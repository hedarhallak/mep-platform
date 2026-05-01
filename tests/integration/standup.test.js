// Phase 34 — Daily standup endpoint tests.
//
// /api/standup/tomorrow returns the projects + workers planned for
// tomorrow's standup huddle. Permission-gated by standup.manage. On
// an empty company (no assignments), returns empty arrays.

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

describeIfDb('Standup — /api/standup/tomorrow', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /tomorrow as COMPANY_ADMIN with no assignments returns 200', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/standup/tomorrow')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('GET /tomorrow without standup.manage returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/standup/tomorrow')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('standup.manage');
  });
});

// Phase 53 — standup mutation surfaces (POST /session, POST /session/:id/complete)
// + GET /materials/:project_id.
//
// Happy paths require a fully seeded project + foreman + assignment_requests
// chain — left to e2e. Here we pin only the RBAC denials and the
// "session not found" branch on /session/:id/complete (which exercises
// the company-scoped UPDATE filter — important to prevent cross-tenant
// session mutation).
describeIfDb('Standup — POST /api/standup/session', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /session without standup.manage returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .post('/api/standup/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ project_id: 1 });

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('standup.manage');
  });
});

describeIfDb('Standup — POST /api/standup/session/:id/complete', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /session/:id/complete with non-existent id returns 404 SESSION_NOT_FOUND', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/standup/session/9999999/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'wrap-up' });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'SESSION_NOT_FOUND' });
  });

  test('POST /session/:id/complete without standup.manage returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .post('/api/standup/session/1/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'x' });

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('standup.manage');
  });
});

describeIfDb('Standup — GET /api/standup/materials/:project_id', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /materials/:project_id without standup.manage returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/standup/materials/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('standup.manage');
  });
});
