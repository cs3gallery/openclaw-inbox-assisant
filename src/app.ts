import { logger } from './common/logger';
import { registerShutdownHooks } from './common/shutdown';
import { env } from './config/env';
import { bootstrapDependencies } from './bootstrap/bootstrap';
import { closePostgresPool } from './db/postgres/client';
import { closeRedis } from './db/redis/client';
import { createAppServer } from './server/createServer';

async function startApp(): Promise<void> {
  await bootstrapDependencies();

  const server = await createAppServer();

  registerShutdownHooks('app', async () => {
    await server.close();
    await closeRedis();
    await closePostgresPool();
  });

  await server.listen({
    host: env.APP_HOST,
    port: env.APP_PORT
  });

  logger.info({ host: env.APP_HOST, port: env.APP_PORT }, 'App server started');
}

startApp().catch(async (error) => {
  logger.fatal({ err: error }, 'App failed to start');
  await closeRedis().catch(() => undefined);
  await closePostgresPool().catch(() => undefined);
  process.exit(1);
});

