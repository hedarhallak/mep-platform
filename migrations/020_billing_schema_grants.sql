-- ============================================================================
-- 020_billing_schema_grants.sql
--
-- Phase 6-D-4 PR 3 / Section 117.5 (May 25, 2026) — permanent fix for
-- Pitfall #49: tables created via `sudo -u postgres psql` are owned by
-- the `postgres` superuser, and Postgres grants ZERO privileges to other
-- roles automatically. This caused a production outage on May 24 when
-- PR 2 refactored routes/super_admin.js to LEFT JOIN subscriptions —
-- the route errored with `permission denied for table subscriptions`
-- (Postgres code 42501) because mepuser had no grants on the 5 new
-- billing tables created by migration 018.
--
-- A hot-fix was applied to prod immediately (manual GRANT statements run
-- via `sudo -u postgres psql`). This migration:
--
--   1. PERMANENT GRANTS — codifies the hot-fix as a migration so any
--      future DB restore from backup OR clean re-deploy gets the same
--      grants. Idempotent: GRANT statements are safe to re-run on tables
--      that already have the grants (no error).
--
--   2. ALTER DEFAULT PRIVILEGES — cluster-wide setup so any FUTURE
--      tables created in the `public` schema by the `postgres` role
--      automatically inherit the same grants. This means PR 4/5 (and
--      every subsequent migration) won't trigger Pitfall #49 again,
--      provided the role that runs CREATE TABLE is `postgres`.
--
-- IMPORTANT — ALTER DEFAULT PRIVILEGES scope:
--   The privileges apply to tables created BY the specified role
--   (here: `postgres`). Since all our migrations run via
--   `sudo -u postgres psql`, the role is always `postgres`, so this
--   ALTER takes effect for every future migration's new tables.
--
--   It does NOT apply to existing tables (those need the explicit
--   GRANTs above). Hence both blocks are needed: explicit for existing,
--   ALTER DEFAULT for future.
--
-- Pitfall #49 reference: DECISIONS.md Section 117.5 + HANDOFF.md Pitfall #49.
-- Belt-and-suspenders convention: every NEW migration that creates a table
-- should ALSO include in-line GRANT statements for mepuser + mepuser_super
-- (so even if ALTER DEFAULT PRIVILEGES is somehow reverted, individual
-- migrations remain self-sufficient).
--
-- Rollback: 020_billing_schema_grants.rollback.sql REVOKEs the explicit
-- grants + reverts the ALTER DEFAULT PRIVILEGES. Note: rolling back would
-- re-break the application on prod, so only run rollback in lower envs.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- Part 1: Permanent GRANTs on the 5 billing tables (Pitfall #49 fix)
-- ──────────────────────────────────────────────────────────────────────────
-- Idempotent — re-running on prod (where hot-fix already applied) is a no-op.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions              TO mepuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_seat_changes  TO mepuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices                   TO mepuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments                   TO mepuser;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_rates                  TO mepuser;

GRANT USAGE, SELECT ON SEQUENCE public.subscriptions_id_seq                TO mepuser;
GRANT USAGE, SELECT ON SEQUENCE public.subscription_seat_changes_id_seq    TO mepuser;
GRANT USAGE, SELECT ON SEQUENCE public.invoices_id_seq                     TO mepuser;
GRANT USAGE, SELECT ON SEQUENCE public.payments_id_seq                     TO mepuser;
GRANT USAGE, SELECT ON SEQUENCE public.tax_rates_id_seq                    TO mepuser;

-- Belt-and-suspenders for mepuser_super (superuser-ish role for SUPER_ADMIN
-- routes that BYPASSRLS — see Section 90 / Pitfall #28). If the role doesn't
-- exist in this environment, the DO block skips silently.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mepuser_super') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions              TO mepuser_super;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_seat_changes  TO mepuser_super;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices                   TO mepuser_super;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments                   TO mepuser_super;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_rates                  TO mepuser_super;

    GRANT USAGE, SELECT ON SEQUENCE public.subscriptions_id_seq                TO mepuser_super;
    GRANT USAGE, SELECT ON SEQUENCE public.subscription_seat_changes_id_seq    TO mepuser_super;
    GRANT USAGE, SELECT ON SEQUENCE public.invoices_id_seq                     TO mepuser_super;
    GRANT USAGE, SELECT ON SEQUENCE public.payments_id_seq                     TO mepuser_super;
    GRANT USAGE, SELECT ON SEQUENCE public.tax_rates_id_seq                    TO mepuser_super;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Part 2: ALTER DEFAULT PRIVILEGES — future-proofing for new tables
-- ──────────────────────────────────────────────────────────────────────────
-- Applies to ALL future tables/sequences created in `public` schema by the
-- `postgres` role. Since every migration runs via `sudo -u postgres psql`,
-- this covers PR 4, PR 5, and every subsequent migration without each
-- needing its own grants.
--
-- These statements are also idempotent (re-running on a cluster where they
-- already exist produces no error, just re-confirms the entries).

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mepuser;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mepuser;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mepuser_super') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mepuser_super;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO mepuser_super;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Sanity check
-- ──────────────────────────────────────────────────────────────────────────
-- Verify the 5 billing tables now have the expected grant rows.
-- 5 tables × 4 privileges (SELECT/INSERT/UPDATE/DELETE) = 20 rows per role.
-- For 2 roles (mepuser + mepuser_super) = 40 expected. For 1 role only = 20.

DO $$
DECLARE
  grant_count INTEGER;
  has_super   BOOLEAN;
  expected    INTEGER;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mepuser_super') INTO has_super;
  expected := CASE WHEN has_super THEN 40 ELSE 20 END;

  SELECT COUNT(*) INTO grant_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('subscriptions', 'subscription_seat_changes',
                       'invoices', 'payments', 'tax_rates')
    AND grantee IN ('mepuser', 'mepuser_super')
    AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');

  IF grant_count < expected THEN
    RAISE EXCEPTION
      'Migration 020 abort: expected ≥% GRANT rows (% tables × % privs × % roles), got %',
      expected, 5, 4, CASE WHEN has_super THEN 2 ELSE 1 END, grant_count;
  END IF;

  RAISE NOTICE 'Migration 020 OK: % GRANT rows confirmed on billing schema (expected ≥%)',
    grant_count, expected;
END $$;

-- Verify ALTER DEFAULT PRIVILEGES took effect by checking pg_default_acl.
-- pg_default_acl has rows when defaults exist; an empty result means the
-- ALTER didn't apply (probably running on a non-Postgres-compatible DB).

DO $$
DECLARE
  default_acl_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO default_acl_count
  FROM pg_default_acl
  WHERE defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

  IF default_acl_count = 0 THEN
    RAISE EXCEPTION
      'Migration 020 abort: pg_default_acl has no rows for public schema after ALTER DEFAULT PRIVILEGES';
  END IF;

  RAISE NOTICE 'Migration 020 OK: % pg_default_acl entries confirmed for public schema',
    default_acl_count;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration manual verification (run after COMMIT to confirm):
-- ============================================================================
--
-- SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_schema = 'public'
--    AND table_name IN ('subscriptions','subscription_seat_changes','invoices','payments','tax_rates')
--    AND grantee LIKE 'mep%'
--  ORDER BY table_name, grantee, privilege_type;
-- -- Expect 40 rows (5 tables × 4 privs × 2 roles).
--
-- SELECT defaclrole::regrole AS owner_role, defaclnamespace::regnamespace AS schema,
--        defaclobjtype, defaclacl
--   FROM pg_default_acl
--  WHERE defaclnamespace = 'public'::regnamespace;
-- -- Expect rows for postgres → public, with defaclacl showing grants to mepuser + mepuser_super.
--
-- -- Smoke test: app can SELECT from subscriptions as mepuser:
-- SET ROLE mepuser;
-- SELECT COUNT(*) FROM public.subscriptions;
-- RESET ROLE;
-- -- Should succeed (no permission denied).
