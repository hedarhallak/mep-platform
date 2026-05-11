-- Section 88 — Phase 4: PostgreSQL Row-Level Security (Stage 1: permissive)
--
-- Goal: enable RLS on all tenant-scoped tables so the database itself rejects
-- cross-tenant reads/writes, even if backend code forgets a WHERE company_id.
--
-- Stage 1 (this migration) is PERMISSIVE: every policy includes an
-- "allow-when-unset" clause. If the request did NOT execute
-- "SET LOCAL app.company_id = $1" (i.e. legacy routes still using pool.query
-- without the new tenant middleware), the policy allows the row. This lets
-- production stay live while the backend migrates routes one batch at a time
-- to use req.db (the tenant-bound client).
--
-- Stage 2 (migration 013, ships AFTER all routes migrated) will remove the
-- allow-when-unset clauses and require app.company_id to always be set.
--
-- SUPER_ADMIN bypass is handled OUTSIDE this migration via a separate DB role
-- "mepuser_super" with the BYPASSRLS attribute (see
-- scripts/postgres/setup_rls_roles.sql, which is run once by the postgres
-- superuser, not via the migration pipeline).
--
-- Why FORCE ROW LEVEL SECURITY: by default Postgres exempts the table owner
-- (mepuser) from RLS even when ENABLE ROW LEVEL SECURITY is set. FORCE makes
-- the owner subject to RLS too, which is what we want — the only legitimate
-- bypass is via the dedicated mepuser_super role.
--
-- Tables in scope:
--   Direct company_id column (19 tables) — direct comparison policies:
--     app_users, assignment_requests, attendance_records, audit_logs,
--     clients, daily_dispatch_runs, employee_daily_dispatch_state, employees,
--     material_catalog, material_requests, material_returns, project_foremen,
--     project_trades, projects, purchase_orders, standup_sessions, suppliers,
--     task_messages, user_invites
--
--   Companies table (the tenant table itself) — special: PK is company_id,
--     so the policy compares to the PK directly.
--
--   Child tables (no direct company_id) — policies via parent join:
--     employee_profiles      (join: employees on employee_id)
--     material_request_items (join: material_requests on request_id)
--     material_return_items  (join: material_returns on return_id)
--     push_tokens            (join: app_users on user_id)
--     refresh_tokens         (join: app_users on user_id)
--     task_recipients        (join: task_messages on message_id)
--     user_permissions       (join: app_users on user_id)
--
--   Global lookup tables (NO RLS — readable by everyone, no tenant scope):
--     ccq_travel_rates, permissions, role_permissions, roles,
--     project_statuses, trade_types
--
-- Policy pattern (direct):
--   USING (
--     current_setting('app.company_id', true) IS NULL
--     OR current_setting('app.company_id', true) = ''
--     OR company_id = current_setting('app.company_id', true)::bigint
--   )
--
-- Policy pattern (child via parent join):
--   USING (
--     current_setting('app.company_id', true) IS NULL
--     OR current_setting('app.company_id', true) = ''
--     OR EXISTS (
--          SELECT 1 FROM <parent> p
--           WHERE p.<pk> = <child>.<fk>
--             AND p.company_id = current_setting('app.company_id', true)::bigint
--        )
--   )
--
-- The third argument "true" to current_setting() means "missing_ok=true" —
-- returns NULL instead of raising if the GUC is not set. This is what makes
-- Stage 1 permissive.
--
-- Rollback: this migration is wrapped in a transaction. If any policy fails
-- to install, all RLS is rolled back. To rollback after commit:
--   ALTER TABLE <each table> DISABLE ROW LEVEL SECURITY, NO FORCE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS rls_tenant_isolation ON <each table>;

BEGIN;

