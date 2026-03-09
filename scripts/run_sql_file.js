// scripts/run_sql_file.js
// Usage: node scripts/run_sql_file.js db/migrations/002_assignment_requests.sql
// Requires: DATABASE_URL in .env (or environment)

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Missing file path. Example: node scripts/run_sql_file.js db/migrations/002_assignment_requests.sql");
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error("SQL file not found:", filePath);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL. Put it in .env or set it in the environment.");
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, "utf8");

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const client = await pool.connect();
    try {
      await client.query(sql);
      console.log("✅ Migration executed successfully:", fileArg);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
