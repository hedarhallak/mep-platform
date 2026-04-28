-- REPLACEMENT? NO. ADD new migration file.
-- File: mep-site-backend/db/migrations/011_user_activation_email_tokens.sql
-- Purpose: Prepare Email Link (Token) activation flow without breaking current invite-code signup or existing logins.
-- Safety: Adds only nullable columns / new table + indexes with IF NOT EXISTS guards.

BEGIN;

-- 1) App users: add email column (nullable for now to avoid breaking existing rows).
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS email text;

-- 2) App users: activation bookkeeping (nullable; used by future email-link activation flow).
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS activation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- Optional: keep a reference to the latest invite used (future use; nullable).
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS last_invite_id bigint;

-- 3) Unique email per company (case-insensitive). Allow NULLs for legacy rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'app_users_company_email_uniq'
  ) THEN
    CREATE UNIQUE INDEX app_users_company_email_uniq
      ON public.app_users (company_id, lower(email))
      WHERE email IS NOT NULL;
  END IF;
END $$;

-- 4) New invites table for Email Link Token activation (separate from invite_code flow).
CREATE TABLE IF NOT EXISTS public.user_invites (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NULL,
  employee_id BIGINT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | USED | REVOKED | EXPIRED
  created_by_user_id BIGINT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NULL,
  used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL
);

-- 5) Indexes for user_invites
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='user_invites_company_email_active_uniq'
  ) THEN
    -- One ACTIVE invite per email per company at a time (historical rows allowed).
    CREATE UNIQUE INDEX user_invites_company_email_active_uniq
      ON public.user_invites (company_id, lower(email))
      WHERE status = 'ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='user_invites_token_hash_uniq'
  ) THEN
    CREATE UNIQUE INDEX user_invites_token_hash_uniq
      ON public.user_invites (token_hash);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='user_invites_expires_at_idx'
  ) THEN
    CREATE INDEX user_invites_expires_at_idx
      ON public.user_invites (expires_at);
  END IF;
END $$;

COMMIT;
