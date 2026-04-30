// Phase 24 — User management list test.
//
// /api/users (mounted from routes/user_management.js) returns the
// company's app_users joined with their employee + profile +
// trade-type info. Permission-gated by settings.user_management.

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

describeIfDb('User management — GET /api/users', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test("Company A admin sees only A's users (tenant-scoped)", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    const workerA = await seedUser({ company_id: companyA.company_id, role: 'WORKER' });
    const workerB = await seedUser({ company_id: companyB.company_id, role: 'WORKER' });

    const { token } = await loginUser(adminA);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);

    const ids = res.body.users.map((u) => Number(u.id));
    expect(ids).toEqual(expect.arrayContaining([adminA.id, workerA.id]));
    expect(ids).not.toContain(workerB.id);
  });

  test('GET /api/users without settings.user_management returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('settings.user_management');
  });
});
