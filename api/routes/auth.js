const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
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

function validPassword(password) {
  return typeof password === 'string' && password.length >= 10;
}

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

// POST /api/auth/citizen/register
router.post('/citizen/register', async (req, res) => {
  const { national_id, full_name, email, password, phone, district } = req.body;
  if (!national_id || !full_name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
  if (!validPassword(password)) return res.status(400).json({ message: 'Password must be at least 10 characters' });
  try {
    const existing = await db.query('SELECT 1 FROM citizen WHERE lower(email) = lower($1) OR national_id = $2', [email, national_id]);
    if (existing.rowCount) return res.status(409).json({ message: 'Account already exists' });
    const citizen_id = require('crypto').randomUUID();
    const password_hash = await bcrypt.hash(password, 10);
    const insertSql = `INSERT INTO citizen (citizen_id,national_id,full_name,email,phone,district,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`;
    await db.query(insertSql, [citizen_id, national_id, full_name, email, phone, district, password_hash]);
    const token = jwt.sign({ citizen_id, full_name, role: 'citizen' }, config.jwtSecret, { expiresIn: '7d' });
    res.json({ citizen_id, token, message: 'Registration successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/citizen/login
router.post('/citizen/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
  if (isRateLimited(`citizen:${req.ip}:${String(email).toLowerCase()}`)) return res.status(429).json({ message: 'Too many attempts. Try again later.' });
  try {
    const result = await db.query('SELECT citizen_id, full_name, password_hash FROM citizen WHERE email = $1', [email]);
    if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ citizen_id: user.citizen_id, full_name: user.full_name, role: 'citizen' }, config.jwtSecret, { expiresIn: '7d' });
    res.json({ citizen_id: user.citizen_id, token, full_name: user.full_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/citizen/password-reset/request', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Missing fields' });
  try {
    const result = await db.query('SELECT citizen_id FROM citizen WHERE lower(email) = lower($1)', [email]);
    if (result.rowCount) await issueResetToken(result.rows[0].citizen_id);
    res.json({ message: 'If the account exists, a reset link has been issued' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to process password reset request' });
  }
});

router.post('/citizen/password-reset/complete', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ message: 'Missing fields' });
  if (!validPassword(password)) return res.status(400).json({ message: 'Password must be at least 10 characters' });
  try {
    const reset = await consumeResetToken(token);
    if (!reset) return res.status(400).json({ message: 'Invalid or expired token' });
    const password_hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE citizen SET password_hash = $1 WHERE citizen_id = $2', [password_hash, reset.citizen_id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to update password' });
  }
});

// POST /api/auth/officer/login
router.post('/officer/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
  if (isRateLimited(`officer:${req.ip}:${String(email).toLowerCase()}`)) return res.status(429).json({ message: 'Too many attempts. Try again later.' });
  try {
    const result = await db.query('SELECT officer_id, full_name, password_hash, land_board_id FROM officer WHERE email = $1', [email]);
    if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ officer_id: user.officer_id, full_name: user.full_name, land_board_id: user.land_board_id, role: 'officer' }, config.jwtSecret, { expiresIn: '2h' });
    res.json({ officer_id: user.officer_id, token, full_name: user.full_name, land_board_id: user.land_board_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/citizen/me', async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
    const result = await db.query('SELECT citizen_id, national_id, full_name, email, phone, district, created_at FROM citizen WHERE citizen_id = $1', [payload.citizen_id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Citizen not found' });
    res.json({ citizen: result.rows[0] });
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
