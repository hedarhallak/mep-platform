// db.js
"use strict";

const { Pool } = require("pg");

// Uses DATABASE_URL if exists, otherwise uses PG* env vars.
// Examples:
// DATABASE_URL=postgres://postgres:password@localhost:5432/erp
const connectionString = process.env.DATABASE_URL || undefined;

const pool = new Pool(
  connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST || "localhost",
        port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
        database: process.env.PGDATABASE || "erp",
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "",
      }
);

// Quick sanity log once (optional)
pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err);
});

module.exports = { pool };
