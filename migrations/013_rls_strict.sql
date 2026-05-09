-- ============================================================================
-- 013_rls_strict.sql
--
-- Phase 4 Stage 3: tighten the 20 tenant-scoped RLS policies installed by
-- migration 012 from PERMISSIVE to STRICT. Drops the "GUC unset = bypass"
-- clause so any forgotten `SET LOCAL app.company_id` fails closed (zero
-- rows for SELECTs / blocked write).
--
-- See DECISIONS.md Section 89-E/3 for the full design + rollout plan.
-- This migration is the final piece of Phase 4c (after 89-D made
-- middleware/permissions.js#can() use req.db, and 89-E/1 + 89-E/2 moved
-- the fire-and-forget helpers — notifyAssignment, calcDistanceKm,
-- audit, logAudit — onto req.db).
--
-- ──────────────────────────────────────────────────────────────────────
-- BEFORE (Stage 1, migration 012):
--
--   CREATE POLICY tenant_isolation ON public.<table>
--     USING (
--       NULLIF(current_setting('app.company_id', true), '') IS NULL
--       OR company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
--     );
--
-- AFTER (Stage 3, this migration):
--
--   CREATE POLICY tenant_isolation ON public.<table>
--     USING (
--       company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
--     );
--
-- The cast `NULL::bigint = company_id` evaluates to NULL → row excluded.
-- So if the GUC is unset (e.g. a query through the global pool with no
-- tenantDb), every row is filtered out — fail-closed by design.
--
-- ──────────────────────────────────────────────────────────────────────
-- audit_logs is the one exception:
--
-- `routes/auth.js` calls `audit(pool, req, …)` from the login / logout /
-- PIN-change handlers. Those routes run pre-tenant — they're the moment a
-- tenant context is established, so they can't mount tenantDb. Under
-- strict mode the audit_logs INSERT from pool would be blocked.
--
-- We split the audit_logs policy into:
--   - tenant_isolation_read   FOR SELECT  with strict USING
--   - tenant_isolation_write  FOR INSERT  permissive (WITH CHECK true)
--
-- audit_logs is append-only by trigger (UPDATE/DELETE blocked at the
-- table level), so we don't need policies for those commands.
--
-- Result for audit_logs:
--   - pool reads (no GUC) → 0 rows (tenant_isolation_read filters)
--   - pool inserts (no GUC) → allowed (tenant_isolation_write WITH CHECK true)
--   - tenantDb reads → only own tenant's rows (tenant_isolation_read)
--   - tenantDb inserts → allowed
--
-- ──────────────────────────────────────────────────────────────────────
-- Rollback: migrations/013_rls_strict.rollback.sql restores the Stage 1
-- permissive policy on all 20 tables.
--
-- This migration is wrapped in a single transaction.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Tighten 19 tenant-scoped policies (every table from 012 EXCEPT audit_logs)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  -- 19 tables. Every table from migration 012 except audit_logs.
  -- audit_logs needs the FOR INSERT exception (handled in section 2 below).
  strict_tables text[] := ARRAY[
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
  FOREACH t IN ARRAY strict_tables LOOP
    -- Drop the existing permissive policy. RLS itself stays enabled +
    -- forced (from 012); only the policy expression changes.
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);

    -- Strict policy: GUC must be set AND match the row's company_id.
    -- Any forgotten SET LOCAL fails closed (zero rows).
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation ON public.%I
        USING (
          company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
        )
        WITH CHECK (
          company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
        )
    $pol$, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. audit_logs: strict reads + permissive inserts
--
-- See file header for rationale. auth.js's pre-tenant audit writes use
-- the global pool and so have no GUC — the permissive WITH CHECK lets
-- them through. SELECT remains strict so cross-tenant audit reads are
-- impossible even if a route forgets tenantDb.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS tenant_isolation ON public.audit_logs;
DROP POLICY IF EXISTS tenant_isolation_read ON public.audit_logs;
DROP POLICY IF EXISTS tenant_isolation_write ON public.audit_logs;

