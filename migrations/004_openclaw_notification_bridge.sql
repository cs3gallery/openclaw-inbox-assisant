CREATE UNIQUE INDEX IF NOT EXISTS idx_digests_type_period_unique
  ON digests (digest_type, period_start, period_end);

CREATE TABLE IF NOT EXISTS outbound_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 100,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  dedupe_key TEXT NOT NULL UNIQUE,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  classification_id UUID REFERENCES email_classifications(id) ON DELETE SET NULL,
  action_queue_id UUID REFERENCES action_queue(id) ON DELETE SET NULL,
  digest_id UUID REFERENCES digests(id) ON DELETE SET NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_action_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES outbound_notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'telegram',
  delivery_status TEXT NOT NULL,
  external_delivery_id TEXT,
  external_chat_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound_user_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES outbound_notifications(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_status TEXT NOT NULL DEFAULT 'received',
  actor_id TEXT NOT NULL,
  actor_display_name TEXT,
  source TEXT NOT NULL DEFAULT 'telegram',
  source_message_id TEXT,
  source_chat_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_notifications_status_available
  ON outbound_notifications (status, available_at, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_outbound_notifications_type_created
  ON outbound_notifications (notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_notifications_email
  ON outbound_notifications (email_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_notifications_action_queue
  ON outbound_notifications (action_queue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification
  ON notification_deliveries (notification_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
  ON notification_deliveries (delivery_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_user_actions_notification
  ON inbound_user_actions (notification_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_user_actions_action_status
  ON inbound_user_actions (action_type, action_status, received_at DESC);

CREATE TRIGGER set_outbound_notifications_updated_at
BEFORE UPDATE ON outbound_notifications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_notification_deliveries_updated_at
BEFORE UPDATE ON notification_deliveries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_inbound_user_actions_updated_at
BEFORE UPDATE ON inbound_user_actions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
