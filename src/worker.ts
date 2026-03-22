import { logger } from './common/logger';
import { registerShutdownHooks } from './common/shutdown';
import { env } from './config/env';
import { bootstrapDependencies } from './bootstrap/bootstrap';
import { closePostgresPool } from './db/postgres/client';
import { closeRedis } from './db/redis/client';
import { createWorkerServer } from './worker/createWorkerServer';
import { startWorkerLoop } from './worker/workerLoop';

async function startWorker(): Promise<void> {
  await bootstrapDependencies();

  const server = await createWorkerServer();
  const stopWorkerLoop = startWorkerLoop();

  registerShutdownHooks('worker', async () => {
    stopWorkerLoop();
    await server.close();
    await closeRedis();
    await closePostgresPool();
  });

  await server.listen({
    host: env.WORKER_HOST,
    port: env.WORKER_PORT
  });

  logger.info({ host: env.WORKER_HOST, port: env.WORKER_PORT }, 'Worker service started');
}

startWorker().catch(async (error) => {
  logger.fatal({ err: error }, 'Worker failed to start');
  await closeRedis().catch(() => undefined);
  await closePostgresPool().catch(() => undefined);
  process.exit(1);
});
