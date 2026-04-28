-- ============================================================================
-- Migration 034: Update demo project addresses + delete unused projects
-- ----------------------------------------------------------------------------
-- Purpose:
--   Replace generic test addresses on 3 demo projects with 3 real Quebec
--   locations to enable geographic distribution testing (workforce planner
--   needs distinct site_lat/site_lng per project). Delete 2 unused projects.
--
--   New addresses:
--     PROJ-11 (Alpha) -> 3175 Chem. de la Cote-Sainte-Catherine, Montreal
--     PROJ-12 (Beta)  -> 520 Bd Arthur-Sauve, Saint-Eustache
--     PROJ-21 (Gamma) -> 9449 Rue de Tilly, Laval
--     PROJ-22 (Delta)   -> DELETED
--     PROJ-23 (Epsilon) -> DELETED
--
-- Date:    2026-04-22
-- Scope:   company_id = 5 only
--
-- Safety:
--   Wrapped in a single transaction. Pre-checks for assignment_requests,
--   assignments, attendance_records, and material_requests on the projects
--   being deleted; aborts with a clear error if any exist (transaction
--   rolls back, nothing changes).
--
-- After running:
--   Run the existing geocoder to populate site_lat/site_lng/geocoded_at:
--     node scripts/geocode_projects.js
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Safety check: ensure PROJ-22 and PROJ-23 are safe to delete
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  ar_count  INT;
  a_count   INT;
  att_count INT;
  mr_count  INT;
BEGIN
  SELECT COUNT(*) INTO ar_count
  FROM public.assignment_requests ar
  JOIN public.projects p ON p.id = ar.project_id
  WHERE p.project_code IN ('PROJ-22', 'PROJ-23')
    AND p.company_id  = 5;

  SELECT COUNT(*) INTO a_count
  FROM public.assignments a
  JOIN public.projects p ON p.id = a.project_id
  WHERE p.project_code IN ('PROJ-22', 'PROJ-23')
    AND p.company_id  = 5;

  SELECT COUNT(*) INTO att_count
  FROM public.attendance_records att
  JOIN public.projects p ON p.id = att.project_id
  WHERE p.project_code IN ('PROJ-22', 'PROJ-23')
    AND p.company_id  = 5;

  SELECT COUNT(*) INTO mr_count
  FROM public.material_requests mr
  JOIN public.projects p ON p.id = mr.project_id
  WHERE p.project_code IN ('PROJ-22', 'PROJ-23')
    AND p.company_id  = 5;

  IF ar_count > 0 OR a_count > 0 OR att_count > 0 OR mr_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete PROJ-22/PROJ-23. Found: assignment_requests=%, assignments=%, attendance_records=%, material_requests=%. Migration aborted.',
      ar_count, a_count, att_count, mr_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Update 3 project addresses (null out coords for re-geocoding)
-- ----------------------------------------------------------------------------

UPDATE public.projects
SET
  site_address   = '3175 Chem. de la Cote-Sainte-Catherine, Montreal, QC H3T 1C5',
  site_lat       = NULL,
  site_lng       = NULL,
  geocoded_at    = NULL,
  geocode_source = NULL
WHERE project_code = 'PROJ-11'
  AND company_id   = 5;

UPDATE public.projects
SET
  site_address   = '520 Bd Arthur-Sauve, Saint-Eustache, QC J7R 5B1',
  site_lat       = NULL,
  site_lng       = NULL,
  geocoded_at    = NULL,
  geocode_source = NULL
WHERE project_code = 'PROJ-12'
  AND company_id   = 5;

UPDATE public.projects
SET
  site_address   = '9449 Rue de Tilly, Laval, QC H7A 3S3',
  site_lat       = NULL,
  site_lng       = NULL,
  geocoded_at    = NULL,
  geocode_source = NULL
WHERE project_code = 'PROJ-21'
  AND company_id   = 5;

-- ----------------------------------------------------------------------------
-- 3. Delete 2 unused projects (clean dependent rows first)
-- ----------------------------------------------------------------------------

DELETE FROM public.project_foremen
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE project_code IN ('PROJ-22', 'PROJ-23')
    AND company_id   = 5
);

DELETE FROM public.project_trades
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE project_code IN ('PROJ-22', 'PROJ-23')
    AND company_id   = 5
);

DELETE FROM public.projects
WHERE project_code IN ('PROJ-22', 'PROJ-23')
  AND company_id   = 5;

-- ----------------------------------------------------------------------------
-- 4. Verification (printed when run via psql)
-- ----------------------------------------------------------------------------

SELECT
  project_code,
  project_name,
  site_address,
  site_lat,
  site_lng,
  CASE
    WHEN site_lat IS NULL THEN 'NEEDS_GEOCODING'
    ELSE 'HAS_COORDS'
  END AS geo_status
FROM public.projects
WHERE company_id = 5
ORDER BY project_code;

COMMIT;
