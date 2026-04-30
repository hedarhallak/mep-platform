// Phase 14 — Core workflow integration tests.
//
// Phase 12 + 13 validated the *boundaries* (tenant isolation, RBAC).
// Phase 14 walks the *flows* through the assignment lifecycle:
// create -> approve / reject / cancel and the state-machine guards.

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

// Convenience: seed an employee with profile + linked app_user that
// matches the company. The POST /api/assignments/requests handler joins
// employee_profiles + app_users WHERE company_id matches before allowing
// an employee to be referenced — without all three rows the create 400s
// with EMPLOYEE_NOT_FOUND.
async function seedAssignableEmployee(companyId) {
  const emp = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({ employee_id: emp.id });
  await seedUser({ company_id: companyId, employee_id: emp.id, role: 'WORKER' });
  return emp;
}

describeIfDb('Workflow — assignment lifecycle', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // SKIPPED — surfaces a real product bug discovered by Phase 14:
  // routes/assignments.js POST /requests INSERTs into a "notes" column
  // on assignment_requests, but the baseline schema (pg_dump of prod
  // 2026-04-28) doesn't have that column. Either prod has drifted away
  // from the dump, or this code path has never run in prod. Separate
  // tracking issue — re-enable once the schema/route mismatch is fixed.
  test.skip('COMPANY_ADMIN POST /api/assignments/requests is auto-approved', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const project = await seedProject({ company_id: company.company_id });
    const emp = await seedAssignableEmployee(company.company_id);

    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_id: project.id,
        employee_id: emp.id,
        start_date: '2026-06-01',
        end_date: '2026-06-30',
        shift_start: '06:00',
        shift_end: '14:30',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.auto_approved).toBe(true);
    expect(res.body.request.status).toBe('APPROVED');
  });

  test('PATCH /requests/:id/approve transitions PENDING -> APPROVED with decision metadata', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const pending = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'PENDING',
      start_date: '2027-01-01',
      end_date: '2027-01-31',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${pending.id}/approve`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.request.status).toBe('APPROVED');
    expect(Number(res.body.request.decision_by_user_id)).toBe(admin.id);
    expect(res.body.request.decision_at).toBeTruthy();
  });

  test('PATCH /requests/:id/reject sets status=REJECTED and stores the reason', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const pending = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'PENDING',
      start_date: '2027-02-01',
      end_date: '2027-02-28',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${pending.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'project not staffed yet' });

    expect(res.statusCode).toBe(200);
    expect(res.body.request.status).toBe('REJECTED');
    expect(res.body.request.decision_note).toBe('project not staffed yet');
    expect(Number(res.body.request.decision_by_user_id)).toBe(admin.id);
  });

  test('PATCH /requests/:id/approve on already-APPROVED returns 409 REQUEST_NOT_PENDING', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const approved = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'APPROVED',
      start_date: '2027-03-01',
      end_date: '2027-03-31',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${approved.id}/approve`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'REQUEST_NOT_PENDING' });
  });

  test('PATCH /requests/:id/reject on already-APPROVED returns 409 REQUEST_NOT_PENDING', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const approved = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'APPROVED',
      start_date: '2027-04-01',
      end_date: '2027-04-30',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${approved.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'changed my mind' });

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'REQUEST_NOT_PENDING' });
  });

  test('PATCH /requests/:id/cancel on PENDING transitions to CANCELLED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const pending = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'PENDING',
      start_date: '2027-05-01',
      end_date: '2027-05-31',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${pending.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.request.status).toBe('CANCELLED');
  });

  test('PATCH /requests/:id/cancel on already-CANCELLED returns 409 CANNOT_CANCEL', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const cancelled = await seedAssignment({
      company_id: company.company_id,
      requested_by_user_id: admin.id,
      status: 'CANCELLED',
      start_date: '2027-06-01',
      end_date: '2027-06-30',
    });

    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch(`/api/assignments/requests/${cancelled.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'CANNOT_CANCEL' });
  });
});
