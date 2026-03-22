import { logger } from '../common/logger';
import { withRetry } from '../common/retry';
import { env } from '../config/env';
import { checkPostgresHealth } from '../db/postgres/client';
import { runMigrations } from '../db/postgres/migrator';
import { ensureQdrantCollections } from '../db/qdrant/bootstrap';
import { checkQdrantHealth } from '../db/qdrant/client';
import { checkRedisHealth } from '../db/redis/client';

async function waitForDependencies(): Promise<void> {
  await Promise.all([
    withRetry(() => checkPostgresHealth(), {
      operation: 'postgres readiness',
      maxAttempts: env.STARTUP_MAX_ATTEMPTS,
      initialDelayMs: env.STARTUP_INITIAL_BACKOFF_MS,
      maxDelayMs: env.STARTUP_MAX_BACKOFF_MS
    }),
    withRetry(() => checkRedisHealth(), {
      operation: 'redis readiness',
      maxAttempts: env.STARTUP_MAX_ATTEMPTS,
      initialDelayMs: env.STARTUP_INITIAL_BACKOFF_MS,
      maxDelayMs: env.STARTUP_MAX_BACKOFF_MS
    }),
    withRetry(() => checkQdrantHealth(), {
      operation: 'qdrant readiness',
      maxAttempts: env.STARTUP_MAX_ATTEMPTS,
      initialDelayMs: env.STARTUP_INITIAL_BACKOFF_MS,
      maxDelayMs: env.STARTUP_MAX_BACKOFF_MS
    })
  ]);
}

export async function bootstrapDependencies(serviceName: string): Promise<void> {
  logger.info({ service: serviceName }, 'Waiting for infrastructure dependencies');
  await waitForDependencies();
  logger.info({ service: serviceName }, 'Infrastructure dependencies are reachable');

  logger.info({ service: serviceName }, 'Running PostgreSQL migrations');
  await runMigrations();
  logger.info({ service: serviceName }, 'Ensuring Qdrant collections');
  await ensureQdrantCollections();

  logger.info({ service: serviceName }, 'Dependency bootstrap completed');
}
