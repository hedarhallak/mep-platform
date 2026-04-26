-- ============================================================================
-- Migration 039: Sync triggers + drop dead employees columns
-- ----------------------------------------------------------------------------
-- Resolves audit findings:
--   H11 — drop employees.home_lat / home_lng (dead — never read or written)
--   M5  — drop employees.phone (dead — never read or written)
--   M1  — sync employees.contact_email → employee_profiles.contact_email
--   M2  — sync app_users.role → employee_profiles.role_code
--   M6  — sync employees.first_name+last_name → employee_profiles.full_name
--   M3  — sync employee_profiles.home_lat+home_lng → home_location (PostGIS)
--
-- Strategy:
--   For duplicate fields where the canonical source and the read site
--   differ, install a database trigger that propagates writes to the
--   read side so reads always see fresh data. Then backfill once so
--   any historical drift is cleaned up.
--
--   For the dead employees columns, drop them outright after verifying
--   no recent writes (zero non-NULL rows would also be acceptable, but
--   the audit verified there are no writes from any code path).
--
-- Safety:
--   Whole migration in a single transaction. If any trigger or backfill
--   fails, everything rolls back.
--   Column drops are irreversible — relies on the latest backup taken
--   immediately before this migration runs (operator responsibility).
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION A — Sync triggers + functions
-- ============================================================================

-- ── 1. employees.first_name+last_name → employee_profiles.full_name ─────────
CREATE OR REPLACE FUNCTION public.sync_employee_full_name()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.employee_profiles
     SET full_name = TRIM(BOTH ' ' FROM CONCAT_WS(' ', NEW.first_name, NEW.last_name)),
         updated_at = NOW()
   WHERE employee_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_employee_full_name ON public.employees;
CREATE TRIGGER trg_sync_employee_full_name
AFTER INSERT OR UPDATE OF first_name, last_name ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.sync_employee_full_name();

-- ── 2. employees.contact_email → employee_profiles.contact_email ────────────
CREATE OR REPLACE FUNCTION public.sync_employee_contact_email()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.employee_profiles
     SET contact_email = NEW.contact_email,
         updated_at = NOW()
   WHERE employee_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_employee_contact_email ON public.employees;
CREATE TRIGGER trg_sync_employee_contact_email
AFTER INSERT OR UPDATE OF contact_email ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.sync_employee_contact_email();

-- ── 3. app_users.role → employee_profiles.role_code ─────────────────────────
CREATE OR REPLACE FUNCTION public.sync_app_user_role_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    UPDATE public.employee_profiles
       SET role_code = NEW.role,
           updated_at = NOW()
     WHERE employee_id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_app_user_role_to_profile ON public.app_users;
CREATE TRIGGER trg_sync_app_user_role_to_profile
AFTER INSERT OR UPDATE OF role, employee_id ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.sync_app_user_role_to_profile();

-- ── 4. employee_profiles.home_lat+home_lng → home_location (PostGIS) ────────
-- BEFORE trigger so we can modify NEW directly before the row is written
CREATE OR REPLACE FUNCTION public.sync_employee_home_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.home_lat IS NOT NULL AND NEW.home_lng IS NOT NULL
     AND NEW.home_lat <> 0 AND NEW.home_lng <> 0
  THEN
    NEW.home_location := ST_SetSRID(ST_MakePoint(NEW.home_lng, NEW.home_lat), 4326);
  ELSIF NEW.home_lat IS NULL OR NEW.home_lng IS NULL THEN
    NEW.home_location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_home_location ON public.employee_profiles;
CREATE TRIGGER trg_sync_home_location
BEFORE INSERT OR UPDATE OF home_lat, home_lng ON public.employee_profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_employee_home_location();

-- ============================================================================
-- SECTION B — One-time backfill (close any historical drift)
-- ============================================================================

-- Backfill full_name from employees → employee_profiles
UPDATE public.employee_profiles ep
   SET full_name = TRIM(BOTH ' ' FROM CONCAT_WS(' ', e.first_name, e.last_name)),
       updated_at = NOW()
  FROM public.employees e
 WHERE ep.employee_id = e.id
   AND COALESCE(ep.full_name, '') <> TRIM(BOTH ' ' FROM CONCAT_WS(' ', e.first_name, e.last_name));

-- Backfill contact_email from employees → employee_profiles
UPDATE public.employee_profiles ep
   SET contact_email = e.contact_email,
       updated_at = NOW()
  FROM public.employees e
 WHERE ep.employee_id = e.id
   AND COALESCE(ep.contact_email, '') IS DISTINCT FROM COALESCE(e.contact_email, '');

-- Backfill role_code from app_users → employee_profiles
UPDATE public.employee_profiles ep
   SET role_code = au.role,
       updated_at = NOW()
  FROM public.app_users au
 WHERE au.employee_id = ep.employee_id
   AND COALESCE(ep.role_code, '') IS DISTINCT FROM COALESCE(au.role, '');

-- Backfill home_location from lat/lng (in case any rows were missed by mig 036)
UPDATE public.employee_profiles
   SET home_location = ST_SetSRID(ST_MakePoint(home_lng, home_lat), 4326)
 WHERE home_lat IS NOT NULL AND home_lng IS NOT NULL
   AND home_lat <> 0 AND home_lng <> 0
   AND (home_location IS NULL
        OR ST_X(home_location::geometry) IS DISTINCT FROM home_lng
        OR ST_Y(home_location::geometry) IS DISTINCT FROM home_lat);

-- ============================================================================
-- SECTION C — Drop dead employees columns (verified by audit: never read/written)
-- ============================================================================

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS home_lat,
  DROP COLUMN IF EXISTS home_lng,
  DROP COLUMN IF EXISTS phone;

-- ============================================================================
-- SECTION D — Verification
-- ============================================================================

-- Sanity: triggers installed
SELECT trigger_name, event_object_table, event_manipulation
  FROM information_schema.triggers
 WHERE trigger_schema = 'public'
   AND trigger_name IN (
     'trg_sync_employee_full_name',
     'trg_sync_employee_contact_email',
     'trg_sync_app_user_role_to_profile',
     'trg_sync_home_location'
   )
 ORDER BY trigger_name;
-- Expected: 4 rows.

-- Sanity: dead columns dropped from employees
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'employees'
   AND column_name IN ('home_lat', 'home_lng', 'phone');
-- Expected: 0 rows (all 3 dropped).

COMMIT;
