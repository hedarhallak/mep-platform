// tests/smoke/middleware_super_admin.test.js — Phase 73c.
//
// middleware/super_admin.js is 12 lines — single role check. Pin all
// three branches: SUPER_ADMIN passes, anyone else 403s, missing req.user
// 403s.

'use strict';

const requireSuperAdmin = require('../../middleware/super_admin');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/super_admin', () => {
  test('calls next() when req.user.role === "SUPER_ADMIN"', () => {
    const req = { user: { role: 'SUPER_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();

    requireSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('responds 403 SUPER_ADMIN_REQUIRED for COMPANY_ADMIN', () => {
    const req = { user: { role: 'COMPANY_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();

    requireSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  test('responds 403 SUPER_ADMIN_REQUIRED when req.user is undefined', () => {
    const req = {};
    const res = makeRes();
    const next = jest.fn();

    requireSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  test('responds 403 when role is lowercase "super_admin" (case-sensitive check)', () => {
    // The middleware does a strict === 'SUPER_ADMIN' check. Since
    // middleware/auth.js already uppercases the role before this runs,
    // this test pins the contract: super_admin (lower) should NOT pass.
    const req = { user: { role: 'super_admin' } };
    const res = makeRes();
    const next = jest.fn();

    requireSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
