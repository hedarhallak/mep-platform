-- db/migrations/021_rbac_permissions.sql
-- Full RBAC system: permissions, role_permissions, user_permissions, audit_logs

BEGIN;

-- ── 1. New roles added to app_users role check ────────────────
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
    -- legacy aliases kept for backwards compatibility
    'ADMIN',
    'PM',
    'PROJECT_MANAGER',
    'PURCHASING'
  ));

-- ── 2. permissions ────────────────────────────────────────────
-- Master list of every permission in the system.
-- New features: just INSERT a row here + seed role_permissions.
CREATE TABLE IF NOT EXISTS public.permissions (
  code        TEXT PRIMARY KEY,          -- e.g. 'employees.view'
  description TEXT NOT NULL,
  grp         TEXT NOT NULL,             -- group: 'employees', 'projects', 'bi'...
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. role_permissions ───────────────────────────────────────
-- Default permissions per role.
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role            TEXT NOT NULL,
  permission_code TEXT NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_role_perms_role ON public.role_permissions(role);

-- ── 4. user_permissions ───────────────────────────────────────
-- Per-user overrides (add or revoke on top of role defaults).
-- granted = true  → explicitly grant (even if role doesn't have it)
-- granted = false → explicitly revoke (even if role has it)
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  permission_code TEXT   NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  granted         BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by      BIGINT,               -- user_id of admin who set this
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_user_perms_user ON public.user_permissions(user_id);

-- ── 5. audit_logs ─────────────────────────────────────────────
-- Table already exists — add missing column and indexes only
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_company ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

-- Prevent any UPDATE or DELETE on audit_logs
CREATE OR REPLACE FUNCTION public.audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is immutable — updates and deletes are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_no_update ON public.audit_logs;
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

DROP TRIGGER IF EXISTS trg_audit_no_delete ON public.audit_logs;
CREATE TRIGGER trg_audit_no_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

-- ── 6. Seed permissions ───────────────────────────────────────
INSERT INTO public.permissions (code, description, grp) VALUES

  -- Dashboard
  ('dashboard.view',                    'View dashboard',                          'dashboard'),

  -- Employees
  ('employees.view',                    'View employees list',                     'employees'),
  ('employees.view_own_trade',          'View employees in own trade only',        'employees'),
  ('employees.create',                  'Add new employees',                       'employees'),
  ('employees.edit',                    'Edit employee details',                   'employees'),
  ('employees.delete',                  'Delete employees',                        'employees'),
  ('employees.invite',                  'Send employee invites',                   'employees'),

  -- Projects
  ('projects.view',                     'View projects list',                      'projects'),
  ('projects.view_own_trade',           'View projects in own trade only',         'projects'),
  ('projects.create',                   'Create new projects',                     'projects'),
  ('projects.edit',                     'Edit project details',                    'projects'),
  ('projects.delete',                   'Delete projects',                         'projects'),

  -- Suppliers
  ('suppliers.view',                    'View suppliers list',                     'suppliers'),
  ('suppliers.create',                  'Add new suppliers',                       'suppliers'),
  ('suppliers.edit',                    'Edit supplier details',                   'suppliers'),
  ('suppliers.delete',                  'Delete suppliers',                        'suppliers'),

  -- Assignments
  ('assignments.view',                  'View assignments',                        'assignments'),
  ('assignments.view_own_trade',        'View assignments in own trade only',      'assignments'),
  ('assignments.create',                'Create assignments',                      'assignments'),
  ('assignments.edit',                  'Edit assignments',                        'assignments'),
  ('assignments.delete',                'Cancel/delete assignments',               'assignments'),
  ('assignments.smart_assign',          'Use smart auto-assign',                   'assignments'),

  -- Attendance
  ('attendance.view',                   'View attendance records',                 'attendance'),
  ('attendance.view_own_trade',         'View attendance in own trade only',       'attendance'),
  ('attendance.view_self',              'View own attendance only',                'attendance'),
  ('attendance.checkin',                'Record check-in / check-out',             'attendance'),
  ('attendance.approve',                'Approve attendance (My Hub)',              'attendance'),
  ('attendance.overtime_approve',       'Approve overtime requests',               'attendance'),

  -- My Hub
  ('hub.access',                        'Access My Hub',                           'hub'),
  ('hub.materials_inbox',               'View material requests inbox',            'hub'),
  ('hub.materials_merge_send',          'Merge and send material requests',        'hub'),
  ('hub.attendance_approval',           'Approve attendance from My Hub',          'hub'),

  -- Material Requests
  ('materials.request_submit',          'Submit material requests',                'materials'),
  ('materials.request_view_own',        'View own material requests',              'materials'),
  ('materials.request_view_all',        'View all material requests',              'materials'),
  ('materials.request_view_own_trade',  'View material requests in own trade',     'materials'),
  ('materials.catalog_view',            'View material catalog (autocomplete)',     'materials'),
  ('materials.surplus_view',            'View surplus materials',                  'materials'),
  ('materials.surplus_declare',         'Declare surplus materials',               'materials'),

  -- Purchase Orders
  ('purchase_orders.view',              'View purchase orders',                    'purchase_orders'),
  ('purchase_orders.view_own_trade',    'View purchase orders in own trade',       'purchase_orders'),
  ('purchase_orders.view_own',          'View own purchase orders only',           'purchase_orders'),
  ('purchase_orders.print',             'Print / export purchase order PDF',       'purchase_orders'),

  -- Business Intelligence
  ('bi.access_full',                    'Access BI — all trades',                  'bi'),
  ('bi.access_own_trade',               'Access BI — own trade only',              'bi'),
  ('bi.workforce_planner',              'Access workforce planner',                'bi'),

  -- Settings
  ('settings.system',                   'Access system settings',                  'settings'),
  ('settings.company',                  'Access company settings',                 'settings'),
  ('settings.user_management',          'Manage users and roles',                  'settings'),
  ('settings.permissions',              'Manage role permissions matrix',          'settings'),

  -- Audit
  ('audit.view',                        'View audit logs',                         'audit')

ON CONFLICT (code) DO NOTHING;

-- ── 7. Seed role_permissions ──────────────────────────────────

-- Helper: seed_role_perms(role, codes[])
DO $$
DECLARE
  r   TEXT;
  p   TEXT;
  codes TEXT[];
BEGIN

  -- SUPER_ADMIN: all permissions
  FOR p IN SELECT code FROM public.permissions LOOP
    INSERT INTO public.role_permissions (role, permission_code)
    VALUES ('SUPER_ADMIN', p)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- IT_ADMIN
  codes := ARRAY[
    'dashboard.view',
    'settings.system', 'settings.company', 'settings.user_management', 'settings.permissions',
    'audit.view',
    'employees.view', 'employees.create', 'employees.edit', 'employees.delete', 'employees.invite'
  ];
  FOREACH p IN ARRAY codes LOOP
    INSERT INTO public.role_permissions (role, permission_code) VALUES ('IT_ADMIN', p) ON CONFLICT DO NOTHING;
  END LOOP;

  -- COMPANY_ADMIN
  codes := ARRAY[
    'dashboard.view',
    'employees.view', 'employees.create', 'employees.edit', 'employees.delete', 'employees.invite',
    'projects.view', 'projects.create', 'projects.edit', 'projects.delete',
    'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
    'assignments.view',
    'attendance.view',
    'materials.request_view_all', 'materials.catalog_view', 'materials.surplus_view',
    'purchase_orders.view', 'purchase_orders.print',
    'bi.access_full', 'bi.access_own_trade', 'bi.workforce_planner',
    'settings.company', 'settings.user_management',
    'audit.view'
  ];
  FOREACH p IN ARRAY codes LOOP
    INSERT INTO public.role_permissions (role, permission_code) VALUES ('COMPANY_ADMIN', p) ON CONFLICT DO NOTHING;
  END LOOP;

  -- TRADE_PROJECT_MANAGER
  codes := ARRAY[
    'dashboard.view',
    'employees.view_own_trade',
    'projects.view_own_trade',
    'suppliers.view',
    'assignments.view_own_trade',
    'attendance.view_own_trade',
    'materials.request_view_own_trade', 'materials.catalog_view', 'materials.surplus_view',
    'purchase_orders.view_own_trade', 'purchase_orders.print',
    'bi.access_own_trade', 'bi.workforce_planner'
  ];
  FOREACH p IN ARRAY codes LOOP
    INSERT INTO public.role_permissions (role, permission_code) VALUES ('TRADE_PROJECT_MANAGER', p) ON CONFLICT DO NOTHING;
  END LOOP;

  -- TRADE_ADMIN
  codes := ARRAY[
    'dashboard.view',
    'employees.view_own_trade',
    'projects.view_own_trade',
    'suppliers.view',
    'assignments.view_own_trade', 'assignments.create', 'assignments.edit', 'assignments.delete', 'assignments.smart_assign',
    'attendance.view_own_trade', 'attendance.checkin', 'attendance.approve', 'attendance.overtime_approve',
    'hub.access', 'hub.materials_inbox', 'hub.materials_merge_send', 'hub.attendance_approval',
    'materials.request_submit', 'materials.request_view_own', 'materials.request_view_own_trade',
    'materials.catalog_view', 'materials.surplus_view', 'materials.surplus_declare',
    'purchase_orders.view_own_trade', 'purchase_orders.print'
  ];
  FOREACH p IN ARRAY codes LOOP
    INSERT INTO public.role_permissions (role, permission_code) VALUES ('TRADE_ADMIN', p) ON CONFLICT DO NOTHING;
  END LOOP;

  -- WORKER
  codes := ARRAY[
    'dashboard.view',
    'attendance.view_self', 'attendance.checkin',
    'materials.request_submit', 'materials.request_view_own', 'materials.catalog_view',
    'purchase_orders.view_own'
  ];
  FOREACH p IN ARRAY codes LOOP
    INSERT INTO public.role_permissions (role, permission_code) VALUES ('WORKER', p) ON CONFLICT DO NOTHING;
  END LOOP;

END $$;

COMMIT;