CREATE POLICY tenant_isolation_read ON public.audit_logs
  FOR SELECT
  USING (
    company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
  );

CREATE POLICY tenant_isolation_write ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 3. Sanity check — every targeted table must end up with the expected
--    policy shape. Roll back the whole migration if anything is off.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  expected_strict_count int := 19;       -- non-audit_logs tables
  expected_audit_policies int := 2;      -- read + write on audit_logs
  strict_count int;
  audit_policy_count int;
BEGIN
  -- 19 tables must have exactly one tenant_isolation policy with the
  -- new strict expression. We can't introspect the policy expression
  -- portably, so we just assert the policy exists.
  SELECT COUNT(*)
    INTO strict_count
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND p.polname = 'tenant_isolation'
     AND c.relname IN (
       'app_users', 'assignment_requests', 'attendance_records', 'clients',
       'daily_dispatch_runs', 'employee_daily_dispatch_state', 'employees',
       'material_catalog', 'material_requests', 'material_returns',
       'project_foremen', 'project_trades', 'projects', 'purchase_orders',
       'standup_sessions', 'suppliers', 'task_messages', 'user_invites',
       'companies'
     );

  IF strict_count <> expected_strict_count THEN
    RAISE EXCEPTION
      'Migration 013 abort: expected tenant_isolation policy on % strict tables, found %',
      expected_strict_count, strict_count;
  END IF;

  -- audit_logs must have exactly 2 policies (read + write).
  SELECT COUNT(*)
    INTO audit_policy_count
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'audit_logs'
     AND p.polname IN ('tenant_isolation_read', 'tenant_isolation_write');

  IF audit_policy_count <> expected_audit_policies THEN
    RAISE EXCEPTION
      'Migration 013 abort: expected % policies on audit_logs (read + write), found %',
      expected_audit_policies, audit_policy_count;
  END IF;

  -- Belt-and-suspenders: the old single tenant_isolation policy must
  -- NOT exist on audit_logs anymore.
  IF EXISTS (
    SELECT 1
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'audit_logs'
       AND p.polname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION
      'Migration 013 abort: old tenant_isolation policy still present on audit_logs';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration manual verification (run after COMMIT to confirm)
-- ============================================================================
--
-- -- 1. Confirm 19 tenant_isolation policies (strict tables):
-- SELECT c.relname, p.polname
--   FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public'
--    AND p.polname = 'tenant_isolation'
--  ORDER BY c.relname;
--
-- -- 2. Confirm audit_logs has read + write policies (NOT tenant_isolation):
-- SELECT polname FROM pg_policy p
--   JOIN pg_class c ON c.oid = p.polrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relname = 'audit_logs'
--  ORDER BY polname;
-- -- Expected: tenant_isolation_read, tenant_isolation_write
--
-- -- 3. Confirm strict mode actually rejects (GUC unset, expect 0 rows):
-- SET LOCAL ROLE mepuser;  -- Make sure RLS applies (postgres role bypasses)
-- SELECT COUNT(*) FROM public.employees;  -- expect 0
-- RESET ROLE;
--
-- -- 4. Confirm strict mode allows when GUC matches:
-- BEGIN;
-- SET LOCAL ROLE mepuser;
-- SET LOCAL app.company_id = '<some-company-id>';
-- SELECT COUNT(*) FROM public.employees;  -- expect that company's count
-- ROLLBACK;
--
-- -- 5. Confirm audit_logs INSERT works without GUC (auth.js path):
-- SET LOCAL ROLE mepuser;
-- INSERT INTO public.audit_logs
--   (company_id, action, entity_type, created_at)
--   VALUES (1, 'TEST', 'test', NOW());
-- RESET ROLE;
-- DELETE FROM public.audit_logs WHERE action = 'TEST';
