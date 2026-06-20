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

  test('§148 Phase 5: per-user overrides — create, read-back, diff-removal, rank-lock', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });

    // Grant the worker a permission their role does NOT inherit → creates an override.
    const grant = await request(app)
      .put(`/api/permissions/user/${worker.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: [{ module: 'projects', action: 'delete', allowed: true }] });
    expect(grant.statusCode).toBe(200);

    const afterGrant = await request(app)
      .get(`/api/permissions/user/${worker.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(afterGrant.statusCode).toBe(200);
    expect(afterGrant.body.user.role).toBe('WORKER');
    expect(afterGrant.body.overrides['projects.delete']).toBe(true);
    // projects.delete is NOT part of the WORKER baseline.
    expect(afterGrant.body.inherited.projects?.delete).toBeFalsy();

    // Setting it back to the inherited value (false) DROPS the override.
    const revert = await request(app)
      .put(`/api/permissions/user/${worker.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: [{ module: 'projects', action: 'delete', allowed: false }] });
    expect(revert.statusCode).toBe(200);

    const afterRevert = await request(app)
      .get(`/api/permissions/user/${worker.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(afterRevert.body.overrides['projects.delete']).toBeUndefined();

    // Rank-lock: a COMPANY_ADMIN cannot edit another COMPANY_ADMIN (equal rank).
    const peer = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const blocked = await request(app)
      .put(`/api/permissions/user/${peer.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: [{ module: 'projects', action: 'view', allowed: false }] });
    expect(blocked.statusCode).toBe(403);
  });

  test('§148 Phase 5: DELETE clears a user’s personal overrides (per-user reset)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });

    await request(app)
      .put(`/api/permissions/user/${worker.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: [{ module: 'projects', action: 'delete', allowed: true }] });

    const del = await request(app)
      .delete(`/api/permissions/user/${worker.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.statusCode).toBe(200);

    const after = await request(app)
      .get(`/api/permissions/user/${worker.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(after.body.overrides).toEqual({});
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

  // §148 P4 fix: the User Management role dropdown needs the catalog, so /roles
  // is allowed for a settings.user_management holder even without settings.permissions.
  test('GET /roles is allowed for a user_management holder (canAny)', async () => {
    const company = await seedCompany();
    const u = await seedUser({ company_id: company.company_id, role: 'WORKER' });
    await seedUserPermission({ user_id: u.id, permission_code: 'settings.user_management' });
    const { token } = await loginUser(u);

    const res = await request(app)
      .get('/api/permissions/roles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.roles)).toBe(true);
  });
});
