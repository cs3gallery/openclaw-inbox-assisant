import type { PoolClient } from 'pg';

import { postgresPool } from '../../../db/postgres/client';
import type { IngestionRunSummary } from '../types';

type IngestionRunRow = {
  id: string;
  provider: string;
  connection_name: string;
  folders: string[];
  status: 'running' | 'completed' | 'failed';
  sync_mode: string;
  trigger_source: string;
  requested_by: string | null;
  started_at: Date;
  completed_at: Date | null;
  messages_seen: number;
  messages_processed: number;
  messages_inserted: number;
  messages_updated: number;
  attachments_seen: number;
  jobs_published: number;
  cursor_before: string | null;
  cursor_after: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
};

type StartIngestionRunInput = {
  provider: string;
  connectionName: string;
  folders: string[];
  syncMode: string;
  triggerSource: string;
  requestedBy?: string;
  cursorBefore?: string;
  metadata: Record<string, unknown>;
};

type FinishIngestionRunInput = {
  status: 'completed' | 'failed';
  messagesSeen: number;
  messagesProcessed: number;
  messagesInserted: number;
  messagesUpdated: number;
  attachmentsSeen: number;
  jobsPublished: number;
  cursorAfter?: string;
  error?: string;
  metadata: Record<string, unknown>;
};

function mapRow(row: IngestionRunRow): IngestionRunSummary {
  return {
    runId: row.id,
    provider: row.provider,
    connectionName: row.connection_name,
    folders: row.folders,
    status: row.status,
    syncMode: row.sync_mode,
    triggerSource: row.trigger_source,
    ...(row.requested_by ? { requestedBy: row.requested_by } : {}),
    startedAt: row.started_at.toISOString(),
    ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}),
    messagesSeen: row.messages_seen,
    messagesProcessed: row.messages_processed,
    messagesInserted: row.messages_inserted,
    messagesUpdated: row.messages_updated,
    attachmentsSeen: row.attachments_seen,
    jobsPublished: row.jobs_published,
    ...(row.cursor_before ? { cursorBefore: row.cursor_before } : {}),
    ...(row.cursor_after ? { cursorAfter: row.cursor_after } : {}),
    ...(row.error ? { error: row.error } : {}),
    metadata: row.metadata
  };
}

export class IngestionRunsRepository {
  async startRun(input: StartIngestionRunInput): Promise<IngestionRunSummary> {
    const result = await postgresPool.query<IngestionRunRow>(
      `
        INSERT INTO ingestion_runs (
          provider,
          connection_name,
          folders,
          status,
          sync_mode,
          trigger_source,
          requested_by,
          cursor_before,
          metadata
        )
        VALUES ($1, $2, $3::jsonb, 'running', $4, $5, $6, $7, $8::jsonb)
        RETURNING *
      `,
      [
        input.provider,
        input.connectionName,
        JSON.stringify(input.folders),
        input.syncMode,
        input.triggerSource,
        input.requestedBy ?? null,
        input.cursorBefore ?? null,
        JSON.stringify(input.metadata)
      ]
    );

    return mapRow(result.rows[0]);
  }

  async finishRun(runId: string, input: FinishIngestionRunInput): Promise<IngestionRunSummary> {
    const result = await postgresPool.query<IngestionRunRow>(
      `
        UPDATE ingestion_runs
        SET
          status = $2,
          completed_at = NOW(),
          messages_seen = $3,
          messages_processed = $4,
          messages_inserted = $5,
          messages_updated = $6,
          attachments_seen = $7,
          jobs_published = $8,
          cursor_after = $9,
          error = $10,
          metadata = $11::jsonb
        WHERE id = $1
        RETURNING *
      `,
      [
        runId,
        input.status,
        input.messagesSeen,
        input.messagesProcessed,
        input.messagesInserted,
        input.messagesUpdated,
        input.attachmentsSeen,
        input.jobsPublished,
        input.cursorAfter ?? null,
        input.error ?? null,
        JSON.stringify(input.metadata)
      ]
    );

    return mapRow(result.rows[0]);
  }

  async listRecent(limit: number): Promise<IngestionRunSummary[]> {
    const result = await postgresPool.query<IngestionRunRow>(
      `
        SELECT *
        FROM ingestion_runs
        ORDER BY started_at DESC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows.map(mapRow);
  }
}

export async function setRunMetadataLastRunId(
  client: PoolClient,
  runId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await client.query(
    `
      UPDATE ingestion_runs
      SET metadata = $2::jsonb
      WHERE id = $1
    `,
    [runId, JSON.stringify(metadata)]
  );
}

