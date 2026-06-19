-- migrations/038_roles_catalog_expansion.sql
--
-- §148 Phase 4 — expand the fixed roles catalog with the common construction /
-- MEP project positions (engineers, estimator, dispatcher, accountant, HSE,
-- QA/QC, HR, payroll, procurement, superintendent, general foreman, operator…).
-- Roles stay a FIXED global catalog (§148): adding one = a single INSERT row.
--
-- rank: position in the hierarchy (HIGHER = more senior; drives the matrix
-- rank-lock — you may only edit a role ranked below yours). ALL new roles are
-- below COMPANY_ADMIN (80) so a company admin can tune every one of them.
-- category: groups roles in the matrix UI (governance / management /
-- engineering / supervision / field) — matches the existing CATEGORY_COLORS.
--
-- Default PERMISSIONS for each role live in lib/role_defaults.js and are applied
-- to role_permissions by scripts/apply_role_defaults.js (run after deploy) — NOT
-- here, to keep the single source of truth in code.
--
-- NOTE: PROJECT_MANAGER becomes a first-class role here. The legacy
-- `PROJECT_MANAGER → TRADE_PROJECT_MANAGER` alias in middleware/roles.js was
-- removed in the same change (no user ever held it — migration 036's FK).
--
-- Idempotent: ON CONFLICT (role_key) DO UPDATE normalizes rank/category on
-- re-run; re-running is a clean no-op.

BEGIN;

INSERT INTO public.roles (role_key, label, rank, category, is_active) VALUES
  ('CONSTRUCTION_MANAGER', 'Construction Manager', 70, 'management',  true),
  ('PROJECT_MANAGER',      'Project Manager',      65, 'management',  true),
  ('SUPERINTENDENT',       'Superintendent',       55, 'supervision', true),
  ('MEP_ENGINEER',         'MEP Engineer',         54, 'engineering', true),
  ('ESTIMATOR',            'Estimator',            52, 'management',  true),
  ('PROJECT_ENGINEER',     'Project Engineer',     52, 'engineering', true),
  ('SITE_ENGINEER',        'Site Engineer',        50, 'engineering', true),
  ('ACCOUNTANT',           'Accountant',           50, 'governance',  true),
  ('BIM_COORDINATOR',      'BIM Coordinator',      48, 'engineering', true),
  ('HR_OFFICER',           'HR Officer',           46, 'governance',  true),
  ('GENERAL_FOREMAN',      'General Foreman',       45, 'supervision', true),
  ('DISPATCHER',           'Dispatcher',           45, 'management',  true),
  ('PROCUREMENT_OFFICER',  'Procurement Officer',   45, 'management',  true),
  ('SAFETY_OFFICER',       'Safety Officer',        44, 'supervision', true),
  ('QA_QC_OFFICER',        'QA/QC Officer',         44, 'supervision', true),
  ('PAYROLL_OFFICER',      'Payroll Officer',       42, 'governance',  true),
  ('OFFICE_CLERK',         'Office Clerk',          30, 'management',  true),
  ('OPERATOR',             'Equipment Operator',    18, 'field',       true)
ON CONFLICT (role_key) DO UPDATE
  SET rank     = EXCLUDED.rank,
      category = EXCLUDED.category,
      label    = COALESCE(public.roles.label, EXCLUDED.label),
      is_active = true;

COMMIT;
