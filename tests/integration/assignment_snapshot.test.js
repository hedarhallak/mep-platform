// tests/integration/assignment_snapshot.test.js
//
// §132 anti-tamper (DECISIONS §136) — project-location snapshot at assignment
// creation time. The guarantee: an assignment captures the project's
// site_lat / site_lng / ccq_sector when it is created, and a LATER edit to the
// project's address does NOT change that snapshot — so a past assignment's CCQ
// travel allowance cannot be retroactively inflated by moving the project pin.
//
// Covers the manual create path (POST /api/assignments/requests, auto-approved
// for COMPANY_ADMIN) + the immutability property after PATCH /api/projects/:id.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
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

// Build a company + admin (creator, auto-approves) + an assignable employee +
// an ACTIVE project pinned to a known location.
async function fixture(siteLat, siteLng, sector = 'IC') {
  const company = await seedCompany();
  const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
  const emp = await seedEmployee({ company_id: company.company_id });
  await seedEmployeeProfile({ employee_id: emp.id });
  // The POST validates the employee via employee_profiles JOIN app_users on
  // employee_id AND company_id, so the employee needs an app_users row.
  await seedUser({ company_id: company.company_id, employee_id: emp.id, role: 'WORKER' });
  const proj = await seedProject({ company_id: company.company_id });
  await getPool().query(
    `UPDATE public.projects SET site_lat = $1, site_lng = $2, ccq_sector = $3,
            site_address = '100 Original St' WHERE id = $4`,
    [siteLat, siteLng, sector, proj.id]
  );
  return { company, admin, emp, proj };
}

describeIfDb('Assignment location snapshot — §132 anti-tamper', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('POST /requests snapshots the project location onto the new assignment', async () => {
    const { admin, emp, proj } = await fixture(45.51, -73.61, 'IC');
    const { token } = await loginUser(admin);

    const res = await request(app)
      .post('/api/assignments/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_id: proj.id,
        employee_id: emp.id,
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        shift_start: '06:00',
        shift_end: '14:30',
      });

    expect(res.statusCode).toBe(201);
    const assignId = res.body.request.id;

    const { rows } = await getPool().query(
      `SELECT snapshot_site_lat, snapshot_site_lng, snapshot_ccq_sector, snapshot_captured_at
         FROM public.assignment_requests WHERE id = $1`,
      [assignId]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].snapshot_site_lat)).toBeCloseTo(45.51, 5);
    expect(Number(rows[0].snapshot_site_lng)).toBeCloseTo(-73.61, 5);
    expect(rows[0].snapshot_ccq_sector).toBe('IC');
    expect(rows[0].snapshot_captured_at).not.toBeNull();
  });

  test('editing the project address LATER does not change the assignment snapshot', async () => {
    const { admin, emp, proj } = await fixture(45.51, -73.61, 'IC');
    const { token } = await loginUser(admin);

    const createRes = await request(app)
      .post('/api/assignments/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        project_id: proj.id,
        employee_id: emp.id,
        start_date: '2026-07-02',
        end_date: '2026-07-02',
        shift_start: '06:00',
        shift_end: '14:30',
      });
    expect(createRes.statusCode).toBe(201);
    const assignId = createRes.body.request.id;

    // Move the project pin far away (the fraud move).
    const patchRes = await request(app)
      .patch(`/api/projects/${proj.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ site_lat: 60.0, site_lng: -120.0, site_address: '9999 Far Away Blvd' });
    expect(patchRes.statusCode).toBe(200);

    // The assignment's snapshot must STILL be the original location.
    const { rows } = await getPool().query(
      `SELECT snapshot_site_lat, snapshot_site_lng FROM public.assignment_requests WHERE id = $1`,
      [assignId]
    );
    expect(Number(rows[0].snapshot_site_lat)).toBeCloseTo(45.51, 5);
    expect(Number(rows[0].snapshot_site_lng)).toBeCloseTo(-73.61, 5);
  });
});
