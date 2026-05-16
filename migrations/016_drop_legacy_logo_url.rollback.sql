-- ============================================================================
-- 016_drop_legacy_logo_url.rollback.sql
--
-- Rollback for 016_drop_legacy_logo_url.sql. Re-adds the `logo_url`
-- column as nullable TEXT, matching the pre-migration schema. Does NOT
-- restore data — the column held no production data (Section 111 / 110.2
-- verification confirmed the only non-null value was a one-day test
-- placeholder on the `mep` company). Restoring shape but not content is
-- sufficient for a recovery scenario.
--
-- Run only if some downstream code or data pipeline turns out to depend
-- on `companies.logo_url` after migration 016 has shipped. The codebase
-- search performed in Section 111 found ZERO functional references — but
-- the rollback is preserved for defensive ops.
-- ============================================================================

BEGIN;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url text;

COMMIT;
