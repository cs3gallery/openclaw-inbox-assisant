import type { PoolClient } from 'pg';

import { env } from '../../../config/env';
import { postgresPool } from '../../../db/postgres/client';
import { ActionQueueRepository } from '../../ingestion/repositories/actionQueueRepository';

type ToolEmailRow = {
  email_id: string;
  sender_name: string | null;
  sender_email: string;
  subject: string;
  received_at: Date | null;
  category: string;
  urgency: string;
  emergency_score: string | number;
  needs_reply: boolean;
  task_likelihood: string | number;
  confidence: string | number;
  short_summary: string | null;
};

type ToolInvocationRow = {
  id: string;
  response_payload: Record<string, unknown> | null;
  email_id: string | null;
  task_id: string | null;
  action_queue_id: string | null;
};

type TaskRow = {
  id: string;
  status: string;
};

export type ToolEmailSummary = {
  emailId: string;
  senderName?: string;
  senderEmail: string;
  subject: string;
  receivedAt?: string;
  category: string;
  urgency: string;
  emergencyScore: number;
  needsReply: boolean;
  taskLikelihood: number;
  confidence: number;
  shortSummary?: string;
};

export type CreateTodoResult = {
  taskId: string;
  taskStatus: string;
  actionQueueId: string;
  idempotentReplay: boolean;
};

type RecordToolInvocationInput = {
  toolName: string;
  outcome: 'succeeded' | 'failed';
  actorType: string;
  actorId?: string;
  source: string;
  emailId?: string;
  taskId?: string;
  actionQueueId?: string;
  idempotencyKey?: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
};

type ListEmailsInput = {
  since?: string;
  limit: number;
  onlyUnresolved: boolean;
};

type CreateTodoInput = {
  emailId?: string;
  title: string;
  notes?: string;
  dueDate?: string;
  priority: 'low' | 'normal' | 'high';
  requestedBy: string;
  idempotencyKey?: string;
};

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function mapToolEmailRow(row: ToolEmailRow): ToolEmailSummary {
  return {
    emailId: row.email_id,
    ...(row.sender_name ? { senderName: row.sender_name } : {}),
    senderEmail: row.sender_email,
    subject: row.subject,
    ...(row.received_at ? { receivedAt: row.received_at.toISOString() } : {}),
    category: row.category,
    urgency: row.urgency,
    emergencyScore: toNumber(row.emergency_score),
    needsReply: row.needs_reply,
    taskLikelihood: toNumber(row.task_likelihood),
    confidence: toNumber(row.confidence),
    ...(row.short_summary ? { shortSummary: row.short_summary } : {})
  };
}

