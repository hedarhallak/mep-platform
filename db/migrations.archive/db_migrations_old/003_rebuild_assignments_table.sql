-- db/migrations/003_rebuild_assignments_table.sql
-- Option 1: Create a REAL assignments table for Assignments V2 workflow.
-- We rename the current public.assignments (which currently has only column "name")
-- to public.assignments_legacy, then create a new public.assignments with the proper columns.

BEGIN;

-- 1) Rename existing assignments table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name='assignments'
  ) THEN
    -- If assignments_legacy already exists, keep the current one as-is (do not overwrite).
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema='public' AND table_name='assignments_legacy'
    ) THEN
      ALTER TABLE public.assignments RENAME TO assignments_legacy;
    END IF;
  END IF;
END$$;

-- 2) Create new assignments table (the real one)
CREATE TABLE IF NOT EXISTS public.assignments (
  id BIGSERIAL PRIMARY KEY,

  employee_id BIGINT NOT NULL,
  project_id  BIGINT NOT NULL,

  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,

  -- Store shift as text for now (e.g. "06:00-14:30"). Later we can normalize.
  shift TEXT NOT NULL DEFAULT '06:00-14:30',

  -- Optional metadata
  created_by_user_id BIGINT NULL,
  source_request_id  BIGINT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_assignments_employee_id ON public.assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_assignments_project_id  ON public.assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_assignments_start_date  ON public.assignments(start_date);
CREATE INDEX IF NOT EXISTS idx_assignments_end_date    ON public.assignments(end_date);

-- Optional: prevent duplicates for exact same assignment line
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_unique_line
  ON public.assignments(employee_id, project_id, start_date, end_date, shift);

-- 4) updated_at trigger (reuse shared helper if exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assignments_updated_at ON public.assignments;

CREATE TRIGGER trg_assignments_updated_at
BEFORE UPDATE ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

COMMIT;
