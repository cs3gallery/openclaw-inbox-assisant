import { postgresPool } from '../../../db/postgres/client';
import { env } from '../../../config/env';
import type { ClassificationOutput } from '../types';

type ClassificationRow = {
  id: string;
};

type UpsertClassificationInput = {
  emailId: string;
  output: ClassificationOutput;
  rawResponse: Record<string, unknown>;
  modelName: string;
};

export class ClassificationRepository {
  async findByEmailIdAndVersion(emailId: string, classifierVersion = env.CLASSIFICATION_VERSION): Promise<string | null> {
    const result = await postgresPool.query<ClassificationRow>(
      `
        SELECT id
        FROM email_classifications
        WHERE email_id = $1
          AND classifier_version = $2
        LIMIT 1
      `,
      [emailId, classifierVersion]
    );

    return result.rows[0]?.id ?? null;
  }

  async upsertClassification(input: UpsertClassificationInput): Promise<string> {
    const emergencyDetected =
      input.output.category === 'emergency' ||
      input.output.urgency === 'critical' ||
      input.output.emergency_score >= env.CLASSIFICATION_EMERGENCY_THRESHOLD;
    const labels = [
      input.output.category,
      input.output.urgency,
      ...(input.output.needs_reply ? ['needs_reply'] : []),
      ...(input.output.task_likelihood >= env.CLASSIFICATION_TASK_THRESHOLD ? ['task_candidate'] : []),
      ...(input.output.finance_doc_type !== 'unknown'
        ? [`finance:${input.output.finance_doc_type}`]
        : [])
    ];

    const result = await postgresPool.query<ClassificationRow>(
      `
        INSERT INTO email_classifications (
          email_id,
          classifier_version,
          urgency,
          category,
          needs_reply,
          emergency_detected,
          emergency_score,
          labels,
          reasoning,
          task_likelihood,
          finance_doc_type,
          confidence,
          explanation_json,
          model_name,
          raw_response,
          classified_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::jsonb,
          $9::jsonb,
          $10,
          $11,
          $12,
          $13::jsonb,
          $14,
          $15::jsonb,
          NOW()
        )
        ON CONFLICT (email_id, classifier_version)
        DO UPDATE SET
          urgency = EXCLUDED.urgency,
          category = EXCLUDED.category,
          needs_reply = EXCLUDED.needs_reply,
          emergency_detected = EXCLUDED.emergency_detected,
          emergency_score = EXCLUDED.emergency_score,
          labels = EXCLUDED.labels,
          reasoning = EXCLUDED.reasoning,
          task_likelihood = EXCLUDED.task_likelihood,
          finance_doc_type = EXCLUDED.finance_doc_type,
          confidence = EXCLUDED.confidence,
          explanation_json = EXCLUDED.explanation_json,
          model_name = EXCLUDED.model_name,
          raw_response = EXCLUDED.raw_response,
          classified_at = NOW()
        RETURNING id
      `,
      [
        input.emailId,
        env.CLASSIFICATION_VERSION,
        input.output.urgency,
        input.output.category,
        input.output.needs_reply,
        emergencyDetected,
        input.output.emergency_score,
        JSON.stringify(labels),
        JSON.stringify(input.output.explanation_json),
        input.output.task_likelihood,
        input.output.finance_doc_type,
        input.output.confidence,
        JSON.stringify(input.output.explanation_json),
        input.modelName,
        JSON.stringify(input.rawResponse)
      ]
    );

    return result.rows[0].id;
  }
}
