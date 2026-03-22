ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS source_provider TEXT NOT NULL DEFAULT 'openclaw_msgraph_connector',
  ADD COLUMN IF NOT EXISTS source_connection_name TEXT,
  ADD COLUMN IF NOT EXISTS source_folder TEXT NOT NULL DEFAULT 'Inbox',
  ADD COLUMN IF NOT EXISTS source_last_modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_to_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS importance TEXT,
  ADD COLUMN IF NOT EXISTS body_content_type TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS email_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT,
  position INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email_id, recipient_type, position)
);

CREATE TABLE IF NOT EXISTS sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  connection_name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  cursor TEXT,
  last_successful_sync_at TIMESTAMPTZ,
  last_seen_received_at TIMESTAMPTZ,
  last_seen_source_updated_at TIMESTAMPTZ,
  last_run_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  connection_name TEXT NOT NULL,
  folders JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'running',
  sync_mode TEXT NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  requested_by TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  messages_seen INTEGER NOT NULL DEFAULT 0,
  messages_processed INTEGER NOT NULL DEFAULT 0,
  messages_inserted INTEGER NOT NULL DEFAULT 0,
  messages_updated INTEGER NOT NULL DEFAULT 0,
  attachments_seen INTEGER NOT NULL DEFAULT 0,
  jobs_published INTEGER NOT NULL DEFAULT 0,
  cursor_before TEXT,
  cursor_after TEXT,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_source_connection_folder_received_at
  ON emails (source_connection_name, source_folder, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_emails_source_last_modified_at
  ON emails (source_last_modified_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_recipients_email_type_position
  ON email_recipients (email_id, recipient_type, position);

CREATE INDEX IF NOT EXISTS idx_email_recipients_email_address
  ON email_recipients (email_address);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_state_scope
  ON sync_state (provider, connection_name, resource_type, resource_key);

CREATE INDEX IF NOT EXISTS idx_sync_state_last_successful_sync_at
  ON sync_state (last_successful_sync_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_at
  ON ingestion_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status_started_at
  ON ingestion_runs (status, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_queue_unique_classify_email
  ON action_queue (action_type, email_id)
  WHERE action_type = 'classify_email' AND email_id IS NOT NULL;

CREATE TRIGGER set_email_recipients_updated_at
BEFORE UPDATE ON email_recipients
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_sync_state_updated_at
BEFORE UPDATE ON sync_state
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_ingestion_runs_updated_at
BEFORE UPDATE ON ingestion_runs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

