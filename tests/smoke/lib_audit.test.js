// tests/smoke/lib_audit.test.js — Phase 73c.
//
// lib/audit.js (117 lines) wraps a single INSERT into public.audit_logs.
// Contract: never throws — audit failures are non-blocking. Tested with
// a fake pool (jest.fn for query) so we verify the SQL shape + the
// expected parameter ordering without touching Postgres.

'use strict';

const { audit, ACTIONS } = require('../../lib/audit');

function makeFakePool({ rejected = false } = {}) {
  const query = rejected
    ? jest.fn().mockRejectedValue(new Error('connection refused'))
    : jest.fn().mockResolvedValue({ rowCount: 1 });
  return { query };
}

describe('lib/audit — audit()', () => {
  test('emits a single INSERT with the expected parameter order', async () => {
    const pool = makeFakePool();
    const req = {
      user: {
        company_id: 7,
        user_id: 42,
        username: 'test@x.com',
        role: 'COMPANY_ADMIN',
      },
      ip: '10.0.0.5',
    };

    await audit(pool, req, {
      action: 'PROJECT_CREATED',
      entity_type: 'project',
      entity_id: 100,
      entity_name: 'Tower 7',
      old_values: null,
      new_values: { name: 'Tower 7' },
      details: { source: 'web' },
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO public\.audit_logs/);
    expect(params).toEqual([
      7, // company_id
      42, // user_id
      'test@x.com', // username
      'COMPANY_ADMIN', // role
      'PROJECT_CREATED', // action
      'project', // entity_type
      100, // entity_id
      'Tower 7', // entity_name
      null, // old_values JSON.stringified
      JSON.stringify({ name: 'Tower 7' }), // new_values
      JSON.stringify({ source: 'web' }), // details
      '10.0.0.5', // ip_address
    ]);
  });

  test('falls back to x-forwarded-for header when req.ip is absent', async () => {
    const pool = makeFakePool();
    const req = {
      user: { company_id: 1, user_id: 1, role: 'WORKER' },
      headers: { 'x-forwarded-for': '203.0.113.5, 198.51.100.1' },
    };

    await audit(pool, req, { action: 'LOGIN_SUCCESS', entity_type: 'session' });

    const params = pool.query.mock.calls[0][1];
    expect(params[11]).toBe('203.0.113.5');
  });

  test('falls back to null IP when neither req.ip nor x-forwarded-for is set', async () => {
    const pool = makeFakePool();
    const req = { user: { user_id: 1 }, headers: {} };

    await audit(pool, req, { action: 'LOGOUT', entity_type: 'session' });

    const params = pool.query.mock.calls[0][1];
    expect(params[11]).toBeNull();
  });

  test('handles missing req.user (anonymous events) — all user fields null', async () => {
    const pool = makeFakePool();
    const req = { ip: '127.0.0.1' };

    await audit(pool, req, { action: 'LOGIN_FAILED', entity_type: 'session' });

    const params = pool.query.mock.calls[0][1];
    expect(params[0]).toBeNull(); // company_id
    expect(params[1]).toBeNull(); // user_id
    expect(params[2]).toBeNull(); // username
    expect(params[3]).toBeNull(); // role
    expect(params[4]).toBe('LOGIN_FAILED');
  });

  test('JSON.stringifies old_values + new_values + details', async () => {
    const pool = makeFakePool();
    const req = { user: { user_id: 1 } };

    await audit(pool, req, {
      action: 'PROJECT_UPDATED',
      entity_type: 'project',
      old_values: { name: 'old' },
      new_values: { name: 'new' },
      details: { changed_fields: ['name'] },
    });

    const params = pool.query.mock.calls[0][1];
    expect(params[8]).toBe(JSON.stringify({ name: 'old' }));
    expect(params[9]).toBe(JSON.stringify({ name: 'new' }));
    expect(params[10]).toBe(JSON.stringify({ changed_fields: ['name'] }));
  });

  test('null JSON fields stay null (no "null" string)', async () => {
    const pool = makeFakePool();
    const req = { user: { user_id: 1 } };

    await audit(pool, req, { action: 'LOGOUT', entity_type: 'session' });

    const params = pool.query.mock.calls[0][1];
    expect(params[8]).toBeNull();
    expect(params[9]).toBeNull();
    expect(params[10]).toBeNull();
  });

  test('swallows DB errors (logs but does not throw)', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const pool = makeFakePool({ rejected: true });
    const req = { user: { user_id: 1 } };

    await expect(
      audit(pool, req, { action: 'LOGIN_FAILED', entity_type: 'session' })
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalledWith('[audit] Failed to write audit log:', 'connection refused');

    errSpy.mockRestore();
  });

  test('handles entity_id = null (default)', async () => {
    const pool = makeFakePool();
    const req = { user: { user_id: 1 } };

    await audit(pool, req, { action: 'LOGIN_SUCCESS', entity_type: 'session' });

    const params = pool.query.mock.calls[0][1];
    expect(params[6]).toBeNull();
    expect(params[7]).toBeNull(); // entity_name default null
  });
});

describe('lib/audit — ACTIONS constants', () => {
  test('exports a non-empty constants object', () => {
    expect(ACTIONS).toBeDefined();
    expect(Object.keys(ACTIONS).length).toBeGreaterThan(10);
  });

  test('every value matches its key (constants enum invariant)', () => {
    for (const [key, value] of Object.entries(ACTIONS)) {
      expect(value).toBe(key);
    }
  });

  test('contains expected action codes', () => {
    expect(ACTIONS.LOGIN_SUCCESS).toBe('LOGIN_SUCCESS');
    expect(ACTIONS.PROJECT_CREATED).toBe('PROJECT_CREATED');
    expect(ACTIONS.EMPLOYEE_DISABLED).toBe('EMPLOYEE_DISABLED');
    expect(ACTIONS.ATTENDANCE_CHECKIN).toBe('ATTENDANCE_CHECKIN');
  });
});
