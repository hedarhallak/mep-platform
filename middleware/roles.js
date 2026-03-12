"use strict";

/**
 * Role hierarchy for MEP Platform
 *
 * SUPER_ADMIN      → sees all companies, system management
 * COMPANY_ADMIN    → sees all within company, analytics & reports (no daily assignments)
 * ADMIN            → legacy alias for COMPANY_ADMIN
 * TRADE_ADMIN      → manages assignments for specific trade(s)
 * PROJECT_MANAGER  → suggests assignments for his projects (was PM)
 * PM               → legacy alias for PROJECT_MANAGER
 * PURCHASING       → purchasing department
 * WORKER           → sees own assignments only
 */

const ROLE_ALIASES = {
  ADMIN: "COMPANY_ADMIN",
  PM:    "PROJECT_MANAGER",
};

/**
 * Normalize role — maps legacy roles to new ones
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
  SUPER_ADMIN:     100,
  COMPANY_ADMIN:   80,
  TRADE_ADMIN:     60,
  PROJECT_MANAGER: 40,
  PURCHASING:      30,
  WORKER:          10,
};

/**
 * requireRoles(allowedRoles)
 * Middleware factory — allows access if user role is in the list
 * Supports both new roles and legacy aliases
 *
 * Example:
 *   router.get('/route', requireRoles(['COMPANY_ADMIN','TRADE_ADMIN']), handler)
 */
function requireRoles(allowedRoles) {
  // Normalize the allowed list too (in case legacy roles passed)
  const normalized = allowedRoles.map(r => normalizeRole(r));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
    }

    const userRole = normalizeRole(req.user.role);

    // SUPER_ADMIN always passes
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
 *
 * Example:
 *   requireMinLevel(60) → TRADE_ADMIN and above
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
const COMPANY_ADMIN_UP  = requireMinLevel(80);   // COMPANY_ADMIN + SUPER_ADMIN
const TRADE_ADMIN_UP    = requireMinLevel(60);   // TRADE_ADMIN + above
const PM_UP             = requireMinLevel(40);   // PM + above
const ANY_AUTHENTICATED = requireMinLevel(10);   // any logged in user

module.exports = {
  normalizeRole,
  requireRoles,
  requireMinLevel,
  SUPER_ADMIN_ONLY,
  COMPANY_ADMIN_UP,
  TRADE_ADMIN_UP,
  PM_UP,
  ANY_AUTHENTICATED,
};
