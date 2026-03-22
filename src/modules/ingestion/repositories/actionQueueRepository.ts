import type { Pool, PoolClient } from 'pg';

import { postgresPool } from '../../../db/postgres/client';

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export type ActionQueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ActionQueueJob = {
  id: string;
  actionType: string;
  targetType: string;
  targetId?: string;
  emailId?: string;
  status: ActionQueueStatus;
  priority: number;
  scheduledFor: string;
  startedAt?: string;
  completedAt?: string;
  attempts: number;
  lastError?: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type EnqueueActionInput = {
  actionType: string;
  targetType: string;
  targetId?: string;
  emailId?: string;
  priority?: number;
  scheduledFor?: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

type EnqueueActionResult = {
  actionQueueId: string;
};

type ActionQueueRow = {
  id: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  email_id: string | null;
  status: ActionQueueStatus;
  priority: number;
  scheduled_for: Date;
  started_at: Date | null;
  completed_at: Date | null;
  attempts: number;
  last_error: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

function mapActionQueueRow(row: ActionQueueRow): ActionQueueJob {
  return {
    id: row.id,
    actionType: row.action_type,
    targetType: row.target_type,
    ...(row.target_id ? { targetId: row.target_id } : {}),
    ...(row.email_id ? { emailId: row.email_id } : {}),
    status: row.status,
    priority: row.priority,
    scheduledFor: row.scheduled_for.toISOString(),
    ...(row.started_at ? { startedAt: row.started_at.toISOString() } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}),
    attempts: row.attempts,
    ...(row.last_error ? { lastError: row.last_error } : {}),
    payload: row.payload ?? {},
    result: row.result ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class ActionQueueRepository {
  async enqueueClassifyEmail(
    client: PoolClient,
    payload: Record<string, unknown>,
    emailId: string
  ): Promise<EnqueueActionResult | null> {
    return this.enqueueAction(client, {
      actionType: 'classify_email',
      targetType: 'email',
      targetId: emailId,
      emailId,
      payload
    });
  }

  async enqueueAction(
    queryable: Queryable,
    input: EnqueueActionInput
  ): Promise<EnqueueActionResult | null> {
    const result = await queryable.query<{ id: string }>(
      `
        INSERT INTO action_queue (
          action_type,
          target_type,
          target_id,
          email_id,
          status,
          priority,
          scheduled_for,
          payload,
          result
        )
        VALUES ($1, $2, $3, $4, 'pending', $5, COALESCE($6, NOW()), $7::jsonb, $8::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING id
      `,
      [
        input.actionType,
        input.targetType,
        input.targetId ?? null,
        input.emailId ?? null,
        input.priority ?? 100,
        input.scheduledFor ?? null,
        JSON.stringify(input.payload ?? {}),
        JSON.stringify(input.result ?? {})
      ]
    );

    return result.rows[0] ? { actionQueueId: result.rows[0].id } : null;
  }

  async claimNextPendingAction(actionType: string): Promise<ActionQueueJob | null> {
    const result = await postgresPool.query<ActionQueueRow>(
      `
        WITH next_job AS (
          SELECT id
          FROM action_queue
          WHERE action_type = $1
            AND status = 'pending'
            AND scheduled_for <= NOW()
          ORDER BY priority ASC, scheduled_for ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE action_queue AS queue
        SET
          status = 'processing',
          started_at = NOW(),
          completed_at = NULL,
          last_error = NULL,
          attempts = queue.attempts + 1
        FROM next_job
        WHERE queue.id = next_job.id
        RETURNING
          queue.id,
          queue.action_type,
          queue.target_type,
          queue.target_id,
          queue.email_id,
          queue.status,
          queue.priority,
          queue.scheduled_for,
          queue.started_at,
          queue.completed_at,
          queue.attempts,
          queue.last_error,
          queue.payload,
          queue.result,
          queue.created_at,
          queue.updated_at
      `,
      [actionType]
    );

    return result.rows[0] ? mapActionQueueRow(result.rows[0]) : null;
  }

  async completeAction(jobId: string, resultPayload: Record<string, unknown>): Promise<void> {
    await postgresPool.query(
      `
        UPDATE action_queue
        SET
          status = 'completed',
          completed_at = NOW(),
          last_error = NULL,
          result = $2::jsonb
        WHERE id = $1
      `,
      [jobId, JSON.stringify(resultPayload)]
    );
  }

  async rescheduleAction(
    jobId: string,
    retryAt: string,
    errorMessage: string,
    resultPayload: Record<string, unknown>
  ): Promise<void> {
    await postgresPool.query(
      `
        UPDATE action_queue
        SET
          status = 'pending',
          scheduled_for = $2,
          started_at = NULL,
          completed_at = NULL,
          last_error = $3,
          result = $4::jsonb
        WHERE id = $1
      `,
      [jobId, retryAt, errorMessage, JSON.stringify(resultPayload)]
    );
  }

  async failAction(
    jobId: string,
    errorMessage: string,
    resultPayload: Record<string, unknown>
  ): Promise<void> {
    await postgresPool.query(
      `
        UPDATE action_queue
        SET
          status = 'failed',
          completed_at = NOW(),
          last_error = $2,
          result = $3::jsonb
        WHERE id = $1
      `,
      [jobId, errorMessage, JSON.stringify(resultPayload)]
    );
  }
}
