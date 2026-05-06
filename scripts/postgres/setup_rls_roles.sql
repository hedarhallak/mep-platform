-- scripts/postgres/setup_rls_roles.sql
--
-- Section 88 — Phase 4 (RLS): one-shot DBA setup.
--
-- Purpose: create the dedicated `mepuser_super` Postgres role with the
-- BYPASSRLS attribute, used by the backend's SUPER_ADMIN connection pool to
-- read/write across tenants. All other backend traffic uses the existing
-- `mepuser` role, which is fully subject to RLS.
--
-- This file is intentionally OUTSIDE the migrations/ directory because it
-- requires PostgreSQL superuser privileges (CREATE ROLE) — the standard
-- migration runner (scripts/migrate.js) connects as `mepuser` (DATABASE_URL)
-- and would not be able to execute these statements.
--
-- ===========================================================================
-- HOW TO RUN (local dev, staging, AND production):
-- ===========================================================================
--
-- 1. Pick a strong password for mepuser_super and store it somewhere safe
--    (e.g., .secrets/mepuser_super.txt on Hedar's machine — already gitignored
--    via Section 86's .gitignore update).
--
-- 2. Set it as an env var for this single shell:
--      export MEPUSER_SUPER_PASSWORD='paste-the-strong-password-here'
--
-- 3. Connect via the postgres superuser and run this file with the password
--    substituted in. The script uses :'MEPUSER_SUPER_PASSWORD' (psql variable
--    binding) so the literal password never lands in the file or the
--    command history.
--
--      sudo -u postgres psql -d mepdb \
--        -v MEPUSER_SUPER_PASSWORD="$MEPUSER_SUPER_PASSWORD" \
--        -f scripts/postgres/setup_rls_roles.sql
--
-- 4. Update the backend env: add DATABASE_URL_SUPER on the production
--    server (and on local .env files used by tests). Format:
--
--      DATABASE_URL_SUPER=postgres://mepuser_super:<password>@localhost:5432/mepdb
--
-- 5. Restart pm2: `pm2 restart mep-backend && pm2 logs mep-backend`.
--
-- ===========================================================================
-- WHAT THIS SCRIPT DOES (each block is idempotent):
-- ===========================================================================

\set ON_ERROR_STOP on

-- Pass the password to the DO block via a session GUC. This is needed
-- because psql's variable substitution (`:'foo'`) is NOT performed inside
-- dollar-quoted blocks ($$ ... $$) — it gets sent verbatim and the server
-- rejects the `:` as a syntax error. set_config() with is_local=false sets
-- the GUC at session scope; the DO block reads it via current_setting().
-- The GUC is cleared explicitly at the end of the script.
SELECT set_config('mep.setup_password', :'MEPUSER_SUPER_PASSWORD', false);

BEGIN;

-- 1. Create mepuser_super if it does not exist. The role:
--    - LOGIN: can connect directly via DATABASE_URL_SUPER
--    - BYPASSRLS: bypasses every RLS policy on every table
--    - NOSUPERUSER / NOCREATEDB / NOCREATEROLE / NOREPLICATION: no other
--      privileges beyond what mepuser already has (defense-in-depth — if
--      this account leaks, the blast radius is "all tenant data" but NOT
--      "destroy the cluster")
DO $$
DECLARE
  pwd text := current_setting('mep.setup_password');
BEGIN
  IF pwd IS NULL OR pwd = '' THEN
    RAISE EXCEPTION 'setup_rls_roles abort: mep.setup_password GUC is empty. Run with: psql -v MEPUSER_SUPER_PASSWORD=<value> -f setup_rls_roles.sql';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mepuser_super') THEN
    EXECUTE format(
      'CREATE ROLE mepuser_super WITH LOGIN BYPASSRLS '
      || 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION '
      || 'PASSWORD %L',
      pwd
    );
  ELSE
    -- Role already exists; just ensure the attributes are correct (safe re-run)
    ALTER ROLE mepuser_super WITH LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
    EXECUTE format('ALTER ROLE mepuser_super WITH PASSWORD %L', pwd);
  END IF;
END$$;

-- 2. Grant mepuser_super membership in mepuser. mepuser is the owner of
--    every application table; granting membership lets mepuser_super inherit
--    ownership-level grants without having to manually GRANT on each table.
GRANT mepuser TO mepuser_super;

-- 3. Confirm the BYPASSRLS attribute landed (defensive check — abort if not).
DO $$
DECLARE
  has_bypass boolean;
BEGIN
  SELECT rolbypassrls INTO has_bypass FROM pg_roles WHERE rolname = 'mepuser_super';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'setup_rls_roles abort: mepuser_super not created';
  END IF;
  IF NOT has_bypass THEN
    RAISE EXCEPTION 'setup_rls_roles abort: mepuser_super lacks BYPASSRLS attribute';
  END IF;
END$$;

COMMIT;

-- Clear the password GUC so it doesn't linger in the session (defensive;
-- the GUC is session-scoped and goes away when the psql session ends, but
-- explicit is better than implicit when the value is sensitive).
SELECT set_config('mep.setup_password', '', false);

-- ===========================================================================
-- VERIFICATION (run manually after this script):
-- ===========================================================================
--
-- -- 1. Role exists with BYPASSRLS:
-- SELECT rolname, rolcanlogin, rolbypassrls, rolsuper, rolcreatedb, rolcreaterole
--   FROM pg_roles WHERE rolname = 'mepuser_super';
-- -- expect: rolcanlogin=t, rolbypassrls=t, rolsuper=f, rolcreatedb=f, rolcreaterole=f
--
-- -- 2. mepuser_super is a member of mepuser:
-- SELECT pg_has_role('mepuser_super', 'mepuser', 'MEMBER');
-- -- expect: t
--
-- -- 3. Connect as mepuser_super and verify cross-tenant SELECT works:
-- --   psql "postgres://mepuser_super:<password>@localhost/mepdb" -c \
-- --     "SET app.company_id = '999999'; SELECT COUNT(DISTINCT company_id) FROM employees;"
-- --   expect: > 1 (BYPASSRLS ignores app.company_id, returns all tenants)
--
-- -- 4. Connect as mepuser and verify RLS still applies:
-- --   psql "postgres://mepuser:<password>@localhost/mepdb" -c \
-- --     "SET app.company_id = '5'; SELECT COUNT(DISTINCT company_id) FROM employees;"
-- --   expect: 1 (only company 5 visible)
