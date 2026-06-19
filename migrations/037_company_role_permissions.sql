-- migrations/037_company_role_permissions.sql
--
-- §148 Phase 3 — the PER-COMPANY permission layer. Roles are a fixed global
-- catalog (roles, migration 035) and `role_permissions` holds the canonical
-- GLOBAL defaults (§148.9). This table lets each company TUNE what a role can
-- do without touching the shared defaults: Accountant@A ≠ Accountant@B.
--
-- Resolution order (middleware/permissions.js, §148 Phase 3):
--   1. user_permissions          (per-user override)      — most specific
--   2. company_role_permissions  (per-company role tune)  — THIS table
--   3. role_permissions          (global default)         — fallback
-- A row here with granted=true GRANTS, granted=false DENIES, absence FALLS
-- THROUGH to the global default. So an EMPTY table = today's behaviour exactly
-- (backward compatible — nothing changes until a company adds an override).
--
-- company-scoped + strict RLS (matches migration 013 / 033 / 034). role FKs to
-- the roles catalog with ON UPDATE CASCADE (mirrors app_users, migration 036);
-- permission_code is free text like role_permissions / user_permissions (no FK,
-- the write path + apply script already guard against unknown codes).
--
-- GRANTs (Pitfall #49): new tables grant nothing automatically.
-- Idempotent: IF NOT EXISTS everywhere; re-running is a no-op.

BEGIN;

CREATE TABLE IF NOT EXISTS public.company_role_permissions (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT  NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  role            TEXT    NOT NULL REFERENCES public.roles(role_key)       ON UPDATE CASCADE,
  permission_code TEXT    NOT NULL,
  granted         BOOLEAN NOT NULL DEFAULT true,
  updated_by      BIGINT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, role, permission_code)
);

-- The UNIQUE(company_id, role, permission_code) index already serves the
-- resolution lookup (exact) and the per-role matrix fetch (company_id, role
-- prefix), so no extra index is needed.

COMMENT ON TABLE public.company_role_permissions IS
  'Per-company override of a role''s permissions. Layers between user_permissions and the global role_permissions default. DECISIONS §148 Phase 3.';

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — strict tenant_isolation (matches migration 013 / 033 / 034)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.company_role_permissions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.company_role_permissions FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.company_role_permissions';
  EXECUTE $pol$
    CREATE POLICY tenant_isolation ON public.company_role_permissions
      USING (
        company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
      )
      WITH CHECK (
        company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
      )
  $pol$;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- GRANTs (Pitfall #49)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r text;
  roles text[] := ARRAY['mepuser', 'mepuser_super'];
BEGIN
  FOREACH r IN ARRAY roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_role_permissions TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.company_role_permissions_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
