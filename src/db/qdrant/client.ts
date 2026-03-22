import { QdrantClient } from '@qdrant/js-client-rest';

import { env } from '../../config/env';

export const qdrantClient = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY || undefined
});

export async function checkQdrantHealth(): Promise<void> {
  await qdrantClient.getCollections();
}

