-- db/migrations/004_geo_g0_employee_home_and_company_policy.sql
-- Geo G0: database foundation for accurate travel distance
-- Adds:
--  - employees.home_lat, employees.home_lng (double precision)
--  - companies.travel_origin_policy (home | company_yard)
--  - companies.yard_lat, companies.yard_lng (optional company origin)
-- Safe: uses IF EXISTS checks + ADD COLUMN IF NOT EXISTS

BEGIN;

-- 1) employees: add home coordinates
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='employees'
  ) THEN
    ALTER TABLE public.employees
      ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS home_lng DOUBLE PRECISION;
  END IF;
END$$;

-- 2) companies: add travel origin policy + optional yard coords
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='companies'
  ) THEN
    ALTER TABLE public.companies
      ADD COLUMN IF NOT EXISTS travel_origin_policy TEXT NOT NULL DEFAULT 'home'
        CHECK (travel_origin_policy IN ('home','company_yard')),
      ADD COLUMN IF NOT EXISTS yard_lat DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS yard_lng DOUBLE PRECISION;
  END IF;
END$$;

COMMIT;
