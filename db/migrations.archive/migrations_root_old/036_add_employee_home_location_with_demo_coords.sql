-- ============================================================================
-- Migration 036: Add employee_profiles.home_location + populate demo coords
-- ----------------------------------------------------------------------------
-- Why this exists:
--   The route code (routes/assignments.js, routes/auto_assign.js,
--   routes/onboarding.js) queries employee_profiles.home_location as a
--   PostGIS geometry(Point, 4326). The column was NEVER actually created in
--   production. As a result:
--     - GET /api/assignments/employees-map silently returns 500
--     - Workforce planner shows zero employees on the map
--     - /auto-suggest distance calculation throws on every call
--   routes/profile.js is the only consumer that survives — it checks
--   information_schema first ("if profCols.has('home_location')") before
--   referencing it.
--
--   This migration aligns the DB with what the code already expects.
--
-- What it does:
--   1. Adds the missing geometry column (idempotent: IF NOT EXISTS).
--   2. Populates home_lat/home_lng on the 50 demo employees (company_id=5)
--      with random coords distributed across Greater Montreal — roughly a
--      50 km x 50 km box covering Montreal Island, Laval, the North Shore
--      (Saint-Eustache), and the South Shore. This produces a realistic
--      spread so distance-based assignment / workforce planner demos look
--      meaningful relative to the 3 project sites we just set up.
--   3. Mirrors the lat/lng values into the new home_location PostGIS column
--      so any code path that uses ST_X / ST_Y / ST_Distance also works.
--
-- Date:    2026-04-26
-- Scope:   employee_profiles rows whose employee belongs to company_id = 5
--
-- Safety:
--   - Wrapped in a single transaction.
--   - The lat/lng UPDATE only runs for rows where home_lat is currently NULL
--     or zero (won't overwrite real data if any exists).
--   - The PostGIS UPDATE only runs for rows where lat/lng are populated.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Add the missing PostGIS column the route code already expects
-- ----------------------------------------------------------------------------
ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS home_location geometry(Point, 4326);

-- Spatial index for distance queries (used by workforce planner)
CREATE INDEX IF NOT EXISTS idx_employee_profiles_home_location
  ON public.employee_profiles
  USING GIST (home_location);

-- ----------------------------------------------------------------------------
-- 2. Populate random Greater Montreal coords for the 50 demo employees
--    Bounding box:
--      lat:  45.3 to 45.8   (~55 km N-S)
--      lng: -74.0 to -73.4  (~47 km E-W at this latitude)
--    Center: approx 45.55, -73.7  (near Montreal / Laval border)
-- ----------------------------------------------------------------------------
UPDATE public.employee_profiles
   SET home_lat = 45.3 + (random() * 0.5),
       home_lng = -74.0 + (random() * 0.6),
       updated_at = NOW()
 WHERE employee_id IN (SELECT id FROM public.employees WHERE company_id = 5)
   AND (home_lat IS NULL OR home_lat = 0);

-- ----------------------------------------------------------------------------
-- 3. Mirror lat/lng into the PostGIS home_location column
--    (Note ST_MakePoint takes longitude first, then latitude)
-- ----------------------------------------------------------------------------
UPDATE public.employee_profiles
   SET home_location = ST_SetSRID(ST_MakePoint(home_lng, home_lat), 4326)
 WHERE employee_id IN (SELECT id FROM public.employees WHERE company_id = 5)
   AND home_lat IS NOT NULL
   AND home_lng IS NOT NULL
   AND home_lat <> 0
   AND home_lng <> 0;

-- ----------------------------------------------------------------------------
-- 4. Verification (printed when run via psql)
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*)                AS total_profiles,
  COUNT(home_lat)         AS with_lat,
  COUNT(home_location)    AS with_postgis_location,
  ROUND(MIN(home_lat)::numeric, 4) AS min_lat,
  ROUND(MAX(home_lat)::numeric, 4) AS max_lat,
  ROUND(MIN(home_lng)::numeric, 4) AS min_lng,
  ROUND(MAX(home_lng)::numeric, 4) AS max_lng
FROM public.employee_profiles
WHERE employee_id IN (SELECT id FROM public.employees WHERE company_id = 5);

COMMIT;
