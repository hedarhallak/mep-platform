"use strict";

/**
 * middleware/roles.js
 *
 * Role hierarchy for MEP Platform
 *
 * SUPER_ADMIN            → sees all companies, system management
 * IT_ADMIN               → system + user management, no business data
 * COMPANY_ADMIN          → full access within company
 * TRADE_PROJECT_MANAGER  → read-only analytics for own trade
 * TRADE_ADMIN            → manages assignments + attendance for own trade
 * WORKER                 → sees own data only
 *
 * Legacy aliases (kept for backward compatibility during migration):
 * ADMIN       → COMPANY_ADMIN
 * PM          → TRADE_PROJECT_MANAGER
 * PROJECT_MANAGER → TRADE_PROJECT_MANAGER
 * FOREMAN     → TRADE_ADMIN
 * PURCHASING  → TRADE_ADMIN
 */

const ROLE_ALIASES = {
  ADMIN:           "COMPANY_ADMIN",
  PM:              "TRADE_PROJECT_MANAGER",
  PROJECT_MANAGER: "TRADE_PROJECT_MANAGER",
  FOREMAN:         "TRADE_ADMIN",
  PURCHASING:      "TRADE_ADMIN",
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
  SUPER_ADMIN:           100,
  IT_ADMIN:               90,
  COMPANY_ADMIN:          80,
  TRADE_PROJECT_MANAGER:  50,
  TRADE_ADMIN:            60,
  WORKER:                 10,
};

/**
 * requireRoles(allowedRoles)
 * Middleware factory — allows access if user role is in the list
 * Supports both new roles and legacy aliases via normalizeRole
 */
function requireRoles(allowedRoles) {
  const normalized = allowedRoles.map(r => normalizeRole(r));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    }

    const userRole = normalizeRole(req.user.role);

    if (userRole === "SUPER_ADMIN") return next();

    if (!normalized.includes(userRole)) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
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
      return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    }

    const userRole  = normalizeRole(req.user.role);
    const userLevel = ROLE_LEVEL[userRole] || 0;

    if (userLevel < level) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
        required_level: level,
        current_role: req.user.role,
      });
    }

    return next();
  };
}

// ── Prebuilt guards ───────────────────────────────────────────
const SUPER_ADMIN_ONLY  = requireRoles(["SUPER_ADMIN"]);
const IT_ADMIN_UP       = requireMinLevel(90);  // IT_ADMIN + SUPER_ADMIN
const COMPANY_ADMIN_UP  = requireMinLevel(80);  // COMPANY_ADMIN + above
const TRADE_ADMIN_UP    = requireMinLevel(60);  // TRADE_ADMIN + above
const PM_UP             = requireMinLevel(50);  // TRADE_PROJECT_MANAGER + above
const ANY_AUTHENTICATED = requireMinLevel(10);  // any logged in user

module.exports = {
  normalizeRole,
  requireRoles,
  requireMinLevel,
  SUPER_ADMIN_ONLY,
  IT_ADMIN_UP,
  COMPANY_ADMIN_UP,
  TRADE_ADMIN_UP,
  PM_UP,
  ANY_AUTHENTICATED,
};
