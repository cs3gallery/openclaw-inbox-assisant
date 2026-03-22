import { postgresPool } from '../../../db/postgres/client';

type SyncStateRow = {
  id: string;
  provider: string;
  connection_name: string;
  resource_type: string;
  resource_key: string;
  cursor: string | null;
  last_successful_sync_at: Date | null;
  last_seen_received_at: Date | null;
  last_seen_source_updated_at: Date | null;
  last_run_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

export type SyncState = {
  id: string;
  provider: string;
  connectionName: string;
  resourceType: string;
  resourceKey: string;
  cursor?: string;
  lastSuccessfulSyncAt?: string;
  lastSeenReceivedAt?: string;
  lastSeenSourceUpdatedAt?: string;
  lastRunId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type UpsertSyncStateInput = {
  provider: string;
  connectionName: string;
  resourceType: string;
  resourceKey: string;
  cursor?: string;
  lastSuccessfulSyncAt?: string;
  lastSeenReceivedAt?: string;
  lastSeenSourceUpdatedAt?: string;
  lastRunId?: string;
  metadata: Record<string, unknown>;
};

function mapRow(row: SyncStateRow): SyncState {
  return {
    id: row.id,
    provider: row.provider,
    connectionName: row.connection_name,
    resourceType: row.resource_type,
    resourceKey: row.resource_key,
    ...(row.cursor ? { cursor: row.cursor } : {}),
    ...(row.last_successful_sync_at
      ? { lastSuccessfulSyncAt: row.last_successful_sync_at.toISOString() }
      : {}),
    ...(row.last_seen_received_at ? { lastSeenReceivedAt: row.last_seen_received_at.toISOString() } : {}),
    ...(row.last_seen_source_updated_at
      ? { lastSeenSourceUpdatedAt: row.last_seen_source_updated_at.toISOString() }
      : {}),
    ...(row.last_run_id ? { lastRunId: row.last_run_id } : {}),
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class SyncStateRepository {
  async get(provider: string, connectionName: string, resourceType: string, resourceKey: string): Promise<SyncState | null> {
    const result = await postgresPool.query<SyncStateRow>(
      `
        SELECT *
        FROM sync_state
        WHERE provider = $1
          AND connection_name = $2
          AND resource_type = $3
          AND resource_key = $4
        LIMIT 1
      `,
      [provider, connectionName, resourceType, resourceKey]
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async upsert(input: UpsertSyncStateInput): Promise<SyncState> {
    const result = await postgresPool.query<SyncStateRow>(
      `
        INSERT INTO sync_state (
          provider,
          connection_name,
          resource_type,
          resource_key,
          cursor,
          last_successful_sync_at,
          last_seen_received_at,
          last_seen_source_updated_at,
          last_run_id,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (provider, connection_name, resource_type, resource_key)
        DO UPDATE SET
          cursor = EXCLUDED.cursor,
          last_successful_sync_at = EXCLUDED.last_successful_sync_at,
          last_seen_received_at = EXCLUDED.last_seen_received_at,
          last_seen_source_updated_at = EXCLUDED.last_seen_source_updated_at,
          last_run_id = EXCLUDED.last_run_id,
          metadata = EXCLUDED.metadata
        RETURNING *
      `,
      [
        input.provider,
        input.connectionName,
        input.resourceType,
        input.resourceKey,
        input.cursor ?? null,
        input.lastSuccessfulSyncAt ?? null,
        input.lastSeenReceivedAt ?? null,
        input.lastSeenSourceUpdatedAt ?? null,
        input.lastRunId ?? null,
        JSON.stringify(input.metadata)
      ]
    );

    return mapRow(result.rows[0]);
  }

  async listByProvider(provider: string, connectionName?: string): Promise<SyncState[]> {
    const result = connectionName
      ? await postgresPool.query<SyncStateRow>(
          `
            SELECT *
            FROM sync_state
            WHERE provider = $1
              AND connection_name = $2
            ORDER BY resource_key ASC
          `,
          [provider, connectionName]
        )
      : await postgresPool.query<SyncStateRow>(
          `
            SELECT *
            FROM sync_state
            WHERE provider = $1
            ORDER BY connection_name ASC, resource_key ASC
          `,
          [provider]
        );

    return result.rows.map(mapRow);
  }
}

