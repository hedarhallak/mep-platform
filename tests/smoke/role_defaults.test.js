// tests/smoke/role_defaults.test.js
//
// §148 — pins the approved INTENT of the canonical role defaults. Pure, no DB.

'use strict';

const { ROLE_DEFAULT_PERMISSIONS, FIELD_WORKER } = require('../../lib/role_defaults');

describe('ROLE_DEFAULT_PERMISSIONS (§148 canonical defaults)', () => {
  const has = (role, code) => ROLE_DEFAULT_PERMISSIONS[role].includes(code);

  test('§147: FOREMAN can submit requests + see projects', () => {
    expect(has('FOREMAN', 'assignments.create')).toBe(true);
    expect(has('FOREMAN', 'projects.view')).toBe(true);
  });

  test('§132: audit.view is OWNER-only — not COMPANY_ADMIN / IT_ADMIN', () => {
    expect(has('OWNER', 'audit.view')).toBe(true);
    expect(has('COMPANY_ADMIN', 'audit.view')).toBe(false);
    expect(has('IT_ADMIN', 'audit.view')).toBe(false);
  });

  test('OWNER is a superset of COMPANY_ADMIN (+ audit)', () => {
    for (const code of ROLE_DEFAULT_PERMISSIONS.COMPANY_ADMIN) {
      expect(has('OWNER', code)).toBe(true);
    }
  });

  test('IT_ADMIN carries no business data (no projects/assignments)', () => {
    expect(ROLE_DEFAULT_PERMISSIONS.IT_ADMIN.some((c) => c.startsWith('projects.'))).toBe(false);
    expect(ROLE_DEFAULT_PERMISSIONS.IT_ADMIN.some((c) => c.startsWith('assignments.'))).toBe(false);
    expect(has('IT_ADMIN', 'settings.permissions')).toBe(true);
  });

  test('APPRENTICE_1-4 + WORKER + JOURNEYMAN share the field-worker baseline', () => {
    for (const r of [
      'JOURNEYMAN',
      'APPRENTICE_1',
      'APPRENTICE_2',
      'APPRENTICE_3',
      'APPRENTICE_4',
      'WORKER',
    ]) {
      expect(ROLE_DEFAULT_PERMISSIONS[r]).toEqual(FIELD_WORKER);
    }
  });

  test('every role has dashboard.view; SUPER_ADMIN is intentionally absent', () => {
    for (const codes of Object.values(ROLE_DEFAULT_PERMISSIONS)) {
      expect(codes).toContain('dashboard.view');
    }
    expect(ROLE_DEFAULT_PERMISSIONS.SUPER_ADMIN).toBeUndefined();
  });

  // §148 Phase 4 — expanded catalog (migration 038).
  describe('Phase 4 expanded catalog', () => {
    const NEW_ROLES = [
      'CONSTRUCTION_MANAGER',
      'PROJECT_MANAGER',
      'SUPERINTENDENT',
      'MEP_ENGINEER',
      'ESTIMATOR',
      'PROJECT_ENGINEER',
      'SITE_ENGINEER',
      'ACCOUNTANT',
      'BIM_COORDINATOR',
      'HR_OFFICER',
      'GENERAL_FOREMAN',
      'DISPATCHER',
      'PROCUREMENT_OFFICER',
      'SAFETY_OFFICER',
      'QA_QC_OFFICER',
      'PAYROLL_OFFICER',
      'OFFICE_CLERK',
      'OPERATOR',
    ];

    test('all 18 new roles have a default set with dashboard.view', () => {
      for (const r of NEW_ROLES) {
        expect(Array.isArray(ROLE_DEFAULT_PERMISSIONS[r])).toBe(true);
        expect(ROLE_DEFAULT_PERMISSIONS[r]).toContain('dashboard.view');
      }
    });

    test('no new role gets audit.view (OWNER-only, §132)', () => {
      for (const r of NEW_ROLES) {
        expect(ROLE_DEFAULT_PERMISSIONS[r]).not.toContain('audit.view');
      }
    });

    test('no new role gets settings.* (governance stays with admins)', () => {
      for (const r of NEW_ROLES) {
        expect(ROLE_DEFAULT_PERMISSIONS[r].some((c) => c.startsWith('settings.'))).toBe(false);
      }
    });

    test('OPERATOR shares the field-worker baseline; ACCOUNTANT can approve expenses', () => {
      expect(ROLE_DEFAULT_PERMISSIONS.OPERATOR).toEqual(FIELD_WORKER);
      expect(ROLE_DEFAULT_PERMISSIONS.ACCOUNTANT).toContain('expense_claims.approve');
    });
  });
});
