'use strict';

// middleware/tenant_db.js
//
// Section 88 — Phase 4 (PostgreSQL RLS): per-request tenant context binding.
//
// What this middleware does on every authenticated request:
//
//   1. Acquires a pg client from the appropriate pool:
//      - SUPER_ADMIN  → superPool (mepuser_super, BYPASSRLS) — sees all tenants
//      - everyone else → pool (mepuser, RLS-enforced)
//
//   2. Begins a transaction on that client and runs
//        SET LOCAL app.company_id = <req.user.company_id>
//      so the RLS policies installed by migration 012 match this tenant.
//
//   3. Attaches the client to req.db. Routes that opt into RLS protection
//      use req.db.query(...) instead of pool.query(...). Routes that have
//      not yet migrated continue to use pool.query() and rely on permissive
//      RLS (Stage 1, migration 012) until they switch over.
//
//   4. Wires res lifecycle hooks so the client is always released exactly
//      once: COMMIT on res 'finish' (clean response), ROLLBACK on res 'close'
//      before finish (client disconnect mid-response or thrown error).
//
// Mount AFTER ./middleware/auth so req.user is populated. Public routes
// (login, onboarding, activate, /api/health, /api/health/deep) MUST NOT
// pass through this middleware — they query app_users / system tables
// before any tenant exists for the request.
//
// SUPER_ADMIN graceful degradation: if DATABASE_URL_SUPER is not configured
// (e.g., in old test envs that haven't run setup_rls_roles.sql yet), we
// fall back to the regular pool with app.company_id unset. While RLS is
// in permissive mode (migration 012, allow-when-unset clauses) this still
// works — SUPER_ADMIN reads succeed because the policies allow unset.
// Migration 013 will tighten this and SUPER_ADMIN will require the super
// pool from then on.

const { pool, superPool } = require('../db');

// Stable, single-source-of-truth for what counts as the cross-tenant role.
const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

module.exports = async function tenantDb(req, res, next) {
  // Defensive: this middleware must come after auth. If req.user is missing,
  // skip the client setup — the next middleware will likely 401.
  if (!req.user) {
    return next();
  }

  const isSuper = req.user.role === SUPER_ADMIN_ROLE;
  const usingSuperPool = isSuper && superPool != null;
  const acquirePool = usingSuperPool ? superPool : pool;

  let client;
  try {
    client = await acquirePool.connect();
  } catch (err) {
    return next(err);
  }

  // Single-fire release guard. The 'finish' and 'close' events on res can
  // both fire (in different orders depending on how the response ends), so
  // we track whether we've already cleaned up.
  let released = false;
  const release = async (mode) => {
    if (released) return;
    released = true;
    try {
      if (mode === 'commit') {
        await client.query('COMMIT');
      } else {
        // ROLLBACK is safe even if BEGIN failed.
        await client.query('ROLLBACK').catch(() => {});
      }
    } finally {
      client.release();
    }
  };

  try {
    await client.query('BEGIN');

    if (!isSuper) {
      // Non-SUPER_ADMIN: bind the request's tenant context. Cast to bigint
      // matches the column type used in policies (companies.company_id is
      // bigint, FK columns are bigint).
      //
      // SET LOCAL is intentional — the value clears at COMMIT/ROLLBACK so
      // it can never leak to the next checkout of this client.
      const companyId = req.user.company_id;
      if (companyId == null) {
        // Authenticated user but no company_id in JWT? That's a malformed
        // token. Roll back and let the route handlers 401/403.
        await release('rollback');
        return res.status(401).json({ ok: false, error: 'NO_TENANT_IN_TOKEN' });
      }
      // Postgres SET LOCAL does not support parameterized values directly,
      // so we sanitize by casting the user-controlled value to a number first.
      const cidNum = Number(companyId);
      if (!Number.isFinite(cidNum) || !Number.isInteger(cidNum) || cidNum < 0) {
        await release('rollback');
        return res.status(401).json({ ok: false, error: 'BAD_TENANT_IN_TOKEN' });
      }
      await client.query(`SET LOCAL app.company_id = '${cidNum}'`);
    }
    // SUPER_ADMIN path: nothing to set. BYPASSRLS on the role attribute
    // makes RLS irrelevant for this connection. (If we fell back to the
    // regular pool because superPool was null, RLS Stage 1 permissive mode
    // allows the unset state.)

    req.db = client;

    // Wire release on response lifecycle. We listen to both events because:
    //   - 'finish' fires when the response is fully flushed → COMMIT
    //   - 'close' fires if the underlying connection is destroyed before
    //     'finish' (client disconnected, error, etc.) → ROLLBACK
    res.on('finish', () => {
      // Ignore the resulting promise — we can't await inside an event handler.
      release('commit');
    });
    res.on('close', () => {
      // If we already committed in 'finish', the guard prevents a double-fire.
      release('rollback');
    });

    return next();
  } catch (err) {
    await release('rollback');
    return next(err);
  }
};

// Exported for tests
module.exports.SUPER_ADMIN_ROLE = SUPER_ADMIN_ROLE;
