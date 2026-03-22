import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { logger } from '../../common/logger';
import type { MailIngestionService } from './service';

const triggerIngestionSchema = z.object({
  connection_name: z.string().min(1).optional(),
  folders: z.array(z.string().min(1)).optional(),
  page_size: z.number().int().positive().max(250).optional(),
  requested_by: z.string().min(1).optional()
});

const recentRunsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20)
});

type MailIngestionRouteOptions = {
  mailIngestionService: MailIngestionService;
};

export async function registerMailIngestionRoutes(
  server: FastifyInstance,
  options: MailIngestionRouteOptions
): Promise<void> {
  server.post('/ingestion/mail/run', async (request, reply) => {
    const parsed = triggerIngestionSchema.parse(request.body ?? {});

    logger.info(
      {
        route: '/ingestion/mail/run',
        connectionName: parsed.connection_name,
        folders: parsed.folders,
        pageSize: parsed.page_size
      },
      'Received manual mail ingestion request'
    );

    const run = await options.mailIngestionService.triggerManualIngestion({
      connectionName: parsed.connection_name,
      folders: parsed.folders,
      pageSize: parsed.page_size,
      requestedBy: parsed.requested_by,
      triggerSource: 'manual'
    });

    reply.code(run.status === 'failed' ? 500 : 200);
    return run;
  });

  server.get('/ingestion/mail/runs', async (request) => {
    const query = recentRunsQuerySchema.parse(request.query ?? {});
    return {
      runs: await options.mailIngestionService.listRecentRuns(query.limit)
    };
  });

  server.get('/ingestion/mail/status', async () => options.mailIngestionService.getStatus());
}

