// tests/integration/tenant_db_89c2.test.js
//
// Section 89-C/2 (Phase 4 Stage 2): cross-tenant isolation regression tests
// for the second batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/attendance (attendance.js)
//
// We exercise the two GET handlers end-to-end through the HTTP stack —
// they have a clean tenant-scoped shape:
//   GET /api/attendance/projects — projects with assignments on a date
//   GET /api/attendance          — assignments + attendance records by project + date
//
// POST /checkin, PATCH /:id/checkout, PATCH /:id/confirm aren't covered
// here because they require a logged-in WORKER user with an active
// assignment matching today's date — that's a denser fixture surface
// than necessary to prove tenant isolation. The middleware regression
// from 89-B's tenant_db_middleware.test.js already proves the write-side
// COMMIT path is RLS-enforced; the GET tests below confirm the migrated
// SELECTs filter correctly.
//
// These tests complement (don't duplicate) tests/integration/
// tenant_db_middleware.test.js (89-B canary on /api/suppliers) and
// tests/integration/tenant_db_89c1.test.js (89-C/1 batch — bi, project-
// foremen, project-trades). Here we prove the same property holds for
// /api/attendance.
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

describeIfDb('tenantDb middleware — Section 89-C/2 batch (/api/attendance)', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let fixtureA;
  let fixtureB;
  // The date covered by seedAttendanceFixture's default assignment range
  // (last year Jan 1 → next year Dec 31). "Today" always falls inside it.
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    // seedAttendanceFixture creates: employee + profile + worker user +
    // active assignment (Jan 1 last year → Dec 31 next year, status APPROVED)
    // for the company. Both companies get one each.
    fixtureA = await seedAttendanceFixture({ company_id: companyA.company_id });
    fixtureB = await seedAttendanceFixture({ company_id: companyB.company_id });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── /api/attendance/projects ─────────────────────────────────

  test('attendance/projects: company A admin sees only company A projects on a given date', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/attendance/projects?date=${today}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const projectIds = res.body.projects.map((p) => Number(p.id));
    expect(projectIds).toContain(fixtureA.assignment.project_id);
    expect(projectIds).not.toContain(fixtureB.assignment.project_id);
  });

  test('attendance/projects: company B admin sees only company B projects on a given date', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app)
      .get(`/api/attendance/projects?date=${today}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const projectIds = res.body.projects.map((p) => Number(p.id));
    expect(projectIds).toContain(fixtureB.assignment.project_id);
    expect(projectIds).not.toContain(fixtureA.assignment.project_id);
  });

  // ── /api/attendance ──────────────────────────────────────────

  test('attendance: company A admin sees only company A assignments + records', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/attendance?date=${today}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const employeeIds = res.body.records.map((r) => Number(r.employee_id));
    expect(employeeIds).toContain(fixtureA.employee.id);
    expect(employeeIds).not.toContain(fixtureB.employee.id);
  });

  test('attendance: company B admin sees only company B assignments + records', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app)
      .get(`/api/attendance?date=${today}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const employeeIds = res.body.records.map((r) => Number(r.employee_id));
    expect(employeeIds).toContain(fixtureB.employee.id);
    expect(employeeIds).not.toContain(fixtureA.employee.id);
  });

  test('attendance: filtering by project_id from the wrong tenant returns empty (cross-tenant blocked)', async () => {
    // Company A admin requests company B's project_id explicitly.
    // Defense-in-depth WHERE company_id + RLS both enforce isolation;
    // expected result is empty records array (200) — never B's rows leaking.
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/attendance?date=${today}&project_id=${fixtureB.assignment.project_id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.records).toEqual([]);
  });
});
