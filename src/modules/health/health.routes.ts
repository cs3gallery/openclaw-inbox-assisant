import type { FastifyInstance } from 'fastify';

import { getLivenessHealth, getReadinessHealth } from './health.service';

type HealthRouteOptions = {
  serviceName: string;
};

export async function registerHealthRoutes(
  server: FastifyInstance,
  options: HealthRouteOptions
): Promise<void> {
  server.get('/livez', async () => getLivenessHealth(options.serviceName));

  server.get('/readyz', async (_request, reply) => {
    const health = await getReadinessHealth(options.serviceName);
    reply.code(health.status === 'ok' ? 200 : 503);
    return health;
  });

  server.get('/health', async (_request, reply) => {
    const health = await getReadinessHealth(options.serviceName);
    reply.code(health.status === 'ok' ? 200 : 503);
    return health;
  });
}

