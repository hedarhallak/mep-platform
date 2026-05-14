// middleware/auth.js
'use strict';

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../lib/auth_utils');

/**
 * Auth middleware:
 * - Reads Authorization: Bearer <token> (mobile path)
 *   OR access_token cookie         (web path, Phase 6-D-1a / Section 100)
 * - Verifies JWT
 * - Sets req.user = { user_id, employee_id, username, role, company_id }
 *
 * Bearer header wins when both are present (explicit > implicit) so a
 * mobile build can't be silently downgraded by a stray cookie on the
 * shared origin.
 */
module.exports = function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Section 100 / Phase 6-D-1a: web clients hold the access token in an
  // HttpOnly cookie (set by routes/auth.js#login). Mobile builds still
  // send Bearer. Either is accepted; Bearer beats cookie if both arrive.
  const cookieToken =
    req.cookies && typeof req.cookies.access_token === 'string' ? req.cookies.access_token : null;

  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'MISSING_TOKEN' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Normalize role to uppercase to avoid "admin" vs "ADMIN" issues
    const role = payload.role ? String(payload.role).toUpperCase() : null;

    req.user = {
      user_id: payload.user_id != null ? String(payload.user_id) : null,
      employee_id: payload.employee_id != null ? String(payload.employee_id) : null,
      username: payload.username || null,
      role,
      company_id: payload.company_id != null ? String(payload.company_id) : null,
      // keep full payload if you need later
      _token_payload: payload,
    };

    return next();
  } catch (_e) {
    return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
  }
};
