-- migrations/036_app_users_role_fk.sql
--
-- Professional permissions — Phase 1b (DECISIONS §148). Replaces the hardcoded
-- `app_users_role_check` CHECK constraint (which enumerated valid roles, so
-- every new role meant editing the constraint) with a FOREIGN KEY to the
-- data-driven `roles` catalog. After this, adding a role is a pure INSERT into
-- `public.roles` — no constraint edit, no code change at the DB layer.
--
-- SAFETY: verified on prod first (§139.2) — all 12 distinct app_users.role
-- values already exist in `roles` (migration 035 seeded the 14 canonical), so
-- the FK can be added without rejecting any existing row.
--
-- ON DELETE is left as the default (NO ACTION/RESTRICT): a role that any user
-- still holds CANNOT be deleted — the right guard. ON UPDATE CASCADE so a
-- future role_key rename propagates to app_users.
--
-- roles.role_key already carries a UNIQUE constraint (migration 029 relies on
-- ON CONFLICT (role_key)), so it is a valid FK target.
--
-- GRANTs: none. Idempotent: DROP IF EXISTS + ADD guarded by a catalog check.

BEGIN;

-- Drop the enumerated CHECK (added in migration 029).
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

-- Add the FK only if it isn't already present (idempotent re-run).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'app_users_role_fk'
       AND conrelid = 'public.app_users'::regclass
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_role_fk
      FOREIGN KEY (role) REFERENCES public.roles(role_key)
      ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
