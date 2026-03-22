import Fastify, { type FastifyInstance } from 'fastify';

import { loggerOptions } from '../common/logger';
import { registerHealthRoutes } from '../modules/health/health.routes';
import { registerMailIngestionRoutes } from '../modules/ingestion/routes';
import { registerNotificationRoutes } from '../modules/notifications/routes';
import type { MailIngestionService } from '../modules/ingestion/service';
import type { NotificationService } from '../modules/notifications/service';

type CreateAppServerOptions = {
  mailIngestionService: MailIngestionService;
  notificationService: NotificationService;
};

export async function createAppServer(options: CreateAppServerOptions): Promise<FastifyInstance> {
  const server = Fastify({
    logger: loggerOptions
  });

  await registerHealthRoutes(server, { serviceName: 'app' });
  await registerMailIngestionRoutes(server, {
    mailIngestionService: options.mailIngestionService
  });
  await registerNotificationRoutes(server, {
    notificationService: options.notificationService
  });

  return server;
}
