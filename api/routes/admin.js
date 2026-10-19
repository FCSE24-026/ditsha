'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

// ── Auth guard: manager-role officers only ────────────────────────────────
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== 'officer') return res.status(403).json({ message: 'Officer access required' });
    if (payload.officer_role !== 'manager') return res.status(403).json({ message: 'Manager role required' });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// ══════════════════════════════════════════════════════════════════════════
// OFFICERS
// ══════════════════════════════════════════════════════════════════════════

// GET /api/admin/officers — list all officers (paginated)
router.get('/officers', adminAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = (req.query.search || '').trim();
  try {
    const searchClause = search ? `AND (lower(o.full_name) LIKE lower($3) OR lower(o.email) LIKE lower($3))` : '';
    const params = [limit, offset];
    if (search) params.push(`%${search}%`);

    const result = await db.query(
      `SELECT o.officer_id, o.full_name, o.email, o.role, o.land_board_id,
              lb.name AS land_board_name, o.created_at
       FROM officer o
       LEFT JOIN land_board lb ON lb.land_board_id = o.land_board_id
       WHERE TRUE ${searchClause}
       ORDER BY o.created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    );
    const countResult = await db.query(
      `SELECT count(*) AS total FROM officer o WHERE TRUE ${searchClause}`,
      search ? [`%${search}%`] : [],
    );
    res.json({ officers: result.rows, total: Number(countResult.rows[0].total) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to list officers' });
  }
});

// GET /api/admin/officers/:id — officer detail
router.get('/officers/:id', adminAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Invalid officer_id' });
  try {
    const result = await db.query(
      `SELECT o.officer_id, o.full_name, o.email, o.role, o.land_board_id,
              lb.name AS land_board_name, o.created_at
       FROM officer o
       LEFT JOIN land_board lb ON lb.land_board_id = o.land_board_id
       WHERE o.officer_id = $1`,
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Officer not found' });
    res.json({ officer: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to fetch officer' });
  }
});

// POST /api/admin/officers — create new officer
router.post('/officers', adminAuth, async (req, res) => {
  const { full_name, email, role, land_board_id, password } = req.body;
  if (!full_name || !email || !land_board_id || !password) {
    return res.status(400).json({ message: 'full_name, email, land_board_id, and password are required' });
  }
  if (!isUuid(land_board_id)) return res.status(400).json({ message: 'land_board_id must be a UUID' });
  if (typeof password !== 'string' || password.length < 10) {
    return res.status(400).json({ message: 'Password must be at least 10 characters' });
  }
  const VALID_ROLES = new Set(['clerk', 'inspector', 'manager']);
  const officerRole = VALID_ROLES.has(role) ? role : 'clerk';
  try {
    const existing = await db.query('SELECT 1 FROM officer WHERE lower(email) = lower($1)', [email]);
    if (existing.rowCount) return res.status(409).json({ message: 'An officer with that email already exists' });

    const board = await db.query('SELECT 1 FROM land_board WHERE land_board_id = $1', [land_board_id]);
    if (!board.rowCount) return res.status(400).json({ message: 'Unknown land_board_id' });

    const officer_id = crypto.randomUUID();
    const password_hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO officer (officer_id, land_board_id, full_name, email, role, password_hash) VALUES ($1,$2,$3,$4,$5,$6)',
      [officer_id, land_board_id, full_name, email, officerRole, password_hash],
    );

    // Audit event
    await db.query(
      `INSERT INTO application_event (event_id, application_id, officer_id, event_type, notes, event_timestamp)
       SELECT $1, NULL, $2, 'officer_created', $3, NOW()
       WHERE FALSE`, // No application_id; use system_configuration for this pattern if needed
      [],
    );

    res.status(201).json({ officer_id, full_name, email, role: officerRole, land_board_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to create officer' });
  }
});

// PUT /api/admin/officers/:id — update officer
router.put('/officers/:id', adminAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Invalid officer_id' });
  const { full_name, role, land_board_id } = req.body;
  const VALID_ROLES = new Set(['clerk', 'inspector', 'manager']);
  try {
    const check = await db.query('SELECT officer_id FROM officer WHERE officer_id = $1', [req.params.id]);
    if (!check.rowCount) return res.status(404).json({ message: 'Officer not found' });

    const updates = [];
    const values = [];
    if (full_name && full_name.trim().length >= 2) { updates.push(`full_name = $${updates.length + 1}`); values.push(full_name.trim()); }
    if (role && VALID_ROLES.has(role)) { updates.push(`role = $${updates.length + 1}`); values.push(role); }
    if (land_board_id) {
      if (!isUuid(land_board_id)) return res.status(400).json({ message: 'land_board_id must be a UUID' });
      const board = await db.query('SELECT 1 FROM land_board WHERE land_board_id = $1', [land_board_id]);
      if (!board.rowCount) return res.status(400).json({ message: 'Unknown land_board_id' });
      updates.push(`land_board_id = $${updates.length + 1}`); values.push(land_board_id);
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No valid fields to update' });

    values.push(req.params.id);
    const result = await db.query(
      `UPDATE officer SET ${updates.join(', ')} WHERE officer_id = $${values.length}
       RETURNING officer_id, full_name, email, role, land_board_id`,
      values,
    );
    res.json({ officer: result.rows[0], message: 'Officer updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to update officer' });
  }
});

// DELETE /api/admin/officers/:id — soft-deactivate by revoking all refresh tokens
// (Hard deletion is blocked to preserve audit trail; role can be set to 'deactivated')
router.delete('/officers/:id', adminAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Invalid officer_id' });
  if (req.params.id === req.user.officer_id) return res.status(400).json({ message: 'You cannot deactivate your own account' });
  try {
    const check = await db.query('SELECT officer_id FROM officer WHERE officer_id = $1', [req.params.id]);
    if (!check.rowCount) return res.status(404).json({ message: 'Officer not found' });
    // Revoke all active sessions
    await db.query('UPDATE refresh_token SET revoked_at = NOW() WHERE officer_id = $1 AND revoked_at IS NULL', [req.params.id]);
    // Mark role as deactivated to block future logins via role check
    await db.query("UPDATE officer SET role = 'deactivated' WHERE officer_id = $1", [req.params.id]);
    res.json({ message: 'Officer deactivated and sessions revoked' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to deactivate officer' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ROLES & PERMISSIONS
// ══════════════════════════════════════════════════════════════════════════

// GET /api/admin/roles — list all roles and their permissions
router.get('/roles', adminAuth, async (req, res) => {
  try {
    const roles = await db.query('SELECT role_id, name, description, created_at FROM officer_role ORDER BY name');
    const permissions = await db.query('SELECT role_id, permission FROM role_permission ORDER BY role_id, permission');
    const permMap = {};
    for (const row of permissions.rows) {
      permMap[row.role_id] = permMap[row.role_id] || [];
      permMap[row.role_id].push(row.permission);
    }
    res.json({
      roles: roles.rows.map((r) => ({ ...r, permissions: permMap[r.role_id] || [] })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to fetch roles' });
  }
});

// POST /api/admin/roles — create a new role
router.post('/roles', adminAuth, async (req, res) => {
  const { name, description, permissions } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ message: 'role name is required' });
  }
  try {
    const existing = await db.query('SELECT 1 FROM officer_role WHERE lower(name) = lower($1)', [name.trim()]);
    if (existing.rowCount) return res.status(409).json({ message: 'Role name already exists' });
    const role_id = crypto.randomUUID();
    await db.query(
      'INSERT INTO officer_role (role_id, name, description) VALUES ($1, $2, $3)',
      [role_id, name.trim(), description || null],
    );
    if (Array.isArray(permissions) && permissions.length) {
      for (const perm of permissions) {
        await db.query(
          'INSERT INTO role_permission (permission_id, role_id, permission) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [crypto.randomUUID(), role_id, String(perm)],
        );
      }
    }
    res.status(201).json({ role_id, name: name.trim(), permissions: permissions || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to create role' });
  }
});

// PUT /api/admin/roles/:id/permissions — replace permissions for a role
router.put('/roles/:id/permissions', adminAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ message: 'Invalid role_id' });
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) return res.status(400).json({ message: 'permissions must be an array' });
  try {
    const role = await db.query('SELECT role_id FROM officer_role WHERE role_id = $1', [req.params.id]);
    if (!role.rowCount) return res.status(404).json({ message: 'Role not found' });
    await db.query('DELETE FROM role_permission WHERE role_id = $1', [req.params.id]);
    for (const perm of permissions) {
      await db.query(
        'INSERT INTO role_permission (permission_id, role_id, permission) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [crypto.randomUUID(), req.params.id, String(perm)],
      );
    }
    res.json({ role_id: req.params.id, permissions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to update permissions' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// SYSTEM CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════

// GET /api/admin/config — list all configuration entries
router.get('/config', adminAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT config_key, config_value, description, updated_at FROM system_configuration ORDER BY config_key');
    res.json({ config: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to fetch configuration' });
  }
});

// PUT /api/admin/config/:key — update a configuration value
router.put('/config/:key', adminAuth, async (req, res) => {
  const { value, description } = req.body;
  if (value === undefined || value === null) return res.status(400).json({ message: 'value is required' });
  try {
    const result = await db.query(
      `INSERT INTO system_configuration (config_key, config_value, description, updated_at, updated_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (config_key) DO UPDATE
         SET config_value = EXCLUDED.config_value,
             description  = COALESCE(EXCLUDED.description, system_configuration.description),
             updated_at   = NOW(),
             updated_by   = EXCLUDED.updated_by
       RETURNING config_key, config_value, description, updated_at`,
      [req.params.key, String(value), description || null, req.user.officer_id],
    );
    res.json({ config: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to update configuration' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════════════════════

// GET /api/admin/audit — paginated audit event log
router.get('/audit', adminAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const application_id = req.query.application_id;
  const officer_id = req.query.officer_id;
  try {
    const conditions = [];
    const params = [limit, offset];
    if (application_id && isUuid(application_id)) {
      params.push(application_id);
      conditions.push(`ae.application_id = $${params.length}`);
    }
    if (officer_id && isUuid(officer_id)) {
      params.push(officer_id);
      conditions.push(`ae.officer_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT ae.event_id, ae.application_id, ae.officer_id, o.full_name AS officer_name,
              ae.event_type, ae.from_status, ae.to_status, ae.stage, ae.notes, ae.event_timestamp
       FROM application_event ae
       LEFT JOIN officer o ON o.officer_id = ae.officer_id
       ${where}
       ORDER BY ae.event_timestamp DESC
       LIMIT $1 OFFSET $2`,
      params,
    );
    res.json({ events: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to fetch audit log' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// OPERATIONAL METRICS
// ══════════════════════════════════════════════════════════════════════════

// GET /api/admin/metrics — system-wide operational health
router.get('/metrics', adminAuth, async (req, res) => {
  try {
    const [appStats, officerCount, pendingNotif] = await Promise.all([
      db.query(
        `SELECT current_status, count(*) AS count FROM application GROUP BY current_status ORDER BY current_status`,
      ),
      db.query('SELECT count(*) AS total FROM officer'),
      db.query('SELECT count(*) AS total FROM notification WHERE read_at IS NULL'),
    ]);
    res.json({
      application_status_breakdown: appStats.rows,
      total_officers: Number(officerCount.rows[0].total),
      unread_notifications: Number(pendingNotif.rows[0].total),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to fetch metrics' });
  }
});

module.exports = router;
