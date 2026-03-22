export const OUTBOUND_NOTIFICATION_TYPES = [
  'urgent_alert',
  'daily_digest',
  'approval_request'
] as const;

export const OUTBOUND_NOTIFICATION_STATUSES = [
  'pending',
  'delivered',
  'delivery_failed',
  'action_received',
  'cancelled'
] as const;

export const NOTIFICATION_DELIVERY_STATUSES = ['sent', 'delivered', 'failed'] as const;

export const INBOUND_USER_ACTION_TYPES = [
  'approve',
  'reject',
  'snooze',
  'mark_not_important',
  'create_todo',
  'forward_to_bill_com',
  'file_to_onedrive'
] as const;

export const INBOUND_USER_ACTION_STATUSES = ['received', 'applied', 'rejected', 'ignored'] as const;

export const DEFAULT_URGENT_ALERT_ACTIONS = [
  'snooze',
  'create_todo',
  'mark_not_important'
] as const;

export const DEFAULT_DAILY_DIGEST_ACTIONS = [
  'snooze',
  'mark_not_important',
  'create_todo'
] as const;

export const DEFAULT_APPROVAL_ACTIONS = ['approve', 'reject', 'snooze'] as const;
