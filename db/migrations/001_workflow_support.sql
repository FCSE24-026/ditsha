CREATE TABLE IF NOT EXISTS application_document (
  document_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES application(application_id) ON DELETE CASCADE,
  uploaded_by_citizen_id UUID REFERENCES citizen(citizen_id),
  original_name VARCHAR(255) NOT NULL,
  storage_name VARCHAR(255) NOT NULL UNIQUE,
  content_type VARCHAR(100) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  scan_status VARCHAR(30) NOT NULL DEFAULT 'unavailable',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS application_note (
  note_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES application(application_id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES officer(officer_id),
  body TEXT NOT NULL,
  citizen_visible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notification (
  notification_id UUID PRIMARY KEY,
  citizen_id UUID NOT NULL REFERENCES citizen(citizen_id) ON DELETE CASCADE,
  application_id UUID REFERENCES application(application_id) ON DELETE CASCADE,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS application_assignment (
  assignment_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES application(application_id) ON DELETE CASCADE,
  officer_id UUID NOT NULL REFERENCES officer(officer_id),
  assigned_by_officer_id UUID REFERENCES officer(officer_id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ml_prediction (
  prediction_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES application(application_id) ON DELETE CASCADE,
  model_version VARCHAR(100) NOT NULL,
  category VARCHAR(80) NOT NULL,
  score NUMERIC(6,5),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  feature_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS application_citizen_idx ON application(citizen_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS application_officer_status_idx ON application(assigned_officer_id, current_status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS application_event_application_idx ON application_event(application_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS notification_citizen_idx ON notification(citizen_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS application_document_application_idx ON application_document(application_id, created_at DESC);
