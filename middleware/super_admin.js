'use strict';

/**
 * Middleware: SUPER_ADMIN
 *
 * Phase 6-D-6.5 / Section 121 — when TOTP_ENFORCE=true, also require that
 * the access token was minted by a TOTP-verified login (the `totp_verified`
 * claim is true). Tokens minted before the rollout don't have the claim;
 * those are rejected with TOTP_REQUIRED so the client can re-login through
 * the new two-step flow. When TOTP_ENFORCE is unset / 'false', we keep the
 * original role-only behavior so the rollout is reversible by env var.
 */
module.exports = function requireSuperAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'SUPER_ADMIN') {
    return res.status(403).json({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
  }
  if (process.env.TOTP_ENFORCE === 'true') {
    if (req.user?.totp_verified !== true) {
      return res.status(401).json({
        ok: false,
        error: 'TOTP_REQUIRED',
        message: 'Sign out and sign in again to complete TOTP verification.',
      });
    }
  }
  return next();
};
