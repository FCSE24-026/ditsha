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
