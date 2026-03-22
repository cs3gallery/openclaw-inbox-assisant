import Fastify, { type FastifyInstance } from 'fastify';

import { loggerOptions } from '../../common/logger';
import type { TelegramBridgeService } from './service';

export async function createTelegramBridgeServer(
  telegramBridgeService: TelegramBridgeService
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: loggerOptions
  });

  server.get('/livez', async () => ({
    service: 'telegram-bridge',
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  }));

  server.get('/readyz', async (_request, reply) => {
    const health = telegramBridgeService.getHealth();
    reply.code(health.status === 'ok' ? 200 : 503);
    return health;
  });

  server.get('/health', async (_request, reply) => {
    const health = telegramBridgeService.getHealth();
    reply.code(health.status === 'ok' ? 200 : 503);
    return health;
  });

  return server;
}
