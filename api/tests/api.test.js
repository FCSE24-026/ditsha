const request = require('supertest');
const app = require('../index');
const db = require('../db');

afterAll(async () => {
  await db.pool.end();
});

describe('API request validation and full lifecycle', () => {
  it('rejects citizen registration without required fields', async () => {
    const res = await request(app)
      .post('/api/auth/citizen/register')
      .send({ email: 'citizen@example.com' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Missing fields');
  });

  it('rejects officer login without required fields', async () => {
    const res = await request(app)
      .post('/api/auth/officer/login')
      .send({ email: 'officer@example.com' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Missing fields');
  });

  it('requires a bearer token for application submission', async () => {
    const res = await request(app)
      .post('/api/applications')
      .send({ application_type: 'residential_allocation', land_board_id: 'board-id' });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Missing token');
  });

  it('requires a bearer token for the officer queue', async () => {
    const res = await request(app).get('/api/officer/applications');

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Missing token');
  });

  it('logs in the seeded officer and returns scoped dashboard data with search and filters', async () => {
    const login = await request(app)
      .post('/api/auth/officer/login')
      .send({ email: 'officer@example.com', password: 'OfficerPass123!' });

    expect(login.statusCode).toBe(200);
    expect(login.body.token).toBeDefined();

    const headers = { Authorization: `Bearer ${login.body.token}` };
    const queue = await request(app).get('/api/officer/applications?limit=5&search=APP').set(headers);
    const analytics = await request(app).get('/api/officer/analytics/dashboard').set(headers);

    expect(queue.statusCode).toBe(200);
    expect(queue.body.applications.length).toBeLessThanOrEqual(5);
    expect(queue.body.total).toBeGreaterThan(0);
    expect(analytics.statusCode).toBe(200);
    expect(analytics.body.total_applications).toBeGreaterThan(0);
  }, 15000);

  it('allows citizen to view and update profile', async () => {
    const login = await request(app)
      .post('/api/auth/citizen/login')
      .send({ email: 'citizen@example.com', password: 'CitizenPass123!' });
    const headers = { Authorization: `Bearer ${login.body.token}` };

    const profile = await request(app).get('/api/auth/citizen/me').set(headers);
    expect(profile.statusCode).toBe(200);
    expect(profile.body.citizen.email).toBe('citizen@example.com');

    const update = await request(app)
      .put('/api/auth/citizen/me')
      .set(headers)
      .send({ full_name: 'Masego Molefe Updated', phone: '+267 71 999 888', district: 'Serowe Central' });
    expect(update.statusCode).toBe(200);
    expect(update.body.citizen.full_name).toBe('Masego Molefe Updated');
  });

  it('supports citizen draft creation, draft retrieval, and submission', async () => {
    const login = await request(app)
      .post('/api/auth/citizen/login')
      .send({ email: 'citizen@example.com', password: 'CitizenPass123!' });
    const headers = { Authorization: `Bearer ${login.body.token}` };
    const board = await db.query('SELECT land_board_id FROM land_board LIMIT 1');

    const draft = await request(app)
      .post('/api/applications/draft')
      .set(headers)
      .send({
        application_type: 'residential_allocation',
        land_board_id: board.rows[0].land_board_id,
        description: 'Draft application for residential plot',
      });
    expect(draft.statusCode).toBe(201);
    expect(draft.body.status).toBe('draft');
    expect(draft.body.reference_number).toMatch(/^DRAFT-/);

    const draftsList = await request(app).get('/api/applications/drafts').set(headers);
    expect(draftsList.statusCode).toBe(200);
    expect(draftsList.body.drafts.some((d) => d.application_id === draft.body.application_id)).toBe(true);

    const submission = await request(app)
      .post('/api/applications')
      .set(headers)
      .send({ application_id: draft.body.application_id });
    expect(submission.statusCode).toBe(200);
    expect(submission.body.reference_number).toMatch(/^APP-/);
    expect(submission.body.status).toBe('submitted');
  }, 15000);

  it('validates document upload signatures and allows authorized access', async () => {
    const citizenLogin = await request(app)
      .post('/api/auth/citizen/login')
      .send({ email: 'citizen@example.com', password: 'CitizenPass123!' });
    const citizenHeaders = { Authorization: `Bearer ${citizenLogin.body.token}` };

    const board = await db.query('SELECT land_board_id FROM land_board LIMIT 1');
    const submission = await request(app)
      .post('/api/applications')
      .set(citizenHeaders)
      .send({ application_type: 'residential_allocation', land_board_id: board.rows[0].land_board_id, description: 'Test plot' });
    const appId = submission.body.application_id;

    // Invalid file signature
    const invalidUpload = await request(app)
      .post(`/api/applications/${appId}/documents`)
      .set(citizenHeaders)
      .attach('document', Buffer.from('NOT A REAL PDF'), { filename: 'test.pdf', contentType: 'application/pdf' });
    expect(invalidUpload.statusCode).toBe(400);
    expect(invalidUpload.body.message).toContain('signature');

    // Valid PDF signature
    const validPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
    const validUpload = await request(app)
      .post(`/api/applications/${appId}/documents`)
      .set(citizenHeaders)
      .attach('document', validPdfBytes, { filename: 'valid_id.pdf', contentType: 'application/pdf' });
    expect(validUpload.statusCode).toBe(201);
    expect(validUpload.body.document.original_name).toBe('valid_id.pdf');
    const docId = validUpload.body.document.document_id;

    // Download document
    const download = await request(app)
      .get(`/api/applications/${appId}/documents/${docId}`)
      .set(citizenHeaders);
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
  }, 15000);

  it('executes full request-info, citizen response, priority override, and assignment loop', async () => {
    const officerLogin = await request(app)
      .post('/api/auth/officer/login')
      .send({ email: 'officer@example.com', password: 'OfficerPass123!' });
    const officerHeaders = { Authorization: `Bearer ${officerLogin.body.token}` };

    const citizenLogin = await request(app)
      .post('/api/auth/citizen/login')
      .send({ email: 'citizen@example.com', password: 'CitizenPass123!' });
    const citizenHeaders = { Authorization: `Bearer ${citizenLogin.body.token}` };

    // 1. Submit application
    const board = await db.query('SELECT land_board_id FROM land_board LIMIT 1');
    const submission = await request(app)
      .post('/api/applications')
      .set(citizenHeaders)
      .send({ application_type: 'residential_allocation', land_board_id: board.rows[0].land_board_id });
    const appId = submission.body.application_id;

    // Assign to officer
    await db.query('UPDATE application SET assigned_officer_id = $1 WHERE application_id = $2', [officerLogin.body.officer_id, appId]);

    // 2. Officer moves to under_review
    const toReview = await request(app)
      .post(`/api/officer/applications/${appId}/status`)
      .set(officerHeaders)
      .send({ status: 'under_review', notes: 'Commencing review' });
    expect(toReview.statusCode).toBe(200);

    // 3. Officer requests information
    const reqInfo = await request(app)
      .post(`/api/officer/applications/${appId}/request-info`)
      .set(officerHeaders)
      .send({ notes: 'Please provide proof of employment or residence letter.' });
    expect(reqInfo.statusCode).toBe(200);
    expect(reqInfo.body.status).toBe('information_requested');

    // 4. Citizen responds
    const respond = await request(app)
      .post(`/api/applications/${appId}/respond`)
      .set(citizenHeaders)
      .send({ notes: 'Attached employment verification letter as requested.' });
    expect(respond.statusCode).toBe(200);
    expect(respond.body.status).toBe('under_review');

    // 5. Officer overrides priority with recorded justification
    const priorityOverride = await request(app)
      .post(`/api/officer/applications/${appId}/override-priority`)
      .set(officerHeaders)
      .send({ priority_score: 0.92, reason: 'High urgency verified by local tribal administration' });
    expect(priorityOverride.statusCode).toBe(200);
    expect(priorityOverride.body.priority_score).toBe(0.92);

    // 6. Officer reassigns case
    const otherOfficer = await db.query('SELECT officer_id FROM officer WHERE officer_id <> $1 LIMIT 1', [officerLogin.body.officer_id]);
    const reassign = await request(app)
      .post(`/api/officer/applications/${appId}/assign`)
      .set(officerHeaders)
      .send({ officer_id: otherOfficer.rows[0].officer_id });
    expect(reassign.statusCode).toBe(200);
    expect(reassign.body.assigned_officer_id).toBe(otherOfficer.rows[0].officer_id);

    // 7. Verify notifications generated for citizen
    const notifications = await request(app).get('/api/notifications').set(citizenHeaders);
    expect(notifications.statusCode).toBe(200);
    expect(notifications.body.notifications.some((n) => n.application_id === appId)).toBe(true);
  }, 20000);

  it('allows citizen to withdraw an active application', async () => {
    const citizenLogin = await request(app)
      .post('/api/auth/citizen/login')
      .send({ email: 'citizen@example.com', password: 'CitizenPass123!' });
    const citizenHeaders = { Authorization: `Bearer ${citizenLogin.body.token}` };

    const board = await db.query('SELECT land_board_id FROM land_board LIMIT 1');
    const submission = await request(app)
      .post('/api/applications')
      .set(citizenHeaders)
      .send({ application_type: 'residential_allocation', land_board_id: board.rows[0].land_board_id });
    const appId = submission.body.application_id;

    const withdraw = await request(app)
      .post(`/api/applications/${appId}/withdraw`)
      .set(citizenHeaders)
      .send({ reason: 'Found alternative accommodation' });
    expect(withdraw.statusCode).toBe(200);
    expect(withdraw.body.status).toBe('withdrawn');

    // Verify detail shows withdrawn
    const detail = await request(app).get(`/api/applications/${appId}`).set(citizenHeaders);
    expect(detail.body.status).toBe('withdrawn');
  });
});
