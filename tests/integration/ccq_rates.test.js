// Phase 28 — CCQ rates endpoints (super admin only).
//
// /api/super/ccq-rates manages the Quebec construction commission's
// travel allowance reference table. Mounted under /api/super so it's
// behind both auth and middleware/super_admin (role='SUPER_ADMIN'
// required).

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

describeIfDb('CCQ rates — /api/super/ccq-rates', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/super/ccq-rates as SUPER_ADMIN returns rates array (200)', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await request(app)
      .get('/api/super/ccq-rates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.rates)).toBe(true);
  });

  test('GET /api/super/ccq-rates as COMPANY_ADMIN returns 403', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/super/ccq-rates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
  });

  test('GET /api/super/ccq-rates/expiring as SUPER_ADMIN returns expiring set (200)', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await request(app)
      .get('/api/super/ccq-rates/expiring')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.expiring)).toBe(true);
    expect(typeof res.body.count).toBe('number');
  });
});
