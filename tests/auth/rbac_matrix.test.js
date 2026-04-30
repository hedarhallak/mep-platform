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
    // SUPER_ADMIN PINs must be 8-32 chars (vs 4-8 for other roles) per
    // routes/auth.js#isValidPin, so override the default 4-char pin.
    const sa = await seedUser({ company_id: null, role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });
    const { token } = await loginUser(sa);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

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
    await seedUserPermission({
      user_id: worker.id,
      permission_code: 'employees.view',
      granted: true,
    });
    await seedEmployee({ company_id: company.company_id });
    const { token } = await loginUser(worker);

    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
