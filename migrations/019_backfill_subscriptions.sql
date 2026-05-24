-- ============================================================================
-- 019_backfill_subscriptions.sql
--
-- Phase 6-D-4 / Section 116.8 (May 24, 2026) — backfill existing companies
-- into the new subscriptions table.
--
-- Background: migration 018 created the subscriptions table but left it
-- empty. This migration creates one subscription row per existing company,
-- deriving subscribed_seats from the shipped Section 114 companies.max_users
-- column (DEFAULT 5, populated via migration 017 backfill).
--
-- After this migration, the application code is still reading from
-- companies.max_users (Section 114 behavior). Phase 6-D-4 PR 2 will refactor
-- routes/invite_employee.js + routes/super_admin.js + CompanyBranding.jsx
-- to read from subscriptions.subscribed_seats instead. Migration 020 (a
-- separate, later session) will DROP companies.max_users once zero references
-- remain in code.
--
-- Bracket → unit_price mapping (per Section 115.3, revised May 24 2026):
--   1-5    seats → $27 → 2700 cents → bracket '1-5'
--   6-10   seats → $25 → 2500 cents → bracket '6-10'
--   11-20  seats → $24 → 2400 cents → bracket '11-20'
--   21-35  seats → $23 → 2300 cents → bracket '21-35'
--   36-50  seats → $22 → 2200 cents → bracket '36-50'
--   50+    seats → $22 (floor) → 2200 cents → bracket '50+'
--
-- minimum_seats_billed: hardcoded to 3 per Section 115.3 floor rule.
--
-- next_billing_at: first day of NEXT month (anchor = 1st of month per
-- Section 115.3). For companies backfilled mid-month, the cron will skip
-- them until the 1st rolls around. last_billed_at is NULL because under
-- the new schema, no monthly invoice has yet been generated for them.
--
-- For each subscription created, an INITIAL row is inserted into
-- subscription_seat_changes for audit history (Section 116.3).
--
-- Idempotency: INSERT ... ON CONFLICT (company_id) DO NOTHING — re-running
-- this migration after a partial failure won't error.
--
-- Rollback: 019_backfill_subscriptions.rollback.sql DELETEs the backfilled
-- subscriptions (and their seat_changes via CASCADE). Migration 018's
-- table structure remains.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- Step 1: Create subscriptions for every existing company
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO public.subscriptions (
  company_id,
  status,
  plan_type,
  subscribed_seats,
  minimum_seats_billed,
  current_unit_price_cents,
  current_bracket_label,
  billing_cycle,
  billing_anchor_day,
  next_billing_at,
  payment_method,
  notes,
  created_at,
  created_by_user_id
)
SELECT
  c.company_id,
  'ACTIVE',                                              -- status: assume existing companies are active
  'MONTHLY',                                             -- plan_type: default for backfilled customers
  COALESCE(c.max_users, 5)::integer,                     -- subscribed_seats from Section 114 max_users
  3,                                                     -- minimum_seats_billed: floor per Section 115.3
  CASE                                                   -- current_unit_price_cents from Section 115.3 bracket ladder (revised May 24 2026)
    WHEN COALESCE(c.max_users, 5) <= 5  THEN 2700        -- $27.00 CAD
    WHEN COALESCE(c.max_users, 5) <= 10 THEN 2500        -- $25.00 CAD
    WHEN COALESCE(c.max_users, 5) <= 20 THEN 2400        -- $24.00 CAD
    WHEN COALESCE(c.max_users, 5) <= 35 THEN 2300        -- $23.00 CAD
    WHEN COALESCE(c.max_users, 5) <= 50 THEN 2200        -- $22.00 CAD
    ELSE                                       2200      -- 50+ floor: $22.00 CAD
  END,
  CASE                                                   -- current_bracket_label (human-readable)
    WHEN COALESCE(c.max_users, 5) <= 5  THEN '1-5'
    WHEN COALESCE(c.max_users, 5) <= 10 THEN '6-10'
    WHEN COALESCE(c.max_users, 5) <= 20 THEN '11-20'
    WHEN COALESCE(c.max_users, 5) <= 35 THEN '21-35'
    WHEN COALESCE(c.max_users, 5) <= 50 THEN '36-50'
    ELSE                                       '50+'
  END,
  'MONTHLY',                                             -- billing_cycle
  1,                                                     -- billing_anchor_day (1st of month)
  date_trunc('month', NOW()) + INTERVAL '1 month',       -- next_billing_at = first of next month
  'MANUAL_INVOICE',                                      -- payment_method: pre-Stripe, all manual
  'Backfilled from Section 114 companies.max_users via migration 019 (Section 116.8). '
    || 'Original plan: ' || COALESCE(c.plan, 'NULL') || ', max_users: ' || COALESCE(c.max_users, 5),
  NOW(),
  (SELECT id FROM public.app_users WHERE role = 'SUPER_ADMIN' ORDER BY id LIMIT 1)
FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- Step 2: For each backfilled subscription, insert INITIAL seat_changes row
-- ──────────────────────────────────────────────────────────────────────────
-- This gives the audit log a starting point ("company started with N seats on
-- this date"). Without this, the seat_changes table would be empty until the
-- first ADD or REDUCE happens, leaving a gap in history.
--
-- Idempotency: skip subscriptions that already have an INITIAL row.

INSERT INTO public.subscription_seat_changes (
  subscription_id,
  change_type,
  seats_before,
  seats_after,
  delta,
  effective_at,
  proration_cents,
  reason,
  created_at,
  created_by_user_id
)
SELECT
  s.id,
  'INITIAL',
  0,                                                     -- seats_before: started from nothing
  s.subscribed_seats,                                    -- seats_after: current snapshot
  s.subscribed_seats,                                    -- delta: full amount
  s.created_at,                                          -- effective_at: at subscription creation
  0,                                                     -- proration_cents: no proration for initial
  'INITIAL seed via migration 019 (Section 116.8 backfill). seats_after = subscriptions.subscribed_seats at creation time.',
  s.created_at,
  s.created_by_user_id
FROM public.subscriptions s
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscription_seat_changes sc
   WHERE sc.subscription_id = s.id AND sc.change_type = 'INITIAL'
);

-- ──────────────────────────────────────────────────────────────────────────
-- Post-migration sanity checks
-- ──────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  company_count   INTEGER;
  subscription_count INTEGER;
  seat_change_count  INTEGER;
  orphan_count    INTEGER;
BEGIN
  SELECT COUNT(*) INTO company_count FROM public.companies;
  SELECT COUNT(*) INTO subscription_count FROM public.subscriptions;
  SELECT COUNT(*) INTO seat_change_count
    FROM public.subscription_seat_changes WHERE change_type = 'INITIAL';

  -- One subscription per company (after this migration, before any churn)
  IF subscription_count <> company_count THEN
    RAISE EXCEPTION
      'Migration 019 abort: subscription count (%) does not match company count (%) — backfill incomplete or duplicates',
      subscription_count, company_count;
  END IF;

  -- One INITIAL seat_change per subscription
  IF seat_change_count <> subscription_count THEN
    RAISE EXCEPTION
      'Migration 019 abort: INITIAL seat_changes count (%) does not match subscription count (%) — audit log incomplete',
      seat_change_count, subscription_count;
  END IF;

  -- No subscriptions with NULL pricing
  SELECT COUNT(*) INTO orphan_count
    FROM public.subscriptions
   WHERE current_unit_price_cents IS NULL OR current_bracket_label IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Migration 019 abort: % subscriptions have NULL pricing fields after backfill',
      orphan_count;
  END IF;

  -- All next_billing_at are in the future
  SELECT COUNT(*) INTO orphan_count
    FROM public.subscriptions
   WHERE next_billing_at <= NOW();
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Migration 019 abort: % subscriptions have next_billing_at in the past',
      orphan_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration manual verification (run after COMMIT to confirm):
-- ============================================================================
--
-- SELECT COUNT(*) FROM public.companies;
-- SELECT COUNT(*) FROM public.subscriptions;
--   -- Should match — one subscription per company.
--
-- SELECT current_bracket_label, current_unit_price_cents, COUNT(*)
--   FROM public.subscriptions
--   GROUP BY current_bracket_label, current_unit_price_cents
--   ORDER BY current_unit_price_cents DESC;
--   -- Should show buckets with correct $/cents:
--   --   '1-5'   → 2400 ($24)
--   --   '6-10'  → 2200 ($22)
--   --   '11-20' → 2000 ($20)
--   --   '21-35' → 1900 ($19)
--   --   '36-50' → 1800 ($18)
--   --   '50+'   → 1800 ($18)
--
-- SELECT COUNT(*) FROM public.subscription_seat_changes WHERE change_type = 'INITIAL';
--   -- Should equal subscriptions count.
--
-- SELECT s.company_id, c.name, s.subscribed_seats, c.max_users, s.current_bracket_label
--   FROM public.subscriptions s
--   JOIN public.companies c USING (company_id)
--  WHERE s.subscribed_seats <> COALESCE(c.max_users, 5);
--   -- Should return 0 rows (backfill preserved max_users → subscribed_seats).
--
-- SELECT next_billing_at FROM public.subscriptions LIMIT 1;
--   -- Should be first day of next month at 00:00:00 UTC.
