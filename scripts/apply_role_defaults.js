#!/usr/bin/env node
// scripts/apply_role_defaults.js
//
// §148 — apply the canonical default permissions (lib/role_defaults.js) to the
// live role_permissions table. ADDITIVE by design: it GRANTS any default a role
// is missing (e.g. FOREMAN's §147 assignments.create + projects.view, the
// APPRENTICE_1-4 baseline that never existed) but NEVER revokes a currently
// granted permission — so running it on prod cannot strip a role of something
// it relies on. Idempotent: re-running grants nothing new.
//
// Run on prod after deploy:  node scripts/apply_role_defaults.js
// (A true wipe-and-reset is the per-role "Reset to defaults" button in the UI.)

// Load .env BEFORE requiring db.js — db.js reads DATABASE_URL / DATABASE_URL_SUPER
// at require-time, and a standalone `node scripts/...` invocation (unlike pm2)
// does not get the app's env otherwise. Without this the pool connects with an
// undefined password → "SASL: client password must be a string".
require('dotenv').config();
const { pool, superPool } = require('../db');
const { ROLE_DEFAULT_PERMISSIONS } = require('../lib/role_defaults');

async function main() {
  // role_permissions is a global config table (no RLS); prefer the BYPASSRLS
  // pool where present, like authPool (Pitfall #28/#59).
  const db = superPool || pool;
  const client = await db.connect();
  let totalGranted = 0;
  try {
    await client.query('BEGIN');
    for (const [role, codes] of Object.entries(ROLE_DEFAULT_PERMISSIONS)) {
      let granted = 0;
      for (const code of codes) {
        const r = await client.query(
          `INSERT INTO public.role_permissions (role, permission_code)
           SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM public.permissions WHERE code = $2)
           ON CONFLICT DO NOTHING`,
          [role, code]
        );
        granted += r.rowCount;
      }
      totalGranted += granted;
      console.log(`${role.padEnd(24)} +${granted} new (of ${codes.length} defaults)`);
    }
    await client.query('COMMIT');
    console.log(`\nDone — ${totalGranted} new grant(s) applied (additive; nothing revoked).`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end().catch(() => {});
    if (superPool) await superPool.end().catch(() => {});
  }
}

main();
