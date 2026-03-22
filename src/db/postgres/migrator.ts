import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../../common/logger';
import { closePostgresPool, postgresPool } from './client';

const MIGRATIONS_TABLE = 'schema_migrations';
const ADVISORY_LOCK_ID = 81234567;

export async function runMigrations(): Promise<void> {
  const advisoryLockClient = await postgresPool.connect();

  try {
    await advisoryLockClient.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    await advisoryLockClient.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedMigrationsResult = await advisoryLockClient.query<{ name: string }>(
      `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY name ASC`
    );
    const appliedMigrations = new Set(appliedMigrationsResult.rows.map((row) => row.name));
    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    const entries = await readdir(migrationsDir, { withFileTypes: true });
    const migrationFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    for (const migrationName of migrationFiles) {
      if (appliedMigrations.has(migrationName)) {
        continue;
      }

      const migrationPath = path.resolve(process.cwd(), 'migrations', migrationName);
      const sql = await readFile(migrationPath, 'utf8');

      try {
        await advisoryLockClient.query('BEGIN');
        await advisoryLockClient.query(sql);
        await advisoryLockClient.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [
          migrationName
        ]);
        await advisoryLockClient.query('COMMIT');
        logger.info({ migrationName }, 'Applied PostgreSQL migration');
      } catch (error) {
        await advisoryLockClient.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await advisoryLockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    advisoryLockClient.release();
  }
}

async function main(): Promise<void> {
  await runMigrations();
  await closePostgresPool();
}

if (require.main === module) {
  main().catch(async (error) => {
    logger.error({ err: error }, 'PostgreSQL migration failed');
    await closePostgresPool();
    process.exit(1);
  });
}
