// scripts/diag_assignments_v2.js
// Diagnostic script for Assignments V2 setup
// Usage: node scripts/diag_assignments_v2.js

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

async function main() {
  const root = process.cwd();

  const routesV2 = path.join(root, "routes", "assignments_v2.js");
  const indexJs = path.join(root, "index.js");

  console.log("=== FILE CHECKS ===");
  console.log("routes/assignments_v2.js:", exists(routesV2) ? "FOUND" : "MISSING", "-", routesV2);
  console.log("index.js:", exists(indexJs) ? "FOUND" : "MISSING", "-", indexJs);

  const indexTxt = readText(indexJs) || "";
  const hasMount = indexTxt.includes('/api/assignments_v2') || indexTxt.includes("/api/assignments_v2");
  console.log("index.js mounts /api/assignments_v2:", hasMount ? "YES" : "NO");

  console.log("\n=== DB CHECKS ===");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL: MISSING in .env");
    process.exit(1);
  }
  console.log("DATABASE_URL: PRESENT");

  const pool = new Pool({ connectionString: url });
  try {
    const dbName = await pool.query("SELECT current_database() AS db_name");
    console.log("current_database():", dbName.rows[0]?.db_name);

    const tbl = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('assignments','assignment_requests','employees','projects')
      ORDER BY table_name
    `);
    console.log("tables present:", tbl.rows.map(r => r.table_name).join(", ") || "(none)");

    const cols = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='assignments'
      ORDER BY ordinal_position
    `);
    console.log("assignments columns:", cols.rows.map(r => r.column_name).join(", ") || "(none)");

    const sample = await pool.query("SELECT * FROM public.assignments ORDER BY id DESC LIMIT 3");
    console.log("assignments sample rows:", sample.rows.length);
    if (sample.rows.length) console.log(sample.rows[0]);

  } finally {
    await pool.end();
  }

  console.log("\n=== NEXT ===");
  if (!exists(routesV2)) {
    console.log("1) Put routes/assignments_v2.js in place.");
  }
  if (!hasMount) {
    console.log("2) Replace index.js with version that mounts /api/assignments_v2.");
  }
  console.log("3) Restart server: node index.js");
}

main().catch((e) => {
  console.error("DIAG FAILED:", e.message);
  process.exit(1);
});
