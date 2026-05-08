// tests/integration/tenant_db_89c5.test.js
//
// Section 89-C/5 (Phase 4 Stage 2): cross-tenant isolation regression tests
// for the fifth batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/users (user_management.js)
//
// We exercise GET /api/users end-to-end + a write-side cross-tenant
// rejection (PATCH /:id/role). The write-side has an explicit company_id
// check that returns 403 CROSS_COMPANY before RLS even gets involved, so
// it's primarily a regression assertion that the existing defense-in-depth
// path still works under the migrated middleware.
//
// PATCH /:id/status, POST /:id/resend follow the same data path through
// app_users.company_id and are transitively covered.
//
// They require a real DB connection (TEST_DATABASE_URL); gated behind
// describeIfDb so the suite skips cleanly without a DB.

'use strict';

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

describeIfDb('tenantDb middleware — Section 89-C/5 batch (/api/users)', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let workerA;
  let workerB;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    // Each company gets one extra WORKER user so the GET /api/users list
    // has at least 2 rows per tenant (admin + worker) — gives us a clean
    // cross-tenant assertion target.
    workerA = await seedUser({ company_id: companyA.company_id, role: 'WORKER' });
    workerB = await seedUser({ company_id: companyB.company_id, role: 'WORKER' });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── GET /api/users ───────────────────────────────────────────

  test('users: company A admin sees only company A users', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const userIds = res.body.users.map((u) => Number(u.id));
    expect(userIds).toContain(adminA.id);
    expect(userIds).toContain(workerA.id);
    expect(userIds).not.toContain(adminB.id);
    expect(userIds).not.toContain(workerB.id);
  });

  test('users: company B admin sees only company B users', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const userIds = res.body.users.map((u) => Number(u.id));
    expect(userIds).toContain(adminB.id);
    expect(userIds).toContain(workerB.id);
    expect(userIds).not.toContain(adminA.id);
    expect(userIds).not.toContain(workerA.id);
  });

  // ── PATCH /api/users/:id/role (cross-tenant rejection) ───────

  test('users/:id/role: company A admin cannot change company B user role', async () => {
    // Under permissive RLS, the WHERE+company_id check inside the route
    // returns 0 rows for the SELECT (target.company_id mismatch), which
    // cascades to either USER_NOT_FOUND (404) or CROSS_COMPANY (403),
    // depending on whether RLS filtered the row out before or after the
    // explicit comparison runs. Either is acceptable — the security
    // property is "company A cannot mutate company B's data".
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .patch(`/api/users/${workerB.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'TRADE_ADMIN' });

    expect([403, 404]).toContain(res.statusCode);
    expect(['USER_NOT_FOUND', 'CROSS_COMPANY']).toContain(res.body.error);
  });
});
