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
 */

const { pool } = require('../db');
const { normalizeRole } = require('./roles');

// In-memory cache: role -> Set<permission_code>
// Refreshed every 5 minutes or on demand
let _roleCache = {};
let _cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadRolePermissions() {
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
 */
async function userHasPermission(userId, role, permissionCode) {
  const normalizedRole = normalizeRole(role);

  // SUPER_ADMIN always passes
  if (normalizedRole === 'SUPER_ADMIN') return true;

  // Check user-level override first
  if (userId) {
    const { rows } = await pool.query(
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
 */
function can(permissionCode) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
    }

    try {
      const userId = req.user.user_id ? Number(req.user.user_id) : null;
      const role = req.user.role;

      const allowed = await userHasPermission(userId, role, permissionCode);

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

      for (const code of permissionCodes) {
        const allowed = await userHasPermission(userId, role, code);
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
 * Non-blocking — fires and forgets, never throws.
 */
function logAudit(req, action, entity, entityId = null, oldValue = null, newValue = null) {
  const userId = req.user?.user_id ? Number(req.user.user_id) : null;
  const companyId = req.user?.company_id ? Number(req.user.company_id) : null;
  const username = req.user?.username || null;
  const role = req.user?.role || null;
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  const ua = req.headers['user-agent'] || null;

  pool
    .query(
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
    )
    .catch((err) => console.error('[audit] Failed to write log:', err.message));
}

module.exports = { can, canAny, userHasPermission, invalidateCache, logAudit };
