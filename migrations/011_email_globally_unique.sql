-- Section 85/86/87 — Migrate authentication from username (globally unique)
-- to email (globally unique) for the Model C single-domain architecture.
--
-- Section 85 architectural pivot established Model C: all users log in at
-- app.constrai.ca with email + PIN. The backend resolves email → company_id
-- and bakes it into the JWT. This requires email to be globally unique
-- (currently it's only per-company unique).
--
-- Audit run on May 6, 2026 confirmed:
-- - 53 users total, all in company_id=5 (MEP Construction, the dev/test tenant)
-- - 0 users have the email field set; all email info is currently in the
--   username field
-- - 50 users have email-formatted usernames (seed.workerN@meptest.com)
-- - 3 users have plain usernames: admin, hedar, badie
-- - No duplicate emails across companies
--
-- Migration plan:
-- 1. Set company_code='mep' for company_id=5 (currently empty string)
-- 2. Hard-delete badie user (id=258) per Hedar's instruction; he will re-add
--    through the proper SUPER_ADMIN procedure later
-- 3. Backfill emails:
--    - Seed workers (50): email = username (already email-formatted)
--    - admin (id=257): synthetic admin@mep.constrai.app
--    - hedar (id=259): real email hedar.hallak@gmail.com
-- 4. Drop UNIQUE(username) constraint (username becomes display-only)
-- 5. Drop UNIQUE(company_id, lower(email)) per-company index
-- 6. Add UNIQUE(lower(email)) global index
-- 7. Add NOT NULL on email
--
-- Code changes shipped with this migration (separate commits):
--   - routes/auth.js: login by email instead of username
--   - mep-frontend: login form uses email field
--   - mep-mobile: login form uses email field
--
-- Rollback strategy: this migration is wrapped in a transaction; if any step
-- fails, all changes roll back. Pre-migration backup is at
-- /root/backups/mepdb-pre-migration-011-YYYYMMDD.dump (taken manually before
-- running this migration on prod).

BEGIN;

-- ============================================================================
-- 1. Set company_code for MEP Construction (currently empty)
-- ============================================================================
UPDATE public.companies
   SET company_code = 'mep'
 WHERE company_id = 5
   AND (company_code IS NULL OR company_code = '');

-- ============================================================================
-- 2. Hard-delete badie user (id=258)
-- ============================================================================
-- Clean up known FK reference first; if other tables block the delete, the
-- transaction will roll back and we'll need to investigate.
DELETE FROM public.refresh_tokens WHERE user_id = 258;
DELETE FROM public.app_users WHERE id = 258;

-- ============================================================================
-- 3. Backfill emails
-- ============================================================================
-- 3a. Seed workers (email-formatted username → email field)
UPDATE public.app_users
   SET email = username
 WHERE (email IS NULL OR email = '')
   AND username LIKE '%@%';

-- 3b. admin (id=257) → synthetic email tied to company_code 'mep'
UPDATE public.app_users
   SET email = 'admin@mep.constrai.app'
 WHERE id = 257;

-- 3c. hedar (id=259) → real email
UPDATE public.app_users
   SET email = 'hedar.hallak@gmail.com'
 WHERE id = 259;

-- 3d. Verification: every user must now have a non-empty email
DO $$
DECLARE
  missing INT;
BEGIN
  SELECT COUNT(*) INTO missing
    FROM public.app_users
   WHERE email IS NULL OR email = '';
  IF missing > 0 THEN
    RAISE EXCEPTION 'Migration 011 abort: % users still have no email after backfill', missing;
  END IF;
END$$;

-- ============================================================================
-- 4. Drop username unique constraint (kept as display column only)
-- ============================================================================
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_username_key;

-- ============================================================================
-- 5. Drop per-company email unique index
-- ============================================================================
DROP INDEX IF EXISTS public.app_users_company_email_uniq;

-- ============================================================================
-- 6. Add global email unique index (case-insensitive)
-- ============================================================================
CREATE UNIQUE INDEX app_users_email_global_uniq
    ON public.app_users (lower(email));

-- ============================================================================
-- 7. Make email NOT NULL
-- ============================================================================
ALTER TABLE public.app_users ALTER COLUMN email SET NOT NULL;

COMMIT;

-- ============================================================================
-- Post-migration verification (run manually after COMMIT)
-- ============================================================================
-- SELECT id, username, email, role FROM public.app_users ORDER BY id;
-- SELECT COUNT(*) FROM public.app_users WHERE email IS NULL OR email = '';
--   -- expect 0
-- SELECT lower(email), COUNT(*) FROM public.app_users GROUP BY lower(email) HAVING COUNT(*) > 1;
--   -- expect empty
-- SELECT company_id, company_code, name FROM public.companies;
--   -- expect company_id=5 has company_code='mep'
