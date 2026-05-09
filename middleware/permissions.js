'use strict';

/**
 * middleware/permissions.js
 *
 * RBAC permission check middleware.
 * Checks role_permissions + user_permissions overrides.
 *
 * Usage:
 *   const { can } = require('./permissions');
 *   router.get('/employees', can('employees.view'), handler);
 *
 * Section 89-D (May 8, 2026): refactored to use the request-scoped
 * `req.db` client for `user_permissions` lookups when available, with
 * `pool` as a backward-compat fallback. Under Stage 2 permissive RLS
 * either path works; under Stage 3 strict RLS, the pool fallback will
 * fail because `user_permissions` lookups need the GUC set, which only
 * `tenantDb` does. Every authenticated route already mounts tenantDb
 * before this middleware fires (verified at end of 89-C/15), so the
 * fallback is purely a defense-in-depth path that should never trigger
 * in production after Stage 3 ships.
 *
 * The `loadRolePermissions` global cache and the `logAudit` write-side
 * stay on `pool` — both touch global tables (`role_permissions`,
 * `audit_logs` is tenant-scoped but is fire-and-forget per the 89-C/11
 * pattern). The cache is module-level, populated once per ~5 minutes
 * regardless of which request triggers the load; using a request-scoped
 * client there would be wrong (the client is released at end of that
 * request, so subsequent reads of the cached Map are fine but a fresh
 * load on a stale-cache hit would crash mid-request handler if we
 * forced req.db).
 */

const { pool } = require('../db');
const { normalizeRole } = require('./roles');

// In-memory cache: role -> Set<permission_code>
// Refreshed every 5 minutes or on demand
let _roleCache = {};
let _cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadRolePermissions() {
  // role_permissions is a global table (no company_id), so RLS doesn't
  // apply. Always read via pool — the cache is module-level and shared
  // across requests, so binding it to a request-scoped client would be
  // semantically wrong.
  const { rows } = await pool.query(`SELECT role, permission_code FROM public.role_permissions`);
  const map = {};
  for (const row of rows) {
    if (!map[row.role]) map[row.role] = new Set();
    map[row.role].add(row.permission_code);
  }
  _roleCache = map;
  _cacheLoadedAt = Date.now();
}

async function getRolePermissions(role) {
  if (Date.now() - _cacheLoadedAt > CACHE_TTL_MS) {
    await loadRolePermissions();
  }
  return _roleCache[role] || new Set();
}

/**
 * Check if a user has a specific permission.
 * Order of precedence:
 *   1. SUPER_ADMIN → always granted
 *   2. user_permissions.granted = false → explicitly denied
 *   3. user_permissions.granted = true  → explicitly granted
 *   4. role_permissions                 → default
 *
 * @param {number|null} userId
 * @param {string} role
 * @param {string} permissionCode
 * @param {{query: function}} [db] - request-scoped client (req.db) when
 *   called from middleware. Defaults to the global pool for backward
 *   compatibility (tests, scripts). Under Stage 3 strict RLS the
 *   default-pool path will return zero rows for user_permissions
 *   lookups — callers must pass req.db (or any client with
 *   `app.company_id` GUC set).
 */
async function userHasPermission(userId, role, permissionCode, db = pool) {
  const normalizedRole = normalizeRole(role);

  // SUPER_ADMIN always passes
  if (normalizedRole === 'SUPER_ADMIN') return true;

  // Check user-level override first
  if (userId) {
    const { rows } = await db.query(
      `SELECT granted FROM public.user_permissions
       WHERE user_id = $1 AND permission_code = $2
       LIMIT 1`,
      [userId, permissionCode]
    );
    if (rows.length > 0) {
      return rows[0].granted === true;
    }
  }

  // Fall back to role default
  const rolePerms = await getRolePermissions(normalizedRole);
  return rolePerms.has(permissionCode);
}

