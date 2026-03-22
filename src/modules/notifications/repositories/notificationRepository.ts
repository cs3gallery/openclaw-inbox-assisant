import type { PoolClient } from 'pg';

import { env } from '../../../config/env';
import { postgresPool } from '../../../db/postgres/client';
import type {
  InboundUserActionStatus,
  InboundUserActionType,
  NotificationAction,
  NotificationDeliveryStatus,
  OutboundNotificationPayload,
  OutboundNotificationStatus,
  OutboundNotificationType
} from '../types';

type OutboundNotificationRow = {
  id: string;
  notification_type: OutboundNotificationType;
  status: OutboundNotificationStatus;
  priority: number;
  title: string;
  summary: string;
  body_markdown: string;
  actions: NotificationAction[] | null;
  dedupe_key: string;
  email_id: string | null;
  classification_id: string | null;
  action_queue_id: string | null;
  digest_id: string | null;
  available_at: Date;
  expires_at: Date | null;
  delivered_at: Date | null;
  last_action_at: Date | null;
  payload: OutboundNotificationPayload | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type NotificationDeliveryRow = {
  id: string;
  notification_id: string;
  channel: string;
  delivery_status: NotificationDeliveryStatus;
  external_delivery_id: string | null;
  external_chat_id: string | null;
  idempotency_key: string;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  delivered_at: Date | null;
  failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type InboundUserActionRow = {
  id: string;
  notification_id: string;
  action_type: InboundUserActionType;
  action_status: InboundUserActionStatus;
  actor_id: string;
  actor_display_name: string | null;
  source: string;
  source_message_id: string | null;
  source_chat_id: string | null;
  idempotency_key: string;
  payload: Record<string, unknown> | null;
  received_at: Date;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type DigestSummaryRow = {
  total_classified: string | number;
  urgent_count: string | number;
  needs_reply_count: string | number;
  task_candidate_count: string | number;
};

type DigestHighlightRow = {
  email_id: string;
  subject: string;
  from_email: string;
  category: string;
  urgency: string;
  needs_reply: boolean;
  confidence: string | number;
  classified_at: Date;
};

type ApprovalEmailContextRow = {
  email_id: string;
  subject: string;
  from_email: string;
  from_name: string | null;
  category: string | null;
  urgency: string | null;
  confidence: string | number | null;
};

type ApprovalActionQueueContextRow = {
  id: string;
  action_type: string;
  priority: number;
  payload: Record<string, unknown> | null;
  email_id: string | null;
};

export type OutboundNotification = {
  id: string;
  notificationType: OutboundNotificationType;
  status: OutboundNotificationStatus;
  priority: number;
  title: string;
  summary: string;
  bodyMarkdown: string;
  actions: NotificationAction[];
  dedupeKey: string;
  emailId?: string;
  classificationId?: string;
  actionQueueId?: string;
  digestId?: string;
  availableAt: string;
  expiresAt?: string;
  deliveredAt?: string;
  lastActionAt?: string;
  payload: OutboundNotificationPayload;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type NotificationDelivery = {
  id: string;
  notificationId: string;
  channel: string;
  deliveryStatus: NotificationDeliveryStatus;
  externalDeliveryId?: string;
  externalChatId?: string;
  idempotencyKey: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  deliveredAt?: string;
  failedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type InboundUserAction = {
  id: string;
  notificationId: string;
  actionType: InboundUserActionType;
  actionStatus: InboundUserActionStatus;
  actorId: string;
  actorDisplayName?: string;
  source: string;
  sourceMessageId?: string;
  sourceChatId?: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type DailyDigestSummary = {
  totalClassified: number;
  urgentCount: number;
  needsReplyCount: number;
  taskCandidateCount: number;
  highlights: Array<{
    emailId: string;
    subject: string;
    fromEmail: string;
    category: string;
    urgency: string;
    needsReply: boolean;
    confidence: number;
    classifiedAt: string;
  }>;
};

export type ApprovalRequestContext = {
  emailId: string;
  subject: string;
  fromEmail: string;
  fromName?: string;
  classification?: {
    category: string;
    urgency: string;
    confidence: number;
  };
  actionQueue?: {
    id: string;
    actionType: string;
    priority: number;
    payload: Record<string, unknown>;
  };
};

type CreateOutboundNotificationInput = {
  notificationType: OutboundNotificationType;
  status?: OutboundNotificationStatus;
  priority?: number;
  title: string;
  summary: string;
  bodyMarkdown: string;
  actions: NotificationAction[];
  dedupeKey: string;
  emailId?: string;
  classificationId?: string;
  actionQueueId?: string;
  digestId?: string;
  availableAt?: string;
  expiresAt?: string;
  payload: OutboundNotificationPayload;
  metadata?: Record<string, unknown>;
};

type ListPendingOutboundNotificationsInput = {
  limit: number;
  notificationTypes?: OutboundNotificationType[];
};

type RecordNotificationDeliveryInput = {
  notificationId: string;
  channel: string;
  deliveryStatus: NotificationDeliveryStatus;
  externalDeliveryId?: string;
  externalChatId?: string;
  idempotencyKey: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
};

type RecordInboundUserActionInput = {
  notificationId: string;
  actionType: InboundUserActionType;
  actorId: string;
  actorDisplayName?: string;
  source: string;
  sourceMessageId?: string;
  sourceChatId?: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
};

type UpsertDigestInput = {
  digestType: string;
  periodStart: string;
  periodEnd: string;
  content: Record<string, unknown>;
};

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapOutboundNotification(row: OutboundNotificationRow): OutboundNotification {
  return {
    id: row.id,
    notificationType: row.notification_type,
    status: row.status,
    priority: row.priority,
    title: row.title,
    summary: row.summary,
    bodyMarkdown: row.body_markdown,
    actions: row.actions ?? [],
    dedupeKey: row.dedupe_key,
    ...(row.email_id ? { emailId: row.email_id } : {}),
    ...(row.classification_id ? { classificationId: row.classification_id } : {}),
    ...(row.action_queue_id ? { actionQueueId: row.action_queue_id } : {}),
    ...(row.digest_id ? { digestId: row.digest_id } : {}),
    availableAt: row.available_at.toISOString(),
    ...(row.expires_at ? { expiresAt: row.expires_at.toISOString() } : {}),
    ...(row.delivered_at ? { deliveredAt: row.delivered_at.toISOString() } : {}),
    ...(row.last_action_at ? { lastActionAt: row.last_action_at.toISOString() } : {}),
    payload: row.payload as OutboundNotificationPayload,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapNotificationDelivery(row: NotificationDeliveryRow): NotificationDelivery {
  return {
    id: row.id,
    notificationId: row.notification_id,
    channel: row.channel,
    deliveryStatus: row.delivery_status,
    ...(row.external_delivery_id ? { externalDeliveryId: row.external_delivery_id } : {}),
    ...(row.external_chat_id ? { externalChatId: row.external_chat_id } : {}),
    idempotencyKey: row.idempotency_key,
    requestPayload: row.request_payload ?? {},
    responsePayload: row.response_payload ?? {},
    ...(row.delivered_at ? { deliveredAt: row.delivered_at.toISOString() } : {}),
    ...(row.failed_at ? { failedAt: row.failed_at.toISOString() } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapInboundUserAction(row: InboundUserActionRow): InboundUserAction {
  return {
    id: row.id,
    notificationId: row.notification_id,
    actionType: row.action_type,
    actionStatus: row.action_status,
    actorId: row.actor_id,
    ...(row.actor_display_name ? { actorDisplayName: row.actor_display_name } : {}),
    source: row.source,
    ...(row.source_message_id ? { sourceMessageId: row.source_message_id } : {}),
    ...(row.source_chat_id ? { sourceChatId: row.source_chat_id } : {}),
    idempotencyKey: row.idempotency_key,
    payload: row.payload ?? {},
    receivedAt: row.received_at.toISOString(),
    ...(row.processed_at ? { processedAt: row.processed_at.toISOString() } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function insertAuditLog(
  client: PoolClient,
  input: {
    entityType: string;
    entityId?: string;
    action: string;
    actorType: string;
    actorId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO audit_log (
        entity_type,
        entity_id,
        action,
        actor_type,
        actor_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.entityType,
      input.entityId ?? null,
      input.action,
      input.actorType,
      input.actorId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export class NotificationRepository {
  async createOutboundNotification(input: CreateOutboundNotificationInput): Promise<OutboundNotification> {
    const result = await postgresPool.query<OutboundNotificationRow>(
      `
        INSERT INTO outbound_notifications (
          notification_type,
          status,
          priority,
          title,
          summary,
          body_markdown,
          actions,
          dedupe_key,
          email_id,
          classification_id,
          action_queue_id,
          digest_id,
          available_at,
          expires_at,
          payload,
          metadata
        )
        VALUES (
          $1,
          COALESCE($2, 'pending'),
          COALESCE($3, 100),
          $4,
          $5,
          $6,
          $7::jsonb,
          $8,
          $9,
          $10,
          $11,
          $12,
          COALESCE($13, NOW()),
          $14,
          $15::jsonb,
          $16::jsonb
        )
        ON CONFLICT (dedupe_key)
        DO UPDATE SET dedupe_key = outbound_notifications.dedupe_key
        RETURNING *
      `,
      [
        input.notificationType,
        input.status ?? null,
        input.priority ?? null,
        input.title,
        input.summary,
        input.bodyMarkdown,
        JSON.stringify(input.actions),
        input.dedupeKey,
        input.emailId ?? null,
        input.classificationId ?? null,
        input.actionQueueId ?? null,
        input.digestId ?? null,
        input.availableAt ?? null,
        input.expiresAt ?? null,
        JSON.stringify(input.payload),
        JSON.stringify(input.metadata ?? {})
      ]
    );

    const notification = mapOutboundNotification(result.rows[0]);

    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');
      await insertAuditLog(client, {
        entityType: 'outbound_notification',
        entityId: notification.id,
        action: 'created_or_reused',
        actorType: 'system',
        metadata: {
          notification_type: notification.notificationType,
          dedupe_key: notification.dedupeKey
        }
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return notification;
  }

  async listPendingOutboundNotifications(
    input: ListPendingOutboundNotificationsInput
  ): Promise<OutboundNotification[]> {
    const result = await postgresPool.query<OutboundNotificationRow>(
      `
        SELECT *
        FROM outbound_notifications
        WHERE status = 'pending'
          AND available_at <= NOW()
          AND ($2::text[] IS NULL OR notification_type = ANY($2))
        ORDER BY priority ASC, available_at ASC, created_at ASC
        LIMIT $1
      `,
      [input.limit, input.notificationTypes?.length ? input.notificationTypes : null]
    );

    return result.rows.map(mapOutboundNotification);
  }

  async recordNotificationDelivery(input: RecordNotificationDeliveryInput): Promise<{
    notification: OutboundNotification;
    delivery: NotificationDelivery;
  }> {
    const client = await postgresPool.connect();

    try {
      await client.query('BEGIN');

      const deliveryResult = await client.query<NotificationDeliveryRow>(
        `
          INSERT INTO notification_deliveries (
            notification_id,
            channel,
            delivery_status,
            external_delivery_id,
            external_chat_id,
            idempotency_key,
            request_payload,
            response_payload,
            delivered_at,
            failed_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::jsonb,
            $8::jsonb,
            CASE WHEN $3 IN ('sent', 'delivered') THEN NOW() ELSE NULL END,
            CASE WHEN $3 = 'failed' THEN NOW() ELSE NULL END
          )
          ON CONFLICT (idempotency_key)
          DO UPDATE SET idempotency_key = notification_deliveries.idempotency_key
          RETURNING *
        `,
        [
          input.notificationId,
          input.channel,
          input.deliveryStatus,
          input.externalDeliveryId ?? null,
          input.externalChatId ?? null,
          input.idempotencyKey,
          JSON.stringify(input.requestPayload ?? {}),
          JSON.stringify(input.responsePayload ?? {})
        ]
      );

      const notificationResult = await client.query<OutboundNotificationRow>(
        `
          UPDATE outbound_notifications
          SET
            status = CASE
              WHEN $2 = 'failed' THEN 'delivery_failed'
              ELSE 'delivered'
            END,
            delivered_at = CASE
              WHEN $2 IN ('sent', 'delivered') THEN COALESCE(delivered_at, NOW())
              ELSE delivered_at
            END,
            metadata = metadata || jsonb_build_object(
              'last_delivery_status', $2,
              'last_delivery_channel', $3
            )
          WHERE id = $1
          RETURNING *
        `,
        [input.notificationId, input.deliveryStatus, input.channel]
      );

      await insertAuditLog(client, {
        entityType: 'outbound_notification',
        entityId: input.notificationId,
        action: 'delivery_recorded',
        actorType: 'openclaw',
        metadata: {
          channel: input.channel,
          delivery_status: input.deliveryStatus,
          external_delivery_id: input.externalDeliveryId
        }
      });

      await client.query('COMMIT');

      return {
        notification: mapOutboundNotification(notificationResult.rows[0]),
        delivery: mapNotificationDelivery(deliveryResult.rows[0])
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordInboundUserAction(input: RecordInboundUserActionInput): Promise<{
    notification: OutboundNotification;
    inboundAction: InboundUserAction;
  }> {
    const client = await postgresPool.connect();

    try {
      await client.query('BEGIN');

      const inboundResult = await client.query<InboundUserActionRow>(
        `
          INSERT INTO inbound_user_actions (
            notification_id,
            action_type,
            actor_id,
            actor_display_name,
            source,
            source_message_id,
            source_chat_id,
            idempotency_key,
            payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
          ON CONFLICT (idempotency_key)
          DO UPDATE SET idempotency_key = inbound_user_actions.idempotency_key
          RETURNING *
        `,
        [
          input.notificationId,
          input.actionType,
          input.actorId,
          input.actorDisplayName ?? null,
          input.source,
          input.sourceMessageId ?? null,
          input.sourceChatId ?? null,
          input.idempotencyKey,
          JSON.stringify(input.payload ?? {})
        ]
      );

      const notificationResult = await client.query<OutboundNotificationRow>(
        `
          UPDATE outbound_notifications
          SET
            status = 'action_received',
            last_action_at = NOW(),
            metadata = metadata || jsonb_build_object(
              'last_user_action',
              jsonb_build_object(
                'action_type', $2,
                'actor_id', $3,
                'source', $4,
                'recorded_at', NOW()
              )
            )
          WHERE id = $1
          RETURNING *
        `,
        [input.notificationId, input.actionType, input.actorId, input.source]
      );

      await insertAuditLog(client, {
        entityType: 'inbound_user_action',
        entityId: inboundResult.rows[0].id,
        action: 'received',
        actorType: 'openclaw_user',
        actorId: input.actorId,
        metadata: {
          notification_id: input.notificationId,
          action_type: input.actionType,
          source: input.source
        }
      });

      await client.query('COMMIT');

      return {
        notification: mapOutboundNotification(notificationResult.rows[0]),
        inboundAction: mapInboundUserAction(inboundResult.rows[0])
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertDigest(input: UpsertDigestInput): Promise<string> {
    const result = await postgresPool.query<{ id: string }>(
      `
        INSERT INTO digests (
          digest_type,
          period_start,
          period_end,
          content
        )
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (digest_type, period_start, period_end)
        DO UPDATE SET
          content = EXCLUDED.content,
          updated_at = NOW()
        RETURNING id
      `,
      [input.digestType, input.periodStart, input.periodEnd, JSON.stringify(input.content)]
    );

    return result.rows[0].id;
  }

  async getDailyDigestSummary(periodStart: string, periodEnd: string, maxItems = 10): Promise<DailyDigestSummary> {
    const summaryResult = await postgresPool.query<DigestSummaryRow>(
      `
        SELECT
          COUNT(*) AS total_classified,
          COUNT(*) FILTER (
            WHERE category = 'emergency'
              OR urgency = 'critical'
              OR emergency_score >= $3
          ) AS urgent_count,
          COUNT(*) FILTER (WHERE needs_reply = TRUE) AS needs_reply_count,
          COUNT(*) FILTER (WHERE task_likelihood >= $4) AS task_candidate_count
        FROM email_classifications
        WHERE classified_at >= $1
          AND classified_at < $2
      `,
      [
        periodStart,
        periodEnd,
        env.CLASSIFICATION_EMERGENCY_THRESHOLD,
        env.CLASSIFICATION_TASK_THRESHOLD
      ]
    );

    const highlightsResult = await postgresPool.query<DigestHighlightRow>(
      `
        SELECT
          classifications.email_id,
          emails.subject,
          emails.from_email,
          classifications.category,
          classifications.urgency,
          classifications.needs_reply,
          classifications.confidence,
          classifications.classified_at
        FROM email_classifications AS classifications
        INNER JOIN emails
          ON emails.id = classifications.email_id
        WHERE classifications.classified_at >= $1
          AND classifications.classified_at < $2
        ORDER BY
          CASE classifications.urgency
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            ELSE 3
          END ASC,
          classifications.emergency_score DESC,
          classifications.classified_at DESC
        LIMIT $3
      `,
      [periodStart, periodEnd, maxItems]
    );

    const summaryRow = summaryResult.rows[0];

    return {
      totalClassified: toNumber(summaryRow?.total_classified),
      urgentCount: toNumber(summaryRow?.urgent_count),
      needsReplyCount: toNumber(summaryRow?.needs_reply_count),
      taskCandidateCount: toNumber(summaryRow?.task_candidate_count),
      highlights: highlightsResult.rows.map((row) => ({
        emailId: row.email_id,
        subject: row.subject,
        fromEmail: row.from_email,
        category: row.category,
        urgency: row.urgency,
        needsReply: row.needs_reply,
        confidence: toNumber(row.confidence),
        classifiedAt: row.classified_at.toISOString()
      }))
    };
  }

  async getApprovalRequestContext(
    emailId: string,
    actionQueueId?: string
  ): Promise<ApprovalRequestContext | null> {
    const emailResult = await postgresPool.query<ApprovalEmailContextRow>(
      `
        SELECT
          emails.id AS email_id,
          emails.subject,
          emails.from_email,
          emails.from_name,
          classifications.category,
          classifications.urgency,
          classifications.confidence
        FROM emails
        LEFT JOIN LATERAL (
          SELECT category, urgency, confidence
          FROM email_classifications
          WHERE email_id = emails.id
            AND classifier_version = $2
          ORDER BY classified_at DESC
          LIMIT 1
        ) AS classifications
          ON TRUE
        WHERE emails.id = $1
        LIMIT 1
      `,
      [emailId, env.CLASSIFICATION_VERSION]
    );

    const emailRow = emailResult.rows[0];

    if (!emailRow) {
      return null;
    }

    let actionQueue:
      | {
          id: string;
          actionType: string;
          priority: number;
          payload: Record<string, unknown>;
        }
      | undefined;

    if (actionQueueId) {
      const actionQueueResult = await postgresPool.query<ApprovalActionQueueContextRow>(
        `
          SELECT id, action_type, priority, payload, email_id
          FROM action_queue
          WHERE id = $1
          LIMIT 1
        `,
        [actionQueueId]
      );

      const actionQueueRow = actionQueueResult.rows[0];

      if (actionQueueRow) {
        actionQueue = {
          id: actionQueueRow.id,
          actionType: actionQueueRow.action_type,
          priority: actionQueueRow.priority,
          payload: actionQueueRow.payload ?? {}
        };
      }
    }

    return {
      emailId: emailRow.email_id,
      subject: emailRow.subject,
      fromEmail: emailRow.from_email,
      ...(emailRow.from_name ? { fromName: emailRow.from_name } : {}),
      ...(emailRow.category && emailRow.urgency
        ? {
            classification: {
              category: emailRow.category,
              urgency: emailRow.urgency,
              confidence: toNumber(emailRow.confidence)
            }
          }
        : {}),
      ...(actionQueue ? { actionQueue } : {})
    };
  }
}
