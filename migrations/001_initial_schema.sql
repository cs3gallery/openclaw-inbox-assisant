CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS sender_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  organization TEXT,
  importance_score NUMERIC(5,4) NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  relationship_notes TEXT,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_profile_id UUID REFERENCES sender_profiles(id) ON DELETE SET NULL,
  graph_message_id TEXT NOT NULL UNIQUE,
  internet_message_id TEXT UNIQUE,
  conversation_id TEXT,
  subject TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  bcc_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  received_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  body_preview TEXT,
  body_text TEXT,
  body_html TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  source_updated_at TIMESTAMPTZ,
  raw_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  classifier_version TEXT NOT NULL DEFAULT 'sprint-1',
  urgency TEXT,
  category TEXT,
  needs_reply BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_detected BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_score NUMERIC(5,4),
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasoning JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email_id, classifier_version)
);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  graph_attachment_id TEXT,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  one_drive_path TEXT,
  is_inline BOOLEAN NOT NULL DEFAULT FALSE,
  finance_related BOOLEAN NOT NULL DEFAULT FALSE,
  download_status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email_id, graph_attachment_id)
);

CREATE TABLE IF NOT EXISTS extracted_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID REFERENCES attachments(id) ON DELETE CASCADE,
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  document_type TEXT,
  vendor_name TEXT,
  document_date DATE,
  total_amount NUMERIC(12,2),
  currency TEXT,
  confidence NUMERIC(5,4),
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reply_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  suggestion_text TEXT,
  tone TEXT,
  model_name TEXT,
  source_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  external_task_id TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'suggested',
  assignee TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  classification_id UUID REFERENCES email_classifications(id) ON DELETE SET NULL,
  feedback_type TEXT NOT NULL,
  feedback_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  approval_mode TEXT NOT NULL DEFAULT 'manual',
  thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 100,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_type TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivered_to JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_conversation_id ON emails (conversation_id);
CREATE INDEX IF NOT EXISTS idx_emails_from_email ON emails (from_email);
CREATE INDEX IF NOT EXISTS idx_email_classifications_email_id ON email_classifications (email_id);
CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments (email_id);
CREATE INDEX IF NOT EXISTS idx_extracted_documents_attachment_id ON extracted_documents (attachment_id);
CREATE INDEX IF NOT EXISTS idx_extracted_documents_email_id ON extracted_documents (email_id);
CREATE INDEX IF NOT EXISTS idx_reply_suggestions_email_id ON reply_suggestions (email_id);
CREATE INDEX IF NOT EXISTS idx_tasks_email_id ON tasks (email_id);
CREATE INDEX IF NOT EXISTS idx_training_feedback_email_id ON training_feedback (email_id);
CREATE INDEX IF NOT EXISTS idx_action_queue_status_schedule ON action_queue (status, scheduled_for, priority);
CREATE INDEX IF NOT EXISTS idx_digests_period ON digests (digest_type, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id, occurred_at DESC);

CREATE TRIGGER set_sender_profiles_updated_at
BEFORE UPDATE ON sender_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_emails_updated_at
BEFORE UPDATE ON emails
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_email_classifications_updated_at
BEFORE UPDATE ON email_classifications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_attachments_updated_at
BEFORE UPDATE ON attachments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_extracted_documents_updated_at
BEFORE UPDATE ON extracted_documents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_reply_suggestions_updated_at
BEFORE UPDATE ON reply_suggestions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_automation_policies_updated_at
BEFORE UPDATE ON automation_policies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_action_queue_updated_at
BEFORE UPDATE ON action_queue
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TRIGGER set_digests_updated_at
BEFORE UPDATE ON digests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

