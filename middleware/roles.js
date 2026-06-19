'use strict';

/**
 * middleware/roles.js
 *
 * Role hierarchy for MEP Platform
 *
 * SUPER_ADMIN            → sees all companies, system management
 * IT_ADMIN               → system + user management, no business data
 * COMPANY_ADMIN          → full access within company
 * TRADE_PROJECT_MANAGER  → manages projects, sends tasks to TRADE_ADMIN
 * TRADE_ADMIN            → manages trades, sends tasks to FOREMAN
 * FOREMAN                → manages team on project, sends tasks to workers
 * JOURNEYMAN             → experienced worker, same access as WORKER
 * APPRENTICE_1           → apprentice level 1
 * APPRENTICE_2           → apprentice level 2
 * APPRENTICE_3           → apprentice level 3
 * APPRENTICE_4           → apprentice level 4
 * WORKER                 → field worker, sees own data only
 * DRIVER                 → driver, sees own data only
 *
 * Legacy aliases (kept for backward compatibility):
 * ADMIN       → COMPANY_ADMIN
 * PM          → TRADE_PROJECT_MANAGER
 * PROJECT_MANAGER → TRADE_PROJECT_MANAGER
 * PURCHASING  → TRADE_ADMIN
 */

const ROLE_ALIASES = {
  ADMIN: 'COMPANY_ADMIN',
  PM: 'TRADE_PROJECT_MANAGER',
  PROJECT_MANAGER: 'TRADE_PROJECT_MANAGER',
  PURCHASING: 'TRADE_ADMIN',
};

/**
 * Normalize role — maps legacy roles to new canonical roles
 */
function normalizeRole(role) {
  if (!role) return null;
  const r = String(role).toUpperCase();
  return ROLE_ALIASES[r] || r;
}

/**
 * Role power levels — higher = more access
 */
const ROLE_LEVEL = {
  SUPER_ADMIN: 100,
  // §132 OWNER — tenant root of trust, above the technical COMPANY_ADMIN and
  // IT_ADMIN; only SUPER_ADMIN (Constrai) outranks it. Constrai-provisioned;
  // no in-tenant role may create/edit/assign it (see canAssignRole). §140.
  OWNER: 95,
  IT_ADMIN: 90,
  COMPANY_ADMIN: 80,
  TRADE_PROJECT_MANAGER: 60,
  TRADE_ADMIN: 50,
  FOREMAN: 40,
  JOURNEYMAN: 20,
  APPRENTICE_4: 16,
  APPRENTICE_3: 15,
  APPRENTICE_2: 14,
  APPRENTICE_1: 13,
  WORKER: 10,
  DRIVER: 10,
};

/**
 * requireRoles(allowedRoles)
 * Middleware factory — allows access if user role is in the list
 * Supports both new roles and legacy aliases via normalizeRole
 */
function requireRoles(allowedRoles) {
  const normalized = allowedRoles.map((r) => normalizeRole(r));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
    }

    const userRole = normalizeRole(req.user.role);

    if (userRole === 'SUPER_ADMIN') return next();

    if (!normalized.includes(userRole)) {
      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        required: allowedRoles,
        current: req.user.role,
      });
    }

    return next();
  };
}

/**
 * requireMinLevel(level)
 * Allows any role at or above the given power level
 */
function requireMinLevel(level) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
    }

    const userRole = normalizeRole(req.user.role);
    const userLevel = ROLE_LEVEL[userRole] || 0;

    if (userLevel < level) {
      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        required_level: level,
        current_role: req.user.role,
      });
    }

    return next();
  };
}

/**
 * canAssignRole(callerRole, targetRole, currentRole)
 * §132 OWNER protection (DECISIONS §140). OWNER is Constrai-managed: no
 * in-tenant role may CREATE/ASSIGN it, nor MODIFY a user who currently IS an
 * OWNER — only SUPER_ADMIN (Constrai). Returns true if the change is allowed.
 *
 * @param {string} callerRole    the acting user's role
 * @param {string} targetRole    the role being assigned (may be undefined)
 * @param {string} [currentRole] the target user's current role — blocks an
 *                               in-tenant actor from demoting/altering an OWNER
 * @returns {boolean}
 */
function canAssignRole(callerRole, targetRole, currentRole = null) {
  if (normalizeRole(callerRole) === 'SUPER_ADMIN') return true;
  if (normalizeRole(targetRole) === 'OWNER') return false;
  if (currentRole && normalizeRole(currentRole) === 'OWNER') return false;
  return true;
}

// ── §147 trade-scoping ────────────────────────────────────────
// Company-level roles oversee ALL trades (dispatchers / admins) and are never
// trade-scoped. Trade-level roles (TRADE_PROJECT_MANAGER / TRADE_ADMIN /
// FOREMAN / workers) are scoped to their own specialty (req.user.trade_code,
// derived from their employee profile at login). Returns the trade_code to
// filter by, or null = "see all trades".
const COMPANY_LEVEL_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'IT_ADMIN', 'COMPANY_ADMIN']);
function tradeScopeFor(user) {
  if (!user) return null;
  if (COMPANY_LEVEL_ROLES.has(normalizeRole(user.role))) return null;
  const tc = user.trade_code ? String(user.trade_code).trim().toUpperCase() : '';
  return tc || null;
}

// ── Prebuilt guards ───────────────────────────────────────────
const SUPER_ADMIN_ONLY = requireRoles(['SUPER_ADMIN']);
const IT_ADMIN_UP = requireMinLevel(90); // IT_ADMIN + SUPER_ADMIN
const COMPANY_ADMIN_UP = requireMinLevel(80); // COMPANY_ADMIN + above
const TRADE_ADMIN_UP = requireMinLevel(50); // TRADE_ADMIN + above
const PM_UP = requireMinLevel(60); // TRADE_PROJECT_MANAGER + above
const FOREMAN_UP = requireMinLevel(40); // FOREMAN + above
const ANY_AUTHENTICATED = requireMinLevel(10); // any logged in user

module.exports = {
  normalizeRole,
  canAssignRole,
  tradeScopeFor,
  ROLE_LEVEL,
  requireRoles,
  requireMinLevel,
  SUPER_ADMIN_ONLY,
  IT_ADMIN_UP,
  COMPANY_ADMIN_UP,
  TRADE_ADMIN_UP,
  PM_UP,
  FOREMAN_UP,
  ANY_AUTHENTICATED,
};
