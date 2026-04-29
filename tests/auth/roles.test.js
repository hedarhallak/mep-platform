// Pure-function tests for middleware/roles.js — RBAC core helpers.
// No DB / no IO — covers the role normalization layer that gates every
// authenticated request before it hits per-permission checks.

const { normalizeRole } = require('../../middleware/roles');

describe('normalizeRole', () => {
  test('returns null for null', () => {
    expect(normalizeRole(null)).toBe(null);
  });

  test('returns null for undefined', () => {
    expect(normalizeRole(undefined)).toBe(null);
  });

  test('returns null for empty string', () => {
    expect(normalizeRole('')).toBe(null);
  });

  test('uppercases lowercase role', () => {
    expect(normalizeRole('foreman')).toBe('FOREMAN');
  });

  test('passes through canonical role unchanged', () => {
    expect(normalizeRole('FOREMAN')).toBe('FOREMAN');
    expect(normalizeRole('SUPER_ADMIN')).toBe('SUPER_ADMIN');
    expect(normalizeRole('TRADE_PROJECT_MANAGER')).toBe('TRADE_PROJECT_MANAGER');
  });

  test('maps legacy ADMIN to COMPANY_ADMIN', () => {
    expect(normalizeRole('ADMIN')).toBe('COMPANY_ADMIN');
    expect(normalizeRole('admin')).toBe('COMPANY_ADMIN');
  });

  test('maps legacy PM to TRADE_PROJECT_MANAGER', () => {
    expect(normalizeRole('PM')).toBe('TRADE_PROJECT_MANAGER');
  });

  test('maps legacy PROJECT_MANAGER to TRADE_PROJECT_MANAGER', () => {
    expect(normalizeRole('PROJECT_MANAGER')).toBe('TRADE_PROJECT_MANAGER');
  });

  test('maps legacy PURCHASING to TRADE_ADMIN', () => {
    expect(normalizeRole('PURCHASING')).toBe('TRADE_ADMIN');
  });

  test('returns unknown role unchanged (uppercased)', () => {
    expect(normalizeRole('SOME_NEW_ROLE')).toBe('SOME_NEW_ROLE');
  });

  test('coerces non-string input via String()', () => {
    expect(normalizeRole(123)).toBe('123');
  });
});

describe('Role hierarchy invariants', () => {
  // Re-import via fresh require to access ROLE_LEVEL even though it's not
  // in the public exports. Using the constants pattern from middleware/auth.js
  // which inspects ROLE_LEVEL through requireMinLevel — we verify the level
  // ordering by exercising requireMinLevel with mock req/res.
  //
  // For a tighter test we could expose ROLE_LEVEL directly; for now we test
  // the observable behavior.

  const { requireMinLevel } = require('../../middleware/roles');

  function mockReqResNext(userRole) {
    const req = userRole == null ? {} : { user: { role: userRole } };
    const status = jest.fn();
    const json = jest.fn();
    const res = {
      status: jest.fn().mockReturnValue({ json }),
    };
    const next = jest.fn();
    return { req, res, next, json };
  }

  test('SUPER_ADMIN passes any minLevel', () => {
    const guard = requireMinLevel(80);
    const { req, res, next } = mockReqResNext('SUPER_ADMIN');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('FOREMAN (level 40) passes minLevel 40', () => {
    const guard = requireMinLevel(40);
    const { req, res, next } = mockReqResNext('FOREMAN');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('FOREMAN (level 40) blocked by minLevel 50', () => {
    const guard = requireMinLevel(50);
    const { req, res, next } = mockReqResNext('FOREMAN');
    guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('WORKER (level 10) is the minimum authenticated', () => {
    const guard = requireMinLevel(10);
    const { req, res, next } = mockReqResNext('WORKER');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('unauthenticated request rejected with 401', () => {
    const guard = requireMinLevel(10);
    const { req, res, next } = mockReqResNext(null);
    guard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('legacy ADMIN role normalized + passes COMPANY_ADMIN level (80)', () => {
    const guard = requireMinLevel(80);
    const { req, res, next } = mockReqResNext('ADMIN');
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
