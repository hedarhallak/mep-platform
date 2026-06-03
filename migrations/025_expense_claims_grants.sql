-- ============================================================================
-- 025_expense_claims_grants.sql
--
-- Section 129.7 — Pitfall #49 retrofit for expense_claims.
--
-- Migration 015 created public.expense_claims BEFORE the GRANTs
-- convention (in-migration GRANTs + migration 020's ALTER DEFAULT
-- PRIVILEGES). The table is owned by postgres with ZERO privileges for
-- the app roles, so the first real use (Section 129 Expenses page)
-- failed with: 42501 permission denied for table expense_claims.
--
-- CI never caught it because the test DB role is postgres (Pitfall #14).
--
-- Role-existence convention (matches migration 020): mepuser exists in
-- every environment (incl. the CI drift DB); mepuser_super only exists
-- on prod, so its grants are wrapped in a DO block that skips silently.
--
-- RLS note: tenant_isolation (from 015) still applies to mepuser;
-- mepuser_super has BYPASSRLS. GRANTs and RLS are independent layers.
-- ============================================================================

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claims TO mepuser;
GRANT USAGE, SELECT ON SEQUENCE public.expense_claims_id_seq TO mepuser;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mepuser_super') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claims TO mepuser_super;
    GRANT USAGE, SELECT ON SEQUENCE public.expense_claims_id_seq TO mepuser_super;
  END IF;
END $$;

-- Sanity check: 4 table privileges per present role.
DO $$
DECLARE
  has_super BOOLEAN;
  expected  INTEGER;
  n         INTEGER;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mepuser_super') INTO has_super;
  expected := CASE WHEN has_super THEN 8 ELSE 4 END;

  SELECT COUNT(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'expense_claims'
     AND grantee IN ('mepuser', 'mepuser_super')
     AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');

  IF n < expected THEN
    RAISE EXCEPTION 'Migration 025 abort: expected % expense_claims grants, found %', expected, n;
  END IF;

  RAISE NOTICE 'Migration 025 OK: % GRANT rows confirmed on expense_claims', n;
END $$;

COMMIT;
