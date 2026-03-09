-- db/migrations/005e_fix_app_users_role_check_add_worker.sql
-- Fix signup failure: allow role 'WORKER' in app_users_role_check constraint.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_users_role_check'
      AND conrelid = 'public.app_users'::regclass
  ) THEN
    ALTER TABLE public.app_users DROP CONSTRAINT app_users_role_check;
  END IF;
END$$;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('ADMIN', 'PM', 'FOREMAN', 'WORKER'));

COMMIT;
