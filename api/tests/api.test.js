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
  }, 15000);
});
