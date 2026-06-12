-- migrations/033_crews.sql
--
-- Assignments Phase 2 — CREW concept (DECISIONS §131.2, Slice 1: schema).
-- Hedar's decision (June 11, 2026): STATIC ROSTER model — a crew is a named,
-- persistent team (a foreman + a fixed member list). Deploying a crew onto a
-- project (Slice 2) expands the current roster into individual
-- assignment_requests rows (which themselves become the historical snapshot);
-- roster edits are forward-only; per-member tweaks after a deploy are
-- "individual = exceptions".
--
-- Tables (both company-scoped, both under strict RLS):
--   crews         — the team: name + foreman + trade tag.
--   crew_members  — the roster (crew ↔ employee). Carries its OWN company_id +
--                   RLS — NOT relying on the parent crews' RLS. This is the
--                   §142.4 lesson: a child table queried without joining its
--                   parent leaks across tenants if it lacks its own policy.
--
-- Permissions: reuses the existing `assignments.*` module (assignments.view /
-- .create / .edit) — crews are an assignments concept, so NO new permission
-- seeding (same approach as tools reusing `materials`, §126.1 / migration 024).
--
-- RLS: strict tenant_isolation, identical to migration 013.
-- GRANTs (Pitfall #49): new tables grant nothing automatically.
-- Idempotent: IF NOT EXISTS everywhere; re-running is a no-op.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- crews (the team)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crews (
  id                   BIGSERIAL PRIMARY KEY,
  company_id           BIGINT NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  -- The crew lead. SET NULL (not CASCADE): removing the foreman employee must
  -- not delete the crew — it just leaves the lead slot empty until reassigned.
  foreman_employee_id  INTEGER REFERENCES public.employees(id) ON DELETE SET NULL,
  -- Optional primary trade tag for filtering (ELECTRICAL/PLUMBING/...). Free
  -- text to match the platform's existing trade handling; NULL = untagged.
  trade_code           TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_crews_company_name UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_crews_company_active ON public.crews(company_id) WHERE is_active;

COMMENT ON TABLE public.crews IS
  'A reusable team (foreman + member roster). Static-roster model. DECISIONS §131.2.';

-- ──────────────────────────────────────────────────────────────────────────
-- crew_members (the roster)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crew_members (
  id           BIGSERIAL PRIMARY KEY,
  -- Denormalized company_id so this table carries its OWN strict RLS policy
  -- (§142.4): never trust the parent crew's RLS for a child queried directly.
  company_id   BIGINT NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  crew_id      BIGINT NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  employee_id  INTEGER NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_crew_members_crew_employee UNIQUE (crew_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON public.crew_members(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_employee ON public.crew_members(employee_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_company ON public.crew_members(company_id);

COMMENT ON TABLE public.crew_members IS
  'Crew roster (crew ↔ employee). Own company_id + RLS, not parent-reliant (§142.4). DECISIONS §131.2.';

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — strict tenant_isolation (matches migration 013) on both tables
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  company_tables text[] := ARRAY['crews', 'crew_members'];
BEGIN
  FOREACH t IN ARRAY company_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
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

-- ──────────────────────────────────────────────────────────────────────────
-- GRANTs (Pitfall #49)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r text;
  t text;
  roles text[] := ARRAY['mepuser', 'mepuser_super'];
  company_tables text[] := ARRAY['crews', 'crew_members'];
BEGIN
  FOREACH r IN ARRAY roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY company_tables LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO %I', t, r);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I_id_seq TO %I', t, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

COMMIT;
