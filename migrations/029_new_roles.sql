-- ================================================================
-- Migration 029: Add New Roles (FOREMAN, JOURNEYMAN, APPRENTICE 1-4, DRIVER)
-- Run on: psql -U mepuser -d mepdb -h localhost
-- ================================================================

-- ── 1. Update role constraint on app_users ────────────────────
ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS chk_au_role;

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check CHECK (
    role IN (
      'SUPER_ADMIN',
      'IT_ADMIN',
      'COMPANY_ADMIN',
      'TRADE_PROJECT_MANAGER',
      'TRADE_ADMIN',
      'FOREMAN',
      'JOURNEYMAN',
      'APPRENTICE_1',
      'APPRENTICE_2',
      'APPRENTICE_3',
      'APPRENTICE_4',
      'WORKER',
      'DRIVER'
    )
  );

-- ── 2. Add FOREMAN permissions ────────────────────────────────
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('FOREMAN', 'attendance.checkin'),
  ('FOREMAN', 'attendance.view_self'),
  ('FOREMAN', 'attendance.view'),
  ('FOREMAN', 'dashboard.view'),
  ('FOREMAN', 'hub.receive_tasks'),
  ('FOREMAN', 'hub.send_tasks'),
  ('FOREMAN', 'materials.catalog_view'),
  ('FOREMAN', 'materials.request_submit'),
  ('FOREMAN', 'materials.request_view_own'),
  ('FOREMAN', 'materials.request_view_team'),
  ('FOREMAN', 'purchase_orders.view_own'),
  ('FOREMAN', 'reports.view'),
  ('FOREMAN', 'reports.view_self'),
  ('FOREMAN', 'reports.view_team'),
  ('FOREMAN', 'tasks.view'),
  ('FOREMAN', 'tasks.assign'),
  ('FOREMAN', 'assignments.view'),
  ('FOREMAN', 'assignments.request')
ON CONFLICT DO NOTHING;

-- ── 3. Add JOURNEYMAN permissions (same as WORKER) ────────────
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('JOURNEYMAN', 'attendance.checkin'),
  ('JOURNEYMAN', 'attendance.view_self'),
  ('JOURNEYMAN', 'dashboard.view'),
  ('JOURNEYMAN', 'hub.receive_tasks'),
  ('JOURNEYMAN', 'materials.catalog_view'),
  ('JOURNEYMAN', 'materials.request_submit'),
  ('JOURNEYMAN', 'materials.request_view_own'),
  ('JOURNEYMAN', 'purchase_orders.view_own'),
  ('JOURNEYMAN', 'reports.view'),
  ('JOURNEYMAN', 'reports.view_self'),
  ('JOURNEYMAN', 'tasks.view')
ON CONFLICT DO NOTHING;

-- ── 4. Add APPRENTICE_1 permissions ───────────────────────────
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('APPRENTICE_1', 'attendance.checkin'),
  ('APPRENTICE_1', 'attendance.view_self'),
  ('APPRENTICE_1', 'dashboard.view'),
  ('APPRENTICE_1', 'hub.receive_tasks'),
  ('APPRENTICE_1', 'materials.catalog_view'),
  ('APPRENTICE_1', 'reports.view_self'),
  ('APPRENTICE_1', 'tasks.view')
ON CONFLICT DO NOTHING;

-- ── 5. Add APPRENTICE_2 permissions ───────────────────────────
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('APPRENTICE_2', 'attendance.checkin'),
  ('APPRENTICE_2', 'attendance.view_self'),
  ('APPRENTICE_2', 'dashboard.view'),
  ('APPRENTICE_2', 'hub.receive_tasks'),
  ('APPRENTICE_2', 'materials.catalog_view'),
  ('APPRENTICE_2', 'reports.view_self'),
  ('APPRENTICE_2', 'tasks.view')
ON CONFLICT DO NOTHING;

-- ── 6. Add APPRENTICE_3 permissions ───────────────────────────
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('APPRENTICE_3', 'attendance.checkin'),
  ('APPRENTICE_3', 'attendance.view_self'),
  ('APPRENTICE_3', 'dashboard.view'),
  ('APPRENTICE_3', 'hub.receive_tasks'),
  ('APPRENTICE_3', 'materials.catalog_view'),
  ('APPRENTICE_3', 'materials.request_submit'),
  ('APPRENTICE_3', 'materials.request_view_own'),
  ('APPRENTICE_3', 'reports.view_self'),
  ('APPRENTICE_3', 'tasks.view')
ON CONFLICT DO NOTHING;

-- ── 7. Add APPRENTICE_4 permissions ───────────────────────────
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('APPRENTICE_4', 'attendance.checkin'),
  ('APPRENTICE_4', 'attendance.view_self'),
  ('APPRENTICE_4', 'dashboard.view'),
  ('APPRENTICE_4', 'hub.receive_tasks'),
  ('APPRENTICE_4', 'materials.catalog_view'),
  ('APPRENTICE_4', 'materials.request_submit'),
  ('APPRENTICE_4', 'materials.request_view_own'),
  ('APPRENTICE_4', 'purchase_orders.view_own'),
  ('APPRENTICE_4', 'reports.view_self'),
  ('APPRENTICE_4', 'tasks.view')
ON CONFLICT DO NOTHING;

-- ── 8. Add DRIVER permissions ─────────────────────────────────
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('DRIVER', 'attendance.checkin'),
  ('DRIVER', 'attendance.view_self'),
  ('DRIVER', 'dashboard.view'),
  ('DRIVER', 'hub.receive_tasks'),
  ('DRIVER', 'reports.view_self'),
  ('DRIVER', 'tasks.view')
ON CONFLICT DO NOTHING;

-- ── Done ──────────────────────────────────────────────────────
-- New roles added:
--   FOREMAN, JOURNEYMAN, APPRENTICE_1, APPRENTICE_2,
--   APPRENTICE_3, APPRENTICE_4, DRIVER