-- ============================================================================
-- Helper: drop+recreate pattern wrapped in DO blocks for idempotency.
-- We name every policy "rls_tenant_isolation" for consistency.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Companies table (special: tenant table itself, PK is company_id)
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON public.companies;
CREATE POLICY rls_tenant_isolation ON public.companies
  USING (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR company_id = current_setting('app.company_id', true)::bigint
  )
  WITH CHECK (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR company_id = current_setting('app.company_id', true)::bigint
  );

-- ----------------------------------------------------------------------------
-- 2. Direct company_id tables (19 tables) — same policy on all
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
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
    'user_invites'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY rls_tenant_isolation ON public.%I
        USING (
          current_setting('app.company_id', true) IS NULL
          OR current_setting('app.company_id', true) = ''
          OR company_id = current_setting('app.company_id', true)::bigint
        )
        WITH CHECK (
          current_setting('app.company_id', true) IS NULL
          OR current_setting('app.company_id', true) = ''
          OR company_id = current_setting('app.company_id', true)::bigint
        )
    $f$, t);
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3. Child tables — policies via parent join
-- ----------------------------------------------------------------------------

-- 3a. employee_profiles (PK = employee_id, joins to employees)
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON public.employee_profiles;
CREATE POLICY rls_tenant_isolation ON public.employee_profiles
  USING (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = employee_profiles.employee_id
         AND e.company_id = current_setting('app.company_id', true)::bigint
    )
  )
  WITH CHECK (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = employee_profiles.employee_id
         AND e.company_id = current_setting('app.company_id', true)::bigint
    )
  );

-- 3b. material_request_items (request_id → material_requests.id)
ALTER TABLE public.material_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_request_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON public.material_request_items;
CREATE POLICY rls_tenant_isolation ON public.material_request_items
  USING (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.material_requests mr
       WHERE mr.id = material_request_items.request_id
         AND mr.company_id = current_setting('app.company_id', true)::bigint
    )
  )
  WITH CHECK (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.material_requests mr
       WHERE mr.id = material_request_items.request_id
         AND mr.company_id = current_setting('app.company_id', true)::bigint
    )
  );

-- 3c. material_return_items (return_id → material_returns.id)
ALTER TABLE public.material_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_return_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON public.material_return_items;
CREATE POLICY rls_tenant_isolation ON public.material_return_items
  USING (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.material_returns mret
       WHERE mret.id = material_return_items.return_id
         AND mret.company_id = current_setting('app.company_id', true)::bigint
    )
  )
  WITH CHECK (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.material_returns mret
       WHERE mret.id = material_return_items.return_id
         AND mret.company_id = current_setting('app.company_id', true)::bigint
    )
  );

-- 3d. push_tokens (user_id → app_users.id)
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON public.push_tokens;
CREATE POLICY rls_tenant_isolation ON public.push_tokens
  USING (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.app_users u
       WHERE u.id = push_tokens.user_id
         AND u.company_id = current_setting('app.company_id', true)::bigint
    )
  )
  WITH CHECK (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.app_users u
       WHERE u.id = push_tokens.user_id
         AND u.company_id = current_setting('app.company_id', true)::bigint
    )
  );

-- 3e. refresh_tokens (user_id → app_users.id)
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON public.refresh_tokens;
CREATE POLICY rls_tenant_isolation ON public.refresh_tokens
  USING (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.app_users u
       WHERE u.id = refresh_tokens.user_id
         AND u.company_id = current_setting('app.company_id', true)::bigint
    )
  )
  WITH CHECK (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.app_users u
       WHERE u.id = refresh_tokens.user_id
         AND u.company_id = current_setting('app.company_id', true)::bigint
    )
  );

-- 3f. task_recipients (message_id → task_messages.id)
ALTER TABLE public.task_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_recipients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON public.task_recipients;
CREATE POLICY rls_tenant_isolation ON public.task_recipients
  USING (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.task_messages tm
       WHERE tm.id = task_recipients.message_id
         AND tm.company_id = current_setting('app.company_id', true)::bigint
    )
  )
  WITH CHECK (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.task_messages tm
       WHERE tm.id = task_recipients.message_id
         AND tm.company_id = current_setting('app.company_id', true)::bigint
    )
  );

