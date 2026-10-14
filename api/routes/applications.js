const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');

const VALID_STATUSES = new Set([
  'draft',
  'submitted',
  'under_review',
  'information_requested',
  'approved',
  'rejected',
  'withdrawn',
]);

const ALLOWED_TRANSITIONS = {
  draft: new Set(['submitted', 'withdrawn']),
  submitted: new Set(['under_review', 'withdrawn']),
  under_review: new Set(['information_requested', 'approved', 'rejected', 'withdrawn']),
  information_requested: new Set(['under_review', 'withdrawn']),
  approved: new Set(),
  rejected: new Set(),
  withdrawn: new Set(),
};

const STAGE_BY_STATUS = {
  draft: 'draft',
  submitted: 'initial_review',
  under_review: 'documentation_review',
  information_requested: 'documentation_review',
  approved: 'final_decision',
  rejected: 'final_decision',
  withdrawn: 'cancelled',
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

function validateFileSignature(filePath, mimetype) {
  try {
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);
    if (mimetype === 'application/pdf') {
      return buffer.subarray(0, 4).toString('ascii') === '%PDF';
    }
    if (mimetype === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimetype === 'image/png') {
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    }
    return false;
  } catch {
    return false;
  }
}

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

// GET /api/land-boards - list boards available to citizens and officers
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

