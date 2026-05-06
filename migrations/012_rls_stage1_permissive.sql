-- ============================================================================
-- 012_rls_stage1_permissive.sql
--
-- Phase 4 Stage 1: Enable PostgreSQL Row-Level Security with PERMISSIVE
-- policies on all 20 tenant-scoped tables. This is the database-layer
-- defense-in-depth foundation for multi-tenant isolation.
--
-- See DECISIONS.md Section 88 for the full design rationale. Summary:
--
--   Stage 1 (this migration):
--     - ENABLE + FORCE ROW LEVEL SECURITY on 20 tables.
--     - Single policy `tenant_isolation` on every table:
--         USING (
--           NULLIF(current_setting('app.company_id', true), '') IS NULL
--           OR company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
--         )
--     - The first clause (GUC unset = bypass) keeps existing routes working
--       without backend changes. Stage 3 will drop this clause.
--     - FORCE ROW LEVEL SECURITY is critical: without it, the table owner
--       (mepuser) bypasses RLS by default, defeating the defense.
--
--   Stage 2 (separate PRs, ~1 week):
--     - Add middleware/db_context.js exposing req.db that calls
--       SET LOCAL app.company_id per authenticated request.
--     - Migrate routes batch by batch.
--     - Introduce mepuser_super role with BYPASSRLS for SUPER_ADMIN ops.
--
--   Stage 3 (single PR, ~1 day):
--     - migrations/013_rls_strict.sql drops the "GUC unset" bypass clause.
--     - Any forgotten SET LOCAL then fails closed.
--
-- Rollback: migrations/012_rls_stage1_permissive.rollback.sql.
-- This migration is wrapped in a single transaction.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Apply RLS uniformly to all 20 tenant-scoped tables.
--
--    A DO block with a FOREACH loop keeps the policy definition DRY across
--    all tables. Every table named below has a `company_id` column (the
--    `companies` table itself uses `company_id` as its primary key — also
--    valid for the policy expression).
--
--    Each iteration is idempotent: DROP POLICY IF EXISTS first, then
--    CREATE POLICY. Re-running this migration is safe.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  -- 20 tables. Order is documentational only (alphabetical, with companies
  -- last so the "tenant root" stands out). Add new tables here when they
  -- introduce a company_id column; remove when a table is dropped.
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
    -- Enable RLS on the table.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Force RLS to apply even to the table owner (mepuser). Without this,
    -- ENABLE ROW LEVEL SECURITY would be a no-op for backend traffic since
    -- mepuser is the owner of all these tables (they were created by it
    -- via prior migrations). FORCE makes the policy bind on the owner too.
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

    -- Drop any existing policy with this name so re-runs are clean.
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);

    -- Permissive policy:
    --   - GUC `app.company_id` unset OR empty -> bypass (Stage 1).
    --   - GUC set -> enforce row.company_id = GUC value.
    --
    -- NULLIF(current_setting('app.company_id', true), '') unifies the two
    -- "unset" representations PostgreSQL might return:
    --   - true NULL when missing_ok=true and the GUC was never declared
    --   - empty string '' when the GUC was declared then RESET
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
-- 2. Sanity check — every targeted table must now have:
--      - rowsecurity = true   (from ENABLE ROW LEVEL SECURITY)
--      - forcerowsecurity = true  (from FORCE ROW LEVEL SECURITY)
--      - exactly one policy named 'tenant_isolation'
--
--    If any check fails, the transaction rolls back so we don't ship a
--    half-applied state.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  expected_count int := 20;
  rls_count int;
  force_count int;
  policy_count int;
BEGIN
  SELECT COUNT(*)
    INTO rls_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN (
       'app_users', 'assignment_requests', 'attendance_records', 'audit_logs',
       'clients', 'daily_dispatch_runs', 'employee_daily_dispatch_state',
       'employees', 'material_catalog', 'material_requests', 'material_returns',
       'project_foremen', 'project_trades', 'projects', 'purchase_orders',
       'standup_sessions', 'suppliers', 'task_messages', 'user_invites',
       'companies'
     )
     AND c.relrowsecurity = true;

  IF rls_count <> expected_count THEN
    RAISE EXCEPTION
      'Migration 012 abort: expected ENABLE ROW LEVEL SECURITY on % tables, found %',
      expected_count, rls_count;
  END IF;

  SELECT COUNT(*)
    INTO force_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN (
       'app_users', 'assignment_requests', 'attendance_records', 'audit_logs',
       'clients', 'daily_dispatch_runs', 'employee_daily_dispatch_state',
       'employees', 'material_catalog', 'material_requests', 'material_returns',
       'project_foremen', 'project_trades', 'projects', 'purchase_orders',
       'standup_sessions', 'suppliers', 'task_messages', 'user_invites',
       'companies'
     )
     AND c.relforcerowsecurity = true;

  IF force_count <> expected_count THEN
    RAISE EXCEPTION
      'Migration 012 abort: expected FORCE ROW LEVEL SECURITY on % tables, found %',
      expected_count, force_count;
  END IF;

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
      'Migration 012 abort: expected tenant_isolation policy on % tables, found %',
      expected_count, policy_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration manual verification (run after COMMIT to confirm)
-- ============================================================================
--
-- -- 1. Confirm 20 rows, all with rowsecurity=t and forcerowsecurity=t:
-- SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public'
--    AND c.relkind = 'r'
--    AND c.relrowsecurity = true
--  ORDER BY c.relname;
--
-- -- 2. Confirm 20 tenant_isolation policies:
-- SELECT c.relname, p.polname
--   FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public'
--    AND p.polname = 'tenant_isolation'
--  ORDER BY c.relname;
--
-- -- 3. Confirm permissive bypass works (GUC unset, expect rows from all
-- --    companies — output should match pre-migration row count):
-- SELECT COUNT(*) FROM public.employees;
--
-- -- 4. Confirm strict mode works (GUC set, expect only that company's rows):
-- BEGIN;
-- SET LOCAL app.company_id = '5';
-- SELECT COUNT(*) FROM public.employees;  -- only company 5's employees
-- ROLLBACK;
--
-- -- 5. Confirm cross-tenant returns 0 (GUC set to non-existent company):
-- BEGIN;
-- SET LOCAL app.company_id = '999999';
-- SELECT COUNT(*) FROM public.employees;  -- expect 0
-- ROLLBACK;
