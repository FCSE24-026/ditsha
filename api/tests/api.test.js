const request = require('supertest');
const app = require('../index');
const db = require('../db');

afterAll(async () => {
  await db.pool.end();
});

describe('API request validation', () => {
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

  it('logs in the seeded officer and returns scoped dashboard data', async () => {
    const login = await request(app)
      .post('/api/auth/officer/login')
      .send({ email: 'officer@example.com', password: 'OfficerPass123!' });

    expect(login.statusCode).toBe(200);
    expect(login.body.token).toBeDefined();

    const headers = { Authorization: `Bearer ${login.body.token}` };
    const queue = await request(app).get('/api/officer/applications?limit=2').set(headers);
    const analytics = await request(app).get('/api/officer/analytics/dashboard').set(headers);

    expect(queue.statusCode).toBe(200);
    expect(queue.body.applications.length).toBeLessThanOrEqual(2);
    expect(queue.body.total).toBeGreaterThan(0);
    expect(analytics.statusCode).toBe(200);
    expect(analytics.body.total_applications).toBeGreaterThan(0);
  }, 15000);

  it('logs in the seeded citizen and submits an application', async () => {
    const login = await request(app)
      .post('/api/auth/citizen/login')
      .send({ email: 'citizen@example.com', password: 'CitizenPass123!' });
    const board = await db.query('SELECT land_board_id FROM land_board LIMIT 1');

    expect(login.statusCode).toBe(200);
    expect(board.rowCount).toBeGreaterThan(0);

    const submission = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ application_type: 'residential_allocation', land_board_id: board.rows[0].land_board_id });

    expect(submission.statusCode).toBe(200);
    expect(submission.body.reference_number).toMatch(/^APP-/);
    expect(submission.body.status).toBe('submitted');
    const applications = await request(app)
      .get('/api/applications')
      .set('Authorization', 'Bearer ' + login.body.token);
    expect(applications.statusCode).toBe(200);
    expect(applications.body.applications.length).toBeGreaterThan(0);
    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer ' + login.body.token);
    expect(notifications.statusCode).toBe(200);
    expect(notifications.body.notifications.length).toBeGreaterThan(0);
  }, 15000);

  it('prevents a citizen from reading another citizen application', async () => {
    const login = await request(app)
      .post('/api/auth/citizen/login')
      .send({ email: 'citizen@example.com', password: 'CitizenPass123!' });
    const other = await db.query(
      'SELECT application_id FROM application WHERE citizen_id <> $1 LIMIT 1',
      [login.body.citizen_id],
    );
    expect(other.rowCount).toBeGreaterThan(0);
    const response = await request(app)
      .get(`/api/applications/${other.rows[0].application_id}`)
      .set('Authorization', 'Bearer ' + login.body.token);
    expect(response.statusCode).toBe(404);
  });

  it('lists Botswana land boards and records an officer decision event', async () => {
    const officerLogin = await request(app)
      .post('/api/auth/officer/login')
      .send({ email: 'officer@example.com', password: 'OfficerPass123!' });
    const officerHeaders = { Authorization: `Bearer ${officerLogin.body.token}` };

    const boards = await request(app).get('/api/land-boards');
    expect(boards.statusCode).toBe(200);
    expect(boards.body.land_boards.some((board) => board.name === 'Ngwato Land Board')).toBe(true);

    const queue = await request(app)
      .get('/api/officer/applications?limit=1&status=submitted')
      .set(officerHeaders);
    expect(queue.statusCode).toBe(200);
    expect(queue.body.applications.length).toBeGreaterThan(0);

    const decision = await request(app)
      .post(`/api/officer/applications/${queue.body.applications[0].application_id}/status`)
      .set(officerHeaders)
      .send({ status: 'under_review', notes: 'Documents received for review' });
    expect(decision.statusCode).toBe(200);
    expect(decision.body.status).toBe('under_review');
  }, 15000);
});
