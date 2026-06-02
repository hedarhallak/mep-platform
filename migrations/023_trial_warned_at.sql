-- migrations/023_trial_warned_at.sql
--
-- Phase 6-D-7 PR3 / Section 125.6 — trial-expiry warning emails.
--
-- Adds one column to public.subscriptions so the daily trial-expiry job can
-- warn a tenant's COMPANY_ADMIN N days before their trial ends WITHOUT
-- re-warning the same trial every day (idempotency marker).
--
-- Column:
--   - trial_warned_at (TIMESTAMPTZ, NULL):
--       When the pre-expiry warning email was sent for the current trial.
--       NULL = not yet warned. The job sets it to NOW() after a successful
--       send and only considers TRIAL subscriptions where it IS NULL.
--
-- No new GRANTs needed: a new column on an existing table inherits the
-- table-level privileges granted to mepuser / mepuser_super in migration 020.
--
-- Idempotent: re-running is a no-op.

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_warned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.subscriptions.trial_warned_at IS
  'When the pre-expiry warning email was sent for the current trial. NULL = not yet warned. Section 125.6.';

-- Partial index for the daily job: only TRIAL subs that still need warning.
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_unwarned
  ON public.subscriptions(trial_ends_at)
  WHERE status = 'TRIAL' AND trial_warned_at IS NULL;

COMMIT;
