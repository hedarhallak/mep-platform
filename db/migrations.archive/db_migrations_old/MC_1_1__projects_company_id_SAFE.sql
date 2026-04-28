-- MC-1.1 (SAFE): Add company_id to public.projects + backfill + FK + index
-- Assumptions (validated):
-- - public.companies contains company_id = 1 (Demo Company)
-- - public.projects currently has rows and does NOT have company_id
-- - Token-scoped company_id will be enforced at API layer in later steps
--
-- Recommended before running:
--   pg_dump -d erp --schema=public --table=public.projects --data-only > projects_backup.sql

BEGIN;

-- 1) Add column (nullable first for safe backfill)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS company_id BIGINT;

-- 2) Backfill existing rows to company_id=1 (only where NULL)
UPDATE public.projects
  SET company_id = 1
WHERE company_id IS NULL;

-- 3) Enforce NOT NULL
ALTER TABLE public.projects
  ALTER COLUMN company_id SET NOT NULL;

-- 4) Add FK constraint (only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_company_id_fkey'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES public.companies(company_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END$$;

-- 5) Index for scoping queries
CREATE INDEX IF NOT EXISTS idx_projects_company_id
  ON public.projects(company_id);

COMMIT;
