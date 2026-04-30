// Phase 13 — RBAC matrix tests.
//
// Pins the behavior of middleware/permissions.js's can() middleware:
//   1. SUPER_ADMIN bypasses every permission check (always granted).
//   2. A role without a role_permissions grant is rejected with
//      403 FORBIDDEN, with the missing permission code echoed in the
//      response.
//   3. user_permissions(granted=false) overrides a role grant -> 403.
//   4. user_permissions(granted=true)  overrides a role denial  -> 200.
//   5. Authentication is required first (401 without Bearer token).
//
// These properties are the second-most-important security guarantee in
// the product after tenant isolation. The 13-role x 12-permission
// matrix isn't enumerated here — instead we verify the four invariants
// of the can() middleware on a representative endpoint, since the
// middleware is identical for every permission code.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedUserPermission,
  cleanupTestRows,
} = require('../helpers/db');

async function loginUser(user, pin = '1234') {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, pin });
  if (res.statusCode !== 200) {
    throw new Error(`Login failed in test setup: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

describeIfDb('RBAC matrix — can() middleware invariants', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /api/employees without Authorization header returns 401', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.statusCode).toBe(401);
  });

  test('SUPER_ADMIN bypasses all permission checks (no role grant needed)', async () => {
    // SUPER_ADMIN has no rows in role_permissions in our seed — the
    // bypass is hardcoded at the top of userHasPermission().
    const sa = await seedUser({ company_id: null, role: 'SUPER_ADMIN' });
    const { token } = await loginUser(sa);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    // 200 (or any non-403). The exact body depends on what employees
    // exist in the test DB; what matters here is that can() didn't
    // 403 the request.
    expect(res.statusCode).not.toBe(403);
  });

  test('WORKER without employees.view grant returns 403 FORBIDDEN with permission code', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
      permission: 'employees.view',
    });
  });

  test('WORKER without projects.view grant returns 403 on /api/projects', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('projects.view');
  });

  test('WORKER without suppliers.view grant returns 403 on /api/suppliers', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app).get('/api/suppliers').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('suppliers.view');
  });

  test('COMPANY_ADMIN with role grant returns 200 on /api/employees', async () => {
    // Smoke test — confirms the positive direction works on the same
    // fixtures the negative tests use.
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('user_permissions(granted=false) overrides a COMPANY_ADMIN role grant — 403', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    // Explicit user-level deny.
    await seedUserPermission({
      user_id: admin.id,
      permission_code: 'employees.view',
      granted: false,
    });
    const { token } = await loginUser(admin);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('employees.view');
  });

  test('user_permissions(granted=true) overrides a WORKER role denial — 200', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    // Explicit user-level allow on a permission the role doesn't have.
    await seedUserPermission({
      user_id: worker.id,
      permission_code: 'employees.view',
      granted: true,
    });
    // Seed at least one employee in the company so the route returns a
    // valid list rather than empty array (200 either way, but more
    // realistic).
    await seedEmployee({ company_id: company.company_id });
    const { token } = await loginUser(worker);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
