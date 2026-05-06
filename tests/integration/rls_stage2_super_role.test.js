// tests/integration/rls_stage2_super_role.test.js
//
// Phase 4 Stage 2 first piece: verify mepuser_super role is provisioned
// with BYPASSRLS + grants so SUPER_ADMIN routes can query cross-tenant
// without being filtered by the Stage 1 RLS policies.
//
// The role is created by scripts/postgres/setup_rls_roles.sql which runs
// once per environment:
//   - CI: invoked from .github/workflows/ci.yml ("Pre-create roles" step).
//   - Production: documented one-time SSH command (DECISIONS.md Section 89).
//   - Local dev: optional; only needed when exercising SUPER_ADMIN code.
//
// This test only verifies the resulting state, not the creation itself.
// (The script's own verification happens at apply time via DO blocks.)

'use strict';

const {
  describeIfDb,
  getPool,
  closePool,
  seedCompany,
  seedEmployee,
  cleanupTestRows,
} = require('../helpers/db');

describeIfDb('Phase 4 Stage 2 — mepuser_super role attributes', () => {
  let companyA;
  let empA;

  beforeAll(async () => {
    companyA = await seedCompany();
    empA = await seedEmployee({ company_id: companyA.company_id, first_name: 'AliceSuper' });
  });

  afterAll(async () => {
    await cleanupTestRows();
    await closePool();
  });

  test('mepuser_super exists with BYPASSRLS + safe non-superuser attributes', async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT rolcanlogin, rolbypassrls, rolsuper, rolcreatedb, rolcreaterole, rolreplication
         FROM pg_roles
        WHERE rolname = 'mepuser_super'`
    );

    expect(rows).toHaveLength(1);
    const r = rows[0];

    // Required positives
    expect(r.rolcanlogin).toBe(true);
    expect(r.rolbypassrls).toBe(true);

    // Defense-in-depth: should NOT have superuser-class privileges. If
    // mepuser_super credentials leak, blast radius is "all tenant data"
    // but NOT "destroy the cluster / extend privileges".
    expect(r.rolsuper).toBe(false);
    expect(r.rolcreatedb).toBe(false);
    expect(r.rolcreaterole).toBe(false);
    expect(r.rolreplication).toBe(false);
  });

  test('mepuser_super is a member of mepuser (inherits table grants)', async () => {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT pg_has_role('mepuser_super', 'mepuser', 'MEMBER') AS is_member"
    );
    expect(rows[0].is_member).toBe(true);
  });

  test('mepuser_super bypasses RLS even when GUC is set to a wrong tenant', async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE mepuser_super');

      // Set GUC to a non-existent company. As mepuser this would return
      // 0 rows (the Stage 1 policy filters them out). As mepuser_super,
      // BYPASSRLS skips the policy entirely → row should still come back.
      await client.query(`SELECT set_config('app.company_id', '999999999', true)`);

      const { rows } = await client.query(`SELECT id FROM public.employees WHERE id = $1`, [
        empA.id,
      ]);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].id)).toBe(empA.id);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('contrast: mepuser does NOT bypass when GUC is set to a wrong tenant', async () => {
    // Sanity check that Stage 1 + the test setup are still working as
    // intended. Without this, a regression that accidentally gives mepuser
    // BYPASSRLS would silently turn the Stage 2 super-role test green.
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('GRANT USAGE ON SCHEMA public TO mepuser');
      await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO mepuser');
      await client.query('SET LOCAL ROLE mepuser');
      await client.query(`SELECT set_config('app.company_id', '999999999', true)`);

      const { rows } = await client.query(`SELECT id FROM public.employees WHERE id = $1`, [
        empA.id,
      ]);
      expect(rows).toHaveLength(0);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
