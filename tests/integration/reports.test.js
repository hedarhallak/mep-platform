// Phase 32 — Reports endpoints (validation + happy-path with no data).
//
// /api/reports/* runs heavy aggregation queries over attendance and
// assignment data. We pin the validation surface (date range required)
// + the empty-data shape on a fresh tenant — the route must return a
// 200 with an empty records array rather than 500'ing on no data.

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

describeIfDb('Reports — /api/reports', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/reports/hours without from/to returns 400', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/hours')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('GET /api/reports/hours with valid range on empty company returns 200 + empty records', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/hours')
      .query({ from: '2026-01-01', to: '2026-01-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body.records).toEqual([]);
    // totals object should be present even with no records
    expect(typeof res.body.totals).toBe('object');
  });

  test('GET /api/reports/hours without reports.view permission returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/reports/hours')
      .query({ from: '2026-01-01', to: '2026-01-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });
});
