-- ============================================================================
-- 018_billing_schema.sql
--
-- Phase 6-D-4 / Section 116 (May 24, 2026) — billing & subscription schema.
--
-- Creates the foundational tables for Constrai's per-seat metered billing
-- model (Section 115 D4):
--
--   1. subscriptions               — per-company subscription state + pricing
--   2. subscription_seat_changes   — append-only audit log of seat add/remove
--                                      events; also the source for proration
--                                      calculations during monthly invoice
--                                      generation
--   3. invoices                    — all invoices regardless of type
--                                      (SUBSCRIPTION_RECURRING, TRAINING,
--                                       CUSTOM_DEMAND, OTHER). Type discriminator
--                                      + JSONB details column for flexibility
--                                      across types
--   4. payments                    — payment events linked to invoices.
--                                      Supports partial payments (50/50 training
--                                      flow per Section 115.4) and external
--                                      reference tracking (Stripe id, cheque #,
--                                      bank reference, etc.)
--   5. tax_rates                   — Quebec tax rate history with effective
--                                      dates. Rates stored as basis points
--                                      (integer) to avoid floating-point math.
--                                      Seeded with QC QST 9975bp (9.975%) and
--                                      Federal GST 500bp (5%) per current law.
--
-- Currency note: ALL money amounts are stored as INTEGER cents (Section 116.12).
--   $24.00 CAD → 2400
--   $1,200.50 CAD → 120050
--   This matches Stripe API conventions and prevents floating-point bugs that
--   plague decimal/numeric storage. Display layer divides by 100 + formats with
--   locale-appropriate separators.
--
-- Tax storage: separate qst_cents + gst_cents columns on invoices (not derived
-- from a rate × subtotal calculation at query time). This preserves historical
-- accuracy — if a rate changes later, old invoices still show the rate that
-- was used when issued. Quebec sequential invoice numbering compliance.
--
-- See DECISIONS.md Section 116 for the full design rationale, state machines,
-- JSONB shapes per invoice type, and API endpoint mapping.
--
-- Rollback: 018_billing_schema.rollback.sql DROPs in reverse dependency order.
-- Migration 019 (subscriptions backfill) depends on this; do not run 019 first.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- ENUM: invoice_type
-- ──────────────────────────────────────────────────────────────────────────
-- Defined as Postgres ENUM (not a CHECK constraint) so future additions
-- can ALTER TYPE ... ADD VALUE without rewriting existing rows. Catch-all
-- 'OTHER' bucket exists deliberately for refunds, credits, adjustments,
-- and edge cases not yet anticipated.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_type') THEN
    CREATE TYPE invoice_type AS ENUM (
      'SUBSCRIPTION_RECURRING',
      'TRAINING',
      'CUSTOM_DEMAND',
      'OTHER'
    );
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Table: subscriptions
-- ──────────────────────────────────────────────────────────────────────────
-- One row per company (UNIQUE company_id constraint). The shipped Section
-- 114 companies.max_users column will be DEPRECATED in a follow-up migration
-- 020 after Phase 6-D-4 code refactors away from it (Section 116.8 step 4).

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                          BIGSERIAL PRIMARY KEY,
  company_id                  BIGINT NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,

  -- State machine (Section 113.3 / 116.7). DELETED is soft-delete; rows are
  -- physically retained for the Quebec 6-year records-retention requirement.
  status                      TEXT NOT NULL DEFAULT 'TRIAL',
  CONSTRAINT chk_subscription_status CHECK (status IN (
    'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'DELETED'
  )),

  -- Service-level plan (NOT feature gating — Section 115.6). All plan_types
  -- get the same product features; the differentiator is commitment level +
  -- support tier + service.
  plan_type                   TEXT NOT NULL DEFAULT 'MONTHLY',
  CONSTRAINT chk_subscription_plan_type CHECK (plan_type IN (
    'MONTHLY', 'ANNUAL', 'ENTERPRISE'
  )),

  -- Trial tracking (7-day trial, 3 seats — Section 115.3)
  trial_started_at            TIMESTAMPTZ,
  trial_ends_at               TIMESTAMPTZ,

  -- Seats & pricing snapshot (live values). subscribed_seats supersedes the
  -- shipped Section 114 companies.max_users (same semantic, different home).
  -- minimum_seats_billed enforces the 3-seat floor from research recommendation
  -- (Section 115.3) — even if a company subscribes to 2 seats, billing is for 3.
  subscribed_seats            INTEGER NOT NULL DEFAULT 3,
  minimum_seats_billed        INTEGER NOT NULL DEFAULT 3,
  current_unit_price_cents    INTEGER NOT NULL,
  current_bracket_label       TEXT NOT NULL,

  -- Billing cycle anchor: 1st of month for all tenants (Section 115.3).
  -- billing_anchor_day kept as a column for future flexibility but always 1 today.
  billing_cycle               TEXT NOT NULL DEFAULT 'MONTHLY',
  CONSTRAINT chk_subscription_billing_cycle CHECK (billing_cycle IN (
    'MONTHLY', 'ANNUAL'
  )),
  billing_anchor_day          INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT chk_billing_anchor_day CHECK (billing_anchor_day BETWEEN 1 AND 28),
  last_billed_at              TIMESTAMPTZ,
  next_billing_at             TIMESTAMPTZ,

  -- Cancellation tracking. cancel_at_period_end = "don't auto-renew" flag
  -- (subscription stays ACTIVE for current period, transitions to CANCELLED
  -- at next_billing_at without further user action).
  cancelled_at                TIMESTAMPTZ,
  cancellation_reason         TEXT,
  cancel_at_period_end        BOOLEAN NOT NULL DEFAULT false,

  -- Payment method (placeholder until Phase 9-B Stripe integration in Q4 2026).
  -- 'MANUAL_INVOICE' is what gets used pre-Stripe: Hedar invoices manually,
  -- customer pays via bank transfer / cheque, payment recorded by SUPER_ADMIN.
  payment_method              TEXT,
  CONSTRAINT chk_subscription_payment_method CHECK (
    payment_method IS NULL OR payment_method IN (
      'MANUAL_INVOICE', 'STRIPE_CARD', 'BANK_TRANSFER', 'OTHER'
    )
  ),
  stripe_subscription_id      TEXT,
  stripe_customer_id          TEXT,

  -- Audit + ops
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id          BIGINT REFERENCES public.app_users(id) ON DELETE SET NULL,

  CONSTRAINT uq_subscriptions_company_id UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company ON public.subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON public.subscriptions(next_billing_at)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_ends ON public.subscriptions(trial_ends_at)
  WHERE status = 'TRIAL';

