// tests/integration/tenant_db_89c7.test.js
//
// Section 89-C/7 (Phase 4 Stage 2): cross-tenant isolation regression tests
// for the seventh batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/standup (standup.js)
//
// We exercise GET /api/standup/tomorrow — returns projects with workers
// assigned tomorrow per the caller's company. Cross-tenant assertion:
// company A admin must NOT see company B's projects in the response.
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
  seedAttendanceFixture,
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

describeIfDb('tenantDb middleware — Section 89-C/7 batch (/api/standup)', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let fixtureA;
  let fixtureB;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    // seedAttendanceFixture creates project + employee + WORKER user +
    // active assignment (Jan 1 last year → Dec 31 next year). "Tomorrow"
    // is always inside that range, so /standup/tomorrow returns the
    // project for each tenant.
    fixtureA = await seedAttendanceFixture({ company_id: companyA.company_id });
    fixtureB = await seedAttendanceFixture({ company_id: companyB.company_id });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── GET /api/standup/tomorrow ────────────────────────────────

  test('standup/tomorrow: company A admin sees only company A projects', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get('/api/standup/tomorrow')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const projectIds = (res.body.projects || []).map((p) => Number(p.id));
    expect(projectIds).toContain(fixtureA.assignment.project_id);
    expect(projectIds).not.toContain(fixtureB.assignment.project_id);
  });

  test('standup/tomorrow: company B admin sees only company B projects', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app)
      .get('/api/standup/tomorrow')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const projectIds = (res.body.projects || []).map((p) => Number(p.id));
    expect(projectIds).toContain(fixtureB.assignment.project_id);
    expect(projectIds).not.toContain(fixtureA.assignment.project_id);
  });
});
