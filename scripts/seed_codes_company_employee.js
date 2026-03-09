// scripts/seed_codes_company_employee.js
// Seed company_code + employee_code for Policy A sign-up.
// Usage: node scripts/seed_codes_company_employee.js
//
// What it does:
// 1) For each company row, sets company_code if NULL/empty -> CMP-0001, CMP-0002, ...
// 2) For each employee row, sets employee_code if NULL/empty -> EMP-C0001-0001 (company-based) or EMP-000001 fallback.
// Safe: does not overwrite existing codes.

require("dotenv").config();
const { Pool } = require("pg");

function pad(n, w) {
  return String(n).padStart(w, "0");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL in .env");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });

  try {
    const db = await pool.query("SELECT current_database() AS db");
    console.log("DB:", db.rows[0].db);

    // Companies
    const companies = await pool.query(
      `SELECT id, company_code
       FROM public.companies
       ORDER BY id ASC`
    );

    console.log("Companies:", companies.rows.length);

    let companySeq = 1;
    for (const c of companies.rows) {
      const existing = (c.company_code || "").trim();
      if (existing) continue;

      const code = `CMP-${pad(companySeq, 4)}`;
      await pool.query(
        `UPDATE public.companies SET company_code=$1 WHERE id=$2`,
        [code, c.id]
      );
      console.log("Set company_code:", c.id, "->", code);
      companySeq++;
    }

    // Lookup
    const companies2 = await pool.query(
      `SELECT id, company_code
       FROM public.companies
       ORDER BY id ASC`
    );
    const companyCodeById = new Map();
    for (const r of companies2.rows) {
      companyCodeById.set(String(r.id), (r.company_code || "").trim());
    }

    // Employees
    const employees = await pool.query(
      `SELECT id, company_id, employee_code
       FROM public.employees
       ORDER BY id ASC`
    );

    console.log("Employees:", employees.rows.length);

    const perCompanyCounter = new Map();
    let globalCounter = 1;

    for (const e of employees.rows) {
      const existing = (e.employee_code || "").trim();
      if (existing) continue;

      const companyId = e.company_id != null ? String(e.company_id) : null;

      let code;
      if (companyId && companyCodeById.get(companyId)) {
        const cCode = companyCodeById.get(companyId); // CMP-0001
        const short = cCode.replace("CMP-", "C");     // C0001
        const next = (perCompanyCounter.get(companyId) || 1);
        perCompanyCounter.set(companyId, next + 1);
        code = `EMP-${short}-${pad(next, 4)}`; // EMP-C0001-0001
      } else {
        code = `EMP-${pad(globalCounter, 6)}`; // EMP-000001
        globalCounter++;
      }

      await pool.query(
        `UPDATE public.employees SET employee_code=$1 WHERE id=$2`,
        [code, e.id]
      );
      console.log("Set employee_code:", e.id, "->", code);
    }

    console.log("Done.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
