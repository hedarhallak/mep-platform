// tests/integration/tenant_db_89c4.test.js
//
// Section 89-C/4 (Phase 4 Stage 2): cross-tenant isolation regression tests
// for the fourth batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/assignments/auto-suggest  (auto_assign.js)
//   - /api/assignments/auto-confirm  (auto_assign.js)
//
// We exercise POST /auto-suggest end-to-end — the suggestions response
// includes a list of projects scoped to the caller's company, so the
// cross-tenant assertion is straightforward (companyA admin must NOT see
// companyB's project_ids in the suggestions array).
//
// /auto-confirm is NOT exercised here — it INSERTs into assignment_requests
// inside a manual `pool.connect()` transaction (see file header in
// routes/auto_assign.js for the rationale). The middleware-side coverage
// from 89-B's tenant_db_middleware.test.js + the in-handler `req.db`
// migration covers the SELECT path; the manual-transaction INSERT path is
// part of the Stage 3 prep TODO and will get its own test once that
// refactor lands.
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
  seedProject,
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

describeIfDb('tenantDb middleware — Section 89-C/4 batch (/api/assignments/auto-*)', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let projectA;
  let projectB;
  // Pick a target_date 30 days out — far enough to not collide with any
  // active assignments that might exist in the test DB.
  const targetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    // Each company gets one ACTIVE project (seedProject defaults to status
    // 'ACTIVE' via the project_statuses seed).
    projectA = await seedProject({ company_id: companyA.company_id });
    projectB = await seedProject({ company_id: companyB.company_id });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('auto-suggest: company A admin sees suggestions only for company A projects', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .post('/api/assignments/auto-suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_date: targetDate });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const projectIds = (res.body.suggestions || []).map((s) => Number(s.project_id));
    expect(projectIds).toContain(projectA.id);
    expect(projectIds).not.toContain(projectB.id);
  });

  test('auto-suggest: company B admin sees suggestions only for company B projects', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app)
      .post('/api/assignments/auto-suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_date: targetDate });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const projectIds = (res.body.suggestions || []).map((s) => Number(s.project_id));
    expect(projectIds).toContain(projectB.id);
    expect(projectIds).not.toContain(projectA.id);
  });

  test('auto-suggest: missing target_date returns 400', async () => {
    // Smoke test for the validation path — also confirms the middleware
    // doesn't break when the route returns early before doing any DB work.
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .post('/api/assignments/auto-suggest')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('TARGET_DATE_REQUIRED');
  });
});
