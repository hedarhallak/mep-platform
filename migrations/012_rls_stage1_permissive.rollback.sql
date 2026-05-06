-- ============================================================================
-- 012_rls_stage1_permissive.rollback.sql
--
-- Rollback for migration 012 (Phase 4 Stage 1 RLS).
--
-- Reverses the migration by:
--   1. DROPping the tenant_isolation policy on each of the 20 tables.
--   2. ALTER TABLE ... NO FORCE ROW LEVEL SECURITY (turn off forced binding).
--   3. ALTER TABLE ... DISABLE ROW LEVEL SECURITY (turn off RLS entirely).
--
-- Run only if 012 needs to be backed out (e.g., a regression discovered
-- post-deploy). After this rollback runs, all 20 tables behave as before:
-- no RLS, no policy, queries unchanged.
--
-- This file is wrapped in a single transaction.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'app_users',
    'assignment_requests',
    'attendance_records',
    'audit_logs',
    'clients',
    'daily_dispatch_runs',
    'employee_daily_dispatch_state',
    'employees',
    'material_catalog',
    'material_requests',
    'material_returns',
    'project_foremen',
    'project_trades',
    'projects',
    'purchase_orders',
    'standup_sessions',
    'suppliers',
    'task_messages',
    'user_invites',
    'companies'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Sanity check: confirm no policy named tenant_isolation remains.
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*)
    INTO remaining
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND p.polname = 'tenant_isolation';

  IF remaining <> 0 THEN
    RAISE EXCEPTION
      'Rollback 012 abort: % tenant_isolation policies still present',
      remaining;
  END IF;
END $$;

COMMIT;
