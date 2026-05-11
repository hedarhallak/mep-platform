// tests/integration/rls_stage3_login.test.js
//
// Section 90 / Piece 90-G regression test — closes Pitfall #28.
//
// The May 11, 2026 production outage (Piece 90-F) was caused by migration
// 013's strict RLS on `app_users`: routes/auth.js#login did a pre-tenant
// SELECT against `app_users` via the regular pool (no GUC set), and the
// strict policy filtered every row out. Login returned 400/401 for every
// account — including SUPER_ADMIN.
//
// CI didn't catch the bug because the test pool connects as `postgres`,
// which has BYPASSRLS by default. The pre-tenant lookup saw the user row
// through BYPASSRLS, the bug never surfaced.
//
// This test reproduces the production posture: a regular pool connected
// as `mepuser` (the role used in /var/www/mep/.env, which does NOT have
// BYPASSRLS). With strict RLS active (migration 013 applied in CI), the
// behavior diverges based on whether DATABASE_URL_SUPER is wired in:
//
//   - With DATABASE_URL_SUPER unset (graceful-degradation fallback) →
//     authPool falls through to the mepuser pool → login fails. This
//     is the production scenario from 90-F. The test documents it so
//     anyone reverting the fix would see this assertion go red.
//
//   - With DATABASE_URL_SUPER pointed at mepuser_super (the 90-G fix
//     applied) → authPool uses superPool (BYPASSRLS) → login succeeds.
//
// Plus SQL-level assertions on the raw policy behavior so a refactor
// that changes the auth.js query shape (e.g., joins a different strict
// table) is also caught.

'use strict';

const request = require('supertest');
const { Pool } = require('pg');
const {
  describeIfDb,
  getPool,
  closePool,
  seedUser,
  seedCompany,
  cleanupTestRows,
} = require('../helpers/db');

// Build mepuser / mepuser_super connection strings from TEST_DATABASE_URL,
// which CI sets to `postgres://postgres:testpass@…`. Both roles share the
// same password (testpass) per the CI workflow (see ci.yml — the role-
// provisioning step uses `MEPUSER_SUPER_PASSWORD=testpass` and the
// `CREATE ROLE mepuser … PASSWORD 'testpass'` line).
function rewriteRole(url, newRole) {
  return url.replace(/:\/\/postgres:/, `://${newRole}:`);
}

