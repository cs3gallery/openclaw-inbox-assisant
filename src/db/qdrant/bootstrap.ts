import { logger } from '../../common/logger';
import { env } from '../../config/env';
import { qdrantClient } from './client';

const requiredCollections = [
  'email_embeddings',
  'reply_style_embeddings',
  'training_examples'
] as const;

export async function ensureQdrantCollections(): Promise<void> {
  logger.info(
    {
      vectorSize: env.EMBEDDING_VECTOR_SIZE,
      distance: env.QDRANT_COLLECTION_DISTANCE,
      onDiskPayload: env.QDRANT_COLLECTION_ON_DISK_PAYLOAD
    },
    'Ensuring required Qdrant collections'
  );

  const existingCollections = await qdrantClient.getCollections();
  const existingNames = new Set(existingCollections.collections.map((collection) => collection.name));

  for (const collectionName of requiredCollections) {
    if (existingNames.has(collectionName)) {
      logger.debug({ collectionName }, 'Qdrant collection already exists');
      continue;
    }

    await qdrantClient.createCollection(collectionName, {
      vectors: {
        size: env.EMBEDDING_VECTOR_SIZE,
        distance: env.QDRANT_COLLECTION_DISTANCE
      },
      on_disk_payload: env.QDRANT_COLLECTION_ON_DISK_PAYLOAD
    });

    logger.info({ collectionName }, 'Created Qdrant collection');
  }
}

async function main(): Promise<void> {
  await ensureQdrantCollections();
}

if (require.main === module) {
  main().catch((error) => {
    logger.error({ err: error }, 'Qdrant bootstrap failed');
    process.exit(1);
  });
}
