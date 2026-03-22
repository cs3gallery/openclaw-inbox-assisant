import { logger } from '../../common/logger';
import { env } from '../../config/env';
import { postgresPool } from '../../db/postgres/client';
import { CLASSIFY_EMAIL_ACTION } from '../ingestion/constants';
import {
  ActionQueueRepository,
  type ActionQueueJob
} from '../ingestion/repositories/actionQueueRepository';
import {
  DETECT_EMERGENCY_ACTION,
  EXTRACT_DOCUMENT_ACTION,
  EXTRACT_TASK_ACTION,
  SUGGEST_REPLY_ACTION
} from './constants';
import { ClassificationOutputValidationError } from './outputHandling';
import type { ClassificationInferenceProvider } from './provider';
import { ClassificationRepository } from './repositories/classificationRepository';
import { ClassificationEmailRepository } from './repositories/emailRepository';
import type { ClassifierEmailContext, ClassificationOutput } from './types';
import type { NotificationService } from '../notifications/service';

type ProcessResult = {
  status: 'completed' | 'retry_scheduled' | 'failed';
};

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function buildRetryAt(attempts: number): string {
  const delayMs = Math.min(
    env.CLASSIFICATION_RETRY_BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0),
    env.CLASSIFICATION_RETRY_MAX_DELAY_MS
  );

  return new Date(Date.now() + delayMs).toISOString();
}

export class EmailClassificationService {
  constructor(
    private readonly actionQueueRepository: ActionQueueRepository,
    private readonly emailRepository: ClassificationEmailRepository,
    private readonly classificationRepository: ClassificationRepository,
    private readonly classifierProvider: ClassificationInferenceProvider,
    private readonly notificationService?: NotificationService
  ) {}

