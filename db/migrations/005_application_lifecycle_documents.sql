-- Additive support for configurable document requirements, document integrity,
-- replacements/deletions, and explicit information-request responses.

CREATE TABLE IF NOT EXISTS application_information_request (
  request_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES application(application_id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES officer(officer_id),
  notes TEXT NOT NULL,
  requested_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMP,
  response_notes TEXT
);

ALTER TABLE application_document ADD COLUMN IF NOT EXISTS document_type VARCHAR(100);
ALTER TABLE application_document ADD COLUMN IF NOT EXISTS checksum_sha256 VARCHAR(64);
ALTER TABLE application_document ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE application_document ADD COLUMN IF NOT EXISTS replaced_document_id UUID REFERENCES application_document(document_id);
ALTER TABLE application_document ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMP;
ALTER TABLE application_document ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE application_document ADD COLUMN IF NOT EXISTS deleted_by_citizen_id UUID REFERENCES citizen(citizen_id);
ALTER TABLE application ALTER COLUMN land_board_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS application_information_request_app_idx
  ON application_information_request(application_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS application_document_active_type_idx
  ON application_document(application_id, document_type, deleted_at, superseded_at);
