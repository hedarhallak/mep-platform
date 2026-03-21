-- db/migrations/022_unify_roles.sql
-- Converts all legacy roles to new RBAC roles
-- Safe to run multiple times (idempotent)

BEGIN;

-- ── 1. Add new roles to the roles table ───────────────────────
INSERT INTO public.roles (role_key, label, is_active)
VALUES
  ('IT_ADMIN',              'IT Administrator',       true),
  ('COMPANY_ADMIN',         'Company Administrator',  true),
  ('TRADE_PROJECT_MANAGER', 'Trade Project Manager',  true),
  ('TRADE_ADMIN',           'Trade Administrator',    true),
  ('WORKER',                'Worker',                 true)
ON CONFLICT (role_key) DO NOTHING;

-- ── 2. Update app_users_role_check constraint ─────────────────
ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN (
    'SUPER_ADMIN',
    'IT_ADMIN',
    'COMPANY_ADMIN',
    'TRADE_PROJECT_MANAGER',
    'TRADE_ADMIN',
    'WORKER',
    -- legacy aliases kept temporarily during migration
    'ADMIN',
    'PM',
    'PROJECT_MANAGER',
    'PURCHASING',
    'FOREMAN'
  ));

-- ── 3. Convert legacy roles in app_users ─────────────────────
UPDATE public.app_users SET role = 'COMPANY_ADMIN'         WHERE role IN ('ADMIN');
UPDATE public.app_users SET role = 'TRADE_PROJECT_MANAGER' WHERE role IN ('PM', 'PROJECT_MANAGER');
UPDATE public.app_users SET role = 'TRADE_ADMIN'           WHERE role IN ('FOREMAN');
UPDATE public.app_users SET role = 'TRADE_ADMIN'           WHERE role IN ('PURCHASING');

-- ── 4. Convert legacy roles in employees table ───────────────
UPDATE public.employees SET employee_profile_type = 'COMPANY_ADMIN'         WHERE employee_profile_type IN ('ADMIN');
UPDATE public.employees SET employee_profile_type = 'TRADE_PROJECT_MANAGER' WHERE employee_profile_type IN ('PM', 'PROJECT_MANAGER');
UPDATE public.employees SET employee_profile_type = 'TRADE_ADMIN'           WHERE employee_profile_type IN ('FOREMAN');
UPDATE public.employees SET employee_profile_type = 'WORKER'                WHERE employee_profile_type IN ('PURCHASING');

-- ── 5. Convert legacy roles in user_invites ──────────────────
UPDATE public.user_invites SET role = 'COMPANY_ADMIN'         WHERE role IN ('ADMIN');
UPDATE public.user_invites SET role = 'TRADE_PROJECT_MANAGER' WHERE role IN ('PM', 'PROJECT_MANAGER');
UPDATE public.user_invites SET role = 'TRADE_ADMIN'           WHERE role IN ('FOREMAN');
UPDATE public.user_invites SET role = 'WORKER'                WHERE role IN ('PURCHASING');

-- ── 6. Now tighten the constraint — remove legacy roles ───────
ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN (
    'SUPER_ADMIN',
    'IT_ADMIN',
    'COMPANY_ADMIN',
    'TRADE_PROJECT_MANAGER',
    'TRADE_ADMIN',
    'WORKER'
  ));

-- ── 7. Seed role_permissions for new roles ───────────────────
-- IT_ADMIN
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'IT_ADMIN', code FROM public.permissions
WHERE code IN (
  'dashboard.view',
  'settings.system','settings.company','settings.user_management','settings.permissions',
  'audit.view',
  'employees.view','employees.create','employees.edit','employees.delete','employees.invite'
)
ON CONFLICT DO NOTHING;

-- TRADE_PROJECT_MANAGER
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'TRADE_PROJECT_MANAGER', code FROM public.permissions
WHERE code IN (
  'dashboard.view',
  'employees.view_own_trade','projects.view_own_trade','suppliers.view',
  'assignments.view_own_trade','attendance.view_own_trade',
  'materials.request_view_own_trade','materials.catalog_view','materials.surplus_view',
  'purchase_orders.view_own_trade','purchase_orders.print',
  'bi.access_own_trade','bi.workforce_planner'
)
ON CONFLICT DO NOTHING;

COMMIT;
