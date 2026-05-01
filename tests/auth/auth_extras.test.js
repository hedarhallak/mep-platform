// Phase 33 — Auth extras: whoami + deprecated signup endpoints.
//
// Phase 11d/e covered login / refresh / logout / change-pin. This file
// fills in the remaining auth surface:
//   - GET  /api/auth/whoami        — JWT introspection for the frontend
//   - POST /api/auth/signup        — deprecated, must return 410
//   - POST /api/auth/signup-invite — deprecated, must return 410

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');

async function loginUser(user, pin) {
  const usePin = pin || user.pin || '1234';
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, pin: usePin });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

describeIfDb('Auth extras — whoami + deprecated signup', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/auth/whoami without Bearer token returns 401 MISSING_TOKEN', async () => {
    const res = await request(app).get('/api/auth/whoami');
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'MISSING_TOKEN' });
  });

  test('GET /api/auth/whoami with valid token returns the user payload', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/auth/whoami').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.role).toBe('COMPANY_ADMIN');
    expect(Number(res.body.user.user_id)).toBe(admin.id);
  });

  test('GET /api/auth/whoami with a garbage token returns 401 INVALID_TOKEN', async () => {
    const res = await request(app)
      .get('/api/auth/whoami')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_TOKEN' });
  });

  test('POST /api/auth/signup returns 410 SIGNUP_DISABLED', async () => {
    const res = await request(app).post('/api/auth/signup').send({ username: 'foo', pin: '1234' });
    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({ ok: false, error: 'SIGNUP_DISABLED' });
  });

  test('POST /api/auth/signup-invite returns 410 SIGNUP_DISABLED', async () => {
    const res = await request(app).post('/api/auth/signup-invite').send({ token: 'whatever' });
    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({ ok: false, error: 'SIGNUP_DISABLED' });
  });
});
