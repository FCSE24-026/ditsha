const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');

const VALID_STATUSES = new Set(['submitted', 'under_review', 'approved', 'rejected']);
const ALLOWED_TRANSITIONS = {
  submitted: new Set(['under_review']),
  under_review: new Set(['approved', 'rejected']),
  approved: new Set(),
  rejected: new Set(),
};
const STAGE_BY_STATUS = {
  submitted: 'initial_review',
  under_review: 'documentation_review',
  approved: 'final_decision',
  rejected: 'final_decision',
};
const REQUIRED_DOCUMENTS = {
  residential_allocation: ['identity_document', 'proof_of_residence'],
  land_transfer: ['identity_document', 'transfer_consent'],
  lease_renewal: ['identity_document', 'existing_lease'],
  change_of_use: ['identity_document', 'planning_statement'],
};
const documentDir = path.join(__dirname, '..', 'private-documents');
fs.mkdirSync(documentDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: documentDir,
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
    callback(null, allowed.has(file.mimetype));
  },
});

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createNotificationQuery(citizenId, applicationId, type, title, body) {
  return {
    text: `INSERT INTO notification (notification_id, citizen_id, application_id, type, title, body)
           VALUES ($1,$2,$3,$4,$5,$6)`,
    values: [crypto.randomUUID(), citizenId, applicationId, type, title, body],
  };
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
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
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.role || payload.role !== 'officer') return res.status(403).json({ message: 'Forbidden' });
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// GET /api/land-boards - list boards available to citizens
router.get('/land-boards', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT land_board_id, name, district, region FROM land_board ORDER BY name',
    );
    res.json({ land_boards: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applications - submit new application
router.post('/applications', authMiddleware, async (req, res) => {
  const { application_type, land_board_id, description } = req.body;
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  if (!application_type || !land_board_id) return res.status(400).json({ message: 'application_type and land_board_id are required' });
  if (!isUuid(land_board_id)) return res.status(400).json({ message: 'land_board_id must be a UUID' });
  try {
    const board = await db.query('SELECT land_board_id FROM land_board WHERE land_board_id = $1', [land_board_id]);
    if (board.rowCount === 0) return res.status(400).json({ message: 'Unknown land board' });
    const application_id = crypto.randomUUID();
    const reference_number = `APP-${new Date().getFullYear()}-${application_id.slice(0, 8).toUpperCase()}`;
    const submitted_at = new Date().toISOString();
    const insertSql = `INSERT INTO application (application_id,citizen_id,land_board_id,application_type,description,reference_number,submitted_at,current_status,current_stage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
    await db.query(insertSql, [application_id, req.user.citizen_id, land_board_id, application_type, description || null, reference_number, submitted_at, 'submitted', 'initial_review']);
    await db.query(
      `INSERT INTO application_event (event_id, application_id, event_type, to_status, stage, notes, event_timestamp)
       VALUES ($1,$2,'submitted','submitted','initial_review','Application submitted',NOW())`,
      [crypto.randomUUID(), application_id],
    );
    await db.query(createNotificationQuery(req.user.citizen_id, application_id, 'application_submitted', 'Application submitted', `Your application ${reference_number} was submitted.`));
    res.json({ application_id, reference_number, status: 'submitted', submitted_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/applications', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  try {
    const result = await db.query(
      `SELECT application_id, reference_number, application_type, current_status AS status,
              current_stage, submitted_at, processing_days
       FROM application WHERE citizen_id = $1 ORDER BY submitted_at DESC`,
      [req.user.citizen_id],
    );
    res.json({ applications: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to load applications' });
  }
});

// GET /api/applications/:id - view application
router.get('/applications/:id', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  try {
    const result = await db.query(
      `SELECT * FROM application WHERE application_id = $1 AND citizen_id = $2`,
      [req.params.id, req.user.citizen_id],
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    const a = result.rows[0];
    const events = await db.query(
      `SELECT event_type, from_status, to_status, stage, notes, event_timestamp
       FROM application_event WHERE application_id = $1 ORDER BY event_timestamp DESC`,
      [a.application_id],
    );
    res.json({
      application_id: a.application_id,
      reference_number: a.reference_number,
      application_type: a.application_type,
      description: a.description,
      status: a.current_status,
      current_stage: a.current_stage,
      submitted_at: a.submitted_at,
      assigned_officer_id: a.assigned_officer_id,
      citizen_id: a.citizen_id,
      events: events.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/applications/:id/documents', authMiddleware, upload.single('document'), async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  if (!req.file) return res.status(400).json({ message: 'A PDF, JPEG, or PNG document up to 10MB is required' });
  try {
    const ownership = await db.query(
      'SELECT application_id FROM application WHERE application_id = $1 AND citizen_id = $2',
      [req.params.id, req.user.citizen_id],
    );
    if (!ownership.rowCount) {
      fs.rmSync(req.file.path, { force: true });
      return res.status(404).json({ message: 'Application not found' });
    }
    const result = await db.query(
      `INSERT INTO application_document
       (document_id, application_id, uploaded_by_citizen_id, original_name, storage_name, content_type, byte_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING document_id, original_name, content_type, byte_size, scan_status, created_at`,
      [crypto.randomUUID(), req.params.id, req.user.citizen_id, req.file.originalname, path.basename(req.file.path), req.file.mimetype, req.file.size],
    );
    res.status(201).json({ document: result.rows[0], scan_notice: 'Malware scanning is unavailable in local development; document remains unverified.' });
  } catch (err) {
    fs.rmSync(req.file.path, { force: true });
    console.error(err);
    res.status(500).json({ message: 'Unable to store document' });
  }
});

router.get('/applications/:id/documents/:documentId', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.storage_name, d.original_name, d.content_type
       FROM application_document d JOIN application a ON a.application_id = d.application_id
       WHERE d.document_id = $1 AND d.application_id = $2
         AND (a.citizen_id = $3 OR a.assigned_officer_id = $4)`,
      [req.params.documentId, req.params.id, req.user.citizen_id || null, req.user.officer_id || null],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Document not found' });
    const document = result.rows[0];
    const filePath = path.join(documentDir, document.storage_name);
    if (!fs.existsSync(filePath)) return res.status(410).json({ message: 'Document storage is unavailable' });
    res.type(document.content_type).download(filePath, document.original_name);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to retrieve document' });
  }
});

// POST /api/officer/applications/:id/status - update a case and record an audit event
router.post('/officer/applications/:id/status', officerAuth, async (req, res) => {
  const { status, stage, notes } = req.body;
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ message: 'status must be submitted, under_review, approved, or rejected' });
  }
  if (status === 'rejected' && (!notes || notes.trim().length < 5)) {
    return res.status(400).json({ message: 'A rejection reason is required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT application_id, current_status, current_stage, submitted_at FROM application WHERE application_id = $1 AND assigned_officer_id = $2 FOR UPDATE',
      [req.params.id, req.user.officer_id],
    );
    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Assigned application not found' });
    }

    const currentApplication = current.rows[0];
    if (!ALLOWED_TRANSITIONS[currentApplication.current_status]?.has(status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Cannot change an application from ${currentApplication.current_status} to ${status}`,
      });
    }
    const nextStage = stage || STAGE_BY_STATUS[status];
    const processingDays = status === 'approved'
      ? Math.max(0, Math.round((Date.now() - new Date(currentApplication.submitted_at).getTime()) / 86400000))
      : null;
    await client.query(
      `UPDATE application
       SET current_status = $1, current_stage = $2, processing_days = COALESCE($3, processing_days)
       WHERE application_id = $4`,
      [status, nextStage, processingDays, req.params.id],
    );
    await client.query(
      `INSERT INTO application_event
       (event_id, application_id, officer_id, event_type, from_status, to_status, stage, notes, event_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [crypto.randomUUID(), req.params.id, req.user.officer_id, 'status_change', currentApplication.current_status, status, nextStage, notes || null],
    );
    const applicationOwner = await client.query('SELECT citizen_id, reference_number FROM application WHERE application_id = $1', [req.params.id]);
    const owner = applicationOwner.rows[0];
    if (owner) {
      await client.query(
        createNotificationQuery(
          owner.citizen_id,
          req.params.id,
          `application_${status}`,
          `Application ${status.replace('_', ' ')}`,
          `Your application ${owner.reference_number} is now ${status.replace('_', ' ')}.${notes ? ` Message: ${notes}` : ''}`,
        ),
      );
    }
    await client.query('COMMIT');
    res.json({ application_id: req.params.id, status, current_stage: nextStage });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get('/officer/applications/:id', officerAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, c.full_name AS citizen_name, c.email AS citizen_email, c.phone AS citizen_phone
       FROM application a JOIN citizen c ON c.citizen_id = a.citizen_id
       WHERE a.application_id = $1 AND a.assigned_officer_id = $2`,
      [req.params.id, req.user.officer_id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Assigned application not found' });
    const application = result.rows[0];
    const [events, documents, notes, prediction] = await Promise.all([
      db.query('SELECT * FROM application_event WHERE application_id = $1 ORDER BY event_timestamp DESC', [req.params.id]),
      db.query('SELECT document_id, original_name, content_type, byte_size, scan_status, created_at FROM application_document WHERE application_id = $1 ORDER BY created_at DESC', [req.params.id]),
      db.query('SELECT note_id, body, citizen_visible, created_at FROM application_note WHERE application_id = $1 AND officer_id = $2 ORDER BY created_at DESC', [req.params.id, req.user.officer_id]),
      db.query('SELECT * FROM ml_prediction WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1', [req.params.id]),
    ]);
    res.json({ application, events: events.rows, documents: documents.rows, notes: notes.rows, prediction: prediction.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to load application details' });
  }
});

router.post('/officer/applications/:id/assistance', officerAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.application_id, a.application_type, a.description, a.submitted_at,
              a.land_board_id
       FROM application a
       WHERE a.application_id = $1 AND a.assigned_officer_id = $2`,
      [req.params.id, req.user.officer_id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Assigned application not found' });
    const application = result.rows[0];
    const documents = await db.query('SELECT original_name FROM application_document WHERE application_id = $1', [req.params.id]);
    const duplicate = await db.query(
      `SELECT count(*) FROM application
       WHERE citizen_id = (SELECT citizen_id FROM application WHERE application_id = $1)
         AND application_id <> $1 AND current_status NOT IN ('approved', 'rejected')`,
      [req.params.id],
    );
    const workload = await db.query(
      `SELECT count(*) FROM application WHERE land_board_id = $1 AND current_status IN ('submitted','under_review')`,
      [application.land_board_id],
    );
    const payload = {
      application_id: application.application_id,
      application_type: application.application_type,
      description: application.description,
      document_names: documents.rows.map((row) => row.original_name),
      required_documents: REQUIRED_DOCUMENTS[application.application_type] || [],
      submitted_at: application.submitted_at,
      duplicate_active_count: Number(duplicate.rows[0].count),
      land_board_workload: Number(workload.rows[0].count),
    };
    const serviceUrl = config.mlServiceUrl;
    const response = await fetch(`${serviceUrl}/v1/assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return res.status(503).json({ message: 'ML assistance is unavailable' });
    const prediction = await response.json();
    await db.query(
      `INSERT INTO ml_prediction (prediction_id, application_id, model_version, category, score, reasons, feature_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
      [crypto.randomUUID(), req.params.id, prediction.model_version, prediction.category, prediction.score, JSON.stringify(prediction.reasons), JSON.stringify(payload)],
    );
    res.json({ prediction });
  } catch (err) {
    console.error(err);
    res.status(503).json({ message: 'ML assistance is unavailable' });
  }
});

router.post('/officer/applications/:id/notes', officerAuth, async (req, res) => {
  const { body, citizen_visible = false } = req.body;
  if (!body || body.trim().length < 2) return res.status(400).json({ message: 'Note text is required' });
  try {
    const ownership = await db.query('SELECT 1 FROM application WHERE application_id = $1 AND assigned_officer_id = $2', [req.params.id, req.user.officer_id]);
    if (!ownership.rowCount) return res.status(404).json({ message: 'Assigned application not found' });
    const result = await db.query(
      `INSERT INTO application_note (note_id, application_id, officer_id, body, citizen_visible)
       VALUES ($1,$2,$3,$4,$5) RETURNING note_id, body, citizen_visible, created_at`,
      [crypto.randomUUID(), req.params.id, req.user.officer_id, body.trim(), Boolean(citizen_visible)],
    );
    res.status(201).json({ note: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to save note' });
  }
});

router.get('/notifications', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  const result = await db.query(
    `SELECT notification_id, application_id, type, title, body, read_at, created_at
     FROM notification WHERE citizen_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.user.citizen_id],
  );
  res.json({ notifications: result.rows });
});

router.post('/notifications/:id/read', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  const result = await db.query(
    'UPDATE notification SET read_at = COALESCE(read_at, NOW()) WHERE notification_id = $1 AND citizen_id = $2 RETURNING notification_id, read_at',
    [req.params.id, req.user.citizen_id],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Notification not found' });
  res.json({ notification: result.rows[0] });
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
    const appsRes = await db.query(`SELECT a.application_id,a.reference_number,a.application_type,a.current_status,a.current_stage,a.submitted_at,a.assigned_officer_id,c.full_name AS citizen_name FROM application a JOIN citizen c ON c.citizen_id = a.citizen_id ${where.replaceAll('assigned_officer_id', 'a.assigned_officer_id').replaceAll('current_status', 'a.current_status')} ORDER BY a.${sortBy} ${sortOrder} LIMIT $${params.length-1} OFFSET $${params.length}`, params);
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
