-- migrations/034_project_labor_requirements.sql
--
-- Project-centric assignment redesign — Phase 0 (DECISIONS §147). The unit of
-- construction work is the PROJECT, so the system should be driven by what each
-- project NEEDS. This table is that demand model: a project's labor requirement
-- is a TIME-PHASED staffing plan — one row per {trade, count, date-range}. A
-- single row = a flat need for the whole project; multiple rows = phases
-- (foundation ≠ finishing). Coverage/gap for any day = required (the rows
-- covering that day) minus assigned (APPROVED assignment_requests overlapping
-- that day, by the assignee's trade). Everything downstream (gap display,
-- nearest-available suggestions, the simplified fill-the-gap flow) derives from
-- this — nothing here changes existing assignment behaviour yet (Phase 0 is the
-- foundation only).
--
-- company-scoped + strict RLS (matches migration 013 / 033). projects.id is
-- INTEGER and companies.company_id is BIGINT (see schema baseline), so the FKs
-- mirror those types. ON DELETE CASCADE on both: deleting a project (or a
-- company) removes its requirements.
--
-- Permissions: reuses the existing `assignments.*` module (view/create/edit) —
-- requirements are an assignments concept, so NO new permission seeding (same
-- approach as crews, §131.2 / migration 033).
--
-- GRANTs (Pitfall #49): new tables grant nothing automatically.
-- Idempotent: IF NOT EXISTS everywhere; re-running is a no-op.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_labor_requirements (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT  NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  project_id      INTEGER NOT NULL REFERENCES public.projects(id)          ON DELETE CASCADE,
  -- Free text to match the platform's existing trade handling (employees +
  -- crews use the same vocabulary, e.g. PLUMBING/ELECTRICAL/...).
  trade_code      TEXT    NOT NULL,
  required_count  INTEGER NOT NULL DEFAULT 1 CHECK (required_count >= 0),
  start_date      DATE    NOT NULL,
  end_date        DATE    NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_plr_dates CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_plr_company_project
  ON public.project_labor_requirements(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_plr_project_dates
  ON public.project_labor_requirements(project_id, start_date, end_date);

COMMENT ON TABLE public.project_labor_requirements IS
  'Time-phased project staffing demand: one row per {trade, count, date-range}. Coverage/gap derives from this. DECISIONS §147.';

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — strict tenant_isolation (matches migration 013 / 033)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.project_labor_requirements ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.project_labor_requirements FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.project_labor_requirements';
  EXECUTE $pol$
    CREATE POLICY tenant_isolation ON public.project_labor_requirements
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
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_labor_requirements TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.project_labor_requirements_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
