-- ============================================================================
-- 016_drop_legacy_logo_url.sql
--
-- Section 111 (May 15, 2026) — hygiene cleanup. Drops the long-unused
-- `companies.logo_url` column that has caused real production confusion
-- (see DECISIONS.md Section 110.2 / Pitfall #44).
--
-- Background: the `companies` table had TWO logo columns:
--   * logo_url       — added pre-Section-85, never read by any code path.
--                       The only references were two `SELECT ... logo_url`
--                       lines in `routes/material_requests.js` that pulled
--                       the column into a `company` object but never used
--                       it — dead-but-fetched data. Those references are
--                       removed in this PR's `routes/material_requests.js`
--                       diff so the SELECTs match the post-migration shape.
--   * brand_logo_url — added in migration 014 (Phase 6-A), returned by
--                       GET /api/companies/:code/branding, consumed by the
--                       frontend bootstrap. This is the canonical column.
--
-- The duplicate caused a multi-PR debug loop on May 15: a SQL UPDATE on
-- `logo_url` returned UPDATE 1 (success) but the API kept returning
-- brand_logo_url: null because they're different columns. New Pitfall #44
-- (3-point chain verification) was encoded; this migration closes the
-- loop by removing the legacy column entirely so a future operator can't
-- repeat the same mistake.
--
-- This migration is DESTRUCTIVE — the column is dropped, not renamed.
-- Take a backup BEFORE running:
--   pg_dump -U mepuser -h localhost -d mepdb -t public.companies \
--     -f /tmp/companies_pre_016_$(date +%Y%m%d).sql
--
-- Rollback: 016_drop_legacy_logo_url.rollback.sql re-adds the column as
-- nullable TEXT (matching the original schema). It does NOT restore data —
-- the column was empty for all but one row (`mep` company, set during
-- May 15 verification testing) so data loss is acceptable.
-- ============================================================================

BEGIN;

-- Defensive sanity check — fail loudly if the column is somehow already
-- gone (e.g., manual cleanup between rollout attempts). RAISE NOTICE
-- instead of ERROR so a re-run after a partial application doesn't
-- abort the whole transaction.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'companies'
       AND column_name  = 'logo_url'
  ) THEN
    RAISE NOTICE 'Migration 016: companies.logo_url already absent — nothing to drop.';
    RETURN;
  END IF;
END $$;

ALTER TABLE public.companies DROP COLUMN IF EXISTS logo_url;

-- Sanity check post-drop.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'companies'
       AND column_name  = 'logo_url'
  ) THEN
    RAISE EXCEPTION 'Migration 016 abort: companies.logo_url still present after DROP';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration manual verification (run after COMMIT to confirm):
-- ============================================================================
--
-- \d+ public.companies
-- -- Expect to see brand_color + brand_logo_url; NOT logo_url.
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'companies'
--    AND column_name LIKE '%logo%';
-- -- Expect 1 row: brand_logo_url. (logo_url is gone.)
