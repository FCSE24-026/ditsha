-- 004_auth_roles_config.sql
-- Adds: refresh_token revocation, officer.email unique constraint,
--       officer_role, role_permission, and system_configuration tables

-- ── Refresh token revocation store ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_token (
  token_id      UUID PRIMARY KEY,
  token_hash    VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 of the opaque token
  officer_id    UUID REFERENCES officer(officer_id) ON DELETE CASCADE,
  citizen_id    UUID REFERENCES citizen(citizen_id) ON DELETE CASCADE,
  issued_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMP NOT NULL,
  revoked_at    TIMESTAMP,
  CONSTRAINT refresh_token_one_owner CHECK (
    (officer_id IS NOT NULL)::int + (citizen_id IS NOT NULL)::int = 1
  )
);
CREATE INDEX IF NOT EXISTS refresh_token_hash_idx ON refresh_token(token_hash);
CREATE INDEX IF NOT EXISTS refresh_token_citizen_idx ON refresh_token(citizen_id, expires_at);
CREATE INDEX IF NOT EXISTS refresh_token_officer_idx ON refresh_token(officer_id, expires_at);

-- ── Unique email constraint on officer ──────────────────────────────────
-- Remove duplicate emails before adding constraint (safe in fresh/seeded DB)
DELETE FROM officer o1
  USING officer o2
  WHERE o1.created_at > o2.created_at
    AND lower(o1.email) = lower(o2.email);

ALTER TABLE officer ADD CONSTRAINT officer_email_unique UNIQUE (email);

-- ── Role and permission tables ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS officer_role (
  role_id     UUID PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permission (
  permission_id UUID PRIMARY KEY,
  role_id       UUID NOT NULL REFERENCES officer_role(role_id) ON DELETE CASCADE,
  permission    VARCHAR(100) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, permission)
);

CREATE INDEX IF NOT EXISTS role_permission_role_idx ON role_permission(role_id);

-- Seed built-in roles
INSERT INTO officer_role (role_id, name, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'clerk',     'Can view and process applications within assigned land board'),
  ('00000000-0000-0000-0000-000000000002', 'inspector', 'Can inspect, request info, and add field notes'),
  ('00000000-0000-0000-0000-000000000003', 'manager',   'Can approve, reject, assign, and override priority')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permission (permission_id, role_id, permission) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'application:read'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'application:note:add'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'application:status:under_review'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'application:read'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'application:note:add'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'application:status:under_review'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'application:request_info'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'application:read'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'application:note:add'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'application:status:under_review'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'application:request_info'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'application:approve'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'application:reject'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'application:assign'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'application:priority:override'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'officer:manage'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', 'analytics:view')
ON CONFLICT (role_id, permission) DO NOTHING;

-- ── System configuration key-value store ────────────────────────────────
CREATE TABLE IF NOT EXISTS system_configuration (
  config_key    VARCHAR(120) PRIMARY KEY,
  config_value  TEXT NOT NULL,
  description   TEXT,
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES officer(officer_id)
);

-- Default document requirements per application type (overrides hardcoded list in API)
INSERT INTO system_configuration (config_key, config_value, description) VALUES
  ('required_documents.residential_allocation', '["identity_document","proof_of_residence"]', 'Required documents for residential allocation'),
  ('required_documents.land_transfer',          '["identity_document","transfer_consent"]',   'Required documents for land transfer'),
  ('required_documents.lease_renewal',          '["identity_document","existing_lease"]',     'Required documents for lease renewal'),
  ('required_documents.change_of_use',          '["identity_document","planning_statement"]', 'Required documents for change of use'),
  ('auth.max_login_attempts',                   '10',                                         'Max failed logins per window'),
  ('auth.lockout_window_minutes',               '15',                                         'Rate-limit window in minutes'),
  ('auth.access_token_ttl_seconds',             '900',                                        'Access token TTL (15 minutes)'),
  ('auth.refresh_token_ttl_days',               '30',                                         'Refresh token TTL in days')
ON CONFLICT (config_key) DO NOTHING;
