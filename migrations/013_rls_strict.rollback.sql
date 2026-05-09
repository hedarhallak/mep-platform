-- ============================================================================
-- 013_rls_strict.rollback.sql
--
-- Rollback for migration 013 (Phase 4 Stage 3 strict RLS flip). Restores
-- the Stage 1 permissive policy shape from migration 012:
--
--   USING (
--     NULLIF(current_setting('app.company_id', true), '') IS NULL
--     OR company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
--   )
--
-- All 20 tables go back to a single `tenant_isolation` policy with the
-- GUC-unset bypass clause. The audit_logs split (read/write policies)
-- is undone — a single permissive policy replaces both.
--
-- This rollback is wrapped in a single transaction.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Restore permissive tenant_isolation on the 19 strict tables.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  rollback_tables text[] := ARRAY[
    'app_users',
    'assignment_requests',
    'attendance_records',
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
  FOREACH t IN ARRAY rollback_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation ON public.%I
        USING (
          NULLIF(current_setting('app.company_id', true), '') IS NULL
          OR company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
        )
    $pol$, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Collapse audit_logs back into a single permissive policy.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS tenant_isolation_read ON public.audit_logs;
DROP POLICY IF EXISTS tenant_isolation_write ON public.audit_logs;
DROP POLICY IF EXISTS tenant_isolation ON public.audit_logs;

CREATE POLICY tenant_isolation ON public.audit_logs
  USING (
    NULLIF(current_setting('app.company_id', true), '') IS NULL
    OR company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
  );

-- ----------------------------------------------------------------------------
-- 3. Sanity check.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  expected_count int := 20;
  policy_count int;
BEGIN
  SELECT COUNT(*)
    INTO policy_count
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND p.polname = 'tenant_isolation'
     AND c.relname IN (
       'app_users', 'assignment_requests', 'attendance_records', 'audit_logs',
       'clients', 'daily_dispatch_runs', 'employee_daily_dispatch_state',
       'employees', 'material_catalog', 'material_requests', 'material_returns',
       'project_foremen', 'project_trades', 'projects', 'purchase_orders',
       'standup_sessions', 'suppliers', 'task_messages', 'user_invites',
       'companies'
     );

  IF policy_count <> expected_count THEN
    RAISE EXCEPTION
      'Rollback 013 abort: expected tenant_isolation policy on % tables, found %',
      expected_count, policy_count;
  END IF;
END $$;

COMMIT;
