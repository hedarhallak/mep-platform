// Phase 26 — Super admin endpoint tests.
//
// /api/super/* is gated by middleware/super_admin.js — only users with
// role='SUPER_ADMIN' can reach the route handlers. Anyone else gets
// 403 SUPER_ADMIN_REQUIRED before the handler runs.

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

describeIfDb('Super admin — /api/super', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/super/stats as SUPER_ADMIN returns aggregate counts (200)', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await request(app).get('/api/super/stats').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    // The stats object has these aggregate counts; the values are
    // whatever's in the DB at run time. Just verify the keys exist.
    expect(res.body.stats).toEqual(
      expect.objectContaining({
        total_companies: expect.anything(),
        active_companies: expect.anything(),
        total_employees: expect.anything(),
        total_projects: expect.anything(),
        total_users: expect.anything(),
      })
    );
  });

  test('GET /api/super/stats as COMPANY_ADMIN returns 403 SUPER_ADMIN_REQUIRED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/super/stats').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
  });

  test('GET /api/super/companies as SUPER_ADMIN returns the companies list with counts', async () => {
    const company = await seedCompany();
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await request(app)
      .get('/api/super/companies')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.companies)).toBe(true);
    const ids = res.body.companies.map((c) => Number(c.id));
    expect(ids).toContain(company.company_id);
  });

  test('GET /api/super/companies/:id as SUPER_ADMIN returns the single company shape', async () => {
    const company = await seedCompany();
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await request(app)
      .get(`/api/super/companies/${company.company_id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.company.id)).toBe(company.company_id);
    expect(res.body.company.name).toBe(company.name);
  });
});
