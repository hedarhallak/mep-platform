-- migrations/027_assignment_location_snapshot.sql
--
-- §132 anti-tamper, prevention foundation part 2 (DECISIONS §135.4 → §136):
-- snapshot the project's site location ONTO the assignment row at creation
-- time, so a later edit to the project's address CANNOT retroactively inflate
-- (or deflate) a past assignment's CCQ travel allowance. The allowance becomes
-- a function of the location as it was when the work was assigned — fraud
-- becomes structurally impossible, not merely detectable (§132.6).
--
-- Columns added to public.assignment_requests:
--   snapshot_site_lat    NUMERIC      — project site latitude at assignment time
--   snapshot_site_lng    NUMERIC      — project site longitude at assignment time
--   snapshot_ccq_sector  TEXT         — project CCQ sector at assignment time
--   snapshot_captured_at TIMESTAMPTZ  — when the snapshot was taken
--   allowance_cents      INTEGER      — RESERVED: persisted daily allowance in
--                                       cents, to be populated once distances
--                                       are payroll-grade (Mapbox Matrix, §131.3
--                                       backlog). Left NULL for now on purpose —
--                                       storing an estimate-derived allowance as
--                                       if it were a payroll figure would itself
--                                       be misleading. The location snapshot
--                                       above is what delivers the §132 guarantee
--                                       today; this column just keeps the schema
--                                       ready so no second migration is needed.
--
-- GRANTs (Pitfall #49): NONE required. assignment_requests is a baseline table
-- that already carries table-level SELECT/INSERT/UPDATE/DELETE for mepuser +
-- mepuser_super (the assignment routes write it in production). In PostgreSQL a
-- table-level privilege automatically covers columns added later, so the new
-- columns are readable/writable by the app roles without an explicit re-grant.
--
-- No RLS change: assignment_requests already has the strict tenant_isolation
-- policy (migration 013); adding columns does not affect it.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS makes re-running a no-op.

BEGIN;

ALTER TABLE public.assignment_requests
  ADD COLUMN IF NOT EXISTS snapshot_site_lat    NUMERIC,
  ADD COLUMN IF NOT EXISTS snapshot_site_lng    NUMERIC,
  ADD COLUMN IF NOT EXISTS snapshot_ccq_sector  TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS allowance_cents      INTEGER;

COMMENT ON COLUMN public.assignment_requests.snapshot_site_lat IS
  'Project site latitude captured at assignment-creation time (§132 anti-tamper). Allowance reads this, never the live project, so a later address edit cannot inflate past allowances.';
COMMENT ON COLUMN public.assignment_requests.snapshot_site_lng IS
  'Project site longitude captured at assignment-creation time (§132 anti-tamper).';
COMMENT ON COLUMN public.assignment_requests.snapshot_ccq_sector IS
  'Project CCQ sector (IC/INDUSTRIAL/RESIDENTIAL) captured at assignment-creation time (§132 anti-tamper).';
COMMENT ON COLUMN public.assignment_requests.snapshot_captured_at IS
  'Timestamp the location snapshot was taken (assignment create / project move).';
COMMENT ON COLUMN public.assignment_requests.allowance_cents IS
  'RESERVED — persisted daily CCQ allowance in cents. NULL until distances are payroll-grade (Mapbox Matrix, §131.3). §132.';

COMMIT;
