import { logger } from './common/logger';
import { registerShutdownHooks } from './common/shutdown';
import { env } from './config/env';
import { bootstrapDependencies } from './bootstrap/bootstrap';
import { closePostgresPool } from './db/postgres/client';
import { closeRedis } from './db/redis/client';
import { OpenClawMsGraphProvider } from './modules/ingestion/providers/openClawMsGraphProvider';
import { ActionQueueRepository } from './modules/ingestion/repositories/actionQueueRepository';
import { IngestionRunsRepository } from './modules/ingestion/repositories/ingestionRunsRepository';
import { MailIngestionRepository } from './modules/ingestion/repositories/mailIngestionRepository';
import { SyncStateRepository } from './modules/ingestion/repositories/syncStateRepository';
import { MailIngestionService } from './modules/ingestion/service';
import { MailQueuePublisher } from './modules/ingestion/queuePublisher';
import { NotificationRepository } from './modules/notifications/repositories/notificationRepository';
import { NotificationService } from './modules/notifications/service';
import { createAppServer } from './server/createServer';

async function startApp(): Promise<void> {
  await bootstrapDependencies('app');

  const mailIngestionService = new MailIngestionService(
    new OpenClawMsGraphProvider(),
    new MailIngestionRepository(),
    new IngestionRunsRepository(),
    new SyncStateRepository(),
    new MailQueuePublisher(new ActionQueueRepository())
  );
  const notificationService = new NotificationService(new NotificationRepository());
  const server = await createAppServer({
    mailIngestionService,
    notificationService
  });

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
