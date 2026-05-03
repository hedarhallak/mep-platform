// tests/integration/reports_phase75e.test.js — Phase 75e
// (May 2026, Section 40 routes coverage push, batch 5 of 5: reports.js).
//
// Targets routes/reports.js (6 endpoints). 9 tests across 6 describe blocks.
// Most endpoints share the parseRange validation helper — exercise it
// once on /hours, then 200 happy path on each endpoint to cover the rest.
//
//   - GET /hours       (3 — 400 missing dates + 400 from > to + 200 happy)
//   - GET /attendance  (1 — 200 happy)
//   - GET /travel      (1 — 200 happy)
//   - GET /assignments (1 — 200 happy)
//   - GET /distance    (1 — 200 happy)
//   - GET /my-daily    (2 — 200 with no linked employee + 200 with linked employee)

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

async function seedAdmin(companyId, withEmployee = true) {
  let employeeId = null;
  if (withEmployee) {
    const emp = await seedEmployee({ company_id: companyId });
    await seedEmployeeProfile({ employee_id: emp.id });
    employeeId = emp.id;
  }
  const admin = await seedUser({
    company_id: companyId,
    employee_id: employeeId,
    role: 'COMPANY_ADMIN',
  });
  return admin;
}

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/reports/hours', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('400 when from/to query params are missing', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/hours')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'from and to dates are required',
    });
  });

  test('400 when from > to', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/hours')
      .query({ from: '2026-12-31', to: '2026-01-01' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'from must be <= to',
    });
  });

  test('200 happy path — empty tenant returns zero totals', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/hours')
      .query({ from: '2026-01-01', to: '2026-12-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body.totals).toMatchObject({
      days_worked: 0,
      total_regular: 0,
      total_overtime: 0,
      total_hours: 0,
    });
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/reports/attendance', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 happy path — empty tenant returns empty records array', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/attendance')
      .query({ from: '2026-01-01', to: '2026-12-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/reports/travel', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 happy path — empty tenant returns grand_total 0', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/travel')
      .query({ from: '2026-01-01', to: '2026-12-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body.grand_total).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/reports/assignments', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 happy path — empty tenant returns empty records', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/assignments')
      .query({ from: '2026-01-01', to: '2026-12-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/reports/distance', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 happy path — empty tenant returns empty records', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/distance')
      .query({ from: '2026-01-01', to: '2026-12-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
describeIfDb('GET /api/reports/my-daily', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('200 returns empty records when caller has no linked employee_id', async () => {
    const company = await seedCompany();
    // No employee linked — exercises the "no employee_id" early-return branch
    const admin = await seedAdmin(company.company_id, /* withEmployee */ false);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/my-daily')
      .query({ from: '2026-01-01', to: '2026-12-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.records).toEqual([]);
  });

  test('200 returns empty records + zero totals when employee linked but no attendance', async () => {
    const company = await seedCompany();
    const admin = await seedAdmin(company.company_id, /* withEmployee */ true);
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/reports/my-daily')
      .query({ from: '2026-01-01', to: '2026-12-31' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body.totals).toMatchObject({
      days_worked: 0,
      total_regular: 0,
      total_overtime: 0,
      total_allowance: 0,
    });
  });
});
