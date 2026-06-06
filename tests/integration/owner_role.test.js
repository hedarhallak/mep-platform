// tests/integration/owner_role.test.js
//
// §132 OWNER role (DECISIONS §140), Slice 1 — the guard is WIRED into the
// in-tenant role-change endpoint. The realistic hole it closes: an in-tenant
// COMPANY_ADMIN must NOT be able to demote/neutralize an OWNER (only Constrai
// can touch an OWNER). A positive control confirms the guard does not
// over-block ordinary role changes.
//
// The caller is granted `settings.user_management` via a user_permissions
// override so the test doesn't depend on role_permissions seeding.

'use strict';

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

describeIfDb('OWNER role guard — PATCH /api/users/:id/role (§132 / §140)', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('in-tenant COMPANY_ADMIN CANNOT demote an OWNER → 403 OWNER_ROLE_RESTRICTED', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await seedUserPermission({
      user_id: admin.id,
      permission_code: 'settings.user_management',
      granted: true,
    });
    const owner = await seedUser({ company_id: company.company_id, role: 'OWNER' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch(`/api/users/${owner.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'COMPANY_ADMIN' });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('OWNER_ROLE_RESTRICTED');
  });

  test('COMPANY_ADMIN CAN still change an ordinary user role (guard does not over-block)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });
    await seedUserPermission({
      user_id: admin.id,
      permission_code: 'settings.user_management',
      granted: true,
    });
    const worker = await seedUser({ company_id: company.company_id, role: 'WORKER' });

    const { token } = await loginUser(admin);
    const res = await request(app)
      .patch(`/api/users/${worker.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      // TRADE_ADMIN is in the endpoint's ALLOWED_ROLES (FOREMAN is not).
      .send({ role: 'TRADE_ADMIN' });

    expect(res.statusCode).toBe(200);
  });
});
