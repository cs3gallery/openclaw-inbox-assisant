import Fastify, { type FastifyInstance } from 'fastify';

import { loggerOptions } from '../common/logger';
import { registerHealthRoutes } from '../modules/health/health.routes';

export async function createAppServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: loggerOptions
  });

  await registerHealthRoutes(server, { serviceName: 'app' });

  return server;
}

