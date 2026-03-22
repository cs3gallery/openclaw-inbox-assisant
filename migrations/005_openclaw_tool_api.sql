CREATE TABLE IF NOT EXISTS tool_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT NOT NULL,
  outcome TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'openclaw',
  actor_id TEXT,
  source TEXT NOT NULL DEFAULT 'openclaw',
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  action_queue_id UUID REFERENCES action_queue(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_tool_created
  ON tool_invocations (tool_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_email_created
  ON tool_invocations (email_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_invocations_tool_idempotency
  ON tool_invocations (tool_name, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TRIGGER set_tool_invocations_updated_at
BEFORE UPDATE ON tool_invocations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
