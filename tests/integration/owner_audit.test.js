// tests/integration/owner_audit.test.js
//
// §132 OWNER role (DECISIONS §140), Slice 2a — the OWNER-only sensitive-edit
// audit viewer (GET /api/permissions/owner-audit, gated by `audit.view`).
// Verifies: (1) no audit.view → 403; (2) with audit.view → 200 and ONLY the
// high-risk sensitive actions are returned (noise like LOGIN_SUCCESS excluded).
//
// The caller is granted audit.view via a user_permissions override so the test
// doesn't depend on role_permissions seeding.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
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

describeIfDb('OWNER sensitive-edit audit — GET /api/permissions/owner-audit (§132 / §140)', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('without audit.view → 403', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    const { token } = await loginUser(admin);

    const res = await request(app)
      .get('/api/permissions/owner-audit')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });

  test('with audit.view → 200, returns ONLY sensitive actions (noise excluded)', async () => {
    const company = await seedCompany();
    const viewer = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await seedUserPermission({
      user_id: viewer.id,
      permission_code: 'audit.view',
      granted: true,
    });

    // Seed one sensitive row + one noise row for the same company.
    await getPool().query(
      `INSERT INTO public.audit_logs (company_id, action, entity_type, entity_name)
       VALUES ($1, 'PROJECT_UPDATED', 'project', 'Test Project'),
              ($1, 'LOGIN_SUCCESS',  'auth',    NULL)`,
      [company.company_id]
    );

    const { token } = await loginUser(viewer);
    const res = await request(app)
      .get('/api/permissions/owner-audit')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.audit)).toBe(true);
    // The sensitive row is present; the noise row is NOT.
    expect(res.body.audit.some((r) => r.action === 'PROJECT_UPDATED')).toBe(true);
    expect(res.body.audit.some((r) => r.action === 'LOGIN_SUCCESS')).toBe(false);
  });
});
