// tests/smoke/middleware_permissions.test.js — Phase 73c.
//
// middleware/permissions.js (~184 lines): RBAC `can` factory, `canAny`,
// `userHasPermission`, `invalidateCache`, `logAudit`. Module-level cache
// is wiped between tests via invalidateCache() so each test starts
// fresh. The pg pool is mocked.

'use strict';

let mockQueryImpl = jest.fn();
jest.mock('../../db', () => ({
  pool: {
    query: (...args) => mockQueryImpl(...args),
  },
}));

const {
  can,
  canAny,
  userHasPermission,
  invalidateCache,
  logAudit,
} = require('../../middleware/permissions');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  invalidateCache(); // force cache reload on next call
  mockQueryImpl = jest.fn();
});

describe('middleware/permissions — userHasPermission', () => {
  test('SUPER_ADMIN always passes without DB lookup', async () => {
    const result = await userHasPermission(1, 'SUPER_ADMIN', 'employees.view');
    expect(result).toBe(true);
    expect(mockQueryImpl).not.toHaveBeenCalled();
  });

  test('legacy alias ADMIN does NOT bypass (only canonical SUPER_ADMIN does)', async () => {
    // Set up: user_permissions returns nothing, role_permissions has nothing for this role
    mockQueryImpl
      .mockResolvedValueOnce({ rows: [] }) // user_permissions
      .mockResolvedValueOnce({ rows: [] }); // role_permissions load

    const result = await userHasPermission(1, 'ADMIN', 'employees.view');

    // ADMIN normalises to COMPANY_ADMIN, which has no role_permissions in this mock → false
    expect(result).toBe(false);
  });

  test('user_permissions explicit grant=true wins over role default', async () => {
    mockQueryImpl.mockResolvedValueOnce({ rows: [{ granted: true }] });

    const result = await userHasPermission(42, 'WORKER', 'projects.edit');

    expect(result).toBe(true);
    // Only the user_permissions query — never falls back to role_permissions
    expect(mockQueryImpl).toHaveBeenCalledTimes(1);
  });

  test('user_permissions explicit grant=false wins over role default', async () => {
    mockQueryImpl.mockResolvedValueOnce({ rows: [{ granted: false }] });

    const result = await userHasPermission(42, 'COMPANY_ADMIN', 'projects.edit');

    expect(result).toBe(false);
    expect(mockQueryImpl).toHaveBeenCalledTimes(1);
  });

  test('falls back to role_permissions when no user-level override', async () => {
    mockQueryImpl
      .mockResolvedValueOnce({ rows: [] }) // user_permissions empty
      .mockResolvedValueOnce({
        rows: [
          { role: 'COMPANY_ADMIN', permission_code: 'projects.view' },
          { role: 'COMPANY_ADMIN', permission_code: 'projects.edit' },
        ],
      });

    const result = await userHasPermission(42, 'COMPANY_ADMIN', 'projects.view');

    expect(result).toBe(true);
    expect(mockQueryImpl).toHaveBeenCalledTimes(2);
  });

  test('returns false when role_permissions has no entry for the requested code', async () => {
    mockQueryImpl.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ role: 'WORKER', permission_code: 'attendance.view' }],
    });

    const result = await userHasPermission(99, 'WORKER', 'projects.delete');
    expect(result).toBe(false);
  });

  test('cached role_permissions are reused on second call (one DB load)', async () => {
    mockQueryImpl
      .mockResolvedValueOnce({ rows: [] }) // user_perm 1
      .mockResolvedValueOnce({
        rows: [{ role: 'FOREMAN', permission_code: 'standup.manage' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // user_perm 2

    const r1 = await userHasPermission(11, 'FOREMAN', 'standup.manage');
    const r2 = await userHasPermission(12, 'FOREMAN', 'standup.manage');

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    // 2 user_permissions calls + 1 role_permissions load = 3, NOT 4
    expect(mockQueryImpl).toHaveBeenCalledTimes(3);
  });

  test('passes null userId straight to role lookup (no user_permissions query)', async () => {
    mockQueryImpl.mockResolvedValueOnce({
      rows: [{ role: 'WORKER', permission_code: 'attendance.view' }],
    });

    const result = await userHasPermission(null, 'WORKER', 'attendance.view');

    expect(result).toBe(true);
    // Only the role_permissions load — user_permissions was skipped
    expect(mockQueryImpl).toHaveBeenCalledTimes(1);
  });
});

describe('middleware/permissions — can()', () => {
  test('responds 401 UNAUTHENTICATED when req.user is missing', async () => {
    const guard = can('employees.view');
    const res = makeRes();
    const next = jest.fn();

    await guard({}, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'UNAUTHENTICATED' });
    expect(next).not.toHaveBeenCalled();
  });

  test('SUPER_ADMIN passes without DB lookup', async () => {
    const guard = can('whatever');
    const req = { user: { user_id: '1', role: 'SUPER_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockQueryImpl).not.toHaveBeenCalled();
  });

  test('responds 403 FORBIDDEN with permission key when not granted', async () => {
    mockQueryImpl.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const guard = can('projects.delete');
    const req = { user: { user_id: '5', role: 'WORKER' } };
    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'FORBIDDEN',
      permission: 'projects.delete',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('responds 500 PERMISSION_CHECK_FAILED when DB throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQueryImpl.mockRejectedValueOnce(new Error('DB down'));

    const guard = can('whatever');
    const req = { user: { user_id: '1', role: 'WORKER' } };
    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'PERMISSION_CHECK_FAILED',
    });
    expect(next).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  test('null user_id (e.g. service tokens) skips user_permissions query', async () => {
    mockQueryImpl.mockResolvedValueOnce({
      rows: [{ role: 'IT_ADMIN', permission_code: 'system.view' }],
    });

    const guard = can('system.view');
    const req = { user: { user_id: null, role: 'IT_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('middleware/permissions — canAny()', () => {
  test('responds 401 UNAUTHENTICATED when req.user is missing', async () => {
    const guard = canAny(['a', 'b']);
    const res = makeRes();
    const next = jest.fn();

    await guard({}, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('passes if first permission is granted (short-circuits)', async () => {
    mockQueryImpl.mockResolvedValueOnce({ rows: [{ granted: true }] });

    const guard = canAny(['perm.one', 'perm.two']);
    const req = { user: { user_id: '1', role: 'WORKER' } };
    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockQueryImpl).toHaveBeenCalledTimes(1); // short-circuit
  });

  test('passes if any later permission is granted', async () => {
    mockQueryImpl
      .mockResolvedValueOnce({ rows: [] }) // perm.one user_permissions
      .mockResolvedValueOnce({
        rows: [{ role: 'WORKER', permission_code: 'perm.two' }],
      }) // role_permissions load (cached after this)
      .mockResolvedValueOnce({ rows: [] }); // perm.two user_permissions

    const guard = canAny(['perm.one', 'perm.two']);
    const req = { user: { user_id: '1', role: 'WORKER' } };
    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('responds 403 FORBIDDEN with permissions array when none granted', async () => {
    mockQueryImpl
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // role_permissions load (empty)
      .mockResolvedValueOnce({ rows: [] }); // perm.two user_permissions

    const guard = canAny(['perm.one', 'perm.two']);
    const req = { user: { user_id: '1', role: 'WORKER' } };
    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'FORBIDDEN',
      permissions: ['perm.one', 'perm.two'],
    });
  });

  test('SUPER_ADMIN bypasses on first iteration', async () => {
    const guard = canAny(['anything', 'else']);
    const req = { user: { user_id: '1', role: 'SUPER_ADMIN' } };
    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockQueryImpl).not.toHaveBeenCalled();
  });

  test('responds 500 PERMISSION_CHECK_FAILED when DB throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQueryImpl.mockRejectedValueOnce(new Error('boom'));

    const guard = canAny(['x']);
    const req = { user: { user_id: '1', role: 'WORKER' } };
    const res = makeRes();
    const next = jest.fn();

    await guard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);

    errSpy.mockRestore();
  });
});

describe('middleware/permissions — invalidateCache()', () => {
  test('forces a fresh role_permissions load on the next userHasPermission call', async () => {
    // Prime the cache
    mockQueryImpl.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ role: 'WORKER', permission_code: 'p1' }],
    });

    await userHasPermission(1, 'WORKER', 'p1'); // 2 queries

    // Second call — should hit cache (1 query for user_permissions)
    mockQueryImpl.mockResolvedValueOnce({ rows: [] });
    await userHasPermission(2, 'WORKER', 'p1'); // 1 query (cache hit)

    expect(mockQueryImpl).toHaveBeenCalledTimes(3);

    // Invalidate cache, then call again — should reload role_permissions (2 queries)
    invalidateCache();
    mockQueryImpl.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ role: 'WORKER', permission_code: 'p1' }],
    });

    await userHasPermission(3, 'WORKER', 'p1');

    expect(mockQueryImpl).toHaveBeenCalledTimes(5); // 3 + 2 reload
  });
});

