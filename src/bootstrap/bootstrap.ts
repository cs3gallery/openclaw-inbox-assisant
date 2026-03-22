import { logger } from '../common/logger';
import { checkPostgresHealth } from '../db/postgres/client';
import { runMigrations } from '../db/postgres/migrator';
import { ensureQdrantCollections } from '../db/qdrant/bootstrap';
import { checkQdrantHealth } from '../db/qdrant/client';
import { checkRedisHealth } from '../db/redis/client';

export async function bootstrapDependencies(): Promise<void> {
  await checkPostgresHealth();
  await checkRedisHealth();
  await checkQdrantHealth();
  await runMigrations();
  await ensureQdrantCollections();

  logger.info('Dependency bootstrap completed');
}

