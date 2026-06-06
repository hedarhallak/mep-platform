// tests/smoke/owner_role_guard.test.js
//
// §132 OWNER role (DECISIONS §140) — the canAssignRole guard. Pure, no DB.
// OWNER is Constrai-managed: no in-tenant role may assign it OR alter a user
// who currently IS an OWNER; only SUPER_ADMIN can.

'use strict';

const { canAssignRole } = require('../../middleware/roles');

describe('canAssignRole (§132 OWNER guard)', () => {
  test('SUPER_ADMIN may assign OWNER', () => {
    expect(canAssignRole('SUPER_ADMIN', 'OWNER')).toBe(true);
  });

  test('COMPANY_ADMIN may NOT assign OWNER', () => {
    expect(canAssignRole('COMPANY_ADMIN', 'OWNER')).toBe(false);
  });

  test('IT_ADMIN may NOT assign OWNER', () => {
    expect(canAssignRole('IT_ADMIN', 'OWNER')).toBe(false);
  });

  test('legacy alias ADMIN (→COMPANY_ADMIN) may NOT assign OWNER', () => {
    expect(canAssignRole('ADMIN', 'OWNER')).toBe(false);
  });

  test('COMPANY_ADMIN may NOT alter a user who currently IS an OWNER (e.g. demote)', () => {
    expect(canAssignRole('COMPANY_ADMIN', 'COMPANY_ADMIN', 'OWNER')).toBe(false);
  });

  test('SUPER_ADMIN may alter an existing OWNER', () => {
    expect(canAssignRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'OWNER')).toBe(true);
  });

  test('ordinary in-tenant assignment is unaffected', () => {
    expect(canAssignRole('COMPANY_ADMIN', 'WORKER')).toBe(true);
    expect(canAssignRole('COMPANY_ADMIN', 'FOREMAN', 'WORKER')).toBe(true);
  });
});
