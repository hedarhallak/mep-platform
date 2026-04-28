// middleware/auth.js
'use strict';

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../lib/auth_utils');

/**
 * Auth middleware:
 * - Reads Authorization: Bearer <token>
 * - Verifies JWT
 * - Sets req.user = { user_id, employee_id, username, role, company_id }
 */
module.exports = function auth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

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
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
  }
};
