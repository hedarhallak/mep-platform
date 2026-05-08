// tests/integration/tenant_db_89c12.test.js
//
// Section 89-C/12 (Phase 4 Stage 2): cross-tenant isolation regression
// tests for the twelfth batch of routes migrated onto req.db
// (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/employees (employees.js)
//
// We exercise GET /api/employees (list scoping) and GET /api/employees/:id
// (cross-tenant 404). PATCH /:id follows the same `WHERE e.company_id`
// guard and is transitively covered.
//
// Note: employees.js has SUPER_ADMIN cross-company logic that we don't
// regression-test here — its safety is covered by the explicit
// `userRole !== 'SUPER_ADMIN'` branch in the SQL builder, and full
// SUPER_ADMIN coverage will land with Stage 3 (89-E) when the
// `mepuser_super` pool ships.
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

describeIfDb('tenantDb middleware — Section 89-C/12 batch (/api/employees)', () => {
  let companyA;
  let companyB;
  let adminA;
  let adminB;
  let empA;
  let empB;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();

    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
    adminB = await seedUser({ company_id: companyB.company_id, role: 'COMPANY_ADMIN' });

    // Seed one employee per company with a profile so the LEFT JOINs in
    // the list query return the row.
    empA = await seedEmployee({ company_id: companyA.company_id });
    await seedEmployeeProfile({ employee_id: empA.id });

    empB = await seedEmployee({ company_id: companyB.company_id });
    await seedEmployeeProfile({ employee_id: empB.id });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  // ── GET /api/employees ────────────────────────────────────────

  test('employees: company A admin sees only company A employees', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const ids = res.body.employees.map((e) => Number(e.id));
    expect(ids).toContain(empA.id);
    expect(ids).not.toContain(empB.id);
  });

  test('employees: company B admin sees only company B employees', async () => {
    const { token } = await loginUser(adminB);
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const ids = res.body.employees.map((e) => Number(e.id));
    expect(ids).toContain(empB.id);
    expect(ids).not.toContain(empA.id);
  });

  // ── GET /api/employees/:id (cross-tenant) ────────────────────

  test('employees/:id: company A admin gets 404 trying to read company B employee', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/employees/${empB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('EMPLOYEE_NOT_FOUND');
  });

  test('employees/:id: company A admin can read own employee', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get(`/api/employees/${empA.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Number(res.body.employee.id)).toBe(empA.id);
  });

  // ── PATCH /api/employees/:id (cross-tenant) ──────────────────

  test('employees/:id (PATCH): company A admin gets 404 trying to update company B employee', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .patch(`/api/employees/${empB.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'Hacked' });

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('EMPLOYEE_NOT_FOUND');
  });
});
