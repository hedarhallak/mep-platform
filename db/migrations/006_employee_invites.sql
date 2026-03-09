-- db/migrations/006_employee_invites.sql
-- Phase: Employee Signup via Employee-Linked Invite
-- Adds: public.employee_invites (safe, no FK assumptions)
-- Policy:
--  - Invite codes are one-time use
--  - Default expiry is enforced in API (48h), DB stores expires_at
--  - Regeneration is allowed but must be audited with a note (enforced in API)

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_invites (
  id BIGSERIAL PRIMARY KEY,
  invite_code TEXT NOT NULL,
  employee_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | USED | REVOKED | EXPIRED
  note TEXT NULL,                       -- admin audit note (required for regeneration in API)
  created_by_user_id BIGINT NULL,       -- app_users.id of admin who generated it
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL
);

-- Safe indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='idx_employee_invites_invite_code'
  ) THEN
    CREATE UNIQUE INDEX idx_employee_invites_invite_code
      ON public.employee_invites(invite_code);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='idx_employee_invites_employee_id'
  ) THEN
    CREATE INDEX idx_employee_invites_employee_id
      ON public.employee_invites(employee_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='idx_employee_invites_status'
  ) THEN
    CREATE INDEX idx_employee_invites_status
      ON public.employee_invites(status);
  END IF;
END$$;

COMMIT;
