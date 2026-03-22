import Fastify, { type FastifyInstance } from 'fastify';

import { loggerOptions } from '../common/logger';
import { registerHealthRoutes } from '../modules/health/health.routes';

export async function createWorkerServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: loggerOptions
  });

  await registerHealthRoutes(server, { serviceName: 'worker' });

  return server;
}

