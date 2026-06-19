// tests/smoke/middleware_roles.test.js — Phase 73c.
//
// middleware/roles.js (~140 lines) is pure logic — role normalisation,
// requireRoles factory, requireMinLevel factory. No DB. Easy unit-test
// surface.

'use strict';

const {
  normalizeRole,
  requireRoles,
  requireMinLevel,
  SUPER_ADMIN_ONLY,
  IT_ADMIN_UP,
  COMPANY_ADMIN_UP,
  TRADE_ADMIN_UP,
  PM_UP,
  FOREMAN_UP,
  ANY_AUTHENTICATED,
} = require('../../middleware/roles');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/roles — normalizeRole', () => {
  test('returns null when input is null/undefined/empty', () => {
    expect(normalizeRole(null)).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
    expect(normalizeRole('')).toBeNull();
  });

  test('uppercases the input role', () => {
    expect(normalizeRole('foreman')).toBe('FOREMAN');
    expect(normalizeRole('Worker')).toBe('WORKER');
  });

  test('maps legacy aliases to canonical roles', () => {
    expect(normalizeRole('ADMIN')).toBe('COMPANY_ADMIN');
    expect(normalizeRole('PM')).toBe('TRADE_PROJECT_MANAGER');
    expect(normalizeRole('PURCHASING')).toBe('TRADE_ADMIN');
    // §148 Phase 4: PROJECT_MANAGER is now a first-class role, not an alias.
    expect(normalizeRole('PROJECT_MANAGER')).toBe('PROJECT_MANAGER');
  });

  test('passes through unknown roles unchanged (uppercased)', () => {
    expect(normalizeRole('CUSTOM_ROLE')).toBe('CUSTOM_ROLE');
  });
});

describe('middleware/roles — requireRoles', () => {
  test('responds 401 UNAUTHENTICATED when req.user is missing', () => {
    const guard = requireRoles(['FOREMAN']);
    const res = makeRes();
    const next = jest.fn();

    guard({}, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'UNAUTHENTICATED' });
    expect(next).not.toHaveBeenCalled();
  });

  test('SUPER_ADMIN bypasses the role list', () => {
    const guard = requireRoles(['FOREMAN']); // not SUPER_ADMIN
    const req = { user: { role: 'SUPER_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('grants when user role matches', () => {
    const guard = requireRoles(['FOREMAN']);
    const req = { user: { role: 'FOREMAN' } };
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('grants when user role matches via legacy alias', () => {
    const guard = requireRoles(['COMPANY_ADMIN']);
    const req = { user: { role: 'ADMIN' } }; // legacy alias
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('responds 403 FORBIDDEN when role is not in list', () => {
    const guard = requireRoles(['FOREMAN', 'TRADE_ADMIN']);
    const req = { user: { role: 'WORKER' } };
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'FORBIDDEN',
      required: ['FOREMAN', 'TRADE_ADMIN'],
      current: 'WORKER',
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('middleware/roles — requireMinLevel', () => {
  test('responds 401 UNAUTHENTICATED when req.user is missing', () => {
    const guard = requireMinLevel(40);
    const res = makeRes();
    const next = jest.fn();

    guard({}, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'UNAUTHENTICATED' });
  });

  test('grants when user level >= required level', () => {
    const guard = requireMinLevel(40); // FOREMAN_UP
    const req = { user: { role: 'COMPANY_ADMIN' } }; // level 80
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('grants when user level === required level', () => {
    const guard = requireMinLevel(40);
    const req = { user: { role: 'FOREMAN' } }; // level 40
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('responds 403 FORBIDDEN when user level < required level', () => {
    const guard = requireMinLevel(40);
    const req = { user: { role: 'WORKER' } }; // level 10
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'FORBIDDEN',
      required_level: 40,
      current_role: 'WORKER',
    });
  });

  test('unknown role gets level 0 (always denied for level > 0)', () => {
    const guard = requireMinLevel(10);
    const req = { user: { role: 'TOTALLY_UNKNOWN' } };
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('honours legacy alias mapping when computing level', () => {
    const guard = requireMinLevel(80); // COMPANY_ADMIN_UP
    const req = { user: { role: 'ADMIN' } }; // alias → COMPANY_ADMIN level 80
    const res = makeRes();
    const next = jest.fn();

    guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('middleware/roles — prebuilt guards', () => {
  test('SUPER_ADMIN_ONLY denies COMPANY_ADMIN', () => {
    const req = { user: { role: 'COMPANY_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();
    SUPER_ADMIN_ONLY(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('SUPER_ADMIN_ONLY allows SUPER_ADMIN', () => {
    const req = { user: { role: 'SUPER_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();
    SUPER_ADMIN_ONLY(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('IT_ADMIN_UP allows IT_ADMIN (level 90)', () => {
    const req = { user: { role: 'IT_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();
    IT_ADMIN_UP(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('IT_ADMIN_UP denies COMPANY_ADMIN (level 80 < 90)', () => {
    const req = { user: { role: 'COMPANY_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();
    IT_ADMIN_UP(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('COMPANY_ADMIN_UP allows COMPANY_ADMIN', () => {
    const req = { user: { role: 'COMPANY_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();
    COMPANY_ADMIN_UP(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('TRADE_ADMIN_UP denies WORKER', () => {
    const req = { user: { role: 'WORKER' } };
    const res = makeRes();
    const next = jest.fn();
    TRADE_ADMIN_UP(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('PM_UP allows TRADE_PROJECT_MANAGER', () => {
    const req = { user: { role: 'TRADE_PROJECT_MANAGER' } };
    const res = makeRes();
    const next = jest.fn();
    PM_UP(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('FOREMAN_UP allows FOREMAN, denies WORKER', () => {
    const reqOk = { user: { role: 'FOREMAN' } };
    const reqNo = { user: { role: 'WORKER' } };
    const next1 = jest.fn();
    const next2 = jest.fn();
    FOREMAN_UP(reqOk, makeRes(), next1);
    FOREMAN_UP(reqNo, makeRes(), next2);
    expect(next1).toHaveBeenCalled();
    expect(next2).not.toHaveBeenCalled();
  });

  test('ANY_AUTHENTICATED allows WORKER', () => {
    const req = { user: { role: 'WORKER' } };
    const res = makeRes();
    const next = jest.fn();
    ANY_AUTHENTICATED(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