COMMENT ON TABLE public.subscriptions IS
  'Per-company subscription state. One row per company. Section 115/116. Supersedes companies.max_users (deprecated in migration 020).';
COMMENT ON COLUMN public.subscriptions.subscribed_seats IS
  'Number of seats the customer is paying for. Source of truth for invite enforcement (HTTP 402 USER_LIMIT_REACHED).';
COMMENT ON COLUMN public.subscriptions.current_unit_price_cents IS
  'Locked snapshot of the per-seat price in cents. Does not retroactively change when the bracket ladder is updated.';
COMMENT ON COLUMN public.subscriptions.minimum_seats_billed IS
  'Floor for billing. Even if subscribed_seats < this, the customer is billed for this many seats.';

-- ──────────────────────────────────────────────────────────────────────────
-- Table: subscription_seat_changes
-- ──────────────────────────────────────────────────────────────────────────
-- Append-only audit log. Every ADD, REDUCE, or INITIAL seat change creates
-- a row. Monthly invoice generation reads this table to compute prorated
-- charges for mid-cycle changes (Section 116.3).

CREATE TABLE IF NOT EXISTS public.subscription_seat_changes (
  id                  BIGSERIAL PRIMARY KEY,
  subscription_id     BIGINT NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,

  change_type         TEXT NOT NULL,
  CONSTRAINT chk_seat_change_type CHECK (change_type IN ('INITIAL', 'ADD', 'REDUCE')),

  seats_before        INTEGER NOT NULL,
  seats_after         INTEGER NOT NULL,
  delta               INTEGER NOT NULL,  -- positive for ADD, negative for REDUCE, equals seats_after for INITIAL

  -- For ADD: NOW(). For REDUCE: end of current billing period (deferred).
  effective_at        TIMESTAMPTZ NOT NULL,

  -- Charge (ADD) or credit (REDUCE) for partial period. NULL until invoice
  -- generation populates it. Reductions typically populate as 0 because
  -- they take effect end-of-cycle, not mid-cycle (Section 115.3).
  proration_cents     INTEGER,

  reason              TEXT,
  -- invoice_id is added in a separate ALTER TABLE after invoices table exists.
  -- Initially NULL; populated when the next monthly invoice captures this change.

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id  BIGINT REFERENCES public.app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_seat_changes_subscription_effective
  ON public.subscription_seat_changes(subscription_id, effective_at);

COMMENT ON TABLE public.subscription_seat_changes IS
  'Append-only audit log of seat add/remove events. Source for monthly invoice proration. Section 116.3.';

-- ──────────────────────────────────────────────────────────────────────────
-- Table: invoices
-- ──────────────────────────────────────────────────────────────────────────
-- ONE table for all invoice types via the invoice_type ENUM discriminator.
-- Type-specific data lives in the JSONB details column (Section 116.4).
-- Sequential invoice_number per Quebec compliance (CONS-YYYY-NNNN format).

CREATE TABLE IF NOT EXISTS public.invoices (
  id                  BIGSERIAL PRIMARY KEY,
  company_id          BIGINT NOT NULL REFERENCES public.companies(company_id),
  subscription_id     BIGINT REFERENCES public.subscriptions(id),  -- NULL for one-time invoices

  type                invoice_type NOT NULL,
  invoice_number      TEXT NOT NULL,  -- 'CONS-2026-0042'

  -- Status flow per Section 116.7. For SUBSCRIPTION_RECURRING, cron generates
  -- DRAFT → auto-marks APPROVED (customer pre-approved by signup). For
  -- TRAINING and CUSTOM_DEMAND, explicit customer approval required.
  status              TEXT NOT NULL DEFAULT 'DRAFT',
  CONSTRAINT chk_invoice_status CHECK (status IN (
    'DRAFT', 'QUOTE_SENT', 'APPROVED', 'PARTIAL_PAID', 'PAID',
    'OVERDUE', 'VOID', 'REFUNDED'
  )),

  -- Amounts in cents (Section 116.12). Tax stored separately (not derived)
  -- to preserve historical accuracy when rates change.
  subtotal_cents      INTEGER NOT NULL,
  qst_cents           INTEGER NOT NULL DEFAULT 0,
  gst_cents           INTEGER NOT NULL DEFAULT 0,
  total_cents         INTEGER NOT NULL,
  amount_paid_cents   INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'CAD',
  CONSTRAINT chk_invoice_currency CHECK (currency IN ('CAD', 'USD')),

  -- Dates
  issue_date          DATE NOT NULL,
  due_date            DATE,
  paid_date           DATE,
  quote_expires_at    DATE,  -- only used for DRAFT / QUOTE_SENT

  -- Type-specific details (Section 116.4 documents the shape per invoice_type)
  details             JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Customer-facing artifacts + notes
  pdf_url             TEXT,
  customer_notes      TEXT,  -- visible on PDF
  internal_notes      TEXT,  -- SUPER_ADMIN only, never on PDF

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id  BIGINT REFERENCES public.app_users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  approved_by         TEXT,  -- customer email, or 'system' for auto-approved subscription invoices

  CONSTRAINT uq_invoice_number UNIQUE (invoice_number),

  -- Sanity: total = subtotal + qst + gst (when stored). Done as CHECK to
  -- catch application bugs before they hit production.
  CONSTRAINT chk_invoice_total_matches CHECK (total_cents = subtotal_cents + qst_cents + gst_cents),

  -- Sanity: amount_paid_cents ≥ 0 and ≤ total_cents (allow rounding for refunds via separate adjustment)
  CONSTRAINT chk_invoice_amount_paid_bounds CHECK (
    amount_paid_cents >= 0 AND amount_paid_cents <= total_cents
  )
);

CREATE INDEX IF NOT EXISTS idx_invoices_company_status ON public.invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON public.invoices(type);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date)
  WHERE status IN ('APPROVED', 'PARTIAL_PAID', 'OVERDUE');
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON public.invoices(subscription_id)
  WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);

