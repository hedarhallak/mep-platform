'use strict';

/**
 * lib/session_policy.js — §133 (DECISIONS §137).
 *
 * Server-side session caps for high-privilege (SUPER_ADMIN) sessions, enforced
 * on /api/auth/refresh so they can't be bypassed by tampering with client JS.
 * This is a BACKSTOP: the client-side 15-min idle (§133.4), ephemeral cookies
 * (§133.2) and per-tab gate (§133.5) remain the primary layers.
 *
 * Two caps:
 *   idle      — too long since the last authenticated admin request.
 *   absolute  — session older than the hard maximum, regardless of activity.
 *
 * Values are env-overridable; defaults are Hedar's choice (idle 60m, abs 480m).
 */

const crypto = require('crypto');

const SA_IDLE_MAX_MIN = parseInt(process.env.SA_IDLE_MAX_MIN, 10) || 60; // 1h
const SA_SESSION_ABS_MAX_MIN = parseInt(process.env.SA_SESSION_ABS_MAX_MIN, 10) || 480; // 8h

// MUST match routes/auth.js hashRefreshToken (sha256 hex) so the UPDATE/SELECT
// finds the row by token_hash.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Decide whether a session may continue given its activity + start times.
 * Pure (no I/O) → unit-testable. Caller applies it only for roles that opt in
 * (isEphemeralSessionRole). Absolute cap is checked first (the stronger one).
 *
 * @param {object} p
 * @param {Date|string} p.lastActivityAt   last authenticated activity
 * @param {Date|string} p.sessionStartedAt initial-login time (carried forward)
 * @param {number} [p.now]                 ms epoch (default Date.now())
 * @param {number} [p.idleMaxMin]
 * @param {number} [p.absMaxMin]
 * @returns {{ok: true} | {ok: false, reason: 'IDLE'|'ABSOLUTE'}}
 */
function evaluateSessionCaps({
  lastActivityAt,
  sessionStartedAt,
  now = Date.now(),
  idleMaxMin = SA_IDLE_MAX_MIN,
  absMaxMin = SA_SESSION_ABS_MAX_MIN,
}) {
  const start = sessionStartedAt ? new Date(sessionStartedAt).getTime() : null;
  const last = lastActivityAt ? new Date(lastActivityAt).getTime() : null;

  if (start !== null && now - start > absMaxMin * 60 * 1000) {
    return { ok: false, reason: 'ABSOLUTE' };
  }
  if (last !== null && now - last > idleMaxMin * 60 * 1000) {
    return { ok: false, reason: 'IDLE' };
  }
  return { ok: true };
}

/**
 * Bump last_activity_at for the session identified by a raw refresh token.
 * Best-effort — never throws into the request path. refresh_tokens has no RLS,
 * so a plain pool is correct.
 *
 * @param {{query: Function}} db   pg pool / client
 * @param {string} rawRefreshToken the cookie value (unhashed)
 */
async function touchActivity(db, rawRefreshToken) {
  if (!rawRefreshToken) return;
  try {
    await db.query(
      `UPDATE public.refresh_tokens
          SET last_activity_at = NOW()
        WHERE token_hash = $1 AND revoked = FALSE`,
      [hashToken(rawRefreshToken)]
    );
  } catch (err) {
    // Activity tracking must never break an admin request.
    console.error('[session_policy] touchActivity failed:', err.message);
  }
}

module.exports = {
  SA_IDLE_MAX_MIN,
  SA_SESSION_ABS_MAX_MIN,
  evaluateSessionCaps,
  touchActivity,
  hashToken,
};
