import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { assertToolApiAuth } from './auth';
import type { ToolService } from './service';

const readToolQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(10),
  requested_by: z.string().min(1).optional(),
  only_unresolved: z
    .union([z.coerce.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true')
});

const readToolBodySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.number().int().positive().max(100).default(10),
  only_unresolved: z.boolean().optional(),
  requested_by: z.string().min(1).optional()
});

const createTodoBodySchema = z.object({
  email_id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).optional(),
  due_date: z.string().datetime().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  requested_by: z.string().min(1),
  idempotency_key: z.string().min(1).max(200).optional()
});

type ToolRouteOptions = {
  toolService: ToolService;
};

function normalizeReadInput(
  value: z.infer<typeof readToolQuerySchema> | z.infer<typeof readToolBodySchema>
): {
  since?: string;
  limit: number;
  onlyUnresolved: boolean;
  requestedBy?: string;
} {
  return {
    since: value.since,
    limit: value.limit,
    onlyUnresolved: value.only_unresolved ?? false,
    ...('requested_by' in value && value.requested_by ? { requestedBy: value.requested_by } : {})
  };
}

export async function registerToolRoutes(
  server: FastifyInstance,
  options: ToolRouteOptions
): Promise<void> {
  server.get('/tools/get_urgent_emails', async (request, reply) => {
    if (!assertToolApiAuth(request, reply)) {
      return;
    }

    const query = readToolQuerySchema.parse(request.query ?? {});
    return {
      ok: true,
      tool: 'get_urgent_emails',
      data: await options.toolService.getUrgentEmails(normalizeReadInput(query))
    };
  });

  server.post('/tools/get_urgent_emails', async (request, reply) => {
    if (!assertToolApiAuth(request, reply)) {
      return;
    }

    const body = readToolBodySchema.parse(request.body ?? {});
    return {
      ok: true,
      tool: 'get_urgent_emails',
      data: await options.toolService.getUrgentEmails(normalizeReadInput(body))
    };
  });

  server.get('/tools/get_pending_emails', async (request, reply) => {
    if (!assertToolApiAuth(request, reply)) {
      return;
    }

    const query = readToolQuerySchema.parse(request.query ?? {});
    return {
      ok: true,
      tool: 'get_pending_emails',
      data: await options.toolService.getPendingEmails(normalizeReadInput(query))
    };
  });

  server.post('/tools/get_pending_emails', async (request, reply) => {
    if (!assertToolApiAuth(request, reply)) {
      return;
    }

    const body = readToolBodySchema.parse(request.body ?? {});
    return {
      ok: true,
      tool: 'get_pending_emails',
      data: await options.toolService.getPendingEmails(normalizeReadInput(body))
    };
  });

  server.post('/tools/create_todo', async (request, reply) => {
    if (!assertToolApiAuth(request, reply)) {
      return;
    }

    const body = createTodoBodySchema.parse(request.body ?? {});
    return {
      ok: true,
      tool: 'create_todo',
      data: await options.toolService.createTodo({
        emailId: body.email_id,
        title: body.title,
        notes: body.notes,
        dueDate: body.due_date,
        priority: body.priority,
        requestedBy: body.requested_by,
        idempotencyKey: body.idempotency_key
      })
    };
  });
}
