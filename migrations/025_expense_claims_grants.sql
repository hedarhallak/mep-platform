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
-- RLS note: tenant_isolation (from 015) still applies to mepuser;
-- mepuser_super has BYPASSRLS. GRANTs and RLS are independent layers.
-- ============================================================================

BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claims TO mepuser, mepuser_super;
GRANT USAGE, SELECT ON SEQUENCE public.expense_claims_id_seq TO mepuser, mepuser_super;

-- Sanity check: both roles must end up with the 4 table privileges.
DO $$
DECLARE
  n int;
BEGIN
  SELECT COUNT(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'expense_claims'
     AND grantee IN ('mepuser', 'mepuser_super')
     AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  IF n <> 8 THEN
    RAISE EXCEPTION 'Migration 025 abort: expected 8 expense_claims grants, found %', n;
  END IF;
END $$;

COMMIT;