-- 3g. user_permissions (user_id → app_users.id)
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON public.user_permissions;
CREATE POLICY rls_tenant_isolation ON public.user_permissions
  USING (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.app_users u
       WHERE u.id = user_permissions.user_id
         AND u.company_id = current_setting('app.company_id', true)::bigint
    )
  )
  WITH CHECK (
    current_setting('app.company_id', true) IS NULL
    OR current_setting('app.company_id', true) = ''
    OR EXISTS (
      SELECT 1 FROM public.app_users u
       WHERE u.id = user_permissions.user_id
         AND u.company_id = current_setting('app.company_id', true)::bigint
    )
  );

-- ============================================================================
-- Verification block — runs inside the same transaction. If RLS isn't on every
-- table we expected, abort.
-- ============================================================================
DO $$
DECLARE
  expected_tables text[] := ARRAY[
    'app_users', 'assignment_requests', 'attendance_records', 'audit_logs',
    'clients', 'companies', 'daily_dispatch_runs',
    'employee_daily_dispatch_state', 'employee_profiles', 'employees',
    'material_catalog', 'material_request_items', 'material_requests',
    'material_return_items', 'material_returns', 'project_foremen',
    'project_trades', 'projects', 'purchase_orders', 'push_tokens',
    'refresh_tokens', 'standup_sessions', 'suppliers', 'task_messages',
    'task_recipients', 'user_invites', 'user_permissions'
  ];
  t text;
  rls_enabled boolean;
  rls_forced boolean;
  policy_count int;
BEGIN
  FOREACH t IN ARRAY expected_tables LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity
      INTO rls_enabled, rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t;

    IF NOT rls_enabled THEN
      RAISE EXCEPTION 'Migration 012 abort: RLS not enabled on public.%', t;
    END IF;
    IF NOT rls_forced THEN
      RAISE EXCEPTION 'Migration 012 abort: FORCE RLS not set on public.%', t;
    END IF;

    SELECT COUNT(*)
      INTO policy_count
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t
       AND policyname = 'rls_tenant_isolation';

    IF policy_count <> 1 THEN
      RAISE EXCEPTION 'Migration 012 abort: rls_tenant_isolation policy missing on public.% (found % policies)', t, policy_count;
    END IF;
  END LOOP;
END$$;

COMMIT;

-- ============================================================================
-- Post-migration manual verification (run as mepuser after this migration):
-- ============================================================================
-- -- Should show "t" (true) for every relevant table:
-- SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND relkind = 'r'
--    AND relname IN (
--      'app_users','assignment_requests','attendance_records','audit_logs',
--      'clients','companies','daily_dispatch_runs',
--      'employee_daily_dispatch_state','employee_profiles','employees',
--      'material_catalog','material_request_items','material_requests',
--      'material_return_items','material_returns','project_foremen',
--      'project_trades','projects','purchase_orders','push_tokens',
--      'refresh_tokens','standup_sessions','suppliers','task_messages',
--      'task_recipients','user_invites','user_permissions'
--    )
--  ORDER BY relname;
--
-- -- Should show one rls_tenant_isolation policy per table:
-- SELECT schemaname, tablename, policyname FROM pg_policies
--  WHERE schemaname = 'public' ORDER BY tablename;
--
-- -- Sanity: with no app.company_id set, all rows visible (permissive mode)
-- SET app.company_id = '';
-- SELECT COUNT(*) FROM public.employees;
--   -- expect: total employee count across all tenants
--
-- -- Sanity: with app.company_id=5, only company 5's rows visible
-- SET app.company_id = '5';
-- SELECT COUNT(*) FROM public.employees;
--   -- expect: only company 5's employees
-- RESET app.company_id;