/**
 * can(permissionCode)
 * Returns Express middleware that checks the permission.
 *
 * Example:
 *   router.get('/employees', can('employees.view'), handler)
 *
 * Mount AFTER `auth` and `tenantDb` so `req.db` is available for the
 * user_permissions lookup. If `req.db` is missing (route hasn't mounted
 * tenantDb), falls back to `pool` — works under Stage 2 permissive RLS
 * but will return zero rows under Stage 3 strict RLS, effectively
 * denying all user-permission overrides.
 */
function can(permissionCode) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
    }

    try {
      const userId = req.user.user_id ? Number(req.user.user_id) : null;
      const role = req.user.role;
      const db = req.db || pool;

      const allowed = await userHasPermission(userId, role, permissionCode, db);

      if (!allowed) {
        return res.status(403).json({
          ok: false,
          error: 'FORBIDDEN',
          permission: permissionCode,
        });
      }

      return next();
    } catch (err) {
      console.error('[permissions] Error checking permission:', err.message);
      return res.status(500).json({ ok: false, error: 'PERMISSION_CHECK_FAILED' });
    }
  };
}

/**
 * canAny(permissionCodes[])
 * Passes if user has ANY of the listed permissions.
 */
function canAny(permissionCodes) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
    }

    try {
      const userId = req.user.user_id ? Number(req.user.user_id) : null;
      const role = req.user.role;
      const db = req.db || pool;

      for (const code of permissionCodes) {
        const allowed = await userHasPermission(userId, role, code, db);
        if (allowed) return next();
      }

      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        permissions: permissionCodes,
      });
    } catch (err) {
      console.error('[permissions] Error checking permissions:', err.message);
      return res.status(500).json({ ok: false, error: 'PERMISSION_CHECK_FAILED' });
    }
  };
}

/**
 * invalidateCache()
 * Call after updating role_permissions to force reload.
 */
function invalidateCache() {
  _cacheLoadedAt = 0;
}

// ── Audit log helper ─────────────────────────────────────────
/**
 * logAudit(req, action, entity, entityId, oldValue, newValue)
 * Awaitable — caller should `await` to ensure the audit row lands
 * before the request response flushes.
 *
 * Section 89-E/2 (May 8, 2026): refactored from a fire-and-forget
 * `pool.query(...).catch(...)` synchronous-return helper to an async
 * helper that uses `req.db` (request-scoped, with `app.company_id`
 * GUC set by tenantDb). Falls back to the global `pool` only if
 * `req.db` is missing (defense-in-depth — every caller of logAudit
 * is in a route mounted with tenantDb, so req.db is always set in
 * practice). Errors are caught and logged so audit failure never
 * crashes the request.
 *
 * Caller pattern changes from
 *   logAudit(req, 'ACTION', 'entity', id, old, new);
 * to
 *   await logAudit(req, 'ACTION', 'entity', id, old, new);
 *
 * Latency impact: small audit_logs INSERT (~5ms) added to response
 * time. Acceptable for write operations that already do meaningful
 * work and want a guaranteed audit trail.
 */
async function logAudit(req, action, entity, entityId = null, oldValue = null, newValue = null) {
  try {
    const userId = req.user?.user_id ? Number(req.user.user_id) : null;
    const companyId = req.user?.company_id ? Number(req.user.company_id) : null;
    const username = req.user?.username || null;
    const role = req.user?.role || null;
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
    const ua = req.headers['user-agent'] || null;
    const db = req.db || pool;

    await db.query(
      `INSERT INTO public.audit_logs
       (company_id, user_id, username, role, action, entity_type, entity_id,
        old_values, new_values, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        companyId,
        userId,
        username,
        role,
        action,
        entity,
        entityId != null ? Number(entityId) : null,
        oldValue != null ? JSON.stringify(oldValue) : null,
        newValue != null ? JSON.stringify(newValue) : null,
        ip,
        ua,
      ]
    );
  } catch (err) {
    console.error('[audit] Failed to write log:', err.message);
  }
}

module.exports = { can, canAny, userHasPermission, invalidateCache, logAudit };
