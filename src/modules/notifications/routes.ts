import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { assertOpenClawBridgeAuth } from './auth';
import { inboundUserActionTypeSchema, notificationDeliveryStatusSchema } from './types';
import type { NotificationService } from './service';

const outboundNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
  notification_types: z
    .string()
    .optional()
    .transform((value) =>
      value
        ?.split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
});

const deliveryAckParamsSchema = z.object({
  notificationId: z.string().uuid()
});

const deliveryAckBodySchema = z.object({
  channel: z.string().min(1).default('telegram'),
  delivery_status: notificationDeliveryStatusSchema,
  external_delivery_id: z.string().min(1).optional(),
  external_chat_id: z.string().min(1).optional(),
  idempotency_key: z.string().min(1),
  request_payload: z.record(z.string(), z.unknown()).optional(),
  response_payload: z.record(z.string(), z.unknown()).optional()
});

const inboundActionBodySchema = z.object({
  notification_id: z.string().uuid(),
  action_type: inboundUserActionTypeSchema,
  actor_id: z.string().min(1),
  actor_display_name: z.string().min(1).optional(),
  source: z.string().min(1).default('telegram'),
  source_message_id: z.string().min(1).optional(),
  source_chat_id: z.string().min(1).optional(),
  idempotency_key: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional()
});

const dailyDigestBodySchema = z.object({
  period_start: z.string().datetime().optional(),
  period_end: z.string().datetime().optional(),
  requested_by: z.string().min(1).optional(),
  max_items: z.number().int().positive().max(25).optional()
});

const approvalRequestBodySchema = z.object({
  email_id: z.string().uuid(),
  action_queue_id: z.string().uuid().optional(),
  requested_actions: z.array(inboundUserActionTypeSchema).min(1).optional(),
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  requested_by: z.string().min(1).optional(),
  idempotency_key: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

type NotificationRouteOptions = {
  notificationService: NotificationService;
};

export async function registerNotificationRoutes(
  server: FastifyInstance,
  options: NotificationRouteOptions
): Promise<void> {
  server.get('/openclaw/notifications/outbound', async (request, reply) => {
    if (!assertOpenClawBridgeAuth(request, reply)) {
      return;
    }

    const query = outboundNotificationsQuerySchema.parse(request.query ?? {});
    return {
      notifications: await options.notificationService.listPendingOutboundNotifications(
        query.limit,
        query.notification_types
      )
    };
  });

  server.post('/openclaw/notifications/:notificationId/deliveries', async (request, reply) => {
    if (!assertOpenClawBridgeAuth(request, reply)) {
      return;
    }

    const params = deliveryAckParamsSchema.parse(request.params ?? {});
    const body = deliveryAckBodySchema.parse(request.body ?? {});
    const result = await options.notificationService.recordNotificationDelivery({
      notificationId: params.notificationId,
      channel: body.channel,
      deliveryStatus: body.delivery_status,
      externalDeliveryId: body.external_delivery_id,
      externalChatId: body.external_chat_id,
      idempotencyKey: body.idempotency_key,
      requestPayload: body.request_payload,
      responsePayload: body.response_payload
    });

    reply.code(200);
    return result;
  });

  server.post('/openclaw/actions', async (request, reply) => {
    if (!assertOpenClawBridgeAuth(request, reply)) {
      return;
    }

    const body = inboundActionBodySchema.parse(request.body ?? {});
    const result = await options.notificationService.recordInboundUserAction({
      notificationId: body.notification_id,
      actionType: body.action_type,
      actorId: body.actor_id,
      actorDisplayName: body.actor_display_name,
      source: body.source,
      sourceMessageId: body.source_message_id,
      sourceChatId: body.source_chat_id,
      idempotencyKey: body.idempotency_key,
      payload: body.payload
    });

    reply.code(200);
    return result;
  });

  server.post('/notifications/daily-digest/run', async (request, reply) => {
    if (!assertOpenClawBridgeAuth(request, reply)) {
      return;
    }

    const body = dailyDigestBodySchema.parse(request.body ?? {});
    const notification = await options.notificationService.createDailyDigest({
      periodStart: body.period_start,
      periodEnd: body.period_end,
      requestedBy: body.requested_by,
      maxItems: body.max_items
    });

    reply.code(200);
    return notification;
  });

  server.post('/notifications/approval-requests', async (request, reply) => {
    if (!assertOpenClawBridgeAuth(request, reply)) {
      return;
    }

    const body = approvalRequestBodySchema.parse(request.body ?? {});
    const notification = await options.notificationService.createApprovalRequest({
      emailId: body.email_id,
      actionQueueId: body.action_queue_id,
      requestedActions: body.requested_actions,
      title: body.title,
      summary: body.summary,
      requestedBy: body.requested_by,
      idempotencyKey: body.idempotency_key,
      metadata: body.metadata
    });

    reply.code(200);
    return notification;
  });
}
