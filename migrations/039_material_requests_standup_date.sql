-- 039_material_requests_standup_date.sql
--
-- §151.2 follow-up — fix the standup "tomorrow materials" duplicate-on-refresh bug.
--
-- routes/standup.js GET /api/standup/materials/:project_id looked up an existing
-- request with `DATE(created_at) = tomorrow`, but created new rows with the
-- default `created_at = NOW()` (today). So when a foreman opened the standup
-- screen TODAY to prepare TOMORROW's materials, the existing-lookup never matched
-- the row it had just created → every refresh spawned a duplicate PENDING
-- material_requests row. The /tomorrow huddle view had the same mismatch.
--
-- Fix: give material_requests an explicit standup_date so the request is findable
-- for the date it's prepared for (not the date it happened to be inserted).
-- Nullable — only standup-created requests set it; the normal materials flow
-- leaves it NULL and is unaffected.

ALTER TABLE public.material_requests
  ADD COLUMN IF NOT EXISTS standup_date DATE;

COMMENT ON COLUMN public.material_requests.standup_date IS
  'The standup huddle date this request is prepared for (set by the standup flow). NULL for normal material requests. §151.2.';

CREATE INDEX IF NOT EXISTS idx_material_requests_standup_date
  ON public.material_requests (company_id, project_id, standup_date)
  WHERE standup_date IS NOT NULL;
