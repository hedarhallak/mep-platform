-- db/migrations/005e2_fix_app_users_role_check_normalize.sql
BEGIN;

UPDATE public.app_users
SET role = UPPER(role)
WHERE role IS NOT NULL;

UPDATE public.app_users
SET role = 'WORKER'
WHERE role IS NULL OR BTRIM(role) = '';

UPDATE public.app_users
SET role = 'WORKER'
WHERE role NOT IN ('ADMIN', 'PM', 'FOREMAN', 'WORKER');

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
