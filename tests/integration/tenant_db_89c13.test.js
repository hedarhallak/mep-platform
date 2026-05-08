// tests/integration/tenant_db_89c13.test.js
//
// Section 89-C/13 (Phase 4 Stage 2): smoke tests for the thirteenth
// batch of routes migrated onto req.db (RLS-enforced).
//
// Routes covered in this batch:
//   - /api/profile (profile.js) — uses req.db via the q(req,...) helper
//   - /api/profile/push-token (push_tokens_route.js) — single endpoint
//
// These routes are per-user, not per-tenant — every query is keyed off
// req.user.employee_id or req.user.user_id from the JWT, with no
// company_id filter in the SQL. Cross-tenant isolation here would
// require hijacking another user's JWT (a separate auth concern).
//
// What we verify:
//   1. /api/profile/dropdowns smokes through auth + tenantDb (no DB
//      hit, just confirms the middleware chain works for this mount).
//   2. GET /api/profile/me for an admin user (no employee_id) returns
//      the admin-shaped response — confirms the q(req,...) helper
//      drives req.db.query correctly.
//   3. POST /api/profile/push-token inserts a row and returns ok —
//      confirms the trivial migration didn't break anything and the
//      ON CONFLICT (user_id) upsert still works under tenantDb.
//
// They require a real DB connection (TEST_DATABASE_URL); gated behind
// describeIfDb so the suite skips cleanly without a DB.

'use strict';

const request = require('supertest');
const app = require('../../app');
const {
  describeIfDb,
  closePool,
  getPool,
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

describeIfDb('tenantDb middleware — Section 89-C/13 batch (/api/profile + push-token)', () => {
  let companyA;
  let adminA;

  beforeAll(async () => {
    companyA = await seedCompany();
    adminA = await seedUser({ company_id: companyA.company_id, role: 'COMPANY_ADMIN' });
  });

  afterAll(async () => {
    // Clean up push_tokens rows for our test users — cleanupTestRows
    // doesn't touch this table.
    const pool = getPool();
    await pool.query(
      `DELETE FROM public.push_tokens WHERE user_id IN (
         SELECT id FROM public.app_users WHERE username LIKE 'test_%'
       )`
    );
    await cleanupTestRows();
    await closePool();
  });

  // ── /api/profile/dropdowns ────────────────────────────────────

  test('profile/dropdowns: smoke test through auth + tenantDb', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .get('/api/profile/dropdowns')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.trades)).toBe(true);
    expect(Array.isArray(res.body.ranks)).toBe(true);
    expect(res.body.trades.length).toBeGreaterThan(0);
  });

  // ── /api/profile/me ───────────────────────────────────────────

  test('profile/me: admin user with no employee_id gets admin-shaped response', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.is_admin).toBe(true);
    expect(res.body.profile.employee_id).toBeNull();
    expect(res.body.profile.role_code).toBe('COMPANY_ADMIN');
    expect(res.body.profile.first_name).toBe(adminA.username);
  });

  // ── /api/profile/push-token ───────────────────────────────────

  test('profile/push-token: inserts a row keyed by user_id', async () => {
    const { token } = await loginUser(adminA);
    const tag = Date.now().toString(36);
    const pushToken = `ExpoPushToken[test_${tag}]`;

    const res = await request(app)
      .post('/api/profile/push-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: pushToken, platform: 'ios' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify the row landed under the caller's user_id.
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT user_id, token, platform FROM public.push_tokens WHERE user_id = $1`,
      [adminA.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].token).toBe(pushToken);
    expect(rows[0].platform).toBe('ios');
  });

  test('profile/push-token: ON CONFLICT (user_id) upserts on second call', async () => {
    const { token } = await loginUser(adminA);
    const newToken = `ExpoPushToken[refreshed_${Date.now().toString(36)}]`;

    const res = await request(app)
      .post('/api/profile/push-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: newToken, platform: 'android' });

    expect(res.statusCode).toBe(200);

    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT token, platform FROM public.push_tokens WHERE user_id = $1`,
      [adminA.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].token).toBe(newToken);
    expect(rows[0].platform).toBe('android');
  });

  test('profile/push-token: missing token returns 400', async () => {
    const { token } = await loginUser(adminA);
    const res = await request(app)
      .post('/api/profile/push-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'ios' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('TOKEN_REQUIRED');
  });
});
