ALTER TABLE email_classifications
  ALTER COLUMN classifier_version SET DEFAULT 'sprint-3',
  ALTER COLUMN category SET DEFAULT 'uncategorized',
  ALTER COLUMN urgency SET DEFAULT 'medium',
  ALTER COLUMN needs_reply SET DEFAULT FALSE;

ALTER TABLE email_classifications
  ADD COLUMN IF NOT EXISTS task_likelihood NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS finance_doc_type TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS explanation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS model_name TEXT,
  ADD COLUMN IF NOT EXISTS raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE email_classifications
SET
  category = COALESCE(category, 'uncategorized'),
  urgency = COALESCE(urgency, 'medium'),
  emergency_score = COALESCE(emergency_score, 0),
  task_likelihood = COALESCE(task_likelihood, 0),
  finance_doc_type = COALESCE(finance_doc_type, 'unknown'),
  confidence = COALESCE(confidence, 0),
  explanation_json = CASE
    WHEN explanation_json = '{}'::jsonb AND reasoning <> '{}'::jsonb THEN reasoning
    ELSE COALESCE(explanation_json, '{}'::jsonb)
  END;

ALTER TABLE email_classifications
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN urgency SET NOT NULL,
  ALTER COLUMN emergency_score SET DEFAULT 0,
  ALTER COLUMN emergency_score SET NOT NULL,
  ALTER COLUMN task_likelihood SET DEFAULT 0,
  ALTER COLUMN task_likelihood SET NOT NULL,
  ALTER COLUMN finance_doc_type SET DEFAULT 'unknown',
  ALTER COLUMN finance_doc_type SET NOT NULL,
  ALTER COLUMN confidence SET DEFAULT 0,
  ALTER COLUMN confidence SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_classifications_email_version
  ON email_classifications (email_id, classifier_version);

CREATE INDEX IF NOT EXISTS idx_email_classifications_category_urgency
  ON email_classifications (category, urgency, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_queue_action_status_schedule
  ON action_queue (action_type, status, scheduled_for, priority, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_queue_unique_suggest_reply
  ON action_queue (action_type, email_id)
  WHERE action_type = 'suggest_reply' AND email_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_queue_unique_extract_task
  ON action_queue (action_type, email_id)
  WHERE action_type = 'extract_task' AND email_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_queue_unique_extract_document
  ON action_queue (action_type, email_id)
  WHERE action_type = 'extract_document' AND email_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_action_queue_unique_detect_emergency
  ON action_queue (action_type, email_id)
  WHERE action_type = 'detect_emergency' AND email_id IS NOT NULL;
