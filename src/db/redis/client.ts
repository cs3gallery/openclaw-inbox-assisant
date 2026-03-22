import Redis from 'ioredis';

import { env } from '../../config/env';

export const redisClient = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS
});

export async function connectRedis(): Promise<void> {
  if (redisClient.status === 'ready' || redisClient.status === 'connecting') {
    return;
  }

  await redisClient.connect();
}

export async function checkRedisHealth(): Promise<void> {
  await connectRedis();
  await redisClient.ping();
}

export async function closeRedis(): Promise<void> {
  if (redisClient.status === 'end') {
    return;
  }

  if (redisClient.status === 'wait') {
    redisClient.disconnect();
    return;
  }

  await redisClient.quit();
}
