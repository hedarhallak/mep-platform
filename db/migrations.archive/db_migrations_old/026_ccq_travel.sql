-- Migration 026: CCQ travel allowance system
-- Adds ccq_sector to projects, ccq_travel_rates table, distance_km to assignment_requests

BEGIN;

-- 1. Add CCQ sector to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ccq_sector TEXT DEFAULT 'IC'
  CHECK (ccq_sector IN ('RESIDENTIAL', 'IC', 'INDUSTRIAL'));

-- 2. Add distance_km to assignment_requests
ALTER TABLE public.assignment_requests
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(8,2);

-- 3. CCQ travel rates table (updatable every 2 years)
CREATE TABLE IF NOT EXISTS public.ccq_travel_rates (
  id             SERIAL PRIMARY KEY,
  sector         TEXT NOT NULL,
  km_threshold   INTEGER NOT NULL,
  effective_date DATE NOT NULL,
  daily_rate     NUMERIC(8,2) NOT NULL,
  UNIQUE(sector, km_threshold, effective_date)
);

-- 4. Insert rates 2025-2028 (IC/Industrial - règle générale)
INSERT INTO public.ccq_travel_rates
  (sector, km_threshold, effective_date, daily_rate)
VALUES
  -- IC & Industrial 2025
  ('IC',         65, '2025-04-27', 47.63),
  ('IC',         90, '2025-04-27', 53.89),
  ('INDUSTRIAL', 65, '2025-04-27', 47.63),
  ('INDUSTRIAL', 90, '2025-04-27', 53.89),
  -- IC & Industrial 2026
  ('IC',         65, '2026-04-26', 50.01),
  ('IC',         90, '2026-04-26', 56.58),
  ('INDUSTRIAL', 65, '2026-04-26', 50.01),
  ('INDUSTRIAL', 90, '2026-04-26', 56.58),
  -- IC & Industrial 2027
  ('IC',         65, '2027-04-25', 52.51),
  ('IC',         90, '2027-04-25', 59.41),
  ('INDUSTRIAL', 65, '2027-04-25', 52.51),
  ('INDUSTRIAL', 90, '2027-04-25', 59.41),
  -- IC & Industrial 2028
  ('IC',         65, '2028-04-30', 54.61),
  ('IC',         90, '2028-04-30', 61.79),
  ('INDUSTRIAL', 65, '2028-04-30', 54.61),
  ('INDUSTRIAL', 90, '2028-04-30', 61.79),
  -- Residential: rate per km beyond 40km (stored as per-km rate)
  ('RESIDENTIAL', 40, '2025-04-27', 0.50)
ON CONFLICT DO NOTHING;

-- 5. Index for fast rate lookup
CREATE INDEX IF NOT EXISTS idx_ccq_rates_sector_date
  ON public.ccq_travel_rates(sector, effective_date DESC);

COMMIT;
