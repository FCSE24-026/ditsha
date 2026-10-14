-- 003_comprehensive_workflow.sql
-- Add support for application drafts, information requests, withdrawals, and priority overrides

ALTER TABLE application ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT FALSE;
ALTER TABLE application ADD COLUMN IF NOT EXISTS priority_score NUMERIC(5, 4);
ALTER TABLE application ADD COLUMN IF NOT EXISTS priority_override_reason TEXT;
ALTER TABLE application ADD COLUMN IF NOT EXISTS priority_overridden_by UUID REFERENCES officer(officer_id);
ALTER TABLE application ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP;
ALTER TABLE application ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS application_land_board_status_idx 
  ON application(land_board_id, current_status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS application_reference_trgm_idx 
  ON application(reference_number);

CREATE INDEX IF NOT EXISTS application_is_draft_idx
  ON application(citizen_id, is_draft);
