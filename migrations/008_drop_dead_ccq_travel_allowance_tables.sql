-- Section 67/74 → C3 retroactive batch 6 — Drop 2 missed dead tables.
--
-- The C4 prep audit (Section 75) re-ran the audit with a schema-qualified
-- + FK-aware detector and turned up 2 tables that should have been dropped
-- in C3 but were missed: `ccq_travel_allowance_bands` and
-- `ccq_travel_allowance_rates`.
--
-- These were identified in Section 66 (Audit 4) as duplicate variants of
-- `ccq_travel_rates` (the actively-used singular table — see ccq_rates.js
-- and reports.js). They were in the original C3 candidate list but slipped
-- through the batch boundaries.
--
-- Verification:
--   - FK references TO: zero.
--   - FK references FROM (own constraints): zero.
--   - Schema-qualified code refs across routes/ lib/ services/ jobs/
--     middleware/ scripts/ tests/ seed.js + mep-frontend/src + mep-mobile/src:
--     zero per table.
--
-- Both tables are fully isolated; drop order is irrelevant.

BEGIN;

DROP TABLE IF EXISTS public.ccq_travel_allowance_bands;
DROP TABLE IF EXISTS public.ccq_travel_allowance_rates;

COMMIT;
