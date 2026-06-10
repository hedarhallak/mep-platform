// tests/admin/super_audit.test.js
//
// §132.6 layer 6 / §140 Slice 3b — Constrai cross-tenant audit oversight.
// GET /api/super/audit returns the high-risk / OWNER audit across ALL tenants
// (SUPER_ADMIN via superPool BYPASSRLS), excluding non-sensitive noise.

'use strict';

const jwt = require('jsonwebtoken');
const app = require('../../app');
const { JWT_SECRET } = require('../../lib/auth_utils');
const { adminRequest } = require('../helpers/admin_request');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');

function saToken(user) {
  return jwt.sign(
    {
      user_id: String(user.id),
      username: user.username,
      company_id: null,
      role: 'SUPER_ADMIN',
      must_change_pin: false,
      totp_verified: true,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describeIfDb('Cross-tenant audit — GET /api/super/audit (§132.6 / §140 Slice 3b)', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('SUPER_ADMIN sees sensitive audit across tenants; noise excluded', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'satest2026' });
    const auth = `Bearer ${saToken(sa)}`;
    const a = await seedCompany();
    const b = await seedCompany();
    const tag = `xt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await getPool().query(
      `INSERT INTO public.audit_logs (company_id, action, entity_type, entity_name) VALUES
         ($1, 'PROJECT_UPDATED', 'project', $3),
         ($2, 'PROJECT_UPDATED', 'project', $4),
         ($1, 'LOGIN_SUCCESS',  'auth',    $5)`,
      [a.company_id, b.company_id, `${tag}_A`, `${tag}_B`, `${tag}_noise`]
    );

    const res = await adminRequest(app).get('/api/super/audit').set('Authorization', auth);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.audit)).toBe(true);

    const names = res.body.audit.map((r) => r.entity_name);
    // Rows from BOTH companies appear (cross-tenant).
    expect(names).toContain(`${tag}_A`);
    expect(names).toContain(`${tag}_B`);
    // Non-sensitive noise is excluded.
    expect(names).not.toContain(`${tag}_noise`);
  });
});
