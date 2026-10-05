const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function officerAuth(req, res, next) {
  // reuse jwt but require role officer
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    if (!payload.role || payload.role !== 'officer') return res.status(403).json({ message: 'Forbidden' });
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// POST /api/applications - submit new application
router.post('/applications', authMiddleware, async (req, res) => {
  const { application_type, land_board_id, description } = req.body;
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  if (!application_type || !land_board_id) return res.status(400).json({ message: 'application_type and land_board_id are required' });
  try {
    const application_id = require('crypto').randomUUID();
    const reference_number = `APP-${new Date().getFullYear()}-${Math.floor(Math.random()*100000).toString().padStart(5,'0')}`;
    const submitted_at = new Date().toISOString();
    const insertSql = `INSERT INTO application (application_id,citizen_id,land_board_id,application_type,description,reference_number,submitted_at,current_status,current_stage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
    await db.query(insertSql, [application_id, req.user.citizen_id, land_board_id, application_type, description || null, reference_number, submitted_at, 'submitted', 'initial_review']);
    res.json({ application_id, reference_number, status: 'submitted', submitted_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/:id - view application
router.get('/applications/:id', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  const id = req.params.id;
  try {
    const params = [id];
    const ownerFilter = req.user.citizen_id ? 'AND citizen_id = $2' : '';
    if (req.user.citizen_id) params.push(req.user.citizen_id);
    const result = await db.query(`SELECT * FROM application WHERE application_id = $1 ${ownerFilter}`, params);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    // normalize response shape
    const a = result.rows[0];
    res.json({
      application_id: a.application_id,
      reference_number: a.reference_number,
      application_type: a.application_type,
      description: a.description,
      status: a.current_status,
      current_stage: a.current_stage,
      submitted_at: a.submitted_at,
      assigned_officer_id: a.assigned_officer_id,
      citizen_id: a.citizen_id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/officer/applications - list applications for officer (paginated)
router.get('/officer/applications', officerAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { status = 'all' } = req.query;
  const sortBy = ['submitted_at', 'current_status', 'reference_number'].includes(req.query.sortBy) ? req.query.sortBy : 'submitted_at';
  const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;
  try {
    const params = [req.user.officer_id];
    let where = 'WHERE assigned_officer_id = $1';
    if (status && status !== 'all') {
      params.push(status);
      where = `WHERE current_status = $${params.length}`;
      where += ' AND assigned_officer_id = $1';
    }
    const totalRes = await db.query(`SELECT count(*) FROM application ${where}`, params);
    const total = Number(totalRes.rows[0].count);
    params.push(limit, offset);
    const appsRes = await db.query(`SELECT a.application_id,a.reference_number,a.application_type,a.current_status,a.submitted_at,a.assigned_officer_id,c.full_name AS citizen_name FROM application a JOIN citizen c ON c.citizen_id = a.citizen_id ${where.replaceAll('assigned_officer_id', 'a.assigned_officer_id').replaceAll('current_status', 'a.current_status')} ORDER BY a.${sortBy} ${sortOrder} LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    res.json({ applications: appsRes.rows, total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/officer/analytics/dashboard
router.get('/officer/analytics/dashboard', officerAuth, async (req, res) => {
  try {
    const filter = 'WHERE assigned_officer_id = $1';
    const totalRes = await db.query(`SELECT count(*) FROM application ${filter}`, [req.user.officer_id]);
    const avgRes = await db.query("SELECT avg(now()-submitted_at) as avg_processing FROM application WHERE current_status = 'approved' AND assigned_officer_id = $1", [req.user.officer_id]);
    const byStatus = await db.query(`SELECT current_status, count(*) FROM application ${filter} GROUP BY current_status`, [req.user.officer_id]);
    res.json({
      total_applications: Number(totalRes.rows[0].count),
      avg_processing_days: avgRes.rows[0].avg_processing ? Math.round((parseFloat(avgRes.rows[0].avg_processing) / (60*60*24)) ) : null,
      applications_by_status: byStatus.rows.reduce((acc,r)=>{acc[r.current_status]=Number(r.count);return acc;},{})
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
