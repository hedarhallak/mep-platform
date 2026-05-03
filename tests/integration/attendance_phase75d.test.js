// tests/integration/attendance_phase75d.test.js — Phase 75d
// (May 2026, Section 40 routes coverage push, batch 4 of 5: attendance.js).
//
// Targets routes/attendance.js (5 endpoints). 10 tests across 5 describe blocks:
//   - GET   /projects           (1 — 200 empty list)
//   - GET   /                   (1 — 200 empty roster for today)
//   - POST  /checkin            (3 — 400 + 403 + 201 happy)
//   - PATCH /:id/checkout       (2 — 403 + 200 happy)
//   - PATCH /:id/confirm        (3 — 404 + 409 + 200 happy)

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

// Today-spanning dates so the route's `start_date <= today AND end_date >= today`
// filter matches regardless of when CI runs.
function todayWindow() {
  const today = new Date();
  const start = new Date(today.getFullYear() - 1, 0, 1).toISOString().slice(0, 10);
  const end = new Date(today.getFullYear() + 1, 11, 31).toISOString().slice(0, 10);
  return { start, end };
}

// Seed a COMPANY_ADMIN with an employee + an active assignment they can
// check into. Uses shift 06:00–23:30 so the SHIFT_ENDED guard doesn't fire
// regardless of the wall-clock time the suite runs at.
async function seedAdminWithLiveAssignment(companyId) {
  const emp = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({ employee_id: emp.id });
  const admin = await seedUser({
    company_id: companyId,
    employee_id: emp.id,
    role: 'COMPANY_ADMIN',
  });
  const project = await seedProject({ company_id: companyId });
  const { start, end } = todayWindow();
  const assignment = await seedAssignment({
    company_id: companyId,
    project_id: project.id,
    employee_id: emp.id,
    requested_by_user_id: admin.id,
    status: 'APPROVED',
    start_date: start,
    end_date: end,
    shift_start: '06:00',
    shift_end: '23:30',
  });
  return { admin, emp, project, assignment };
}

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/attendance/projects', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 returns empty list when company has no APPROVED assignments today', async () => {
    const company = await seedCompany();
    const emp = await seedEmployee({ company_id: company.company_id });
    await seedEmployeeProfile({ employee_id: emp.id });
    const admin = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'COMPANY_ADMIN',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/attendance/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.projects)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/attendance', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 returns roster + summary for today (empty when no active assignments)', async () => {
    const company = await seedCompany();
    const emp = await seedEmployee({ company_id: company.company_id });
    await seedEmployeeProfile({ employee_id: emp.id });
    const admin = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'COMPANY_ADMIN',
    });
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/attendance').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body.summary).toMatchObject({
      total: expect.any(Number),
      checked_in: expect.any(Number),
      checked_out: expect.any(Number),
      confirmed: expect.any(Number),
    });
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('POST /api/attendance/checkin', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 ASSIGNMENT_REQUIRED when assignment_request_id is missing', async () => {
    const company = await seedCompany();
    const emp = await seedEmployee({ company_id: company.company_id });
    await seedEmployeeProfile({ employee_id: emp.id });
    const admin = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'COMPANY_ADMIN',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ASSIGNMENT_REQUIRED' });
  });

  test('403 ASSIGNMENT_NOT_FOUND_OR_NOT_YOURS for non-existent assignment id', async () => {
    const company = await seedCompany();
    const emp = await seedEmployee({ company_id: company.company_id });
    await seedEmployeeProfile({ employee_id: emp.id });
    const admin = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'COMPANY_ADMIN',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ assignment_request_id: 9999999 });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'ASSIGNMENT_NOT_FOUND_OR_NOT_YOURS' });
  });

  test('201 happy path — admin checks into their own active assignment', async () => {
    const company = await seedCompany();
    const { admin, assignment } = await seedAdminWithLiveAssignment(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ assignment_request_id: assignment.id });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.record).toBeDefined();
    expect(res.body.record.status).toBe('CHECKED_IN');
    expect(res.body.record.check_in_time).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('PATCH /api/attendance/:id/checkout', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('403 RECORD_NOT_FOUND_OR_NOT_YOURS for non-existent attendance id', async () => {
    const company = await seedCompany();
    const emp = await seedEmployee({ company_id: company.company_id });
    await seedEmployeeProfile({ employee_id: emp.id });
    const admin = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'COMPANY_ADMIN',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/attendance/9999999/checkout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: 'RECORD_NOT_FOUND_OR_NOT_YOURS' });
  });

  test('200 happy path — checkout chains from a CHECKED_IN record', async () => {
    const company = await seedCompany();
    const { admin, assignment } = await seedAdminWithLiveAssignment(company.company_id);
    const { token } = await loginUser(admin);

    // Step 1: check in
    const checkin = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ assignment_request_id: assignment.id });
    expect(checkin.statusCode).toBe(201);
    const recordId = Number(checkin.body.record.id);

    // Step 2: check out
    const res = await request(app)
      .patch(`/api/attendance/${recordId}/checkout`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.record.status).toBe('CHECKED_OUT');
    expect(res.body.record.check_out_time).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('PATCH /api/attendance/:id/confirm', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('404 RECORD_NOT_FOUND for non-existent attendance id', async () => {
    const company = await seedCompany();
    const emp = await seedEmployee({ company_id: company.company_id });
    await seedEmployeeProfile({ employee_id: emp.id });
    const admin = await seedUser({
      company_id: company.company_id,
      employee_id: emp.id,
      role: 'COMPANY_ADMIN',
    });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .patch('/api/attendance/9999999/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'RECORD_NOT_FOUND' });
  });

  test('409 NOT_CHECKED_OUT_YET when record is still in CHECKED_IN status', async () => {
    const company = await seedCompany();
    const { admin, assignment } = await seedAdminWithLiveAssignment(company.company_id);
    const { token } = await loginUser(admin);

    // Check in only — not out
    const checkin = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ assignment_request_id: assignment.id });
    expect(checkin.statusCode).toBe(201);
    const recordId = Number(checkin.body.record.id);

    const res = await request(app)
      .patch(`/api/attendance/${recordId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'NOT_CHECKED_OUT_YET' });
  });

  test('200 happy path — admin confirms hours after checkout (no adjustment → CONFIRMED)', async () => {
    const company = await seedCompany();
    const { admin, assignment } = await seedAdminWithLiveAssignment(company.company_id);
    const { token } = await loginUser(admin);

    const checkin = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ assignment_request_id: assignment.id });
    const recordId = Number(checkin.body.record.id);

    await request(app)
      .patch(`/api/attendance/${recordId}/checkout`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .patch(`/api/attendance/${recordId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'all good' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    // No regular_hours/overtime_hours in body → no adjustment → CONFIRMED, not ADJUSTED
    expect(res.body.record.status).toBe('CONFIRMED');
    expect(res.body.record.foreman_note).toBe('all good');
  });
});
