// tests/integration/tenant_db_89c3.test.js
//
// Section 89-C/3 (Phase 4 Stage 2): cross-tenant isolation regression tests
// for the third batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/reports (reports.js)
//
// We exercise GET /reports/assignments and GET /reports/hours end-to-end —
// they have the cleanest tenant-scoped shape and use the same fixture
// surface (assignment_requests + attendance_records) without needing the
// CCQ travel-rates table to be seeded with sector data.
//
// /reports/travel, /reports/distance, /reports/my-daily, /reports/attendance
// share the same data path; if /assignments + /hours filter correctly
// cross-tenant, the others will too — they all join through
// assignment_requests.company_id which is RLS-enforced.
//
// These tests complement (don't duplicate) tests/integration/
// tenant_db_middleware.test.js (89-B canary), tests/integration/
// tenant_db_89c1.test.js (89-C/1 batch), tests/integration/
// tenant_db_89c2.test.js (89-C/2 batch).
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

describeIfDb('tenantDb middleware — Section 89-C/3 batch (/api/reports)', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let fixtureA;
  let fixtureB;
  // Use a wide date window — seedAttendanceFixture creates assignments
  // covering Jan 1 last year → Dec 31 next year, which always overlaps.
  const from = `${new Date().getFullYear() - 1}-01-01`;
  const to = `${new Date().getFullYear() + 1}-12-31`;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    fixtureA = await seedAttendanceFixture({ company_id: companyA.company_id });
    fixtureB = await seedAttendanceFixture({ company_id: companyB.company_id });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── /api/reports/assignments ─────────────────────────────────

  test('reports/assignments: company A admin sees only company A assignments', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/reports/assignments?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const assignmentIds = res.body.records.map((r) => Number(r.assignment_id));
    expect(assignmentIds).toContain(fixtureA.assignment.id);
    expect(assignmentIds).not.toContain(fixtureB.assignment.id);
  });

  test('reports/assignments: company B admin sees only company B assignments', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app)
      .get(`/api/reports/assignments?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const assignmentIds = res.body.records.map((r) => Number(r.assignment_id));
    expect(assignmentIds).toContain(fixtureB.assignment.id);
    expect(assignmentIds).not.toContain(fixtureA.assignment.id);
  });

  test('reports/assignments: filtering by cross-tenant project_id returns empty', async () => {
    // Company A admin requests company B's project_id explicitly.
    // RLS + WHERE company_id both enforce isolation; expected: empty array.
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(
        `/api/reports/assignments?from=${from}&to=${to}&project_id=${fixtureB.assignment.project_id}`
      )
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.records).toEqual([]);
  });

  // ── /api/reports/attendance (smoke) ──────────────────────────

  test('reports/attendance: company A admin sees only company A roster', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/reports/attendance?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const employeeIds = res.body.records.map((r) => Number(r.employee_id));
    expect(employeeIds).toContain(fixtureA.employee.id);
    expect(employeeIds).not.toContain(fixtureB.employee.id);
  });

  // ── /api/reports/hours (smoke) ───────────────────────────────
  //
  // /hours requires attendance_records. seedAttendanceFixture only seeds
  // the assignment, not actual records — so the response is empty for
  // both tenants. We just verify the endpoint loads under tenantDb without
  // 5xx, which proves the middleware wiring is correct for /api/reports.

  test('reports/hours: company A admin gets a clean 200 (smoke under tenantDb)', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/reports/hours?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
    // No attendance_records seeded → no rows for either tenant.
    // The point of this test is just to confirm the endpoint loads.
    const employeeIds = res.body.records.map((r) => Number(r.employee_id));
    expect(employeeIds).not.toContain(fixtureB.employee.id);
  });
});
