// tests/integration/rls_stage1.test.js
//
// Phase 4 Stage 1 — Permissive Row-Level Security (DB-layer test).
//
// Exercises the policies created by migration 012 directly at the database
// layer, complementing tests/integration/tenant_isolation.test.js which
// exercises the same property via the HTTP routes.
//
// Four scenarios:
//   1. GUC unset           -> permissive bypass: rows from all companies returned.
//   2. GUC = companyA      -> only companyA's rows returned, B's filtered out.
//   3. GUC = nonexistent   -> 0 rows returned (RLS filters everything out).
//   4. GUC = '' (empty)    -> behaves like unset (permissive bypass).
//
// IMPORTANT: RLS policies are bypassed by roles that have the BYPASSRLS
// attribute (superusers and any role explicitly granted BYPASSRLS). CI
// connects as `postgres` (superuser) for test setup speed, but production
// runs as `mepuser` (non-super). To test the policy meaningfully we switch
// to `mepuser` for the duration of each test transaction via SET LOCAL ROLE.
// Both the GRANT and SET LOCAL ROLE auto-revert on ROLLBACK so there's no
// pollution of the testdb.
//
// The CI workflow already creates `mepuser` before applying migrations
// (.github/workflows/ci.yml — "Pre-create roles" step). Locally, anyone
// running this test against TEST_DATABASE_URL must have a `mepuser` role
// in the target database (production setup already does).

'use strict';

const {
  describeIfDb,
  getPool,
  closePool,
  seedCompany,
  seedEmployee,
  cleanupTestRows,
} = require('../helpers/db');

// Helper: run `callback(client)` inside a transaction with role switched to
// mepuser (non-super, RLS-respecting). Always rolls back at the end so the
// GRANT + SET ROLE leave no trace.
async function withMepuserRls(callback) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Make sure mepuser can read the public schema. In production mepuser
    // owns the tables; in CI it's created bare. The grant rolls back with
    // the transaction, so the testdb stays clean.
    await client.query('GRANT USAGE ON SCHEMA public TO mepuser');
    await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO mepuser');

    // Switch the current role for the duration of this transaction. RLS
    // policies will now apply (postgres bypasses, mepuser doesn't).
    await client.query('SET LOCAL ROLE mepuser');

    await callback(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describeIfDb('Phase 4 Stage 1 — Permissive RLS at the DB layer', () => {
  let companyA;
  let companyB;
  let empA1;
  let empA2;
  let empB1;

  beforeAll(async () => {
    companyA = await seedCompany();
    companyB = await seedCompany();
    empA1 = await seedEmployee({ company_id: companyA.company_id, first_name: 'AliceRLS' });
    empA2 = await seedEmployee({ company_id: companyA.company_id, first_name: 'AnnaRLS' });
    empB1 = await seedEmployee({ company_id: companyB.company_id, first_name: 'BobRLS' });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('GUC unset: strict policy returns 0 rows (Stage 3 contract — migration 013)', async () => {
    // Section 89-E/3 (May 9, 2026): migration 013 dropped the
    // "GUC unset = bypass" clause. With no GUC set, the policy
    // expression `company_id = NULL::bigint` evaluates to NULL on
    // every row → all rows excluded. Fail-closed by design.
    await withMepuserRls(async (client) => {
      const { rows } = await client.query(
        `SELECT id, first_name, company_id
           FROM public.employees
          WHERE id IN ($1, $2, $3)
          ORDER BY id`,
        [empA1.id, empA2.id, empB1.id]
      );

      expect(rows).toHaveLength(0);
    });
  });

  test('GUC = companyA: only company A employees returned, company B filtered out', async () => {
    await withMepuserRls(async (client) => {
      // set_config(setting, value, is_local) — `is_local=true` is equivalent
      // to SET LOCAL but accepts a parameter binding (SET LOCAL doesn't).
      await client.query(`SELECT set_config('app.company_id', $1, true)`, [
        String(companyA.company_id),
      ]);

      const { rows } = await client.query(
        `SELECT id FROM public.employees WHERE id IN ($1, $2, $3) ORDER BY id`,
        [empA1.id, empA2.id, empB1.id]
      );
      const ids = rows.map((r) => Number(r.id));

      expect(ids).toEqual(expect.arrayContaining([empA1.id, empA2.id]));
      expect(ids).not.toContain(empB1.id);
      expect(ids).toHaveLength(2);
    });
  });

  test('GUC = nonexistent company: 0 rows returned (RLS fails closed for unknown tenant)', async () => {
    await withMepuserRls(async (client) => {
      await client.query(`SELECT set_config('app.company_id', $1, true)`, ['999999999']);

      const { rows } = await client.query(
        `SELECT id FROM public.employees WHERE id IN ($1, $2, $3)`,
        [empA1.id, empA2.id, empB1.id]
      );

      expect(rows).toHaveLength(0);
    });
  });

  test('GUC empty string: behaves like unset under Stage 3 strict (returns 0 rows)', async () => {
    // Edge case worth pinning: the policy uses NULLIF(…, '') so empty
    // string is treated the same as NULL. Under Stage 3 strict that
    // means 0 rows (instead of the Stage 1 "permissive bypass returns
    // everything"). A future bug that sets the GUC to '' instead of
    // setting a real bigint will fail-closed at the read, which is the
    // desired behavior — the route handler should never see stale rows.
    await withMepuserRls(async (client) => {
      await client.query(`SELECT set_config('app.company_id', '', true)`);

      const { rows } = await client.query(
        `SELECT id FROM public.employees WHERE id IN ($1, $2, $3) ORDER BY id`,
        [empA1.id, empA2.id, empB1.id]
      );
      expect(rows).toHaveLength(0);
    });
  });
});
