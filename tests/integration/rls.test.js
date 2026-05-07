// tests/integration/rls.test.js
//
// Section 88 — Phase 4: PostgreSQL Row-Level Security (Stage 1 permissive).
//
// These tests validate the RLS policies installed by migration 012 directly
// at the database level — no Express layer involved. They confirm that:
//
//   1. With app.company_id unset → policies are permissive (allow-all).
//      This is the Stage 1 contract that lets unmigrated routes keep working.
//
//   2. With app.company_id = X → only company X's rows are visible.
//      Validates the core tenant-isolation property.
//
//   3. WITH CHECK rejects cross-tenant INSERT/UPDATE.
//      Validates write-side defense-in-depth.
//
//   4. Child-table policies (via parent join) work correctly.
//      Validates the policy-via-EXISTS pattern for tables without a direct
//      company_id column (e.g., employee_profiles).
//
//   5. mepuser_super (BYPASSRLS) sees all tenants.
//      Conditionally skipped if DATABASE_URL_SUPER is not configured (e.g.,
//      old test envs that haven't run scripts/postgres/setup_rls_roles.sql).
//
// These tests use the same DATABASE_URL test pool as the rest of the
// integration suite. No middleware involved — we set app.company_id directly
// on a checked-out client.

'use strict';

const { Pool } = require('pg');
const {
  describeIfDb,
  getPool,
  seedCompany,
  seedUser,
  seedEmployee,
  seedEmployeeProfile,
  seedSupplier,
} = require('../helpers/db');

// Conditional describe for SUPER_ADMIN bypass: only runs if DATABASE_URL_SUPER
// is set to a real connection (i.e., scripts/postgres/setup_rls_roles.sql was
// run on the test DB).
const superAvailable = !!(
  process.env.DATABASE_URL_SUPER && process.env.DATABASE_URL_SUPER.length > 0
);
const describeIfSuper = superAvailable ? describe : describe.skip;

