'use strict';

/**
 * Middleware:    SUPER_ADMIN
 */
module.exports = function requireSuperAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'SUPER_ADMIN') {
    return res.status(403).json({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
  }
  return next();
};
