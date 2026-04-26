-- ============================================================================
-- Migration 038: Drop dead "v1" materials tables
-- ----------------------------------------------------------------------------
-- Background:
--   Audit on 2026-04-26 discovered an entire parallel materials workflow
--   that exists in the code (routes/materials.js) and DB (materials_*
--   plural tables) but is NOT called by any frontend or mobile client:
--
--     - materials_requests       (daily work-date based; SUBMITTED status)
--     - materials_request_items
--     - materials_tickets        (DRAFT / SENT_TO_OFFICE workflow)
--     - materials_ticket_items
--
--   The active flow is the singular `material_requests` (merge-and-send PO,
--   served by routes/material_requests.js, used by mobile + web).
--
--   The plural tables are remnants of an earlier "v1" daily-ticket workflow
--   that was replaced but never cleaned up. They were created manually on
--   prod (not by any migration) — this migration finally formalizes their
--   removal.
--
-- Coordination with code change (commit `<TBD>`):
--   index.js was updated in the same commit to remove the mount of
--   routes/materials.js. After this migration runs, the file becomes
--   dead code on disk and can be deleted in a future sprint.
--
-- Safety:
--   Wrapped in a transaction. Pre-check verifies all 4 tables are empty;
--   if any rows exist, the migration aborts and rolls back without dropping
--   anything. (Empty was verified at audit time on 2026-04-26.)
-- ============================================================================

BEGIN;

-- Defense in depth: bail if any table has data
DO $$
DECLARE
  req_count       BIGINT;
  req_items_count BIGINT;
  tic_count       BIGINT;
  tic_items_count BIGINT;
  total           BIGINT;
BEGIN
  SELECT COUNT(*) INTO req_count       FROM public.materials_requests;
  SELECT COUNT(*) INTO req_items_count FROM public.materials_request_items;
  SELECT COUNT(*) INTO tic_count       FROM public.materials_tickets;
  SELECT COUNT(*) INTO tic_items_count FROM public.materials_ticket_items;
  total := req_count + req_items_count + tic_count + tic_items_count;

  IF total > 0 THEN
    RAISE EXCEPTION
      'Cannot drop dead materials tables: contain data. materials_requests=%, materials_request_items=%, materials_tickets=%, materials_ticket_items=%. Migration aborted.',
      req_count, req_items_count, tic_count, tic_items_count;
  END IF;
END $$;

-- Drop tables (CASCADE handles sequences, indexes, FK constraints to/from
-- these tables, but there should be none since they are isolated)
DROP TABLE IF EXISTS public.materials_ticket_items   CASCADE;
DROP TABLE IF EXISTS public.materials_tickets        CASCADE;
DROP TABLE IF EXISTS public.materials_request_items  CASCADE;
DROP TABLE IF EXISTS public.materials_requests       CASCADE;

-- Verification
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'materials_requests',
    'materials_request_items',
    'materials_tickets',
    'materials_ticket_items'
  );
-- Expected: 0 rows.

COMMIT;