  async processNextQueuedEmail(): Promise<ProcessResult | null> {
    const job = await this.actionQueueRepository.claimNextPendingAction(CLASSIFY_EMAIL_ACTION);

    if (!job) {
      return null;
    }

    try {
      await this.processJob(job);
      return { status: 'completed' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown classification error';
      const validationDebug =
        error instanceof ClassificationOutputValidationError ? error.debugSnapshot : undefined;
      const resultPayload = {
        action_type: job.actionType,
        email_id: job.emailId,
        error: errorMessage,
        ...(validationDebug ? { classification_debug: validationDebug } : {})
      };

      if (job.attempts >= env.CLASSIFICATION_MAX_ATTEMPTS) {
        await this.actionQueueRepository.failAction(job.id, errorMessage, resultPayload);
        logger.error(
          {
            err: error,
            jobId: job.id,
            emailId: job.emailId,
            attempts: job.attempts,
            repairActionCount: validationDebug?.repair_actions.length,
            validationErrors: validationDebug?.validation_errors.map((issue) => issue.path)
          },
          'Classification job failed permanently'
        );

        return { status: 'failed' };
      }

      const retryAt = buildRetryAt(job.attempts);
      await this.actionQueueRepository.rescheduleAction(job.id, retryAt, errorMessage, {
        ...resultPayload,
        retry_at: retryAt,
        attempts: job.attempts
      });

      logger.warn(
        {
          err: error,
          jobId: job.id,
          emailId: job.emailId,
          attempts: job.attempts,
          retryAt,
          repairActionCount: validationDebug?.repair_actions.length,
          validationErrors: validationDebug?.validation_errors.map((issue) => issue.path)
        },
        'Classification job failed and was rescheduled'
      );

      return { status: 'retry_scheduled' };
    }
  }

  private async processJob(job: ActionQueueJob): Promise<void> {
    if (!job.emailId) {
      throw new Error(`Classification job ${job.id} is missing email_id`);
    }

    const existingClassificationId = await this.classificationRepository.findByEmailIdAndVersion(
      job.emailId
    );

    if (existingClassificationId) {
      await this.actionQueueRepository.completeAction(job.id, {
        status: 'skipped',
        reason: 'already_classified',
        classification_id: existingClassificationId
      });

      logger.info(
        { jobId: job.id, emailId: job.emailId, classificationId: existingClassificationId },
        'Skipping classify_email job because the email is already classified'
      );

      return;
    }

    const emailContext = await this.emailRepository.getEmailContext(job.emailId);

    if (!emailContext) {
      throw new Error(`Email ${job.emailId} not found for classification`);
    }

    const classificationResult = await this.classifierProvider.classifyEmail(emailContext);
    const normalizedOutput = this.normalizeOutput(classificationResult.output);
    const classificationId = await this.classificationRepository.upsertClassification({
      emailId: job.emailId,
      output: normalizedOutput,
      rawResponse: classificationResult.rawResponse,
      modelName: classificationResult.modelName
    });
    const nextActions = await this.enqueueFollowUpActions(job.emailId, classificationId, normalizedOutput);
    const outboundNotifications = await this.emitOutboundNotifications(
      emailContext,
      classificationId,
      normalizedOutput,
      nextActions
    );

    await this.actionQueueRepository.completeAction(job.id, {
      status: 'completed',
      classification_id: classificationId,
      category: normalizedOutput.category,
      urgency: normalizedOutput.urgency,
      needs_reply: normalizedOutput.needs_reply,
      confidence: normalizedOutput.confidence,
      provider: classificationResult.providerName,
      model_name: classificationResult.modelName,
      repaired: classificationResult.repairActions.length > 0,
      repair_action_count: classificationResult.repairActions.length,
      repair_actions: classificationResult.repairActions,
      outbound_notification_ids: outboundNotifications.map((notification) => notification.id),
      next_actions: nextActions
    });

    logger.info(
      {
        jobId: job.id,
        emailId: job.emailId,
        classificationId,
        category: normalizedOutput.category,
        urgency: normalizedOutput.urgency,
        needsReply: normalizedOutput.needs_reply,
        taskLikelihood: normalizedOutput.task_likelihood,
        financeDocType: normalizedOutput.finance_doc_type,
        emergencyScore: normalizedOutput.emergency_score,
        confidence: normalizedOutput.confidence,
        provider: classificationResult.providerName,
        modelName: classificationResult.modelName,
        repairActions: classificationResult.repairActions,
        outboundNotifications: outboundNotifications.map((notification) => ({
          id: notification.id,
          type: notification.notificationType,
          status: notification.status
        })),
        nextActions
      },
      'Email classified successfully'
    );
  }

  private async emitOutboundNotifications(
    emailContext: ClassifierEmailContext,
    classificationId: string,
    output: ClassificationOutput,
    nextActions: string[]
  ) {
    if (!this.notificationService) {
      return [];
    }

    const urgentAlert = await this.notificationService.createUrgentAlertFromClassification({
      emailContext,
      classificationId,
      output,
      nextActions
    });

    return urgentAlert ? [urgentAlert] : [];
  }

  private normalizeOutput(output: ClassificationOutput): ClassificationOutput {
    return {
      ...output,
      emergency_score: roundScore(output.emergency_score),
      task_likelihood: roundScore(output.task_likelihood),
      confidence: roundScore(output.confidence)
    };
  }

  private async enqueueFollowUpActions(
    emailId: string,
    classificationId: string,
    output: ClassificationOutput
  ): Promise<string[]> {
    const nextActions: string[] = [];

    const enqueue = async (
      actionType: string,
      priority: number,
      payload: Record<string, unknown>
    ): Promise<void> => {
      const inserted = await this.actionQueueRepository.enqueueAction(postgresPool, {
        actionType,
        targetType: 'email',
        targetId: emailId,
        emailId,
        priority,
        payload
      });

      if (inserted) {
        nextActions.push(actionType);
      }
    };

    if (output.needs_reply) {
      await enqueue(SUGGEST_REPLY_ACTION, 40, {
        email_id: emailId,
        classification_id: classificationId,
        category: output.category,
        urgency: output.urgency
      });
    }

    if (output.task_likelihood >= env.CLASSIFICATION_TASK_THRESHOLD) {
      await enqueue(EXTRACT_TASK_ACTION, 60, {
        email_id: emailId,
        classification_id: classificationId,
        task_likelihood: output.task_likelihood,
        urgency: output.urgency
      });
    }

    if (output.finance_doc_type !== 'unknown') {
      await enqueue(EXTRACT_DOCUMENT_ACTION, 70, {
        email_id: emailId,
        classification_id: classificationId,
        finance_doc_type: output.finance_doc_type
      });
    }

    if (
      output.category === 'emergency' ||
      output.urgency === 'critical' ||
      output.emergency_score >= env.CLASSIFICATION_EMERGENCY_THRESHOLD
    ) {
      await enqueue(DETECT_EMERGENCY_ACTION, 10, {
        email_id: emailId,
        classification_id: classificationId,
        emergency_score: output.emergency_score,
        urgency: output.urgency
      });
    }

    return nextActions;
  }
}
