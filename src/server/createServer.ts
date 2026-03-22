import Fastify, { type FastifyInstance } from 'fastify';

import { loggerOptions } from '../common/logger';
import { registerHealthRoutes } from '../modules/health/health.routes';
import { registerMailIngestionRoutes } from '../modules/ingestion/routes';
import { registerNotificationRoutes } from '../modules/notifications/routes';
import { registerToolRoutes } from '../modules/tools/routes';
import type { MailIngestionService } from '../modules/ingestion/service';
import type { NotificationService } from '../modules/notifications/service';
import type { ToolService } from '../modules/tools/service';

type CreateAppServerOptions = {
  mailIngestionService: MailIngestionService;
  notificationService: NotificationService;
  toolService: ToolService;
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
  await registerToolRoutes(server, {
    toolService: options.toolService
  });

  return server;
}
