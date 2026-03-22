export const EMAIL_CATEGORY_VALUES = [
  'emergency',
  'needs_reply',
  'task_request',
  'receipt',
  'invoice',
  'quote',
  'purchase_confirmation',
  'internal_update',
  'system_alert',
  'marketing',
  'newsletter',
  'low_value',
  'uncategorized'
] as const;

export const EMAIL_URGENCY_VALUES = ['low', 'medium', 'high', 'critical'] as const;

export const FINANCE_DOC_TYPE_VALUES = [
  'receipt',
  'invoice',
  'quote',
  'purchase_confirmation',
  'unknown'
] as const;

export const SENTIMENT_VALUES = ['negative', 'neutral', 'positive', 'mixed'] as const;

export const SUGGEST_REPLY_ACTION = 'suggest_reply';
export const EXTRACT_TASK_ACTION = 'extract_task';
export const EXTRACT_DOCUMENT_ACTION = 'extract_document';
export const DETECT_EMERGENCY_ACTION = 'detect_emergency';