// GET /api/officers - list officers for assignment (officer only)
router.get('/officers', officerAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT officer_id, full_name, email, role, land_board_id
       FROM officer
       WHERE land_board_id = $1
       ORDER BY full_name`,
      [req.user.land_board_id],
    );
    res.json({ officers: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applications/draft - save or update draft
router.post('/applications/draft', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  const { application_id, application_type, land_board_id, description } = req.body;

  try {
    if (land_board_id && !isUuid(land_board_id)) {
      return res.status(400).json({ message: 'land_board_id must be a UUID' });
    }

    if (application_id) {
      if (!isUuid(application_id)) {
        return res.status(400).json({ message: 'application_id must be a UUID' });
      }
      const existing = await db.query(
        'SELECT application_id, current_status FROM application WHERE application_id = $1 AND citizen_id = $2',
        [application_id, req.user.citizen_id],
      );
      if (existing.rowCount === 0) return res.status(404).json({ message: 'Draft not found' });
      if (existing.rows[0].current_status !== 'draft') {
        return res.status(400).json({ message: 'Only drafts can be modified via this endpoint' });
      }

      await db.query(
        `UPDATE application
         SET application_type = COALESCE($1, application_type),
             land_board_id = COALESCE($2, land_board_id),
             description = $3,
             last_activity_at = NOW()
         WHERE application_id = $4`,
        [application_type || null, land_board_id || null, description || null, application_id],
      );
      return res.json({ application_id, message: 'Draft updated successfully' });
    }

    const newAppId = crypto.randomUUID();
    const draftRef = `DRAFT-${newAppId.slice(0, 8).toUpperCase()}`;
    const insertSql = `
      INSERT INTO application
        (application_id, citizen_id, land_board_id, application_type, description,
         reference_number, submitted_at, current_status, current_stage, is_draft)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'draft', 'draft', TRUE)
    `;
    await db.query(insertSql, [
      newAppId,
      req.user.citizen_id,
      land_board_id || null,
      application_type || 'residential_allocation',
      description || null,
      draftRef,
    ]);

    res.status(201).json({
      application_id: newAppId,
      reference_number: draftRef,
      status: 'draft',
      message: 'Draft saved successfully',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/drafts - list citizen drafts
router.get('/applications/drafts', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  try {
    const result = await db.query(
      `SELECT a.application_id, a.reference_number, a.application_type, a.description,
              a.land_board_id, lb.name AS land_board_name, a.created_at, a.last_activity_at
       FROM application a
       LEFT JOIN land_board lb ON lb.land_board_id = a.land_board_id
       WHERE a.citizen_id = $1 AND a.current_status = 'draft'
       ORDER BY a.created_at DESC`,
      [req.user.citizen_id],
    );
    res.json({ drafts: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to load drafts' });
  }
});

// POST /api/applications - submit new application or submit existing draft
router.post('/applications', authMiddleware, async (req, res) => {
  const { application_id: draftId, application_type, land_board_id, description } = req.body;
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let applicationId = draftId;
    let finalType = application_type;
    let finalBoardId = land_board_id;
    let finalDescription = description;

    if (draftId) {
      if (!isUuid(draftId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'application_id must be a UUID' });
      }
      const draftCheck = await client.query(
        'SELECT * FROM application WHERE application_id = $1 AND citizen_id = $2 FOR UPDATE',
        [draftId, req.user.citizen_id],
      );
      if (draftCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Draft not found' });
      }
      const draft = draftCheck.rows[0];
      finalType = finalType || draft.application_type;
      finalBoardId = finalBoardId || draft.land_board_id;
      finalDescription = finalDescription !== undefined ? finalDescription : draft.description;
    } else {
      applicationId = crypto.randomUUID();
    }

    if (!finalType || !finalBoardId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'application_type and land_board_id are required' });
    }
    if (!isUuid(finalBoardId)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'land_board_id must be a UUID' });
    }

    const board = await client.query('SELECT land_board_id FROM land_board WHERE land_board_id = $1', [finalBoardId]);
    if (board.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Unknown land board' });
    }

    const reference_number = `APP-${new Date().getFullYear()}-${applicationId.slice(0, 8).toUpperCase()}`;
    const submitted_at = new Date().toISOString();

    if (draftId) {
      await client.query(
        `UPDATE application
         SET reference_number = $1,
             application_type = $2,
             land_board_id = $3,
             description = $4,
             submitted_at = $5,
             current_status = 'submitted',
             current_stage = 'initial_review',
             is_draft = FALSE,
             last_activity_at = NOW()
         WHERE application_id = $6`,
        [reference_number, finalType, finalBoardId, finalDescription || null, submitted_at, applicationId],
      );
    } else {
      const insertSql = `
        INSERT INTO application
          (application_id, citizen_id, land_board_id, application_type, description,
           reference_number, submitted_at, current_status, current_stage, is_draft)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', 'initial_review', FALSE)
      `;
      await client.query(insertSql, [
        applicationId,
        req.user.citizen_id,
        finalBoardId,
        finalType,
        finalDescription || null,
        reference_number,
        submitted_at,
      ]);
    }

    await client.query(
      `INSERT INTO application_event
        (event_id, application_id, event_type, from_status, to_status, stage, notes, event_timestamp)
       VALUES ($1, $2, 'submitted', ${draftId ? "'draft'" : 'null'}, 'submitted', 'initial_review', 'Application submitted', NOW())`,
      [crypto.randomUUID(), applicationId],
    );

    await client.query(
      createNotificationQuery(
        req.user.citizen_id,
        applicationId,
        'application_submitted',
        'Application submitted',
        `Your application ${reference_number} was successfully submitted.`,
      ),
    );

    await client.query('COMMIT');
    res.json({ application_id: applicationId, reference_number, status: 'submitted', submitted_at });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/applications - list citizen applications
router.get('/applications', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  try {
    const result = await db.query(
      `SELECT a.application_id, a.reference_number, a.application_type, a.current_status AS status,
              a.current_stage, a.submitted_at, a.processing_days, a.description,
              lb.name AS land_board_name
       FROM application a
       LEFT JOIN land_board lb ON lb.land_board_id = a.land_board_id
       WHERE a.citizen_id = $1 AND a.current_status <> 'draft'
       ORDER BY a.submitted_at DESC`,
      [req.user.citizen_id],
    );
    res.json({ applications: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to load applications' });
  }
});

// GET /api/applications/:id - view application for citizen
router.get('/applications/:id', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  try {
    const result = await db.query(
      `SELECT a.*, lb.name AS land_board_name
       FROM application a
       LEFT JOIN land_board lb ON lb.land_board_id = a.land_board_id
       WHERE a.application_id = $1 AND a.citizen_id = $2`,
      [req.params.id, req.user.citizen_id],
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Not found' });
    const a = result.rows[0];

    const [events, documents, notes] = await Promise.all([
      db.query(
        `SELECT event_type, from_status, to_status, stage, notes, event_timestamp
         FROM application_event WHERE application_id = $1 ORDER BY event_timestamp DESC`,
        [a.application_id],
      ),
      db.query(
        `SELECT document_id, original_name, content_type, byte_size, scan_status, created_at
         FROM application_document WHERE application_id = $1 ORDER BY created_at DESC`,
        [a.application_id],
      ),
      db.query(
        `SELECT note_id, body, created_at
         FROM application_note WHERE application_id = $1 AND citizen_visible = TRUE ORDER BY created_at DESC`,
        [a.application_id],
      ),
    ]);

    res.json({
      application_id: a.application_id,
      reference_number: a.reference_number,
      application_type: a.application_type,
      description: a.description,
      status: a.current_status,
      current_stage: a.current_stage,
      submitted_at: a.submitted_at,
      land_board_name: a.land_board_name,
      assigned_officer_id: a.assigned_officer_id,
      citizen_id: a.citizen_id,
      events: events.rows,
      documents: documents.rows,
      notes: notes.rows,
      required_documents: REQUIRED_DOCUMENTS[a.application_type] || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applications/:id/documents - upload supporting document
router.post('/applications/:id/documents', authMiddleware, upload.single('document'), async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  if (!req.file) return res.status(400).json({ message: 'A PDF, JPEG, or PNG document up to 10MB is required' });

  // Signature check
  if (!validateFileSignature(req.file.path, req.file.mimetype)) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ message: 'Uploaded file signature does not match expected format' });
  }

  try {
    const ownership = await db.query(
      'SELECT application_id, current_status FROM application WHERE application_id = $1 AND citizen_id = $2',
      [req.params.id, req.user.citizen_id],
    );
    if (!ownership.rowCount) {
      fs.rmSync(req.file.path, { force: true });
      return res.status(404).json({ message: 'Application not found' });
    }

    const appStatus = ownership.rows[0].current_status;
    if (appStatus === 'approved' || appStatus === 'rejected' || appStatus === 'withdrawn') {
      fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ message: `Cannot upload documents to a ${appStatus} application` });
    }

    const result = await db.query(
      `INSERT INTO application_document
       (document_id, application_id, uploaded_by_citizen_id, original_name, storage_name, content_type, byte_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING document_id, original_name, content_type, byte_size, scan_status, created_at`,
      [crypto.randomUUID(), req.params.id, req.user.citizen_id, req.file.originalname, path.basename(req.file.path), req.file.mimetype, req.file.size],
    );

    // Update document_complete flag if all required documents present
    const appInfo = await db.query('SELECT application_type FROM application WHERE application_id = $1', [req.params.id]);
    const reqDocs = REQUIRED_DOCUMENTS[appInfo.rows[0]?.application_type] || [];
    const allDocs = await db.query('SELECT original_name FROM application_document WHERE application_id = $1', [req.params.id]);
    if (reqDocs.length > 0 && allDocs.rowCount >= reqDocs.length) {
      await db.query('UPDATE application SET document_complete = TRUE WHERE application_id = $1', [req.params.id]);
    }

    res.status(201).json({
      document: result.rows[0],
      scan_notice: 'Malware scanning is unavailable in local development; document remains unverified.',
    });
  } catch (err) {
    fs.rmSync(req.file.path, { force: true });
    console.error(err);
    res.status(500).json({ message: 'Unable to store document' });
  }
});

// GET /api/applications/:id/documents/:documentId - download document
router.get('/applications/:id/documents/:documentId', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.storage_name, d.original_name, d.content_type
       FROM application_document d
       JOIN application a ON a.application_id = d.application_id
       WHERE d.document_id = $1 AND d.application_id = $2
         AND (a.citizen_id = $3 OR a.assigned_officer_id = $4 OR $5 = 'officer')`,
      [
        req.params.documentId,
        req.params.id,
        req.user.citizen_id || null,
        req.user.officer_id || null,
        req.user.role || null,
      ],
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

// POST /api/applications/:id/respond - citizen responds to information request
router.post('/applications/:id/respond', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  const { notes } = req.body;
  if (!notes || notes.trim().length < 5) {
    return res.status(400).json({ message: 'A response explanation of at least 5 characters is required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const appQuery = await client.query(
      'SELECT application_id, reference_number, current_status, assigned_officer_id FROM application WHERE application_id = $1 AND citizen_id = $2 FOR UPDATE',
      [req.params.id, req.user.citizen_id],
    );
    if (appQuery.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Application not found' });
    }

    const currentApp = appQuery.rows[0];
    if (currentApp.current_status !== 'information_requested') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Application is in '${currentApp.current_status}' status, not 'information_requested'`,
      });
    }

    await client.query(
      `UPDATE application
       SET current_status = 'under_review', current_stage = 'documentation_review', last_activity_at = NOW()
       WHERE application_id = $1`,
      [req.params.id],
    );

    await client.query(
      `INSERT INTO application_event
        (event_id, application_id, event_type, from_status, to_status, stage, notes, event_timestamp)
       VALUES ($1, $2, 'citizen_response', 'information_requested', 'under_review', 'documentation_review', $3, NOW())`,
      [crypto.randomUUID(), req.params.id, notes.trim()],
    );

    await client.query(
      `INSERT INTO application_note
        (note_id, application_id, officer_id, body, citizen_visible)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [
        crypto.randomUUID(),
        req.params.id,
        currentApp.assigned_officer_id || '00000000-0000-0000-0000-000000000000',
        `Citizen Response: ${notes.trim()}`,
      ],
    );

    await client.query('COMMIT');
    res.json({
      application_id: req.params.id,
      status: 'under_review',
      message: 'Response submitted successfully. Application returned to review queue.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/applications/:id/withdraw - citizen withdraws application
router.post('/applications/:id/withdraw', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  const { reason } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const appQuery = await client.query(
      'SELECT application_id, reference_number, current_status FROM application WHERE application_id = $1 AND citizen_id = $2 FOR UPDATE',
      [req.params.id, req.user.citizen_id],
    );
    if (appQuery.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Application not found' });
    }

    const currentApp = appQuery.rows[0];
    if (['approved', 'rejected', 'withdrawn'].includes(currentApp.current_status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Cannot withdraw an application that is already ${currentApp.current_status}`,
      });
    }

    await client.query(
      `UPDATE application
       SET current_status = 'withdrawn', current_stage = 'cancelled', withdrawn_at = NOW(), last_activity_at = NOW()
       WHERE application_id = $1`,
      [req.params.id],
    );

    await client.query(
      `INSERT INTO application_event
        (event_id, application_id, event_type, from_status, to_status, stage, notes, event_timestamp)
       VALUES ($1, $2, 'application_withdrawn', $3, 'withdrawn', 'cancelled', $4, NOW())`,
      [crypto.randomUUID(), req.params.id, currentApp.current_status, reason || 'Withdrawn by applicant'],
    );

    await client.query(
      createNotificationQuery(
        req.user.citizen_id,
        req.params.id,
        'application_withdrawn',
        'Application withdrawn',
        `Your application ${currentApp.reference_number} has been cancelled/withdrawn.`,
      ),
    );

    await client.query('COMMIT');
    res.json({
      application_id: req.params.id,
      status: 'withdrawn',
      message: 'Application withdrawn successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/officer/applications/:id/request-info - officer requests additional information
router.post('/api/officer/applications/:id/request-info', officerAuth, async (req, res) => {
  const { notes } = req.body;
  if (!notes || notes.trim().length < 5) {
    return res.status(400).json({ message: 'A clear explanation of what information is requested is required (min 5 chars)' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT application_id, current_status, citizen_id, reference_number FROM application WHERE application_id = $1 AND assigned_officer_id = $2 FOR UPDATE',
      [req.params.id, req.user.officer_id],
    );
    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Assigned application not found' });
    }

    const currentApp = current.rows[0];
    if (currentApp.current_status !== 'under_review') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Cannot request info on application with status '${currentApp.current_status}'. It must be 'under_review'.`,
      });
    }

    await client.query(
      `UPDATE application
       SET current_status = 'information_requested', current_stage = 'documentation_review', last_activity_at = NOW()
       WHERE application_id = $1`,
      [req.params.id],
    );

    await client.query(
      `INSERT INTO application_note
        (note_id, application_id, officer_id, body, citizen_visible)
       VALUES ($1,$2,$3,$4,TRUE)`,
      [crypto.randomUUID(), req.params.id, req.user.officer_id, `Information Requested: ${notes.trim()}`],
    );

    await client.query(
      `INSERT INTO application_event
        (event_id, application_id, officer_id, event_type, from_status, to_status, stage, notes, event_timestamp)
       VALUES ($1,$2,$3,'request_information','under_review','information_requested','documentation_review',$4,NOW())`,
      [crypto.randomUUID(), req.params.id, req.user.officer_id, notes.trim()],
    );

    await client.query(
      createNotificationQuery(
        currentApp.citizen_id,
        req.params.id,
        'information_requested',
        'Additional information requested',
        `The reviewing officer requested information for ${currentApp.reference_number}: ${notes.trim()}`,
      ),
    );

    await client.query('COMMIT');
    res.json({
      application_id: req.params.id,
      status: 'information_requested',
      current_stage: 'documentation_review',
      message: 'Information request sent to citizen',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Alias for mounting without /api prefix
router.post('/officer/applications/:id/request-info', officerAuth, async (req, res) => {
  const { notes } = req.body;
  if (!notes || notes.trim().length < 5) {
    return res.status(400).json({ message: 'A clear explanation of what information is requested is required (min 5 chars)' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT application_id, current_status, citizen_id, reference_number FROM application WHERE application_id = $1 AND assigned_officer_id = $2 FOR UPDATE',
      [req.params.id, req.user.officer_id],
    );
    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Assigned application not found' });
    }

    const currentApp = current.rows[0];
    if (currentApp.current_status !== 'under_review') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Cannot request info on application with status '${currentApp.current_status}'. It must be 'under_review'.`,
      });
    }

    await client.query(
      `UPDATE application
       SET current_status = 'information_requested', current_stage = 'documentation_review', last_activity_at = NOW()
       WHERE application_id = $1`,
      [req.params.id],
    );

    await client.query(
      `INSERT INTO application_note
        (note_id, application_id, officer_id, body, citizen_visible)
       VALUES ($1,$2,$3,$4,TRUE)`,
      [crypto.randomUUID(), req.params.id, req.user.officer_id, `Information Requested: ${notes.trim()}`],
    );

    await client.query(
      `INSERT INTO application_event
        (event_id, application_id, officer_id, event_type, from_status, to_status, stage, notes, event_timestamp)
       VALUES ($1,$2,$3,'request_information','under_review','information_requested','documentation_review',$4,NOW())`,
      [crypto.randomUUID(), req.params.id, req.user.officer_id, notes.trim()],
    );

    await client.query(
      createNotificationQuery(
        currentApp.citizen_id,
        req.params.id,
        'information_requested',
        'Additional information requested',
        `The reviewing officer requested information for ${currentApp.reference_number}: ${notes.trim()}`,
      ),
    );

    await client.query('COMMIT');
    res.json({
      application_id: req.params.id,
      status: 'information_requested',
      current_stage: 'documentation_review',
      message: 'Information request sent to citizen',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/officer/applications/:id/assign - assign / reassign officer
router.post('/officer/applications/:id/assign', officerAuth, async (req, res) => {
  const { officer_id } = req.body;
  if (!officer_id || !isUuid(officer_id)) {
    return res.status(400).json({ message: 'Valid officer_id is required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const targetOfficer = await client.query(
      'SELECT officer_id, full_name, land_board_id FROM officer WHERE officer_id = $1',
      [officer_id],
    );
    if (targetOfficer.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Target officer not found' });
    }

    const appQuery = await client.query(
      'SELECT application_id, reference_number, assigned_officer_id, land_board_id FROM application WHERE application_id = $1 FOR UPDATE',
      [req.params.id],
    );
    if (appQuery.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Application not found' });
    }

    await client.query(
      'UPDATE application SET assigned_officer_id = $1, last_activity_at = NOW() WHERE application_id = $2',
      [officer_id, req.params.id],
    );

    await client.query(
      `INSERT INTO application_assignment
        (assignment_id, application_id, officer_id, assigned_by_officer_id)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), req.params.id, officer_id, req.user.officer_id],
    );

    await client.query(
      `INSERT INTO application_event
        (event_id, application_id, officer_id, event_type, stage, notes, event_timestamp)
       VALUES ($1, $2, $3, 'officer_reassigned', 'assignment', $4, NOW())`,
      [
        crypto.randomUUID(),
        req.params.id,
        req.user.officer_id,
        `Reassigned to ${targetOfficer.rows[0].full_name}`,
      ],
    );

    await client.query('COMMIT');
    res.json({
      application_id: req.params.id,
      assigned_officer_id: officer_id,
      assigned_officer_name: targetOfficer.rows[0].full_name,
      message: 'Application reassigned successfully',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/officer/applications/:id/override-priority - manual priority override with reason
router.post('/officer/applications/:id/override-priority', officerAuth, async (req, res) => {
  const { priority_score, reason } = req.body;
  if (priority_score === undefined || typeof priority_score !== 'number' || priority_score < 0 || priority_score > 1) {
    return res.status(400).json({ message: 'priority_score must be a number between 0 and 1' });
  }
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ message: 'A mandatory override reason of at least 5 characters is required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const appQuery = await client.query(
      'SELECT application_id, priority_score FROM application WHERE application_id = $1 AND assigned_officer_id = $2 FOR UPDATE',
      [req.params.id, req.user.officer_id],
    );
    if (appQuery.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Assigned application not found' });
    }

    const previousScore = appQuery.rows[0].priority_score;
    await client.query(
      `UPDATE application
       SET priority_score = $1, priority_override_reason = $2, priority_overridden_by = $3, last_activity_at = NOW()
       WHERE application_id = $4`,
      [priority_score, reason.trim(), req.user.officer_id, req.params.id],
    );

    await client.query(
      `INSERT INTO application_event
        (event_id, application_id, officer_id, event_type, stage, notes, event_timestamp)
       VALUES ($1, $2, $3, 'priority_overridden', 'adjudication', $4, NOW())`,
      [
        crypto.randomUUID(),
        req.params.id,
        req.user.officer_id,
        `Priority score manually changed from ${previousScore ?? 'none'} to ${priority_score}. Reason: ${reason.trim()}`,
      ],
    );

    await client.query('COMMIT');
    res.json({
      application_id: req.params.id,
      priority_score,
      reason: reason.trim(),
      message: 'Priority score overridden with audit record',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/officer/applications/:id/status - update case status
router.post('/officer/applications/:id/status', officerAuth, async (req, res) => {
  const { status, stage, notes } = req.body;
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ message: 'status must be submitted, under_review, approved, or rejected' });
  }
  if (status === 'rejected' && (!notes || notes.trim().length < 5)) {
    return res.status(400).json({ message: 'A rejection reason of at least 5 characters is required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT application_id, current_status, current_stage, submitted_at, citizen_id, reference_number FROM application WHERE application_id = $1 AND assigned_officer_id = $2 FOR UPDATE',
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
       SET current_status = $1, current_stage = $2, processing_days = COALESCE($3, processing_days), last_activity_at = NOW()
       WHERE application_id = $4`,
      [status, nextStage, processingDays, req.params.id],
    );

    await client.query(
      `INSERT INTO application_event
       (event_id, application_id, officer_id, event_type, from_status, to_status, stage, notes, event_timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [crypto.randomUUID(), req.params.id, req.user.officer_id, 'status_change', currentApplication.current_status, status, nextStage, notes || null],
    );

    await client.query(
      createNotificationQuery(
        currentApplication.citizen_id,
        req.params.id,
        `application_${status}`,
        `Application ${status.replace('_', ' ')}`,
        `Your application ${currentApplication.reference_number} is now ${status.replace('_', ' ')}.${notes ? ` Note: ${notes}` : ''}`,
      ),
    );

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

// GET /api/officer/applications/:id - get detail for officer
router.get('/officer/applications/:id', officerAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, c.full_name AS citizen_name, c.email AS citizen_email, c.phone AS citizen_phone,
              c.district AS citizen_district, lb.name AS land_board_name
       FROM application a
       JOIN citizen c ON c.citizen_id = a.citizen_id
       LEFT JOIN land_board lb ON lb.land_board_id = a.land_board_id
       WHERE a.application_id = $1 AND a.assigned_officer_id = $2`,
      [req.params.id, req.user.officer_id],
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Assigned application not found' });
    const application = result.rows[0];

    const [events, documents, notes, prediction, assignments] = await Promise.all([
      db.query('SELECT * FROM application_event WHERE application_id = $1 ORDER BY event_timestamp DESC', [req.params.id]),
      db.query('SELECT document_id, original_name, content_type, byte_size, scan_status, created_at FROM application_document WHERE application_id = $1 ORDER BY created_at DESC', [req.params.id]),
      db.query('SELECT note_id, body, citizen_visible, created_at FROM application_note WHERE application_id = $1 ORDER BY created_at DESC', [req.params.id]),
      db.query('SELECT * FROM ml_prediction WHERE application_id = $1 ORDER BY created_at DESC LIMIT 1', [req.params.id]),
      db.query(`SELECT aa.assignment_id, aa.created_at, o.full_name AS assigned_to, by_o.full_name AS assigned_by
                FROM application_assignment aa
                JOIN officer o ON o.officer_id = aa.officer_id
                LEFT JOIN officer by_o ON by_o.officer_id = aa.assigned_by_officer_id
                WHERE aa.application_id = $1 ORDER BY aa.created_at DESC`, [req.params.id]),
    ]);

    res.json({
      application,
      events: events.rows,
      documents: documents.rows,
      notes: notes.rows,
      prediction: prediction.rows[0] || null,
      assignments: assignments.rows,
      required_documents: REQUIRED_DOCUMENTS[application.application_type] || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to load application details' });
  }
});

// POST /api/officer/applications/:id/assistance - run ML check
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
         AND application_id <> $1 AND current_status NOT IN ('approved', 'rejected', 'withdrawn')`,
      [req.params.id],
    );
    const workload = await db.query(
      `SELECT count(*) FROM application WHERE land_board_id = $1 AND current_status IN ('submitted','under_review','information_requested')`,
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

// POST /api/officer/applications/:id/notes - add officer review note
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

// GET /api/notifications - citizen notifications
router.get('/notifications', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  const result = await db.query(
    `SELECT notification_id, application_id, type, title, body, read_at, created_at
     FROM notification WHERE citizen_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.user.citizen_id],
  );
  res.json({ notifications: result.rows });
});

// POST /api/notifications/:id/read - mark notification as read
router.post('/notifications/:id/read', authMiddleware, async (req, res) => {
  if (!req.user.citizen_id) return res.status(403).json({ message: 'Citizen access required' });
  const result = await db.query(
    'UPDATE notification SET read_at = COALESCE(read_at, NOW()) WHERE notification_id = $1 AND citizen_id = $2 RETURNING notification_id, read_at',
    [req.params.id, req.user.citizen_id],
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Notification not found' });
  res.json({ notification: result.rows[0] });
});

// GET /api/officer/applications - list applications for officer queue (search, filter, sort, paginate)
router.get('/officer/applications', officerAuth, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { status = 'all', search = '', land_board_id } = req.query;
  const allowedSorts = ['submitted_at', 'current_status', 'reference_number', 'priority_score'];
  const sortBy = allowedSorts.includes(req.query.sortBy) ? req.query.sortBy : 'submitted_at';
  const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const offset = (page - 1) * limit;

  try {
    const params = [req.user.officer_id];
    const conditions = ['a.assigned_officer_id = $1', 'a.is_draft = FALSE'];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`a.current_status = $${params.length}`);
    }

    if (land_board_id && isUuid(land_board_id)) {
      params.push(land_board_id);
      conditions.push(`a.land_board_id = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(`(lower(a.reference_number) LIKE $${params.length} OR lower(c.full_name) LIKE $${params.length})`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countSql = `
      SELECT count(*)
      FROM application a
      JOIN citizen c ON c.citizen_id = a.citizen_id
      ${whereClause}
    `;
    const totalRes = await db.query(countSql, params);
    const total = Number(totalRes.rows[0].count);

    params.push(limit, offset);
    const listSql = `
      SELECT a.application_id, a.reference_number, a.application_type, a.current_status,
             a.current_stage, a.submitted_at, a.assigned_officer_id, a.priority_score,
             a.priority_override_reason, c.full_name AS citizen_name, lb.name AS land_board_name
      FROM application a
      JOIN citizen c ON c.citizen_id = a.citizen_id
      LEFT JOIN land_board lb ON lb.land_board_id = a.land_board_id
      ${whereClause}
      ORDER BY a.${sortBy} ${sortOrder} NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const appsRes = await db.query(listSql, params);
    res.json({ applications: appsRes.rows, total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/officer/analytics/dashboard
router.get('/officer/analytics/dashboard', officerAuth, async (req, res) => {
  try {
    const filter = 'WHERE assigned_officer_id = $1 AND is_draft = FALSE';
    const totalRes = await db.query(`SELECT count(*) FROM application ${filter}`, [req.user.officer_id]);
    const avgRes = await db.query(
      "SELECT avg(now() - submitted_at) as avg_processing FROM application WHERE current_status = 'approved' AND assigned_officer_id = $1",
      [req.user.officer_id],
    );
    const byStatus = await db.query(
      `SELECT current_status, count(*) FROM application ${filter} GROUP BY current_status`,
      [req.user.officer_id],
    );
    res.json({
      total_applications: Number(totalRes.rows[0].count),
      avg_processing_days: avgRes.rows[0].avg_processing
        ? Math.round(parseFloat(avgRes.rows[0].avg_processing) / 86400)
        : null,
      applications_by_status: byStatus.rows.reduce((acc, r) => {
        acc[r.current_status] = Number(r.count);
        return acc;
      }, {}),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
