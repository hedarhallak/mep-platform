-- db/migrations/SAFE_012_app_users_profile_status_state_machine.sql
-- Additive ONLY: introduces app_users.profile_status state machine.
-- Goal (Step 1): Add column safely with default/backfill so NOTHING breaks.
-- States: NEW | INCOMPLETE | COMPLETED
--
-- Safety rules:
--  - Only runs if public.app_users exists
--  - Adds column if missing
--  - Backfills NULL to COMPLETED (so existing users are unaffected)
--  - Adds CHECK constraint if missing

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='app_users'
  ) THEN

    -- 1) Add column (safe)
    ALTER TABLE public.app_users
      ADD COLUMN IF NOT EXISTS profile_status TEXT;

    -- 2) Ensure default is COMPLETED (safe even if already set)
    ALTER TABLE public.app_users
      ALTER COLUMN profile_status SET DEFAULT 'COMPLETED';

    -- 3) Backfill: keep existing users unaffected
    UPDATE public.app_users
      SET profile_status = 'COMPLETED'
      WHERE profile_status IS NULL;

    -- 4) Add CHECK constraint (safe)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_app_users_profile_status'
    ) THEN
      ALTER TABLE public.app_users
        ADD CONSTRAINT ck_app_users_profile_status
        CHECK (profile_status IN ('NEW','INCOMPLETE','COMPLETED'));
    END IF;

  END IF;
END$$;

COMMIT;
