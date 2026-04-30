// Phase 29 — BI workforce-suggestions tests.
//
// /api/bi/workforce-suggestions analyzes employee home locations vs
// active project sites. Permission-gated by bi.access_full. The route
// short-circuits with empty arrays + zero summary when the company has
// no projects with site coordinates — that's the easy happy path to pin.

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

describeIfDb('BI — /api/bi/workforce-suggestions', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /workforce-suggestions with no geo-tagged projects returns empty result', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/bi/workforce-suggestions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.current_assignments).toEqual([]);
    expect(res.body.suggestions).toEqual([]);
    expect(res.body.summary).toEqual({
      total_assignments: 0,
      far_assignments: 0,
      optimizable: 0,
    });
  });

  test('GET /workforce-suggestions without bi.access_full returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/bi/workforce-suggestions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('bi.access_full');
  });
});
