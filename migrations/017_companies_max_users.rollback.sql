-- ============================================================================
-- 017_companies_max_users.rollback.sql
--
-- Rollback for migration 017. Drops the max_users column and its index.
-- No data preservation: max_users is derivable from companies.plan via
-- the same CASE expression the forward migration uses.
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS public.idx_companies_max_users;

ALTER TABLE public.companies DROP COLUMN IF EXISTS max_users;

-- Sanity check.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'companies'
       AND column_name  = 'max_users'
  ) THEN
    RAISE EXCEPTION 'Migration 017 rollback abort: companies.max_users still present after DROP';
  END IF;
END $$;

COMMIT;