describe('middleware/permissions — logAudit()', () => {
  test('fires INSERT INTO public.audit_logs with all context fields', async () => {
    mockQueryImpl.mockResolvedValueOnce({ rowCount: 1 });

    const req = {
      user: {
        user_id: 5,
        company_id: 9,
        username: 'admin@x.com',
        role: 'COMPANY_ADMIN',
      },
      headers: {
        'x-forwarded-for': '203.0.113.1',
        'user-agent': 'Mozilla/5.0',
      },
      socket: { remoteAddress: '127.0.0.1' },
    };

    logAudit(req, 'PROJECT_CREATED', 'project', 100, null, { name: 'X' });

    // logAudit is fire-and-forget — let the microtask flush
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockQueryImpl).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQueryImpl.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO public\.audit_logs/);
    expect(params[0]).toBe(9); // company_id
    expect(params[1]).toBe(5); // user_id
    expect(params[2]).toBe('admin@x.com');
    expect(params[3]).toBe('COMPANY_ADMIN');
    expect(params[4]).toBe('PROJECT_CREATED');
    expect(params[5]).toBe('project');
    expect(params[6]).toBe(100);
    expect(params[7]).toBeNull(); // old_values
    expect(params[8]).toBe(JSON.stringify({ name: 'X' })); // new_values
    expect(params[9]).toBe('203.0.113.1'); // x-forwarded-for first
    expect(params[10]).toBe('Mozilla/5.0');
  });

  test('falls back to socket.remoteAddress when x-forwarded-for absent', async () => {
    mockQueryImpl.mockResolvedValueOnce({ rowCount: 1 });

    const req = {
      user: { user_id: 1, company_id: 1, username: 'a', role: 'WORKER' },
      headers: {},
      socket: { remoteAddress: '10.1.2.3' },
    };

    logAudit(req, 'LOGIN_SUCCESS', 'session');
    await new Promise((resolve) => setImmediate(resolve));

    const params = mockQueryImpl.mock.calls[0][1];
    expect(params[9]).toBe('10.1.2.3');
  });

  test('handles missing req.user (all user fields null)', async () => {
    mockQueryImpl.mockResolvedValueOnce({ rowCount: 1 });

    const req = { headers: {}, socket: {} };
    logAudit(req, 'LOGIN_FAILED', 'session');
    await new Promise((resolve) => setImmediate(resolve));

    const params = mockQueryImpl.mock.calls[0][1];
    expect(params[0]).toBeNull();
    expect(params[1]).toBeNull();
    expect(params[2]).toBeNull();
    expect(params[3]).toBeNull();
  });

  test('swallows DB errors (logs but does not throw)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQueryImpl.mockRejectedValueOnce(new Error('DB lost'));

    const req = { user: { user_id: 1 }, headers: {}, socket: {} };
    expect(() => logAudit(req, 'LOGOUT', 'session')).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(errSpy).toHaveBeenCalledWith('[audit] Failed to write log:', 'DB lost');
    errSpy.mockRestore();
  });
});
