import { env } from '../../config/env';
import type { ClassifierEmailContext, ClassificationOutput } from '../classification/types';
import {
  defaultApprovalActions,
  defaultUrgentAlertActions,
  inboundUserActionTypeSchema,
  outboundNotificationTypeSchema,
  type InboundUserActionType,
  type NotificationAction
} from './types';
import { NotificationRepository, type OutboundNotification } from './repositories/notificationRepository';

type CreateDailyDigestInput = {
  periodStart?: string;
  periodEnd?: string;
  requestedBy?: string;
  maxItems?: number;
};

type CreateApprovalRequestInput = {
  emailId: string;
  actionQueueId?: string;
  requestedActions?: InboundUserActionType[];
  title?: string;
  summary?: string;
  requestedBy?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

type RecordNotificationDeliveryInput = {
  notificationId: string;
  channel: string;
  deliveryStatus: 'sent' | 'delivered' | 'failed';
  externalDeliveryId?: string;
  externalChatId?: string;
  idempotencyKey: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
};

type RecordInboundUserActionInput = {
  notificationId: string;
  actionType: InboundUserActionType;
  actorId: string;
  actorDisplayName?: string;
  source: string;
  sourceMessageId?: string;
  sourceChatId?: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
};

function escapeMarkdown(value: string): string {
  return value.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function buildNotificationBody(lines: string[]): string {
  return lines.filter((line) => line.trim().length > 0).join('\n');
}

function computePeriodWindow(periodStart?: string, periodEnd?: string): {
  periodStart: string;
  periodEnd: string;
} {
  const end = periodEnd ? new Date(periodEnd) : new Date();
  const start = periodStart
    ? new Date(periodStart)
    : new Date(end.getTime() - 24 * 60 * 60 * 1000);

  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString()
  };
}

function buildApprovalActions(
  actionType?: string,
  requestedActions?: InboundUserActionType[]
): NotificationAction[] {
  if (requestedActions?.length) {
    return requestedActions.map((type) => ({
      type: inboundUserActionTypeSchema.parse(type),
      label:
        type === 'approve'
          ? 'Approve'
          : type === 'reject'
            ? 'Reject'
            : type === 'snooze'
              ? 'Snooze'
              : type === 'mark_not_important'
                ? 'Not Important'
                : type === 'create_todo'
                  ? 'Create Todo'
                  : type === 'forward_to_bill_com'
                    ? 'Forward to Bill.com'
                    : 'File to OneDrive'
    }));
  }

  if (actionType === 'extract_document') {
    return [
      ...defaultApprovalActions,
      { type: 'forward_to_bill_com', label: 'Forward to Bill.com' },
      { type: 'file_to_onedrive', label: 'File to OneDrive' }
    ];
  }

  if (actionType === 'extract_task') {
    return [...defaultApprovalActions, { type: 'create_todo', label: 'Create Todo' }];
  }

  return defaultApprovalActions;
}

export class NotificationService {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  async createUrgentAlertFromClassification(input: {
    emailContext: ClassifierEmailContext;
    classificationId: string;
    output: ClassificationOutput;
    nextActions: string[];
  }): Promise<OutboundNotification | null> {
    const isUrgent =
      input.output.category === 'emergency' ||
      input.output.urgency === 'critical' ||
      input.output.emergency_score >= env.CLASSIFICATION_EMERGENCY_THRESHOLD;

    if (!isUrgent) {
      return null;
    }

    const title = `Urgent alert: ${input.emailContext.subject || '(no subject)'}`;
    const summary = `${input.emailContext.fromEmail} · ${input.output.category} · ${input.output.urgency}`;

    return this.notificationRepository.createOutboundNotification({
      notificationType: outboundNotificationTypeSchema.parse('urgent_alert'),
      priority: 10,
      title,
      summary,
      bodyMarkdown: buildNotificationBody([
        `*${escapeMarkdown(title)}*`,
        `From: ${escapeMarkdown(input.emailContext.fromName ?? input.emailContext.fromEmail)}`,
        `Category: ${escapeMarkdown(input.output.category)}`,
        `Urgency: ${escapeMarkdown(input.output.urgency)}`,
        `Emergency score: ${input.output.emergency_score.toFixed(2)}`,
        `Summary: ${escapeMarkdown(input.output.explanation_json.summary)}`
      ]),
      actions: defaultUrgentAlertActions,
      dedupeKey: `urgent_alert:${input.classificationId}`,
      emailId: input.emailContext.emailId,
      classificationId: input.classificationId,
      payload: {
        type: 'urgent_alert',
        data: {
          email_id: input.emailContext.emailId,
          classification_id: input.classificationId,
          subject: input.emailContext.subject || '(no subject)',
          from_email: input.emailContext.fromEmail,
          ...(input.emailContext.fromName ? { from_name: input.emailContext.fromName } : {}),
          ...(input.emailContext.receivedAt ? { received_at: input.emailContext.receivedAt } : {}),
          category: input.output.category,
          urgency: input.output.urgency,
          emergency_score: input.output.emergency_score,
          confidence: input.output.confidence,
          summary: input.output.explanation_json.summary,
          next_actions: input.nextActions
        }
      },
      metadata: {
        transport_owner: 'openclaw',
        channel: 'telegram'
      }
    });
  }

  async createDailyDigest(input: CreateDailyDigestInput): Promise<OutboundNotification> {
    const { periodStart, periodEnd } = computePeriodWindow(input.periodStart, input.periodEnd);
    const digestSummary = await this.notificationRepository.getDailyDigestSummary(
      periodStart,
      periodEnd,
      input.maxItems ?? 10
    );

    const digestId = await this.notificationRepository.upsertDigest({
      digestType: 'daily',
      periodStart,
      periodEnd,
      content: {
        total_classified: digestSummary.totalClassified,
        urgent_count: digestSummary.urgentCount,
        needs_reply_count: digestSummary.needsReplyCount,
        task_candidate_count: digestSummary.taskCandidateCount,
        highlights: digestSummary.highlights
      }
    });

    const title = 'Daily inbox digest';
    const summary = `${digestSummary.totalClassified} classified · ${digestSummary.urgentCount} urgent · ${digestSummary.needsReplyCount} need reply`;
    const highlightLines = digestSummary.highlights.slice(0, 5).map((highlight) => {
      return `- ${escapeMarkdown(highlight.subject)} (${escapeMarkdown(highlight.category)} / ${escapeMarkdown(highlight.urgency)})`;
    });

    return this.notificationRepository.createOutboundNotification({
      notificationType: outboundNotificationTypeSchema.parse('daily_digest'),
      priority: 50,
      title,
      summary,
      bodyMarkdown: buildNotificationBody([
        `*${escapeMarkdown(title)}*`,
        `Window: ${periodStart} to ${periodEnd}`,
        `Classified: ${digestSummary.totalClassified}`,
        `Urgent: ${digestSummary.urgentCount}`,
        `Needs reply: ${digestSummary.needsReplyCount}`,
        `Task candidates: ${digestSummary.taskCandidateCount}`,
        '',
        'Highlights:',
        ...highlightLines
      ]),
      actions: [],
      dedupeKey: `daily_digest:${periodStart}:${periodEnd}`,
      digestId,
      payload: {
        type: 'daily_digest',
        data: {
          digest_id: digestId,
          period_start: periodStart,
          period_end: periodEnd,
          total_classified: digestSummary.totalClassified,
          urgent_count: digestSummary.urgentCount,
          needs_reply_count: digestSummary.needsReplyCount,
          task_candidate_count: digestSummary.taskCandidateCount,
          highlights: digestSummary.highlights.map((highlight) => ({
            email_id: highlight.emailId,
            subject: highlight.subject,
            from_email: highlight.fromEmail,
            category: highlight.category,
            urgency: highlight.urgency,
            needs_reply: highlight.needsReply,
            confidence: highlight.confidence,
            classified_at: highlight.classifiedAt
          }))
        }
      },
      metadata: {
        requested_by: input.requestedBy ?? 'system',
        transport_owner: 'openclaw',
        channel: 'telegram'
      }
    });
  }

  async createApprovalRequest(input: CreateApprovalRequestInput): Promise<OutboundNotification> {
    const context = await this.notificationRepository.getApprovalRequestContext(
      input.emailId,
      input.actionQueueId
    );

    if (!context) {
      throw new Error(`Email ${input.emailId} was not found for approval request creation`);
    }

    const actions = buildApprovalActions(context.actionQueue?.actionType, input.requestedActions);
    const title =
      input.title ??
      `Approval needed: ${context.actionQueue?.actionType ?? 'review'} for ${context.subject || '(no subject)'}`;
    const summary =
      input.summary ??
      `Review ${context.subject || '(no subject)'} from ${context.fromName ?? context.fromEmail}`;
    const dedupeKey =
      input.idempotencyKey ??
      `approval_request:${context.actionQueue?.id ?? context.emailId}:${actions.map((action) => action.type).join(',')}`;

    return this.notificationRepository.createOutboundNotification({
      notificationType: outboundNotificationTypeSchema.parse('approval_request'),
      priority: 30,
      title,
      summary,
      bodyMarkdown: buildNotificationBody([
        `*${escapeMarkdown(title)}*`,
        `From: ${escapeMarkdown(context.fromName ?? context.fromEmail)}`,
        `Subject: ${escapeMarkdown(context.subject)}`,
        ...(context.classification
          ? [
              `Category: ${escapeMarkdown(context.classification.category)}`,
              `Urgency: ${escapeMarkdown(context.classification.urgency)}`,
              `Confidence: ${context.classification.confidence.toFixed(2)}`
            ]
          : []),
        ...(context.actionQueue
          ? [
              `Queued action: ${escapeMarkdown(context.actionQueue.actionType)}`,
              `Priority: ${String(context.actionQueue.priority)}`
            ]
          : []),
        `Summary: ${escapeMarkdown(summary)}`
      ]),
      actions,
      dedupeKey,
      emailId: context.emailId,
      actionQueueId: context.actionQueue?.id,
      payload: {
        type: 'approval_request',
        data: {
          email_id: context.emailId,
          ...(context.actionQueue ? { action_queue_id: context.actionQueue.id } : {}),
          requested_actions: actions.map((action) => action.type),
          ...(input.requestedBy ? { requested_by: input.requestedBy } : {}),
          title,
          summary,
          subject: context.subject,
          from_email: context.fromEmail,
          ...(context.fromName ? { from_name: context.fromName } : {}),
          ...(context.classification
            ? {
                classification: {
                  category: context.classification.category,
                  urgency: context.classification.urgency,
                  confidence: context.classification.confidence
                }
              }
            : {}),
          ...(context.actionQueue
            ? {
                action_queue: {
                  action_type: context.actionQueue.actionType,
                  priority: context.actionQueue.priority,
                  payload: context.actionQueue.payload
                }
              }
            : {}),
          metadata: input.metadata ?? {}
        }
      },
      metadata: {
        requested_by: input.requestedBy ?? 'system',
        transport_owner: 'openclaw',
        channel: 'telegram',
        ...(input.metadata ?? {})
      }
    });
  }

  async listPendingOutboundNotifications(limit: number, notificationTypes?: string[]): Promise<OutboundNotification[]> {
    return this.notificationRepository.listPendingOutboundNotifications({
      limit,
      notificationTypes: notificationTypes?.map((type) => outboundNotificationTypeSchema.parse(type))
    });
  }

  async recordNotificationDelivery(input: RecordNotificationDeliveryInput) {
    return this.notificationRepository.recordNotificationDelivery(input);
  }

  async recordInboundUserAction(input: RecordInboundUserActionInput) {
    return this.notificationRepository.recordInboundUserAction(input);
  }
}
