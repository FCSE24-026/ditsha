const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');

// ── In-memory rate limiter (keyed by IP + identity) ─────────────────────
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(key) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > MAX_ATTEMPTS;
}

// ── Password policy ──────────────────────────────────────────────────────
function validPassword(password) {
  return typeof password === 'string' && password.length >= 10;
}

// ── Refresh token helpers ────────────────────────────────────────────────
const REFRESH_TTL_DAYS = 30;
const ACCESS_TTL_SECONDS = 900; // 15 minutes

async function issueTokenPair(payload) {
  const accessToken = jwt.sign(payload, config.jwtSecret, { expiresIn: ACCESS_TTL_SECONDS });
  const opaqueToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(opaqueToken).digest('hex');
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO refresh_token (token_id, token_hash, citizen_id, officer_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      tokenId,
      tokenHash,
      payload.citizen_id || null,
      payload.officer_id || null,
      expiresAt,
    ],
  );
  return { accessToken, token: accessToken, refreshToken: opaqueToken, expiresIn: ACCESS_TTL_SECONDS };
}

async function consumeRefreshToken(opaqueToken) {
  const tokenHash = crypto.createHash('sha256').update(opaqueToken).digest('hex');
  const result = await db.query(
    `UPDATE refresh_token
     SET revoked_at = NOW()
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     RETURNING token_id, citizen_id, officer_id`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

// ── Password reset helpers ───────────────────────────────────────────────
async function issueResetToken(citizenId) {
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await db.query(
    `INSERT INTO password_reset_token (token_hash, citizen_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [tokenHash, citizenId],
  );
  return token;
}

async function consumeResetToken(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await db.query(
    `UPDATE password_reset_token
     SET used_at = NOW()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING citizen_id`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

// ── POST /api/auth/citizen/register ─────────────────────────────────────
router.post('/citizen/register', async (req, res) => {
  const { national_id, full_name, email, password, phone, district } = req.body;
  if (!national_id || !full_name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
  if (!validPassword(password)) return res.status(400).json({ message: 'Password must be at least 10 characters' });
  if (isRateLimited(`register:${req.ip}`)) return res.status(429).json({ message: 'Too many attempts. Try again later.' });
  try {
    const existing = await db.query('SELECT 1 FROM citizen WHERE lower(email) = lower($1) OR national_id = $2', [email, national_id]);
    if (existing.rowCount) return res.status(409).json({ message: 'Account already exists' });
    const citizen_id = crypto.randomUUID();
    const password_hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO citizen (citizen_id,national_id,full_name,email,phone,district,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [citizen_id, national_id, full_name, email, phone, district, password_hash],
    );
    const payload = { citizen_id, full_name, role: 'citizen' };
    const tokens = await issueTokenPair(payload);
    res.json({ citizen_id, ...tokens, message: 'Registration successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/citizen/login ─────────────────────────────────────────
router.post('/citizen/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
  if (isRateLimited(`citizen:${req.ip}:${String(email).toLowerCase()}`)) return res.status(429).json({ message: 'Too many attempts. Try again later.' });
  try {
    const result = await db.query('SELECT citizen_id, full_name, password_hash FROM citizen WHERE lower(email) = lower($1)', [email]);
    if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const payload = { citizen_id: user.citizen_id, full_name: user.full_name, role: 'citizen' };
    const tokens = await issueTokenPair(payload);
    res.json({ citizen_id: user.citizen_id, full_name: user.full_name, ...tokens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/officer/login ─────────────────────────────────────────
router.post('/officer/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
  if (isRateLimited(`officer:${req.ip}:${String(email).toLowerCase()}`)) return res.status(429).json({ message: 'Too many attempts. Try again later.' });
  try {
    const result = await db.query(
      'SELECT officer_id, full_name, password_hash, land_board_id, role FROM officer WHERE lower(email) = lower($1)',
      [email],
    );
    if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const payload = {
      officer_id: user.officer_id,
      full_name: user.full_name,
      land_board_id: user.land_board_id,
      role: 'officer',
      officer_role: user.role,
    };
    const tokens = await issueTokenPair(payload);
    res.json({ officer_id: user.officer_id, full_name: user.full_name, land_board_id: user.land_board_id, ...tokens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────
// Exchange a valid refresh token for a new access + refresh token pair.
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ message: 'refresh_token is required' });
  try {
    const record = await consumeRefreshToken(refresh_token);
    if (!record) return res.status(401).json({ message: 'Invalid or expired refresh token' });

    let payload;
    if (record.citizen_id) {
      const citizen = await db.query(
        'SELECT citizen_id, full_name FROM citizen WHERE citizen_id = $1',
        [record.citizen_id],
      );
      if (!citizen.rowCount) return res.status(401).json({ message: 'Account not found' });
      const u = citizen.rows[0];
      payload = { citizen_id: u.citizen_id, full_name: u.full_name, role: 'citizen' };
    } else {
      const officer = await db.query(
        'SELECT officer_id, full_name, land_board_id, role FROM officer WHERE officer_id = $1',
        [record.officer_id],
      );
      if (!officer.rowCount) return res.status(401).json({ message: 'Account not found' });
      const u = officer.rows[0];
      payload = { officer_id: u.officer_id, full_name: u.full_name, land_board_id: u.land_board_id, role: 'officer', officer_role: u.role };
    }

    const tokens = await issueTokenPair(payload);
    res.json(tokens);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to refresh token' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────
// Revoke the provided refresh token. Access token expiry is handled by its TTL.
router.post('/logout', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ message: 'refresh_token is required' });
  try {
    await consumeRefreshToken(refresh_token); // revoke if valid; ignore if already expired/invalid
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to process logout' });
  }
});

// ── POST /api/auth/citizen/password-reset/request ────────────────────────
router.post('/citizen/password-reset/request', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Missing fields' });
  if (isRateLimited(`pw-reset:${req.ip}`)) return res.status(429).json({ message: 'Too many attempts. Try again later.' });
  try {
    const result = await db.query('SELECT citizen_id FROM citizen WHERE lower(email) = lower($1)', [email]);
    if (result.rowCount) await issueResetToken(result.rows[0].citizen_id);
    // Non-revealing: same response whether account exists or not
    res.json({ message: 'If the account exists, a reset link has been issued' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to process password reset request' });
  }
});

// ── POST /api/auth/citizen/password-reset/complete ────────────────────────
router.post('/citizen/password-reset/complete', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ message: 'Missing fields' });
  if (!validPassword(password)) return res.status(400).json({ message: 'Password must be at least 10 characters' });
  try {
    const reset = await consumeResetToken(token);
    if (!reset) return res.status(400).json({ message: 'Invalid or expired token' });
    const password_hash = await bcrypt.hash(password, 10);
    // Revoke all existing refresh tokens for this citizen after password reset
    await db.query('UPDATE refresh_token SET revoked_at = NOW() WHERE citizen_id = $1 AND revoked_at IS NULL', [reset.citizen_id]);
    await db.query('UPDATE citizen SET password_hash = $1 WHERE citizen_id = $2', [password_hash, reset.citizen_id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to update password' });
  }
});

// ── GET /api/auth/citizen/me ──────────────────────────────────────────────
router.get('/citizen/me', async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
    const result = await db.query(
      'SELECT citizen_id, national_id, full_name, email, phone, district, created_at FROM citizen WHERE citizen_id = $1',
      [payload.citizen_id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Citizen not found' });
    res.json({ citizen: result.rows[0] });
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ── PUT /api/auth/citizen/me ──────────────────────────────────────────────
router.put('/citizen/me', async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
    const { full_name, phone, district } = req.body;
    if (!full_name || full_name.trim().length < 2) {
      return res.status(400).json({ message: 'Valid full name is required' });
    }
    const result = await db.query(
      `UPDATE citizen
       SET full_name = $1, phone = COALESCE($2, phone), district = COALESCE($3, district)
       WHERE citizen_id = $4
       RETURNING citizen_id, national_id, full_name, email, phone, district, created_at`,
      [full_name.trim(), phone ? phone.trim() : null, district ? district.trim() : null, payload.citizen_id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Citizen not found' });
    res.json({ citizen: result.rows[0], message: 'Profile updated successfully' });
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