describeIfDb('Phase 4 Stage 3 / 90-G — login under strict RLS (Pitfall #28 regression)', () => {
  let sa;
  let company;

  // The two isolated app instances + their pools. Captured via
  // jest.isolateModules so the test process retains a single `app.js`
  // import for the rest of the suite while we side-load two extras here.
  let appWithSuper;
  let appWithoutSuper;
  const isolatedPools = [];

  beforeAll(async () => {
    // Seed via the default (postgres / BYPASSRLS) test pool — RLS doesn't
    // apply, so the writes go through regardless of policy.
    company = await seedCompany();
    sa = await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' });

    const baseUrl = process.env.TEST_DATABASE_URL;
    if (!baseUrl) {
      throw new Error('TEST_DATABASE_URL must be set for this test (helpers should have skipped).');
    }
    const mepuserUrl = rewriteRole(baseUrl, 'mepuser');
    const mepuserSuperUrl = rewriteRole(baseUrl, 'mepuser_super');

    // ── App A: DATABASE_URL=mepuser + DATABASE_URL_SUPER=mepuser_super.
    // Represents the 90-G fix correctly applied in production.
    jest.isolateModules(() => {
      const savedDb = process.env.DATABASE_URL;
      const savedSuper = process.env.DATABASE_URL_SUPER;
      try {
        process.env.DATABASE_URL = mepuserUrl;
        process.env.DATABASE_URL_SUPER = mepuserSuperUrl;
        appWithSuper = require('../../app');
        // Capture the pools so afterAll can close them cleanly.
        const dbMod = require('../../db');
        isolatedPools.push(dbMod.pool, dbMod.superPool);
      } finally {
        // Restore env so the next isolateModules block doesn't inherit.
        process.env.DATABASE_URL = savedDb;
        if (savedSuper === undefined) delete process.env.DATABASE_URL_SUPER;
        else process.env.DATABASE_URL_SUPER = savedSuper;
      }
    });

    // ── App B: DATABASE_URL=mepuser, DATABASE_URL_SUPER UNSET.
    // Represents the May 10 production posture between 89-E/3 (strict RLS
    // deployed) and the 013 rollback at 05:08 UTC May 11. authPool falls
    // through to the mepuser pool → login lookup 0-rows → 400/401.
    //
    // We set DATABASE_URL_SUPER='' (empty string) rather than `delete`
    // because app.js calls `require('dotenv').config()` on load, which
    // would re-populate the var from a local .env file if one exists.
    // Empty string survives dotenv's "don't overwrite" semantics and
    // db.js treats it as falsy (→ superPool = null).
    jest.isolateModules(() => {
      const savedDb = process.env.DATABASE_URL;
      const savedSuper = process.env.DATABASE_URL_SUPER;
      try {
        process.env.DATABASE_URL = mepuserUrl;
        process.env.DATABASE_URL_SUPER = '';
        appWithoutSuper = require('../../app');
        const dbMod = require('../../db');
        // Defensive: if superPool is somehow non-null here (e.g., a future
        // refactor of db.js stops treating '' as falsy), the test's
        // "bug repro" assertion would silently pass. Fail loudly instead.
        expect(dbMod.superPool).toBeNull();
        isolatedPools.push(dbMod.pool);
      } finally {
        process.env.DATABASE_URL = savedDb;
        if (savedSuper === undefined) delete process.env.DATABASE_URL_SUPER;
        else process.env.DATABASE_URL_SUPER = savedSuper;
      }
    });
  });

  afterAll(async () => {
    // Close the isolated pools BEFORE cleanupTestRows so the regular test
    // pool (postgres) can DELETE the test rows without contention.
    for (const p of isolatedPools) {
      if (p && typeof p.end === 'function') {
        try {
          await p.end();
        } catch {
          /* ignore — already closed */
        }
      }
    }
    await cleanupTestRows();
    await closePool();
  });

  // ── SQL-level guards ───────────────────────────────────────────────

  test('SQL: mepuser + strict RLS + no GUC → 0 rows from auth.js login SELECT', async () => {
    // Reproduces the exact SELECT shape from routes/auth.js#login. Under
    // strict RLS (migration 013) with no `app.company_id` GUC set, the
    // policy `company_id = NULLIF(current_setting(...), '')::bigint`
    // evaluates to `NULL = company_id` → NULL → row excluded. Every row
    // is filtered out for the non-BYPASSRLS mepuser role.
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE mepuser');
      // Intentionally do NOT set app.company_id — this is the pre-tenant
      // case auth.js operates in.

      const { rows } = await client.query(
        `SELECT au.id, au.username, au.email, au.role
           FROM public.app_users au
           LEFT JOIN public.employee_profiles ep ON ep.employee_id = au.employee_id
          WHERE lower(au.email) = lower($1) OR lower(au.username) = lower($1)
          LIMIT 1`,
        [sa.username]
      );

      expect(rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('SQL: mepuser_super + strict RLS + no GUC → 1 row (BYPASSRLS path)', async () => {
    // Same SELECT, but as mepuser_super (BYPASSRLS attribute set by
    // setup_rls_roles.sql). The policy is skipped entirely → the row is
    // returned regardless of GUC state. This is the fix path.
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE mepuser_super');

      const { rows } = await client.query(
        `SELECT au.id, au.username, au.email, au.role
           FROM public.app_users au
           LEFT JOIN public.employee_profiles ep ON ep.employee_id = au.employee_id
          WHERE lower(au.email) = lower($1) OR lower(au.username) = lower($1)
          LIMIT 1`,
        [sa.username]
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].username).toBe(sa.username);
      expect(String(rows[0].role).toUpperCase()).toBe('SUPER_ADMIN');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('SQL: companies SUSPENDED check has the same shape (mepuser=0 / super=1)', async () => {
    // The login flow also runs `SELECT status FROM public.companies WHERE
    // company_id = $1` as a pre-tenant SUSPENDED check. companies is also
    // in 013's strict_tables list, so the same fix must cover this query.
    const pool = getPool();

    const c1 = await pool.connect();
    try {
      await c1.query('BEGIN');
      await c1.query('SET LOCAL ROLE mepuser');
      const { rows } = await c1.query(
        'SELECT status FROM public.companies WHERE company_id = $1 LIMIT 1',
        [company.company_id]
      );
      expect(rows).toHaveLength(0);
    } finally {
      await c1.query('ROLLBACK');
      c1.release();
    }

    const c2 = await pool.connect();
    try {
      await c2.query('BEGIN');
      await c2.query('SET LOCAL ROLE mepuser_super');
      const { rows } = await c2.query(
        'SELECT status FROM public.companies WHERE company_id = $1 LIMIT 1',
        [company.company_id]
      );
      expect(rows).toHaveLength(1);
    } finally {
      await c2.query('ROLLBACK');
      c2.release();
    }
  });

  // ── db.js contract guard ───────────────────────────────────────────

  test('contract: db.js exports superPool (null when env unset, instance when set)', () => {
    // The fix depends on db.js exporting a `superPool` property. If
    // someone reverts db.js to its pre-90-G shape (`module.exports = {
    // pool }`), authPool computed in routes/auth.js becomes
    // `undefined || pool = pool` → bug returns. This contract guard fails
    // loudly on that regression.
    //
    // We re-import via jest.isolateModules so this test sees a clean
    // module cache and reads the actual export.
    jest.isolateModules(() => {
      const dbMod = require('../../db');
      expect(dbMod).toHaveProperty('superPool');
      // The exported value is either `null` (env unset) or a pg.Pool
      // instance (env set). Either is acceptable — the key is that the
      // property exists.
      if (dbMod.superPool !== null) {
        expect(typeof dbMod.superPool.connect).toBe('function');
        // Don't leak — the isolated pool is local to this require.
        if (typeof dbMod.superPool.end === 'function') {
          // Best-effort close; ignore errors.
          dbMod.superPool.end().catch(() => {});
        }
      }
      if (typeof dbMod.pool.end === 'function') {
        dbMod.pool.end().catch(() => {});
      }
    });
  });

  // ── End-to-end gating (this is the test that catches the original bug) ──

  test('e2e: app with DATABASE_URL=mepuser + DATABASE_URL_SUPER=mepuser_super → /api/auth/login 200 (fix verified)', async () => {
    // The 90-G fix correctly wired: authPool = superPool (BYPASSRLS).
    // Login lookup succeeds despite strict RLS on app_users, the user is
    // found, PIN verifies, response is 200.
    const res = await request(appWithSuper)
      .post('/api/auth/login')
      .send({ username: sa.username, pin: 'sa-pin-1234' });

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('SUPER_ADMIN');
  });

  test('e2e: app with DATABASE_URL=mepuser + DATABASE_URL_SUPER UNSET → /api/auth/login NON-200 (bug repro)', async () => {
    // The graceful-degradation fallback (authPool = pool) returns the
    // mepuser pool. Under strict RLS the login lookup returns 0 rows →
    // user is undefined → the PIN-format check resolves against role=null
    // (4–8 chars), the 9-char SA PIN fails the format check, response is
    // 400 INVALID_PIN_FORMAT. This is the exact production failure mode
    // from Piece 90-F.
    //
    // Asserting NOT 200 (rather than a specific code) keeps the test
    // robust to future refactors that may surface this error differently
    // — what we care about is that login is broken without the superPool
    // fix, so anyone removing the fix has a red CI signal.
    const res = await request(appWithoutSuper)
      .post('/api/auth/login')
      .send({ username: sa.username, pin: 'sa-pin-1234' });

    expect(res.statusCode).not.toBe(200);
    expect(res.body.ok).toBe(false);
    // Most likely INVALID_PIN_FORMAT (the SA path) or INVALID_CREDENTIALS
    // (the non-SA fallback). Both prove the same lookup failure.
    expect(['INVALID_PIN_FORMAT', 'INVALID_CREDENTIALS']).toContain(res.body.error);
  });

  test('e2e: app with DATABASE_URL=mepuser + DATABASE_URL_SUPER=mepuser_super → /api/auth/refresh 200 (refresh path covered)', async () => {
    // Phase 4 Stage 3 also makes the refresh-token lookup (JOIN
    // refresh_tokens × app_users) fail under strict RLS. Verify the same
    // fix path keeps token rotation working.
    const login = await request(appWithSuper)
      .post('/api/auth/login')
      .send({ username: sa.username, pin: 'sa-pin-1234' });
    expect(login.statusCode).toBe(200);
    expect(login.body.refresh_token).toBeDefined();

    const refresh = await request(appWithSuper)
      .post('/api/auth/refresh')
      .send({ refresh_token: login.body.refresh_token });

    expect(refresh.statusCode).toBe(200);
    expect(refresh.body.ok).toBe(true);
    expect(refresh.body.token).toBeDefined();
    expect(refresh.body.user.role).toBe('SUPER_ADMIN');
  });
});

// Suppress an unused-var lint warning if Pool ever ends up unused after
// future refactors — keep the import handy since the test pattern often
// needs a one-off connection that doesn't go through helpers/db.
void Pool;