async function insertAuditLog(
  client: PoolClient,
  input: {
    entityType: string;
    entityId?: string;
    action: string;
    actorType: string;
    actorId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO audit_log (
        entity_type,
        entity_id,
        action,
        actor_type,
        actor_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.entityType,
      input.entityId ?? null,
      input.action,
      input.actorType,
      input.actorId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export class ToolRepository {
  constructor(private readonly actionQueueRepository = new ActionQueueRepository()) {}

  async listUrgentEmails(input: ListEmailsInput): Promise<ToolEmailSummary[]> {
    const result = await postgresPool.query<ToolEmailRow>(
      `
        SELECT
          emails.id AS email_id,
          emails.from_name AS sender_name,
          emails.from_email AS sender_email,
          emails.subject,
          emails.received_at,
          classifications.category,
          classifications.urgency,
          classifications.emergency_score,
          classifications.needs_reply,
          classifications.task_likelihood,
          classifications.confidence,
          COALESCE(classifications.explanation_json->>'summary', emails.body_preview) AS short_summary
        FROM email_classifications AS classifications
        INNER JOIN emails
          ON emails.id = classifications.email_id
        WHERE classifications.classifier_version = $1
          AND (
            classifications.category = 'emergency'
            OR classifications.urgency IN ('high', 'critical')
            OR classifications.emergency_score >= $4
          )
          AND ($2::timestamptz IS NULL OR COALESCE(emails.received_at, classifications.classified_at) >= $2)
          AND (
            NOT $3::boolean
            OR (
              NOT EXISTS (
                SELECT 1
                FROM tasks
                WHERE tasks.email_id = emails.id
              )
              AND NOT EXISTS (
                SELECT 1
                FROM action_queue
                WHERE action_queue.email_id = emails.id
                  AND action_queue.action_type = 'create_todo'
              )
            )
          )
        ORDER BY
          CASE classifications.urgency
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END ASC,
          classifications.emergency_score DESC,
          COALESCE(emails.received_at, classifications.classified_at) DESC
        LIMIT $5
      `,
      [
        env.CLASSIFICATION_VERSION,
        input.since ?? null,
        input.onlyUnresolved,
        env.CLASSIFICATION_EMERGENCY_THRESHOLD,
        input.limit
      ]
    );

    return result.rows.map(mapToolEmailRow);
  }

  async listPendingEmails(input: ListEmailsInput): Promise<ToolEmailSummary[]> {
    const result = await postgresPool.query<ToolEmailRow>(
      `
        SELECT
          emails.id AS email_id,
          emails.from_name AS sender_name,
          emails.from_email AS sender_email,
          emails.subject,
          emails.received_at,
          classifications.category,
          classifications.urgency,
          classifications.emergency_score,
          classifications.needs_reply,
          classifications.task_likelihood,
          classifications.confidence,
          COALESCE(classifications.explanation_json->>'summary', emails.body_preview) AS short_summary
        FROM email_classifications AS classifications
        INNER JOIN emails
          ON emails.id = classifications.email_id
        WHERE classifications.classifier_version = $1
          AND (
            classifications.needs_reply = TRUE
            OR classifications.category IN ('needs_reply', 'task_request')
            OR classifications.task_likelihood >= $4
          )
          AND ($2::timestamptz IS NULL OR COALESCE(emails.received_at, classifications.classified_at) >= $2)
          AND (
            NOT $3::boolean
            OR (
              NOT EXISTS (
                SELECT 1
                FROM tasks
                WHERE tasks.email_id = emails.id
              )
              AND NOT EXISTS (
                SELECT 1
                FROM action_queue
                WHERE action_queue.email_id = emails.id
                  AND action_queue.action_type = 'create_todo'
              )
            )
          )
        ORDER BY
          classifications.needs_reply DESC,
          classifications.task_likelihood DESC,
          CASE classifications.urgency
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END ASC,
          COALESCE(emails.received_at, classifications.classified_at) DESC
        LIMIT $5
      `,
      [
        env.CLASSIFICATION_VERSION,
        input.since ?? null,
        input.onlyUnresolved,
        env.CLASSIFICATION_TASK_THRESHOLD,
        input.limit
      ]
    );

    return result.rows.map(mapToolEmailRow);
  }

  async createTodo(input: CreateTodoInput): Promise<CreateTodoResult> {
    const client = await postgresPool.connect();

    try {
      await client.query('BEGIN');

      if (input.emailId) {
        const emailResult = await client.query<{ id: string }>(
          `SELECT id FROM emails WHERE id = $1 LIMIT 1`,
          [input.emailId]
        );

        if (emailResult.rows.length === 0) {
          throw new Error(`Email ${input.emailId} was not found`);
        }
      }

      if (input.idempotencyKey) {
        const existingInvocation = await client.query<ToolInvocationRow>(
          `
            SELECT id, response_payload, email_id, task_id, action_queue_id
            FROM tool_invocations
            WHERE tool_name = 'create_todo'
              AND idempotency_key = $1
            LIMIT 1
          `,
          [input.idempotencyKey]
        );

        const existing = existingInvocation.rows[0];

        if (existing?.response_payload) {
          const responsePayload = existing.response_payload;
          return {
            taskId: String(responsePayload.task_id ?? existing.task_id),
            taskStatus: String(responsePayload.status ?? 'queued'),
            actionQueueId: String(responsePayload.action_queue_id ?? existing.action_queue_id),
            idempotentReplay: true
          };
        }
      }

      const taskResult = await client.query<TaskRow>(
        `
          INSERT INTO tasks (
            email_id,
            title,
            notes,
            due_at,
            priority,
            status,
            assignee,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7::jsonb)
          RETURNING id, status
        `,
        [
          input.emailId ?? null,
          input.title,
          input.notes ?? null,
          input.dueDate ?? null,
          input.priority,
          input.requestedBy,
          JSON.stringify({
            source: 'openclaw_tool_api',
            requested_by: input.requestedBy,
            ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {})
          })
        ]
      );

      const task = taskResult.rows[0];
      const enqueueResult = await this.actionQueueRepository.enqueueAction(client, {
        actionType: 'create_todo',
        targetType: 'task',
        targetId: task.id,
        emailId: input.emailId,
        priority: input.priority === 'high' ? 50 : input.priority === 'low' ? 150 : 100,
        payload: {
          task_id: task.id,
          title: input.title,
          ...(input.notes ? { notes: input.notes } : {}),
          ...(input.dueDate ? { due_date: input.dueDate } : {}),
          priority: input.priority,
          requested_by: input.requestedBy,
          source: 'openclaw_tool_api'
        }
      });

      if (!enqueueResult) {
        throw new Error('Unable to enqueue create_todo action');
      }

      const responsePayload = {
        status: 'queued',
        task_id: task.id,
        action_queue_id: enqueueResult.actionQueueId
      };

      const invocationResult = await client.query<{ id: string }>(
        `
          INSERT INTO tool_invocations (
            tool_name,
            outcome,
            actor_type,
            actor_id,
            source,
            email_id,
            task_id,
            action_queue_id,
            idempotency_key,
            request_payload,
            response_payload,
            metadata
          )
          VALUES (
            'create_todo',
            'succeeded',
            'openclaw',
            $1,
            'openclaw',
            $2,
            $3,
            $4,
            $5,
            $6::jsonb,
            $7::jsonb,
            $8::jsonb
          )
          RETURNING id
        `,
        [
          input.requestedBy,
          input.emailId ?? null,
          task.id,
          enqueueResult.actionQueueId,
          input.idempotencyKey ?? null,
          JSON.stringify({
            email_id: input.emailId,
            title: input.title,
            notes: input.notes,
            due_date: input.dueDate,
            priority: input.priority,
            requested_by: input.requestedBy,
            idempotency_key: input.idempotencyKey
          }),
          JSON.stringify(responsePayload),
          JSON.stringify({
            mode: 'queued_backend_action'
          })
        ]
      );

      await insertAuditLog(client, {
        entityType: 'task',
        entityId: task.id,
        action: 'created_via_tool_api',
        actorType: 'openclaw',
        actorId: input.requestedBy,
        metadata: {
          action_queue_id: enqueueResult.actionQueueId,
          email_id: input.emailId
        }
      });

      await insertAuditLog(client, {
        entityType: 'tool_invocation',
        entityId: invocationResult.rows[0].id,
        action: 'succeeded',
        actorType: 'openclaw',
        actorId: input.requestedBy,
        metadata: {
          tool_name: 'create_todo',
          task_id: task.id
        }
      });

      await client.query('COMMIT');

      return {
        taskId: task.id,
        taskStatus: task.status,
        actionQueueId: enqueueResult.actionQueueId,
        idempotentReplay: false
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordToolInvocation(input: RecordToolInvocationInput): Promise<void> {
    const client = await postgresPool.connect();

    try {
      await client.query('BEGIN');

      const invocationResult = await client.query<{ id: string }>(
        `
          INSERT INTO tool_invocations (
            tool_name,
            outcome,
            actor_type,
            actor_id,
            source,
            email_id,
            task_id,
            action_queue_id,
            idempotency_key,
            request_payload,
            response_payload,
            metadata,
            error_code,
            error_message
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14)
          RETURNING id
        `,
        [
          input.toolName,
          input.outcome,
          input.actorType,
          input.actorId ?? null,
          input.source,
          input.emailId ?? null,
          input.taskId ?? null,
          input.actionQueueId ?? null,
          input.idempotencyKey ?? null,
          JSON.stringify(input.requestPayload ?? {}),
          JSON.stringify(input.responsePayload ?? {}),
          JSON.stringify(input.metadata ?? {}),
          input.errorCode ?? null,
          input.errorMessage ?? null
        ]
      );

      await insertAuditLog(client, {
        entityType: 'tool_invocation',
        entityId: invocationResult.rows[0].id,
        action: input.outcome,
        actorType: input.actorType,
        actorId: input.actorId,
        metadata: {
          tool_name: input.toolName,
          source: input.source,
          ...(input.errorCode ? { error_code: input.errorCode } : {})
        }
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
