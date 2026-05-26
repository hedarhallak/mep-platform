-- migrations/021_fix_gst_rate_scale.sql
--
-- Phase 6-D-4 PR 5 / Section 116.6 — normalize GST rate scale.
--
-- Migration 018 seeded the tax_rates table with two different scales:
--   - QST  = 9975  (thousandths-of-percent: 9975 / 100000 = 9.975%)
--   - GST  = 500   (basis points:           500  / 10000  = 5.000%)
--
-- The calculateTaxes() helper in lib/invoice_numbering.js standardizes on
-- thousandths-of-percent (divisor 100000). To make GST consistent, this
-- migration updates the active GST row from 500 → 5000 so the same divisor
-- works for both rows.
--
-- Idempotent: only updates the row where rate_basis_points is still the old
-- 500. Subsequent runs are a no-op.
--
-- No tax history is invalidated — the FEDERAL/GST row's effective_from and
-- effective_until are unchanged. We're only correcting the storage scale,
-- not changing the actual 5% rate.

BEGIN;

UPDATE public.tax_rates
   SET rate_basis_points = 5000
 WHERE jurisdiction = 'FEDERAL'
   AND tax_name = 'GST'
   AND rate_basis_points = 500;

-- Sanity check: after this migration both active rates should use the
-- thousandths-of-percent scale. If a future migration adds new tax rows,
-- they MUST follow the same convention (rate * 1000 = percent).

COMMIT;

-- bump: re-trigger CI
