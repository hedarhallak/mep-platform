// Phase 40 — Super admin POST /api/super/companies validation surface.
//
// The full happy-path flow (creating a company + admin user) hardcodes
// role='ADMIN' which is NOT in the app_users role CHECK constraint
// (canonical roles are COMPANY_ADMIN, etc). That would fail with a
// constraint violation — pinned as TODO for product fix. For now we
// pin the validation guards that fire BEFORE the INSERT.

const request = require('supertest');
const app = require('../../app');
const { adminRequest } = require('../helpers/admin_request');
const { describeIfDb, closePool, seedUser, cleanupTestRows } = require('../helpers/db');

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

describeIfDb('Super admin — POST /api/super/companies validation', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /companies without name returns 400 COMPANY_NAME_REQUIRED', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await adminRequest(app)
      .post('/api/super/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ admin_username: 'foo', admin_pin: '1234' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'COMPANY_NAME_REQUIRED' });
  });

  test('POST /companies without admin_username returns 400 ADMIN_USERNAME_REQUIRED', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await adminRequest(app)
      .post('/api/super/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'NewCo', admin_pin: '1234' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ADMIN_USERNAME_REQUIRED' });
  });

  test('POST /companies without admin_pin returns 400 ADMIN_PIN_REQUIRED', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await adminRequest(app)
      .post('/api/super/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'NewCo', admin_username: 'foo' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ADMIN_PIN_REQUIRED' });
  });

  test('POST /companies with INVALID_PLAN returns 400', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await adminRequest(app)
      .post('/api/super/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'NewCo',
        admin_username: 'foo',
        admin_pin: '1234',
        plan: 'NOT_A_REAL_PLAN',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'INVALID_PLAN' });
  });

  test('POST /companies with USERNAME_TAKEN returns 409', async () => {
    // Seed an existing user, then try to create a company that would
    // reuse that username for its admin.
    const existing = await seedUser({ role: 'WORKER', pin: '1234' });
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await adminRequest(app)
      .post('/api/super/companies')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'NewCo',
        admin_username: existing.username,
        admin_pin: '1234',
      });

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'USERNAME_TAKEN' });
  });
});
