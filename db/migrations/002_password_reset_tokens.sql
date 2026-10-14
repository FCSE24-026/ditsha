CREATE TABLE IF NOT EXISTS password_reset_token (
  token_hash VARCHAR(64) PRIMARY KEY,
  citizen_id UUID NOT NULL REFERENCES citizen(citizen_id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_token_expiry_idx
  ON password_reset_token(expires_at)
  WHERE used_at IS NULL;
