-- ============================================================================
-- 020_billing_schema_grants.rollback.sql
--
-- Rollback for migration 020. REVOKEs the explicit grants on the 5 billing
-- tables + reverts the ALTER DEFAULT PRIVILEGES for the public schema.
--
-- ⚠️ WARNING ⚠️
-- Running this rollback on prod will RE-BREAK the application: routes that
-- read from subscriptions/invoices/payments/etc. will start returning
-- `permission denied for table X` (Postgres code 42501). The Section 117
-- hot-fix that was applied manually on May 24 would also be reverted.
--
-- Only run this rollback in a lower environment (test, staging) where
-- breaking the app is acceptable. On prod, the right way to undo is
-- "revert the PR" which re-applies migration 020 anyway (so rollback
-- never gets executed on prod in practice).
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- Revert Part 2 first: ALTER DEFAULT PRIVILEGES
-- ──────────────────────────────────────────────────────────────────────────

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM mepuser;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM mepuser;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mepuser_super') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM mepuser_super;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE USAGE, SELECT ON SEQUENCES FROM mepuser_super;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Revert Part 1: explicit GRANTs on the 5 billing tables
-- ──────────────────────────────────────────────────────────────────────────

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.subscriptions              FROM mepuser;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.subscription_seat_changes  FROM mepuser;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.invoices                   FROM mepuser;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payments                   FROM mepuser;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.tax_rates                  FROM mepuser;

REVOKE USAGE, SELECT ON SEQUENCE public.subscriptions_id_seq                FROM mepuser;
REVOKE USAGE, SELECT ON SEQUENCE public.subscription_seat_changes_id_seq    FROM mepuser;
REVOKE USAGE, SELECT ON SEQUENCE public.invoices_id_seq                     FROM mepuser;
REVOKE USAGE, SELECT ON SEQUENCE public.payments_id_seq                     FROM mepuser;
REVOKE USAGE, SELECT ON SEQUENCE public.tax_rates_id_seq                    FROM mepuser;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mepuser_super') THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.subscriptions              FROM mepuser_super;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.subscription_seat_changes  FROM mepuser_super;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.invoices                   FROM mepuser_super;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payments                   FROM mepuser_super;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.tax_rates                  FROM mepuser_super;

    REVOKE USAGE, SELECT ON SEQUENCE public.subscriptions_id_seq                FROM mepuser_super;
    REVOKE USAGE, SELECT ON SEQUENCE public.subscription_seat_changes_id_seq    FROM mepuser_super;
    REVOKE USAGE, SELECT ON SEQUENCE public.invoices_id_seq                     FROM mepuser_super;
    REVOKE USAGE, SELECT ON SEQUENCE public.payments_id_seq                     FROM mepuser_super;
    REVOKE USAGE, SELECT ON SEQUENCE public.tax_rates_id_seq                    FROM mepuser_super;
  END IF;
END $$;

COMMIT;
