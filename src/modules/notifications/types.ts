import { z } from 'zod';

import {
  DEFAULT_APPROVAL_ACTIONS,
  DEFAULT_DAILY_DIGEST_ACTIONS,
  DEFAULT_URGENT_ALERT_ACTIONS,
  INBOUND_USER_ACTION_STATUSES,
  INBOUND_USER_ACTION_TYPES,
  NOTIFICATION_DELIVERY_STATUSES,
  OUTBOUND_NOTIFICATION_STATUSES,
  OUTBOUND_NOTIFICATION_TYPES
} from './constants';

export const outboundNotificationTypeSchema = z.enum(OUTBOUND_NOTIFICATION_TYPES);
export const outboundNotificationStatusSchema = z.enum(OUTBOUND_NOTIFICATION_STATUSES);
export const notificationDeliveryStatusSchema = z.enum(NOTIFICATION_DELIVERY_STATUSES);
export const inboundUserActionTypeSchema = z.enum(INBOUND_USER_ACTION_TYPES);
export const inboundUserActionStatusSchema = z.enum(INBOUND_USER_ACTION_STATUSES);

export const notificationActionSchema = z.object({
  type: inboundUserActionTypeSchema,
  label: z.string().min(1).max(80)
});

export const urgentAlertPayloadSchema = z.object({
  email_id: z.string().uuid(),
  classification_id: z.string().uuid(),
  subject: z.string().min(1),
  from_email: z.string().email(),
  from_name: z.string().optional(),
  received_at: z.string().optional(),
  category: z.string().min(1),
  urgency: z.string().min(1),
  emergency_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  next_actions: z.array(z.string().min(1)).default([])
});

export const dailyDigestItemSchema = z.object({
  email_id: z.string().uuid(),
  subject: z.string().min(1),
  from_email: z.string().email(),
  category: z.string().min(1),
  urgency: z.string().min(1),
  needs_reply: z.boolean(),
  confidence: z.number().min(0).max(1),
  classified_at: z.string()
});

export const dailyDigestPayloadSchema = z.object({
  digest_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  total_classified: z.number().int().nonnegative(),
  urgent_count: z.number().int().nonnegative(),
  needs_reply_count: z.number().int().nonnegative(),
  task_candidate_count: z.number().int().nonnegative(),
  highlights: z.array(dailyDigestItemSchema).max(25)
});

export const approvalRequestPayloadSchema = z.object({
  email_id: z.string().uuid(),
  action_queue_id: z.string().uuid().optional(),
  requested_actions: z.array(inboundUserActionTypeSchema).min(1),
  requested_by: z.string().optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  subject: z.string().min(1),
  from_email: z.string().email(),
  from_name: z.string().optional(),
  classification: z
    .object({
      category: z.string().min(1),
      urgency: z.string().min(1),
      confidence: z.number().min(0).max(1)
    })
    .optional(),
  action_queue: z
    .object({
      action_type: z.string().min(1),
      priority: z.number().int(),
      payload: z.record(z.string(), z.unknown())
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const outboundNotificationPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('urgent_alert'),
    data: urgentAlertPayloadSchema
  }),
  z.object({
    type: z.literal('daily_digest'),
    data: dailyDigestPayloadSchema
  }),
  z.object({
    type: z.literal('approval_request'),
    data: approvalRequestPayloadSchema
  })
]);

export type OutboundNotificationType = z.infer<typeof outboundNotificationTypeSchema>;
export type OutboundNotificationStatus = z.infer<typeof outboundNotificationStatusSchema>;
export type NotificationDeliveryStatus = z.infer<typeof notificationDeliveryStatusSchema>;
export type InboundUserActionType = z.infer<typeof inboundUserActionTypeSchema>;
export type InboundUserActionStatus = z.infer<typeof inboundUserActionStatusSchema>;
export type NotificationAction = z.infer<typeof notificationActionSchema>;
export type OutboundNotificationPayload = z.infer<typeof outboundNotificationPayloadSchema>;
export type UrgentAlertPayload = z.infer<typeof urgentAlertPayloadSchema>;
export type DailyDigestPayload = z.infer<typeof dailyDigestPayloadSchema>;
export type ApprovalRequestPayload = z.infer<typeof approvalRequestPayloadSchema>;

export const defaultUrgentAlertActions = DEFAULT_URGENT_ALERT_ACTIONS.map((type) => ({
  type,
  label:
    type === 'create_todo'
      ? 'Create Todo'
      : type === 'mark_not_important'
        ? 'Not Important'
        : 'Snooze'
}));

export const defaultDailyDigestActions = DEFAULT_DAILY_DIGEST_ACTIONS.map((type) => ({
  type,
  label:
    type === 'create_todo'
      ? 'Create Todo'
      : type === 'mark_not_important'
        ? 'Not Important'
        : 'Snooze'
}));

export const defaultApprovalActions = DEFAULT_APPROVAL_ACTIONS.map((type) => ({
  type,
  label: type === 'approve' ? 'Approve' : type === 'reject' ? 'Reject' : 'Snooze'
}));