describeIfDb('RLS — Phase 4 Stage 1 (permissive policies)', () => {
  let pool;
  let companyA;
  let companyB;
  let employeeA;
  let employeeB;
  let supplierA;
  let supplierB;

  beforeAll(async () => {
    pool = getPool();

    // Two distinct companies, each with one employee + one supplier.
    companyA = await seedCompany();
    companyB = await seedCompany();

    employeeA = await seedEmployee({ company_id: companyA.company_id });
    employeeB = await seedEmployee({ company_id: companyB.company_id });

    await seedEmployeeProfile({ employee_id: employeeA.id });
    await seedEmployeeProfile({ employee_id: employeeB.id });

    supplierA = await seedSupplier({ company_id: companyA.company_id });
    supplierB = await seedSupplier({ company_id: companyB.company_id });
  });

  // ---------------------------------------------------------------------------
  // 1. Permissive baseline — unset app.company_id allows reading both tenants.
  // ---------------------------------------------------------------------------
  describe('with app.company_id unset (permissive baseline)', () => {
    it('reads both tenants from a direct-company_id table (employees)', async () => {
      const client = await pool.connect();
      try {
        await client.query(`RESET app.company_id`);
        const { rows } = await client.query(
          `SELECT id, company_id FROM public.employees
            WHERE id IN ($1, $2)
            ORDER BY id`,
          [employeeA.id, employeeB.id]
        );
        expect(rows).toHaveLength(2);
        const ids = rows.map((r) => Number(r.id)).sort();
        expect(ids).toEqual([employeeA.id, employeeB.id].sort());
      } finally {
        client.release();
      }
    });

    it('reads both tenants from a child table (employee_profiles)', async () => {
      const client = await pool.connect();
      try {
        await client.query(`RESET app.company_id`);
        const { rows } = await client.query(
          `SELECT employee_id FROM public.employee_profiles
            WHERE employee_id IN ($1, $2)
            ORDER BY employee_id`,
          [employeeA.id, employeeB.id]
        );
        expect(rows).toHaveLength(2);
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Tenant isolation — app.company_id = X shows only X's rows.
  // ---------------------------------------------------------------------------
  describe('with app.company_id set to a specific tenant', () => {
    it('hides other tenant employees', async () => {
      const client = await pool.connect();
      try {
        await client.query(`SET app.company_id = '${companyA.company_id}'`);
        const { rows } = await client.query(
          `SELECT id, company_id FROM public.employees
            WHERE id IN ($1, $2)`,
          [employeeA.id, employeeB.id]
        );
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].id)).toBe(employeeA.id);
      } finally {
        await client.query(`RESET app.company_id`).catch(() => {});
        client.release();
      }
    });

    it('hides other tenant suppliers', async () => {
      const client = await pool.connect();
      try {
        await client.query(`SET app.company_id = '${companyB.company_id}'`);
        const { rows } = await client.query(
          `SELECT id FROM public.suppliers
            WHERE id IN ($1, $2)`,
          [supplierA.id, supplierB.id]
        );
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].id)).toBe(supplierB.id);
      } finally {
        await client.query(`RESET app.company_id`).catch(() => {});
        client.release();
      }
    });

    it('hides other tenant rows on a child table (employee_profiles)', async () => {
      const client = await pool.connect();
      try {
        await client.query(`SET app.company_id = '${companyA.company_id}'`);
        const { rows } = await client.query(
          `SELECT employee_id FROM public.employee_profiles
            WHERE employee_id IN ($1, $2)`,
          [employeeA.id, employeeB.id]
        );
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].employee_id)).toBe(employeeA.id);
      } finally {
        await client.query(`RESET app.company_id`).catch(() => {});
        client.release();
      }
    });

    it('switches view when app.company_id changes mid-session', async () => {
      const client = await pool.connect();
      try {
        await client.query(`SET app.company_id = '${companyA.company_id}'`);
        const a = await client.query(
          `SELECT COUNT(*)::int AS n FROM public.employees WHERE id IN ($1, $2)`,
          [employeeA.id, employeeB.id]
        );
        expect(a.rows[0].n).toBe(1);

        await client.query(`SET app.company_id = '${companyB.company_id}'`);
        const b = await client.query(
          `SELECT COUNT(*)::int AS n FROM public.employees WHERE id IN ($1, $2)`,
          [employeeA.id, employeeB.id]
        );
        expect(b.rows[0].n).toBe(1);
      } finally {
        await client.query(`RESET app.company_id`).catch(() => {});
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. WITH CHECK — cross-tenant write attempts are rejected.
  // ---------------------------------------------------------------------------
  describe('write-side defense (WITH CHECK)', () => {
    it('rejects INSERT into suppliers with mismatched company_id', async () => {
      const client = await pool.connect();
      try {
        await client.query(`SET app.company_id = '${companyA.company_id}'`);

        let threw = null;
        try {
          await client.query(
            `INSERT INTO public.suppliers
               (company_id, name, email, phone, trade_code, is_active)
             VALUES ($1, 'cross-tenant-attempt', 'x@x.test', '000', 'GENERAL', true)`,
            [companyB.company_id]
          );
        } catch (err) {
          threw = err;
        }
        expect(threw).not.toBeNull();
        // Postgres SQLSTATE 42501 = insufficient_privilege; RLS WITH CHECK
        // failures specifically come back as: "new row violates row-level
        // security policy for table ..." → SQLSTATE '42501'.
        expect(threw && threw.code).toBe('42501');
      } finally {
        await client.query(`RESET app.company_id`).catch(() => {});
        client.release();
      }
    });

    it('rejects UPDATE that would migrate a row to another tenant', async () => {
      const client = await pool.connect();
      try {
        await client.query(`SET app.company_id = '${companyA.company_id}'`);

        let threw = null;
        try {
          await client.query(
            `UPDATE public.suppliers
                SET company_id = $1
              WHERE id = $2`,
            [companyB.company_id, supplierA.id]
          );
        } catch (err) {
          threw = err;
        }
        expect(threw).not.toBeNull();
        expect(threw && threw.code).toBe('42501');
      } finally {
        await client.query(`RESET app.company_id`).catch(() => {});
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. SUPER_ADMIN bypass via mepuser_super (DATABASE_URL_SUPER).
  // ---------------------------------------------------------------------------
  describeIfSuper('SUPER_ADMIN via mepuser_super (BYPASSRLS)', () => {
    let superPoolLocal;
    beforeAll(() => {
      superPoolLocal = new Pool({ connectionString: process.env.DATABASE_URL_SUPER });
    });
    afterAll(async () => {
      await superPoolLocal.end();
    });

    it('reads all tenants regardless of app.company_id', async () => {
      const client = await superPoolLocal.connect();
      try {
        // Even setting a wildly unrelated tenant — BYPASSRLS ignores it.
        await client.query(`SET app.company_id = '999999'`);
        const { rows } = await client.query(
          `SELECT id, company_id FROM public.employees
            WHERE id IN ($1, $2)
            ORDER BY id`,
          [employeeA.id, employeeB.id]
        );
        expect(rows).toHaveLength(2);
      } finally {
        await client.query(`RESET app.company_id`).catch(() => {});
        client.release();
      }
    });

    it('can INSERT into any tenant without WITH CHECK rejecting', async () => {
      const client = await superPoolLocal.connect();
      try {
        await client.query(`SET app.company_id = '0'`);
        const { rows } = await client.query(
          `INSERT INTO public.suppliers
             (company_id, name, email, phone, trade_code, is_active)
           VALUES ($1, 'rls_test_super_insert', 'sup@super.test', '000', 'GENERAL', true)
           RETURNING id, company_id`,
          [companyB.company_id]
        );
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].company_id)).toBe(companyB.company_id);

        // Cleanup: delete the row we just inserted.
        await client.query(`DELETE FROM public.suppliers WHERE id = $1`, [rows[0].id]);
      } finally {
        await client.query(`RESET app.company_id`).catch(() => {});
        client.release();
      }
    });
  });
});
