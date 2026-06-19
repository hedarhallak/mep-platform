// tests/smoke/trade_scope.test.js
//
// §147 trade-scoping — the tradeScopeFor() helper. Pure, no DB.
// Company-level roles (admins/dispatchers/owner) oversee ALL trades → null.
// Trade-level roles (foreman / trade manager / workers) are scoped to their
// own specialty (from their employee profile), uppercased.

'use strict';

const { tradeScopeFor } = require('../../middleware/roles');

describe('tradeScopeFor (§147 trade-scoping)', () => {
  test('company-level roles see ALL trades (null) regardless of their trade_code', () => {
    expect(tradeScopeFor({ role: 'SUPER_ADMIN', trade_code: 'PLUMBING' })).toBeNull();
    expect(tradeScopeFor({ role: 'OWNER', trade_code: 'ELECTRICAL' })).toBeNull();
    expect(tradeScopeFor({ role: 'IT_ADMIN', trade_code: 'PLUMBING' })).toBeNull();
    expect(tradeScopeFor({ role: 'COMPANY_ADMIN', trade_code: 'PLUMBING' })).toBeNull();
  });

  test('trade-level roles are scoped to their own trade (uppercased)', () => {
    expect(tradeScopeFor({ role: 'FOREMAN', trade_code: 'plumbing' })).toBe('PLUMBING');
    expect(tradeScopeFor({ role: 'TRADE_ADMIN', trade_code: 'ELECTRICAL' })).toBe('ELECTRICAL');
    expect(tradeScopeFor({ role: 'TRADE_PROJECT_MANAGER', trade_code: 'Mechanical' })).toBe(
      'MECHANICAL'
    );
  });

  test('legacy alias ADMIN (→ COMPANY_ADMIN) sees all trades', () => {
    expect(tradeScopeFor({ role: 'ADMIN', trade_code: 'PLUMBING' })).toBeNull();
  });

  test('a trade-level user with no trade_code is unscoped (null)', () => {
    expect(tradeScopeFor({ role: 'FOREMAN', trade_code: null })).toBeNull();
    expect(tradeScopeFor({ role: 'FOREMAN', trade_code: '' })).toBeNull();
    expect(tradeScopeFor({ role: 'FOREMAN' })).toBeNull();
  });

  test('null/undefined user → null', () => {
    expect(tradeScopeFor(null)).toBeNull();
    expect(tradeScopeFor(undefined)).toBeNull();
  });
});
