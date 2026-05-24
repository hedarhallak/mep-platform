-- ============================================================================
-- 018_billing_schema.rollback.sql
--
-- Rollback for migration 018. Drops the 5 billing tables + invoice_type ENUM
-- in reverse dependency order.
--
-- WARNING: This is destructive. If migration 019 has been applied (backfilled
-- subscriptions for existing companies), rolling back 018 implicitly destroys
-- that data too — there's no way to drop tables while preserving their rows.
-- Run 019.rollback BEFORE 018.rollback if both have been applied.
-- ============================================================================

BEGIN;

-- Drop in reverse dependency order:
--   payments        → references invoices
--   seat_changes    → references subscriptions AND invoices
--   invoices        → references subscriptions
--   subscriptions   → references companies (not dropped)
--   tax_rates       → independent
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.subscription_seat_changes;
DROP TABLE IF EXISTS public.invoices;
DROP TABLE IF EXISTS public.subscriptions;
DROP TABLE IF EXISTS public.tax_rates;

-- Drop the ENUM. Has to come AFTER invoices is dropped (invoices.type column
-- uses it). Postgres errors if any column still references the type.
DROP TYPE IF EXISTS invoice_type;

-- Sanity check.
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('subscriptions', 'subscription_seat_changes', 'invoices', 'payments', 'tax_rates');
  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'Migration 018 rollback abort: % tables still present after DROP', remaining_count;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_type') THEN
    RAISE EXCEPTION 'Migration 018 rollback abort: invoice_type ENUM still present after DROP';
  END IF;
END $$;

COMMIT;
