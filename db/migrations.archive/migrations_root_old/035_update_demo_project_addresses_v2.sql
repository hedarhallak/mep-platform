-- ============================================================================
-- Migration 035: Update 3 demo project addresses (Path A: address-only)
-- ----------------------------------------------------------------------------
-- Purpose:
--   Update site_address on 3 demo projects to real Quebec sites so the demo
--   shows distinct geographic locations on the map. Coordinates intentionally
--   left untouched here — they will be overwritten by the matching one-off
--   geocoder script (scripts/force_geocode_demo.js) after this runs.
--
-- Why no DELETE / no NULL coords (vs migration 034)?
--   Migration 034 also tried to delete PROJ-22/PROJ-23 and null the coords
--   so the existing geocoder (which only acts on NULL coords) would re-run.
--   It failed silently inside its DO block (table-name typo + unknown FK
--   restrictions on materials_requests/materials_tickets/project_geofences).
--   Path A is the minimal-disruption alternative: only change addresses,
--   force-geocode externally, defer the deletes to a future cleanup.
--
-- Date:    2026-04-22
-- Scope:   company_id = 5 only
-- ============================================================================

BEGIN;

UPDATE public.projects
SET site_address = '3175 Chem. de la Cote-Sainte-Catherine, Montreal, QC H3T 1C5'
WHERE project_code = 'PROJ-11' AND company_id = 5;

UPDATE public.projects
SET site_address = '520 Bd Arthur-Sauve, Saint-Eustache, QC J7R 5B1'
WHERE project_code = 'PROJ-12' AND company_id = 5;

UPDATE public.projects
SET site_address = '9449 Rue de Tilly, Laval, QC H7A 3S3'
WHERE project_code = 'PROJ-21' AND company_id = 5;

-- Verification (printed when run via psql)
SELECT
  project_code,
  project_name,
  site_address,
  site_lat,
  site_lng,
  geocode_source
FROM public.projects
WHERE company_id = 5
ORDER BY project_code;

COMMIT;
