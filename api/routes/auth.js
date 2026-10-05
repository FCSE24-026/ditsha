const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// POST /api/auth/citizen/register
router.post('/citizen/register', async (req, res) => {
  const { national_id, full_name, email, password, phone, district } = req.body;
  if (!national_id || !full_name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
  try {
    const citizen_id = require('crypto').randomUUID();
    const password_hash = await bcrypt.hash(password, 10);
    const insertSql = `INSERT INTO citizen (citizen_id,national_id,full_name,email,phone,district,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`;
    await db.query(insertSql, [citizen_id, national_id, full_name, email, phone, district, password_hash]);
    const token = jwt.sign({ citizen_id, full_name, role: 'citizen' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
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
  try {
    const result = await db.query('SELECT citizen_id, full_name, password_hash FROM citizen WHERE email = $1', [email]);
    if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ citizen_id: user.citizen_id, full_name: user.full_name, role: 'citizen' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
    res.json({ citizen_id: user.citizen_id, token, full_name: user.full_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// POST /api/auth/officer/login
router.post('/officer/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
  try {
    const result = await db.query('SELECT officer_id, full_name, password_hash, land_board_id FROM officer WHERE email = $1', [email]);
    if (result.rowCount === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ officer_id: user.officer_id, full_name: user.full_name, land_board_id: user.land_board_id, role: 'officer' }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
    res.json({ officer_id: user.officer_id, token, full_name: user.full_name, land_board_id: user.land_board_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
