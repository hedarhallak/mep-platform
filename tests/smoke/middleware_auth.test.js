// tests/smoke/middleware_auth.test.js — Phase 73c (May 2026, Section 22
// hardening, coverage push 47% → 65%).
//
// middleware/auth.js (41 lines) does pure JWT verification. No DB, no
// external services. Easy unit-test target — exercise the four
// observable branches: missing token, wrong header shape, invalid token,
// valid token (with role normalisation).

'use strict';

const jwt = require('jsonwebtoken');
const auth = require('../../middleware/auth');
const { JWT_SECRET } = require('../../lib/auth_utils');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('middleware/auth', () => {
  test('responds 401 MISSING_TOKEN when Authorization header is absent', () => {
    const req = { headers: {} };
    const res = makeRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'MISSING_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  test('responds 401 MISSING_TOKEN when Authorization header lacks "Bearer " prefix', () => {
    const req = { headers: { authorization: 'Token abc.def.ghi' } };
    const res = makeRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'MISSING_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  test('responds 401 INVALID_TOKEN when JWT verification fails', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-jwt' } };
    const res = makeRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  test('responds 401 INVALID_TOKEN when JWT was signed with a different secret', () => {
    const wrongToken = jwt.sign({ user_id: 1, role: 'WORKER' }, 'a-different-secret');
    const req = { headers: { authorization: `Bearer ${wrongToken}` } };
    const res = makeRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  test('valid token populates req.user with normalised (uppercase) role and calls next()', () => {
    const token = jwt.sign(
      {
        user_id: 42,
        employee_id: 7,
        username: 'foreman1',
        role: 'foreman', // lowercase on purpose
        company_id: 3,
      },
      JWT_SECRET
    );
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user.user_id).toBe('42');
    expect(req.user.employee_id).toBe('7');
    expect(req.user.username).toBe('foreman1');
    expect(req.user.role).toBe('FOREMAN');
    expect(req.user.company_id).toBe('3');
    expect(req.user._token_payload).toMatchObject({ user_id: 42, role: 'foreman' });
  });

  test('null/missing payload fields become null on req.user', () => {
    const token = jwt.sign({ username: 'lonely' }, JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = jest.fn();

    auth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.user_id).toBeNull();
    expect(req.user.employee_id).toBeNull();
    expect(req.user.role).toBeNull();
    expect(req.user.company_id).toBeNull();
    expect(req.user.username).toBe('lonely');
  });

  test('numeric ID fields are stringified', () => {
    const token = jwt.sign(
      { user_id: 0, employee_id: 0, company_id: 0, role: 'WORKER' },
      JWT_SECRET
    );
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = jest.fn();

    auth(req, res, next);

    // 0 != null, so all three should be the string "0"
    expect(req.user.user_id).toBe('0');
    expect(req.user.employee_id).toBe('0');
    expect(req.user.company_id).toBe('0');
  });
});
