// tests/integration/rls_stage1.test.js
//
// Phase 4 Stage 1 — Permissive Row-Level Security (DB-layer test).
//
// This test exercises the policies created by migration 012 directly at the
// database layer (raw SQL), complementing tests/integration/tenant_isolation.test.js
// which exercises the same property via the HTTP routes.
//
// Three scenarios:
//   1. GUC unset           -> permissive bypass: rows from all companies returned.
//   2. GUC = company A id  -> only company A's rows returned.
//   3. GUC = nonexistent   -> 0 rows returned (RLS filters everything out).
//
// The test uses a dedicated client checked out of the pool so SET LOCAL
// (or rather set_config(..., true)) stays scoped to a single transaction
// and rolls back cleanly without affecting other tests.

'use strict';

const {
  describeIfDb,
  getPool,
  closePool,
  seedCompany,
  seedEmployee,
  cleanupTestRows,
} = require('../helpers/db');

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

  test('GUC unset: permissive bypass returns rows from all companies (Stage 1 contract)', async () => {
    // Use the shared pool — no GUC set on any connection out of it.
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, first_name, company_id
         FROM public.employees
        WHERE id IN ($1, $2, $3)
        ORDER BY id`,
      [empA1.id, empA2.id, empB1.id]
    );

    const ids = rows.map((r) => Number(r.id));
    expect(ids).toEqual(expect.arrayContaining([empA1.id, empA2.id, empB1.id]));
    expect(ids).toHaveLength(3);
  });

  test('GUC = companyA: only company A employees returned, company B filtered out', async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
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

      // Company A's employees are visible.
      expect(ids).toEqual(expect.arrayContaining([empA1.id, empA2.id]));
      // Company B's employee is filtered out by the policy.
      expect(ids).not.toContain(empB1.id);
      expect(ids).toHaveLength(2);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('GUC = nonexistent company: 0 rows returned (RLS fails closed for unknown tenant)', async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.company_id', $1, true)`, ['999999999']);

      const { rows } = await client.query(
        `SELECT id FROM public.employees WHERE id IN ($1, $2, $3)`,
        [empA1.id, empA2.id, empB1.id]
      );

      expect(rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('GUC empty string: behaves like unset (permissive bypass)', async () => {
    // Edge case worth pinning: the policy treats empty string the same as NULL.
    // A future bug that sets the GUC to '' instead of unsetting it must NOT
    // accidentally trigger the strict path with empty string casting.
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.company_id', '', true)`);

      const { rows } = await client.query(
        `SELECT id FROM public.employees WHERE id IN ($1, $2, $3) ORDER BY id`,
        [empA1.id, empA2.id, empB1.id]
      );
      const ids = rows.map((r) => Number(r.id));
      expect(ids).toEqual(expect.arrayContaining([empA1.id, empA2.id, empB1.id]));
      expect(ids).toHaveLength(3);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
