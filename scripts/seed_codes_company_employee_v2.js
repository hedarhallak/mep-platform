// scripts/seed_codes_company_employee_v2.js
// Seed company_code + employee_code for Policy A sign-up.
// FIX: does NOT assume companies PK column is "id". Detects the PK column dynamically.
//
// Usage: node scripts/seed_codes_company_employee_v2.js
//
// Safe:
// - Does not overwrite existing company_code / employee_code
// - Works even if companies PK is company_id or another column

require('dotenv').config();
const { Pool } = require('pg');

function pad(n, w) {
  return String(n).padStart(w, '0');
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Missing DATABASE_URL in .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });

  try {
    const db = await pool.query('SELECT current_database() AS db');
    console.log('DB:', db.rows[0].db);

    // Detect companies PK column
    const pkRes = await pool.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'companies'
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
      LIMIT 1;
    `);

    if (!pkRes.rows.length) {
      throw new Error('Could not detect PRIMARY KEY column for public.companies');
    }

    const companyPk = pkRes.rows[0].column_name;
    console.log('companies PK:', companyPk);

    // Fetch companies
    const companies = await pool.query(
      `SELECT ${companyPk} AS company_pk, company_code
       FROM public.companies
       ORDER BY ${companyPk} ASC`
    );

    console.log('Companies:', companies.rows.length);

    let companySeq = 1;
    for (const c of companies.rows) {
      const existing = (c.company_code || '').trim();
      if (existing) continue;

      const code = `CMP-${pad(companySeq, 4)}`;
      await pool.query(`UPDATE public.companies SET company_code=$1 WHERE ${companyPk}=$2`, [
        code,
        c.company_pk,
      ]);
      console.log('Set company_code:', c.company_pk, '->', code);
      companySeq++;
    }

    // Build company_code lookup
    const companies2 = await pool.query(
      `SELECT ${companyPk} AS company_pk, company_code
       FROM public.companies
       ORDER BY ${companyPk} ASC`
    );

    const companyCodeByPk = new Map();
    for (const r of companies2.rows) {
      companyCodeByPk.set(String(r.company_pk), (r.company_code || '').trim());
    }

    // Employees
    const employees = await pool.query(
      `SELECT id, company_id, employee_code
       FROM public.employees
       ORDER BY id ASC`
    );

    console.log('Employees:', employees.rows.length);

    const perCompanyCounter = new Map();
    let globalCounter = 1;

    for (const e of employees.rows) {
      const existing = (e.employee_code || '').trim();
      if (existing) continue;

      const companyId = e.company_id != null ? String(e.company_id) : null;

      let code;
      if (companyId && companyCodeByPk.get(companyId)) {
        const cCode = companyCodeByPk.get(companyId); // CMP-0001
        const short = cCode.replace('CMP-', 'C'); // C0001
        const next = perCompanyCounter.get(companyId) || 1;
        perCompanyCounter.set(companyId, next + 1);
        code = `EMP-${short}-${pad(next, 4)}`; // EMP-C0001-0001
      } else {
        code = `EMP-${pad(globalCounter, 6)}`; // EMP-000001
        globalCounter++;
      }

      await pool.query(`UPDATE public.employees SET employee_code=$1 WHERE id=$2`, [code, e.id]);
      console.log('Set employee_code:', e.id, '->', code);
    }

    console.log('Done.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