COMMENT ON TABLE public.invoices IS
  'All invoices (subscription, training, custom demand, other) with type discriminator. Section 116.4. Sequential invoice_number per Quebec compliance.';
COMMENT ON COLUMN public.invoices.details IS
  'Type-specific data as JSONB. See DECISIONS.md Section 116.4 for the shape per invoice_type.';

-- Now that invoices exists, add the FK link from seat_changes back to invoices.
ALTER TABLE public.subscription_seat_changes
  ADD COLUMN IF NOT EXISTS invoice_id BIGINT REFERENCES public.invoices(id);

CREATE INDEX IF NOT EXISTS idx_seat_changes_invoice
  ON public.subscription_seat_changes(invoice_id)
  WHERE invoice_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- Table: payments
-- ──────────────────────────────────────────────────────────────────────────
-- Payment events linked to invoices. Supports partial payments (is_partial
-- = true for 50/50 training first payment) and external references for
-- non-Stripe payment methods (cheque #, bank reference, etc.). When a payment
-- is recorded with status=SUCCEEDED, application logic updates the parent
-- invoice's amount_paid_cents and re-evaluates status (PAID if fully paid,
-- PARTIAL_PAID if not).

CREATE TABLE IF NOT EXISTS public.payments (
  id                  BIGSERIAL PRIMARY KEY,
  invoice_id          BIGINT NOT NULL REFERENCES public.invoices(id),

  amount_cents        INTEGER NOT NULL,
  CONSTRAINT chk_payment_amount_positive CHECK (amount_cents > 0),
  currency            TEXT NOT NULL DEFAULT 'CAD',
  CONSTRAINT chk_payment_currency CHECK (currency IN ('CAD', 'USD')),

  method              TEXT NOT NULL,
  CONSTRAINT chk_payment_method CHECK (method IN (
    'STRIPE_CARD', 'BANK_TRANSFER', 'CHEQUE', 'CASH', 'OTHER'
  )),

  status              TEXT NOT NULL DEFAULT 'PENDING',
  CONSTRAINT chk_payment_status CHECK (status IN (
    'PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'
  )),

  paid_at             TIMESTAMPTZ,

  external_ref        TEXT,  -- Stripe payment_intent_id, bank reference, cheque #, etc.

  is_partial          BOOLEAN NOT NULL DEFAULT false,  -- true for 50/50 first payment

  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by_user_id BIGINT REFERENCES public.app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at)
  WHERE status = 'SUCCEEDED';

