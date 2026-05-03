// tests/integration/assignments_phase75a.test.js — Phase 75a (May 2026,
// Section 40 routes coverage push, batch 1 of 5: assignments.js).
//
// Targets the previously-uncovered branches in routes/assignments.js:
//   - PATCH /requests/:id/reassign (6 branches)
//   - PATCH /requests/:id/move    (6 branches)
//   - POST  /repeat-confirm       (2 branches — validation + empty-day)
//   - GET   /suggest/:project_id  (2 branches — validation + 404)
//
// All tests are gated by `describeIfDb` — they skip locally when
// TEST_DATABASE_URL is unset, run fully in CI.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
  seedProject,
  seedAssignment,
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

// Same convenience used in workflows.test.js — make an employee row + a
// linked app_user so the assignment route's joins succeed.
async function seedAssignableEmployee(companyId) {
  const emp = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({ employee_id: emp.id });
  await seedUser({ company_id: companyId, employee_id: emp.id, role: 'WORKER' });
  return emp;
}

describeIfDb('PATCH /api/assignments/requests/:id/reassign', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 NEW_EMPLOYEE_REQUIRED when body lacks new_employee_id', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const approved = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'APPROVED',
      start_date: '2027-07-01',
      end_date: '2027-07-31',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${approved.id}/reassign`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'NEW_EMPLOYEE_REQUIRED' });
  });

  test('404 REQUEST_NOT_FOUND for non-existent id', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/assignments/requests/9999999/reassign')
      .set('Authorization', `Bearer ${token}`)
      .send({ new_employee_id: 1 });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'REQUEST_NOT_FOUND' });
  });

  test('409 CANNOT_REASSIGN when assignment status is not APPROVED (PENDING)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const pending = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'PENDING',
      start_date: '2027-08-01',
      end_date: '2027-08-31',
    });
    const otherEmp = await seedAssignableEmployee(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${pending.id}/reassign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_employee_id: otherEmp.id });

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'CANNOT_REASSIGN' });
  });

  test('400 EMPLOYEE_NOT_FOUND when new employee is not in caller company', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const approved = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'APPROVED',
      start_date: '2027-09-01',
      end_date: '2027-09-30',
    });
    const { token } = await loginUser(admin);

    // Use an obviously bogus employee id that won't match any company.
    const res = await request(app)
      .patch(`/api/assignments/requests/${approved.id}/reassign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_employee_id: 99999999 });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'EMPLOYEE_NOT_FOUND' });
  });

  test('200 happy path — original cancelled, new APPROVED row created', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const newEmp = await seedAssignableEmployee(company.company_id);
    const approved = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'APPROVED',
      start_date: '2027-10-01',
      end_date: '2027-10-31',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${approved.id}/reassign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_employee_id: newEmp.id });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.request).toBeDefined();
    expect(res.body.request.status).toBe('APPROVED');
    // New row is for the new employee, not the original
    expect(Number(res.body.request.requested_for_employee_id)).toBe(newEmp.id);
    // The new row preserves the original date range
    expect(res.body.request.start_date).toMatch(/2027-10-01/);
    expect(res.body.request.end_date).toMatch(/2027-10-31/);
  });
});

describeIfDb('PATCH /api/assignments/requests/:id/move', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 NEW_PROJECT_REQUIRED when body lacks new_project_id', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const approved = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'APPROVED',
      start_date: '2027-11-01',
      end_date: '2027-11-30',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${approved.id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'NEW_PROJECT_REQUIRED' });
  });

  test('404 REQUEST_NOT_FOUND for non-existent id', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/assignments/requests/9999999/move')
      .set('Authorization', `Bearer ${token}`)
      .send({ new_project_id: project.id });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'REQUEST_NOT_FOUND' });
  });

  test('409 CANNOT_MOVE when assignment status is not APPROVED (PENDING)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const pending = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'PENDING',
      start_date: '2027-12-01',
      end_date: '2027-12-31',
    });
    const otherProject = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${pending.id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_project_id: otherProject.id });

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'CANNOT_MOVE' });
  });

  // NOTE: Dead-code finding (Bug 9, surfaced by Phase 75a). The route's
  // SAME_PROJECT guard at routes/assignments.js:935 reads:
  //   if (r.project_id === Number(new_project_id))
  // `r.project_id` comes back from node-pg as a STRING for bigint/int8
  // columns by default, while `Number(new_project_id)` is a JS Number.
  // Strict === between "5" and 5 is always false, so the SAME_PROJECT
  // branch NEVER fires. In production a user moving to the same project
  // gets 200 with project_id unchanged (effective no-op) instead of the
  // intended 400 SAME_PROJECT short-circuit.
  //
  // Tracked as a bug. The fix is `Number(r.project_id) === Number(new_project_id)`
  // (or use loose ==). Same pattern likely exists elsewhere in routes/.
  // Test pins the CURRENT (buggy) behaviour so a fix doesn't break CI silently.
  test('move to SAME project currently returns 200 (Bug 9 — SAME_PROJECT guard is dead code)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const project = await seedProject({ company_id: company.company_id });
    const approved = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      project_id: project.id,
      status: 'APPROVED',
      start_date: '2028-01-01',
      end_date: '2028-01-31',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${approved.id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_project_id: project.id });

    // Buggy current behaviour: 200 instead of 400 SAME_PROJECT.
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    // After Bug 9 is fixed (Number coercion on r.project_id), update this
    // test to expect: 400 + { ok: false, error: 'SAME_PROJECT' }.
  });

  test('404 PROJECT_NOT_FOUND when target project not in caller company', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const approved = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'APPROVED',
      start_date: '2028-02-01',
      end_date: '2028-02-29',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${approved.id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_project_id: 99999999 });

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'PROJECT_NOT_FOUND' });
  });

  test('200 happy path — project_id updated in place, status stays APPROVED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const fromProject = await seedProject({ company_id: company.company_id });
    const toProject = await seedProject({ company_id: company.company_id });
    const approved = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      project_id: fromProject.id,
      status: 'APPROVED',
      start_date: '2028-03-01',
      end_date: '2028-03-31',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${approved.id}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ new_project_id: toProject.id });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.request.project_id)).toBe(toProject.id);
    expect(res.body.request.status).toBe('APPROVED');
    // Same row id — move is in-place, not a re-create
    expect(Number(res.body.request.id)).toBe(approved.id);
  });
});

describeIfDb('POST /api/assignments/repeat-confirm', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 TARGET_DATE_REQUIRED when body lacks target_date', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/repeat-confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'TARGET_DATE_REQUIRED' });
  });

  test('200 with { created: 0, skipped: 0 } when no APPROVED assignment overlaps today', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/repeat-confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_date: '2099-01-01' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, created: 0, skipped: 0 });
  });
});

describeIfDb('GET /api/assignments/suggest/:project_id', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 DATES_REQUIRED when start_date or end_date missing', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get(`/api/assignments/suggest/${project.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'DATES_REQUIRED' });
  });

  test('404 PROJECT_NOT_FOUND when project id not in caller company', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/assignments/suggest/99999999')
      .query({ start_date: '2028-04-01', end_date: '2028-04-30' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'PROJECT_NOT_FOUND' });
  });

  test('200 happy path — empty tenant returns suggestions array (possibly empty)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const project = await seedProject({ company_id: company.company_id });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get(`/api/assignments/suggest/${project.id}`)
      .query({ start_date: '2028-05-01', end_date: '2028-05-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.project).toBeDefined();
    expect(Number(res.body.project.id)).toBe(project.id);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });
});
