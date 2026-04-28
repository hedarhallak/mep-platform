-- db/migrations/005e3_fix_app_users_role_check_drop_then_normalize.sql
-- The previous migration failed because the OLD check constraint rejects role='WORKER'.
-- So we must DROP the existing constraint first, then normalize data, then recreate constraint.

BEGIN;

-- 1) Drop existing constraint first (if present)
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

-- 2) Normalize roles
UPDATE public.app_users
SET role = UPPER(role)
WHERE role IS NOT NULL;

UPDATE public.app_users
SET role = 'WORKER'
WHERE role IS NULL OR BTRIM(role) = '';

UPDATE public.app_users
SET role = 'WORKER'
WHERE role NOT IN ('ADMIN', 'PM', 'FOREMAN', 'WORKER');

-- 3) Recreate constraint allowing WORKER
ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('ADMIN', 'PM', 'FOREMAN', 'WORKER'));

COMMIT;
