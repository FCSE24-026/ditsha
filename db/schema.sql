-- PostgreSQL schema for Ditsha

CREATE TABLE IF NOT EXISTS citizen (
  citizen_id UUID PRIMARY KEY,
  national_id VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  district VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS land_board (
  land_board_id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  district VARCHAR(100),
  region VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS officer (
  officer_id UUID PRIMARY KEY,
  land_board_id UUID NOT NULL REFERENCES land_board(land_board_id),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application (
  application_id UUID PRIMARY KEY,
  citizen_id UUID NOT NULL REFERENCES citizen(citizen_id),
  land_board_id UUID NOT NULL REFERENCES land_board(land_board_id),
  application_type VARCHAR(100),
  description TEXT,
  reference_number VARCHAR(50) UNIQUE NOT NULL,
  submitted_at TIMESTAMP NOT NULL,
  current_status VARCHAR(50),
  current_stage VARCHAR(100),
  processing_days INTEGER,
  document_complete BOOLEAN DEFAULT FALSE,
  assigned_officer_id UUID REFERENCES officer(officer_id),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE application ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE application ADD COLUMN IF NOT EXISTS processing_days INTEGER;
ALTER TABLE application ADD COLUMN IF NOT EXISTS document_complete BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS application_event (
  event_id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES application(application_id),
  officer_id UUID REFERENCES officer(officer_id),
  event_type VARCHAR(100),
  from_status VARCHAR(50),
  to_status VARCHAR(50),
  stage VARCHAR(100),
  notes TEXT,
  event_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

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
