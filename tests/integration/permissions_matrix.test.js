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

    // §148 Phase 2 — the full catalog (all codes by module, granted or not),
    // so the UI can render every toggle dynamically.
    expect(typeof res.body.catalog).toBe('object');
    expect(Array.isArray(res.body.catalog.assignments)).toBe(true);
    expect(res.body.catalog.assignments).toContain('view');
    // CRUD actions sort before the rest: 'view' precedes 'smart_assign'.
    const a = res.body.catalog.assignments;
    expect(a.indexOf('view')).toBeLessThan(a.indexOf('smart_assign'));
  });

  // §148 Phase 2 — data-driven rank-lock on PUT (from roles.rank, not a
  // hardcoded map). These 403s fire before any mutation, so they don't touch
  // the global role_permissions table.
  test('PUT /role rank-lock: COMPANY_ADMIN cannot edit an equal-or-higher role (403)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const body = { permissions: [{ module: 'dashboard', action: 'view', allowed: true }] };

    const equalRole = await request(app)
      .put('/api/permissions/role/COMPANY_ADMIN')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(equalRole.statusCode).toBe(403);

    const higherRole = await request(app)
      .put('/api/permissions/role/SUPER_ADMIN')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(higherRole.statusCode).toBe(403);
  });

  test('§148 Phase 3b: COMPANY_ADMIN edits are per-company overrides, not global', async () => {
    const compA = await seedCompany();
    const adminA = await seedUser({ company_id: compA.company_id, role: 'COMPANY_ADMIN' });
    const { token: tokenA } = await loginUser(adminA);

    const compB = await seedCompany();
    const adminB = await seedUser({ company_id: compB.company_id, role: 'COMPANY_ADMIN' });
    const { token: tokenB } = await loginUser(adminB);

    const getMatrix = (token) =>
      request(app).get('/api/permissions/matrix').set('Authorization', `Bearer ${token}`);
    const fmView = (res) => !!res.body.matrix?.FOREMAN?.projects?.view;

    const before = fmView(await getMatrix(tokenA));

    // Company A flips FOREMAN's projects.view. The company branch is diff-based,
    // so a partial body touching just this one code is valid.
    const put = await request(app)
      .put('/api/permissions/role/FOREMAN')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ permissions: [{ module: 'projects', action: 'view', allowed: !before }] });
    expect(put.statusCode).toBe(200);

    // A sees the override; B (same global default) is UNAFFECTED → proves the
    // write went to company_role_permissions, not the shared role_permissions.
    expect(fmView(await getMatrix(tokenA))).toBe(!before);
    expect(fmView(await getMatrix(tokenB))).toBe(before);

    // Reset drops A's override → back to the global default.
    const reset = await request(app)
      .post('/api/permissions/reset/FOREMAN')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(reset.statusCode).toBe(200);
    expect(fmView(await getMatrix(tokenA))).toBe(before);
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

// §148 — data-driven role catalog (migration 035).
describeIfDb('Role catalog — /api/permissions/roles', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GET /roles returns the catalog with rank + category', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/permissions/roles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.roles)).toBe(true);
    const foreman = res.body.roles.find((r) => r.role_key === 'FOREMAN');
    expect(foreman).toBeDefined();
    expect(foreman.rank).toBe(40);
    expect(foreman.category).toBe('supervision');
    // Sorted senior→junior: the first role outranks the last.
    expect(res.body.roles[0].rank).toBeGreaterThanOrEqual(
      res.body.roles[res.body.roles.length - 1].rank
    );
  });

  test('GET /roles without settings.permissions returns 403', async () => {
    const company = await seedCompany();
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    const { token } = await loginUser(worker);

    const res = await request(app)
      .get('/api/permissions/roles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });
});