COMMENT ON TABLE public.payments IS
  'Payment events linked to invoices. Supports partial payments (50/50 training). Section 116.5.';

-- ──────────────────────────────────────────────────────────────────────────
-- Table: tax_rates
-- ──────────────────────────────────────────────────────────────────────────
-- Quebec tax rate history. Rates stored as basis points (1/100 of 1%) to
-- avoid floating-point math. Invoices look up the rate active at their
-- issue_date via:
--   SELECT rate_basis_points FROM tax_rates
--    WHERE jurisdiction = ? AND tax_name = ?
--      AND effective_from <= issue_date
--      AND (effective_until IS NULL OR issue_date < effective_until)
--    ORDER BY effective_from DESC LIMIT 1

CREATE TABLE IF NOT EXISTS public.tax_rates (
  id                  BIGSERIAL PRIMARY KEY,
  jurisdiction        TEXT NOT NULL,  -- 'QC' | 'FEDERAL'
  tax_name            TEXT NOT NULL,  -- 'QST' | 'GST'
  rate_basis_points   INTEGER NOT NULL,  -- 9975 = 9.975%, 500 = 5%
  CONSTRAINT chk_tax_rate_positive CHECK (rate_basis_points >= 0 AND rate_basis_points <= 10000),
  effective_from      DATE NOT NULL,
  effective_until     DATE,  -- NULL = currently active
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tax_effective_order CHECK (
    effective_until IS NULL OR effective_until > effective_from
  )
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_lookup
  ON public.tax_rates(jurisdiction, tax_name, effective_from DESC);

COMMENT ON TABLE public.tax_rates IS
  'Quebec tax rate history. Rates in basis points (integer) to avoid floating-point. Section 116.6.';

-- Seed initial rates (current as of May 2026).
-- QST: 9.975% since 2013 (Revenu Québec)
-- GST: 5% since 2008 (CRA)
INSERT INTO public.tax_rates (jurisdiction, tax_name, rate_basis_points, effective_from, notes)
VALUES
  ('QC',      'QST', 9975, '2013-01-01', 'Quebec Sales Tax — 9.975% since 2013 (Revenu Québec)'),
  ('FEDERAL', 'GST', 500,  '2008-01-01', 'Federal Goods and Services Tax — 5% since 2008 (CRA)')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- Post-migration sanity checks
-- ──────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  expected_tables TEXT[] := ARRAY[
    'subscriptions', 'subscription_seat_changes', 'invoices', 'payments', 'tax_rates'
  ];
  missing_count INTEGER;
  tax_rate_count INTEGER;
BEGIN
  -- All 5 tables exist?
  SELECT COUNT(*) INTO missing_count
  FROM unnest(expected_tables) AS t(tname)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t.tname
  );
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Migration 018 abort: % expected tables missing after create', missing_count;
  END IF;

  -- invoice_type ENUM exists?
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_type') THEN
    RAISE EXCEPTION 'Migration 018 abort: invoice_type ENUM was not created';
  END IF;

  -- Tax rates seeded?
  SELECT COUNT(*) INTO tax_rate_count FROM public.tax_rates;
  IF tax_rate_count < 2 THEN
    RAISE EXCEPTION 'Migration 018 abort: expected ≥2 tax_rates rows after seed, got %', tax_rate_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration manual verification (run after COMMIT to confirm):
-- ============================================================================
--
-- \dt public.subscriptions
-- \dt public.subscription_seat_changes
-- \dt public.invoices
-- \dt public.payments
-- \dt public.tax_rates
--   -- All 5 tables should appear
--
-- \dT+ invoice_type
--   -- ENUM with 4 values: SUBSCRIPTION_RECURRING, TRAINING, CUSTOM_DEMAND, OTHER
--
-- SELECT jurisdiction, tax_name, rate_basis_points, effective_from
--   FROM public.tax_rates ORDER BY jurisdiction, tax_name;
--   -- Expect 2 rows: QC/QST/9975, FEDERAL/GST/500
--
-- \d public.subscriptions
--   -- Should show UNIQUE(company_id), all CHECK constraints, indexes
--
-- \d public.invoices
--   -- Should show invoice_type column, UNIQUE(invoice_number),
--   -- chk_invoice_total_matches, chk_invoice_amount_paid_bounds
--
-- SELECT COUNT(*) FROM public.subscriptions;  -- 0 expected (backfill is migration 019)
