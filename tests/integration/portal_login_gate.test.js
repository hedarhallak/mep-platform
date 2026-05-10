// tests/integration/portal_login_gate.test.js
//
// Phase 5 / 90-E — cross-portal login gate.
//
// Verifies that the /api/auth/login handler rejects COMPANY_ADMIN (and
// any non-SUPER_ADMIN role) when the request's Host header is
// admin.constrai.ca, with a 403 BLOCKED_PORTAL_LOGIN response and a
// matching audit_logs row. The reverse direction (SA on tenant Host) is
// intentionally allowed per Section 90's "SA can test as a tenant"
// requirement.
//
// All assertions exercise the real DB so they're gated behind
// describeIfDb. Tests that don't need DB stay in vhost_isolation.test.js.

'use strict';

const request = require('supertest');
const app = require('../../app');
const { adminRequest, tenantRequest } = require('../helpers/admin_request');
const {
  describeIfDb,
  closePool,
  getPool,
  seedCompany,
  seedUser,
  cleanupTestRows,
} = require('../helpers/db');

describeIfDb('Phase 5 / 90-E — cross-portal login gate', () => {
  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('admin.constrai.ca + COMPANY_ADMIN credentials → 403 BLOCKED_PORTAL_LOGIN', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const res = await adminRequest(app)
      .post('/api/auth/login')
      .send({ username: admin.username, pin: '1234' });

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      ok: false,
      error: 'BLOCKED_PORTAL_LOGIN',
    });
  });

  test('admin.constrai.ca + COMPANY_ADMIN writes a BLOCKED_PORTAL_LOGIN audit row', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    await adminRequest(app).post('/api/auth/login').send({ username: admin.username, pin: '1234' });

    // Look up the audit row directly. audit_logs has a permissive INSERT
    // policy under Stage 3 RLS (89-E/3) so the auth.js pool path can
    // write here even without a tenant GUC.
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT action, entity_id, entity_name, details
       FROM public.audit_logs
       WHERE action = $1
         AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      ['BLOCKED_PORTAL_LOGIN', admin.id]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('BLOCKED_PORTAL_LOGIN');
    expect(Number(rows[0].entity_id)).toBe(admin.id);
    // details is jsonb — check the role + portal fields.
    expect(rows[0].details).toMatchObject({
      role: 'COMPANY_ADMIN',
      attempted_portal: 'admin',
    });
  });

  test('admin.constrai.ca + SUPER_ADMIN credentials → 200 (gate passes)', async () => {
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });

    const res = await adminRequest(app)
      .post('/api/auth/login')
      .send({ username: sa.username, pin: 'sa-pin-1234' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('SUPER_ADMIN');
  });

  test('app.constrai.ca + SUPER_ADMIN credentials → 200 (allowed per Section 90)', async () => {
    // Section 90 Decision A explicitly says SA needs to be able to log
    // into the tenant portal (testing as a tenant in another tab).
    // Verify the gate doesn't fire on the tenant Host.
    const sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });

    const res = await tenantRequest(app)
      .post('/api/auth/login')
      .send({ username: sa.username, pin: 'sa-pin-1234' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.role).toBe('SUPER_ADMIN');
  });

  test('app.constrai.ca + COMPANY_ADMIN credentials → 200 (existing tenant flow unchanged)', async () => {
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const res = await tenantRequest(app)
      .post('/api/auth/login')
      .send({ username: admin.username, pin: '1234' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.role).toBe('COMPANY_ADMIN');
  });

  test('default Host (127.0.0.1) + COMPANY_ADMIN credentials → 200 (gate not active off-portal)', async () => {
    // Tests that don't set Host explicitly fall through to the default
    // behavior. The portal gate fires ONLY for hostname=admin.constrai.ca
    // — anything else (tenant Host, default supertest 127.0.0.1, etc.)
    // takes the existing tenant flow. This preserves the ~41 existing
    // test files that use `request(app)` without Host headers.
    const company = await seedCompany();
    const admin = await seedUser({ company_id: company.company_id, role: 'COMPANY_ADMIN' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: admin.username, pin: '1234' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.role).toBe('COMPANY_ADMIN');
  });
});
