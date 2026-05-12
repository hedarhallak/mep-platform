-- ============================================================================
-- 014_company_branding.rollback.sql
--
-- Rollback for migration 014. Drops the two branding columns added to
-- public.companies. Data in those columns is lost — irreversible by
-- the rollback itself. If branding values exist on prod and need to
-- be preserved before rollback, export them first:
--
--   psql -d mepdb -At -c "SELECT company_id, brand_color, brand_logo_url FROM public.companies WHERE brand_color IS NOT NULL OR brand_logo_url IS NOT NULL" > /root/branding-backup-$(date +%Y%m%d).csv
--
-- This rollback is intended for the same-day reversal scenario (e.g.,
-- if the migration ships to prod with a typo and we revert immediately
-- before any tenant has saved a value).
-- ============================================================================

BEGIN;

ALTER TABLE public.companies
  DROP COLUMN IF EXISTS brand_color,
  DROP COLUMN IF EXISTS brand_logo_url;

-- Sanity check.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'companies'
       AND column_name IN ('brand_color', 'brand_logo_url')
  ) THEN
    RAISE EXCEPTION 'Migration 014 rollback abort: branding columns still present';
  END IF;
END $$;

COMMIT;
