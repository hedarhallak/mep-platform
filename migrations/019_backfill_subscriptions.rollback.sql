-- ============================================================================
-- 019_backfill_subscriptions.rollback.sql
--
-- Rollback for migration 019. DELETEs the backfilled subscriptions (and their
-- INITIAL seat_changes via FK CASCADE). Migration 018's table structure
-- remains intact — only the rows from the backfill go away.
--
-- WARNING: This is destructive for the backfill. If any application code has
-- since written real subscription data (Phase 6-D-4 PR 2 onwards), this
-- rollback will destroy that data too. Use cautiously and only as part of
-- a coordinated revert sequence.
-- ============================================================================

BEGIN;

-- DELETE subscriptions where the notes column marks them as backfilled.
-- This is more surgical than DELETE FROM subscriptions WHERE 1=1, which would
-- also nuke any real subscriptions created by later code.
DELETE FROM public.subscriptions
 WHERE notes LIKE 'Backfilled from Section 114 companies.max_users via migration 019%';

-- The CASCADE on subscription_seat_changes.subscription_id will auto-delete
-- their INITIAL rows. No explicit DELETE needed there.

-- Sanity check
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
    FROM public.subscriptions
   WHERE notes LIKE 'Backfilled from Section 114 companies.max_users via migration 019%';
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Migration 019 rollback abort: % backfilled subscriptions still present', remaining;
  END IF;
END $$;

COMMIT;
