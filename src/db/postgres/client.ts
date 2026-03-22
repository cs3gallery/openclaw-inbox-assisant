import { Pool } from 'pg';

import { env } from '../../config/env';

export const postgresPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.POSTGRES_MAX_CONNECTIONS,
  connectionTimeoutMillis: env.POSTGRES_CONNECT_TIMEOUT_MS,
  ssl: env.DATABASE_SSL_ENABLED ? { rejectUnauthorized: false } : undefined
});

export async function checkPostgresHealth(): Promise<void> {
  await postgresPool.query('SELECT 1');
}

export async function closePostgresPool(): Promise<void> {
  await postgresPool.end();
}
