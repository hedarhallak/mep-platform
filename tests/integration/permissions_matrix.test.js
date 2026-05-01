// Phase 31 — RBAC permissions matrix endpoint.
//
// /api/permissions/matrix is the admin-facing surface that drives the
// "Roles & Permissions" UI. Returns the full role × module × action
// truth table built from public.role_permissions. Permission-gated by
// settings.permissions.

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  seedCompany,
  seedUser,
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

describeIfDb('Permissions matrix — /api/permissions/matrix', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /matrix as COMPANY_ADMIN returns roles + modules + matrix shape', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/permissions/matrix')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.roles)).toBe(true);
    expect(Array.isArray(res.body.modules)).toBe(true);
    expect(typeof res.body.matrix).toBe('object');
    // COMPANY_ADMIN is one of the roles seeded; verify it shows up + has
    // at least one granted action.
    expect(res.body.roles).toContain('COMPANY_ADMIN');
    expect(res.body.matrix.COMPANY_ADMIN).toBeDefined();
    expect(res.body.matrix.COMPANY_ADMIN.employees?.view).toBe(true);
  });

  test('GET /matrix without settings.permissions returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/permissions/matrix')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.permission).toBe('settings.permissions');
  });

  test('GET /role/COMPANY_ADMIN returns the role permission grants', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/permissions/role/COMPANY_ADMIN')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.role).toBe('COMPANY_ADMIN');
    expect(Array.isArray(res.body.permissions)).toBe(true);
    const codes = res.body.permissions.map((p) => p.permission_code);
    expect(codes).toEqual(expect.arrayContaining(['employees.view', 'projects.view']));
  });

  test('GET /role/INVALID_ROLE returns 400 Invalid role', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/permissions/role/NOT_A_REAL_ROLE')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid role');
  });
});
