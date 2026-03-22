import { strict as assert } from 'node:assert';

import { logger } from '../common/logger';
import { env } from '../config/env';
import { closePostgresPool, postgresPool } from '../db/postgres/client';
import { ensureQdrantCollections } from '../db/qdrant/bootstrap';
import { qdrantClient } from '../db/qdrant/client';
import { closeRedis } from '../db/redis/client';

const requiredTables = [
  'emails',
  'email_classifications',
  'attachments',
  'extracted_documents',
  'reply_suggestions',
  'tasks',
  'sender_profiles',
  'training_feedback',
  'automation_policies',
  'action_queue',
  'digests',
  'audit_log'
] as const;

const requiredIndexes = [
  'idx_emails_received_at',
  'idx_emails_conversation_id',
  'idx_emails_from_email',
  'idx_email_classifications_email_id',
  'idx_attachments_email_id',
  'idx_extracted_documents_attachment_id',
  'idx_extracted_documents_email_id',
  'idx_reply_suggestions_email_id',
  'idx_tasks_email_id',
  'idx_training_feedback_email_id',
  'idx_action_queue_status_schedule',
  'idx_digests_period',
  'idx_audit_log_entity'
] as const;

const updatedAtTriggerTables = [
  'sender_profiles',
  'emails',
  'email_classifications',
  'attachments',
  'extracted_documents',
  'reply_suggestions',
  'tasks',
  'automation_policies',
  'action_queue',
  'digests'
] as const;

async function verifyTables(): Promise<void> {
  const result = await postgresPool.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [requiredTables]
  );

  const found = new Set(result.rows.map((row) => row.table_name));

  for (const tableName of requiredTables) {
    assert(found.has(tableName), `Missing table: ${tableName}`);
  }
}

async function verifyMigrationHistory(): Promise<void> {
  const result = await postgresPool.query<{ name: string }>(
    `
      SELECT name
      FROM schema_migrations
      ORDER BY name ASC
    `
  );

  assert.equal(result.rows.length, 1, 'Expected exactly one applied migration');
  assert.equal(result.rows[0].name, '001_initial_schema.sql', 'Unexpected migration history');
}

async function verifyIndexes(): Promise<void> {
  const result = await postgresPool.query<{ indexname: string }>(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
    `,
    [requiredIndexes]
  );

  const found = new Set(result.rows.map((row) => row.indexname));

  for (const indexName of requiredIndexes) {
    assert(found.has(indexName), `Missing index: ${indexName}`);
  }
}

async function verifyUpdatedAtTriggers(): Promise<void> {
  const result = await postgresPool.query<{ event_object_table: string }>(
    `
      SELECT event_object_table
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND trigger_name LIKE 'set\\_%\\_updated_at'
        AND event_object_table = ANY($1::text[])
      GROUP BY event_object_table
    `,
    [updatedAtTriggerTables]
  );

  const found = new Set(result.rows.map((row) => row.event_object_table));

  for (const tableName of updatedAtTriggerTables) {
    assert(found.has(tableName), `Missing updated_at trigger for table: ${tableName}`);
  }
}

async function verifyUpdatedAtBehavior(): Promise<void> {
  const inserted = await postgresPool.query<{ id: string; updated_at: Date }>(
    `
      INSERT INTO sender_profiles (email_address, display_name)
      VALUES ($1, $2)
      RETURNING id, updated_at
    `,
    [`verify-${Date.now()}@example.com`, 'Verification Sender']
  );

  const row = inserted.rows[0];
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const updated = await postgresPool.query<{ updated_at: Date }>(
    `
      UPDATE sender_profiles
      SET display_name = $2
      WHERE id = $1
      RETURNING updated_at
    `,
    [row.id, 'Verification Sender Updated']
  );

  await postgresPool.query('DELETE FROM sender_profiles WHERE id = $1', [row.id]);

  assert(
    updated.rows[0].updated_at.getTime() > row.updated_at.getTime(),
    'updated_at trigger did not advance timestamp'
  );
}

async function verifyQdrantCollections(): Promise<void> {
  await ensureQdrantCollections();

  const collections = await qdrantClient.getCollections();
  const names = new Set(collections.collections.map((collection) => collection.name));

  for (const collectionName of ['email_embeddings', 'reply_style_embeddings', 'training_examples']) {
    assert(names.has(collectionName), `Missing Qdrant collection: ${collectionName}`);

    const collection = await qdrantClient.getCollection(collectionName);
    const vectorConfig = collection.config?.params?.vectors;

    assert(vectorConfig && !Array.isArray(vectorConfig), `Invalid Qdrant vector config: ${collectionName}`);
    assert(vectorConfig.size === env.EMBEDDING_VECTOR_SIZE, `Unexpected vector size for ${collectionName}`);
    assert(
      vectorConfig.distance === env.QDRANT_COLLECTION_DISTANCE,
      `Unexpected distance metric for ${collectionName}`
    );
  }
}

async function main(): Promise<void> {
  logger.info('Running infrastructure verification');
  await verifyMigrationHistory();
  await verifyTables();
  await verifyIndexes();
  await verifyUpdatedAtTriggers();
  await verifyUpdatedAtBehavior();
  await verifyQdrantCollections();
  logger.info('Infrastructure verification completed');
}

main()
  .catch(async (error) => {
    logger.error({ err: error }, 'Infrastructure verification failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRedis().catch(() => undefined);
    await closePostgresPool().catch(() => undefined);
  });
