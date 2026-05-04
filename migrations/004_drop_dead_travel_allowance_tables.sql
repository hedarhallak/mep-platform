-- Section 67/70 → C3 batch 2 — Drop 4 dead travel_allowance_* tables.
--
-- Identified in Section 66 Audit 4. These four are independent variants of
-- a "travel allowance / per-diem" feature design that was never built; the
-- actual travel/distance logic in the codebase is currently inline in
-- routes (no table involved). Dropping all four cleanly is safe because:
--
--   - Section 66 grep across ~881 KB of backend code: zero references.
--   - mep-frontend/ + mep-mobile/ grep: zero references.
--   - Schema baseline: zero outside FK constraints reference these tables.
--   - These tables have zero outside FK constraints of their own (no
--     dependencies on other tables to worry about).
--
-- Each table is therefore fully isolated. Drop order is irrelevant.

BEGIN;

DROP TABLE IF EXISTS public.travel_allowance_brackets;
DROP TABLE IF EXISTS public.travel_allowance_policies;
DROP TABLE IF EXISTS public.travel_allowance_policy;
DROP TABLE IF EXISTS public.travel_allowance_rules;

COMMIT;
