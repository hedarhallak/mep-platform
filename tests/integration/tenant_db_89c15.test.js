// tests/integration/tenant_db_89c15.test.js
//
// Section 89-C/15 (Phase 4 Stage 2): smoke tests for SUPER_ADMIN routes
// migrated onto req.db (BYPASSRLS via superPool).
//
// Routes covered in this batch:
//   - /api/super (super_admin.js) — company management
//   - /api/super/ccq-rates (ccq_rates.js) — CCQ travel rates
//
// What we verify:
//   1. SUPER_ADMIN can hit /api/super/stats and see cross-company
//      aggregates (no RLS narrowing applied).
//   2. SUPER_ADMIN can list /api/super/companies and see ALL companies
//      (no per-tenant filtering).
//   3. SUPER_ADMIN can read /api/super/ccq-rates (global table).
//   4. Non-SUPER_ADMIN gets 403 from the superAdmin middleware before
//      tenantDb even runs (regression check).
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

describeIfDb('tenantDb middleware — Section 89-C/15 batch (SUPER_ADMIN routes)', () => {
  let companyA;
  let companyB;
  let superUser;
  let regularAdmin;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    // SUPER_ADMIN typically has no company_id. seedUser supports
    // company_id: null for this case.
    superUser = await seedUser({ company_id: null, role: 'SUPER_ADMIN' });
    regularAdmin = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── /api/super ───────────────────────────────────────────────

  test('super/stats: SUPER_ADMIN sees cross-company aggregates', async () => {
    const { token } = await loginUser(superUser);
    const res = await request(app).get('/api/super/stats').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.stats).toBeDefined();
    // Total companies should be at least our 2 seeded test companies.
    expect(Number(res.body.stats.total_companies)).toBeGreaterThanOrEqual(2);
  });

  test('super/companies: SUPER_ADMIN sees ALL companies (no per-tenant filter)', async () => {
    const { token } = await loginUser(superUser);
    const res = await request(app)
      .get('/api/super/companies')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const ids = res.body.companies.map((c) => Number(c.id));
    // Both seeded companies must be visible — confirms BYPASSRLS path
    // works (tenantDb routes SUPER_ADMIN through superPool).
    expect(ids).toContain(companyA.company_id);
    expect(ids).toContain(companyB.company_id);
  });

  test('super/companies: regular admin gets 403 from superAdmin middleware (before tenantDb)', async () => {
    const { token } = await loginUser(regularAdmin);
    const res = await request(app)
      .get('/api/super/companies')
      .set('Authorization', `Bearer ${token}`);

    // The superAdmin middleware mounts before tenantDb in app.js, so a
    // non-SUPER_ADMIN gets 403 (or 401, depending on the middleware
    // implementation) without ever touching req.db.
    expect([401, 403]).toContain(res.statusCode);
  });

  // ── /api/super/ccq-rates ──────────────────────────────────────

  test('ccq-rates: SUPER_ADMIN can list rates (global table)', async () => {
    const { token } = await loginUser(superUser);
    const res = await request(app)
      .get('/api/super/ccq-rates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.rates)).toBe(true);
  });

  test('ccq-rates: regular admin gets 403 from superAdmin middleware', async () => {
    const { token } = await loginUser(regularAdmin);
    const res = await request(app)
      .get('/api/super/ccq-rates')
      .set('Authorization', `Bearer ${token}`);

    expect([401, 403]).toContain(res.statusCode);
  });
});
