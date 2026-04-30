// Phase 18 — Attendance check-in / check-out workflow.
//
// Phase 12.6 covered the GET /api/attendance tenant boundary. This file
// pins the heart of the time-tracking flow: a worker can check in, then
// check out, and the record carries the right state and computed hours.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
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

// Convenience: seed everything an attendance flow needs:
//   employee + employee_profile + linked app_user + APPROVED assignment
//   whose date range spans today and whose shift_end is far enough in the
//   future that the route's "after shift end" 409 guard never fires.
async function seedCheckinFixture(companyId) {
  const emp = await seedEmployee({ company_id: companyId });
  await seedEmployeeProfile({ employee_id: emp.id });
  const user = await seedUser({
    company_id: companyId,
    employee_id: emp.id,
    role: 'COMPANY_ADMIN',
  });

  const today = new Date();
  const start = new Date(today.getFullYear() - 1, 0, 1).toISOString().slice(0, 10);
  const end = new Date(today.getFullYear() + 1, 11, 31).toISOString().slice(0, 10);

  const assignment = await seedAssignment({
    company_id: companyId,
    employee_id: emp.id,
    requested_by_user_id: user.id,
    start_date: start,
    end_date: end,
    shift_start: '00:01',
    shift_end: '23:59', // never blocks check-in regardless of clock time
  });
  return { user, assignment, employee: emp };
}

describeIfDb('Workflow — attendance check-in / check-out', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /api/attendance/checkin creates a CHECKED_IN record (201)', async () => {
    const company = await seedCompany();
    const { user, assignment } = await seedCheckinFixture(company.company_id);

    const { token } = await loginUser(user);

    const res = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ assignment_request_id: assignment.id });

    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.record.status).toBe('CHECKED_IN');
    expect(res.body.record.check_in_time).toBeTruthy();
    expect(Number(res.body.record.assignment_request_id)).toBe(assignment.id);
  });

  test('POST /api/attendance/checkin without assignment_request_id returns 400', async () => {
    const company = await seedCompany();
    const { user } = await seedCheckinFixture(company.company_id);

    const { token } = await loginUser(user);

    const res = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'ASSIGNMENT_REQUIRED' });
  });

  test('PATCH /api/attendance/:id/checkout transitions CHECKED_IN -> CHECKED_OUT', async () => {
    const company = await seedCompany();
    const { user, assignment } = await seedCheckinFixture(company.company_id);

    const { token } = await loginUser(user);

    // First check in — produces a CHECKED_IN record we can check out from.
    const checkin = await request(app)
      .post('/api/attendance/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ assignment_request_id: assignment.id });
    expect(checkin.statusCode).toBe(201);

    const recordId = Number(checkin.body.record.id);

    const checkout = await request(app)
      .patch(`/api/attendance/${recordId}/checkout`)
      .set('Authorization', `Bearer ${token}`);

    expect(checkout.statusCode).toBe(200);
    expect(checkout.body.ok).toBe(true);
    expect(checkout.body.record.status).toBe('CHECKED_OUT');
    expect(checkout.body.record.check_out_time).toBeTruthy();
    // Hours computed by calcHours() — at minimum, raw_minutes is set.
    expect(checkout.body.record.raw_minutes).not.toBeNull();
  });
});
