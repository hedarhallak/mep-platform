// db.js
'use strict';

const { Pool } = require('pg');

// =============================================================================
// Regular pool — connects as `mepuser` (or whatever DATABASE_URL points at).
// This pool is RLS-enforced: every authenticated request goes through
// middleware/tenant_db.js which sets `app.company_id` on the per-request
// client, and RLS policies (migrations 012 / 013) gate every row.
// =============================================================================
// Uses DATABASE_URL if exists, otherwise uses PG* env vars.
// Examples:
// DATABASE_URL=postgres://postgres:password@localhost:5432/erp
const connectionString = process.env.DATABASE_URL || undefined;

const pool = new Pool(
  connectionString
    ? { connectionString }
    : {
        host: process.env.PGHOST || 'localhost',
        port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
        database: process.env.PGDATABASE || 'erp',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
      }
);

// Quick sanity log once (optional)
pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

// =============================================================================
// SUPER pool — connects as `mepuser_super` (BYPASSRLS).
//
// Section 89-A provisioned the `mepuser_super` role on prod (and CI via
// scripts/postgres/setup_rls_roles.sql). The role has BYPASSRLS = true so
// queries through this pool see every row regardless of `app.company_id`.
//
// Why we need it:
//   1. SUPER_ADMIN cross-tenant routes (used by middleware/tenant_db.js).
//   2. Pre-tenant lookups in routes/auth.js (login, refresh, whoami,
//      change-pin) — these run BEFORE any tenant context exists, so the
//      regular pool has no GUC set. Under strict RLS (migration 013) the
//      regular pool would return zero rows for app_users / refresh_tokens
//      lookups and break login. See DECISIONS.md Section 90 / Piece 90-F
//      for the incident report and Pitfall #28 for the convention.
//
// Graceful degradation: if DATABASE_URL_SUPER is unset (older dev
// environments, CI legacy paths) we export `superPool = null`. Callers
// MUST handle the null case — typically by falling back to `pool`. Under
// Stage 1 permissive RLS the fallback works because the policy allows the
// GUC-unset state; under Stage 3 strict it would 0-row, so the fallback
// is intended only as a development convenience. Production MUST set
// DATABASE_URL_SUPER once 013 is re-applied.
// =============================================================================
const superConnectionString = process.env.DATABASE_URL_SUPER || undefined;

const superPool = superConnectionString
  ? new Pool({ connectionString: superConnectionString })
  : null;

if (superPool) {
  superPool.on('error', (err) => {
    console.error('Unexpected PG superPool error:', err);
  });
}

module.exports = { pool, superPool };
