-- Migration 028: CCQ Travel Rates Table
-- Stores ACQ/CCQ travel allowance rates per trade, sector, distance threshold, and effective date
-- Managed by SUPER_ADMIN only
-- System sends reminder 60 days before rate expiry

CREATE TABLE IF NOT EXISTS public.ccq_travel_rates (
  id              bigserial PRIMARY KEY,
  trade_code      text      NOT NULL, -- PLUMBING, HVAC, ELECTRICAL, CARPENTRY, ELEVATOR_TECH, GENERAL
  sector          text      NOT NULL DEFAULT 'IC', -- IC, I, RESIDENTIAL
  min_km          numeric(6,1) NOT NULL, -- minimum distance threshold
  rate_cad        numeric(8,2) NOT NULL, -- rate per day in CAD (0 = tax form only)
  tax_form        text      NULL, -- e.g. 'T2200 + TP-64.3' for 41-65km
  effective_from  date      NOT NULL,
  effective_to    date      NOT NULL,
  notes           text      NULL,
  created_by      bigint    REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT ccq_travel_rates_sector_check CHECK (sector IN ('IC', 'I', 'RESIDENTIAL')),
  CONSTRAINT ccq_travel_rates_dates_check  CHECK (effective_from <= effective_to)
);

CREATE INDEX IF NOT EXISTS idx_ccq_travel_rates_lookup
  ON public.ccq_travel_rates (trade_code, sector, min_km, effective_from, effective_to);

-- ── Seed data from ACQ "Frais de déplacement 2025-2028" ──────

-- Tax form zone (41-65 km) — all trades, all sectors
INSERT INTO public.ccq_travel_rates (trade_code, sector, min_km, rate_cad, tax_form, effective_from, effective_to, notes) VALUES
  ('GENERAL',       'IC', 41, 0, 'T2200 + TP-64.3', '2025-04-27', '2028-04-29', '41-65km tax form only'),
  ('ELECTRICAL',    'IC', 41, 0, 'T2200 + TP-64.3', '2025-04-27', '2028-04-29', '41-65km tax form only'),
  ('PLUMBING',      'IC', 41, 0, 'T2200 + TP-64.3', '2025-04-27', '2028-04-29', '41-65km tax form only'),
  ('PLUMBING',      'I',  41, 0, 'T2200 + TP-64.3', '2025-04-27', '2028-04-29', '41-65km tax form only'),
  ('HVAC',          'IC', 41, 0, 'T2200 + TP-64.3', '2025-04-27', '2028-04-29', '41-65km tax form only'),
  ('CARPENTRY',     'IC', 41, 0, 'T2200 + TP-64.3', '2025-04-27', '2028-04-29', '41-65km tax form only'),
  ('ELEVATOR_TECH', 'IC', 41, 0, 'T2200 + TP-64.3', '2025-04-27', '2028-04-29', '41-65km tax form only');

-- Règle générale IC/I (ELECTRICAL, GENERAL) — 2025
INSERT INTO public.ccq_travel_rates (trade_code, sector, min_km, rate_cad, effective_from, effective_to) VALUES
  ('GENERAL',    'IC', 65, 47.63, '2025-04-27', '2026-04-25'),
  ('GENERAL',    'IC', 90, 53.89, '2025-04-27', '2026-04-25'),
  ('ELECTRICAL', 'IC', 65, 47.63, '2025-04-27', '2026-04-25'),
  ('ELECTRICAL', 'IC', 90, 53.89, '2025-04-27', '2026-04-25');

-- Règle générale IC/I — 2026
INSERT INTO public.ccq_travel_rates (trade_code, sector, min_km, rate_cad, effective_from, effective_to) VALUES
  ('GENERAL',    'IC', 65, 50.01, '2026-04-26', '2027-04-24'),
  ('GENERAL',    'IC', 90, 56.58, '2026-04-26', '2027-04-24'),
  ('ELECTRICAL', 'IC', 65, 50.01, '2026-04-26', '2027-04-24'),
  ('ELECTRICAL', 'IC', 90, 56.58, '2026-04-26', '2027-04-24');

-- Règle générale IC/I — 2027
INSERT INTO public.ccq_travel_rates (trade_code, sector, min_km, rate_cad, effective_from, effective_to) VALUES
  ('GENERAL',    'IC', 65, 52.51, '2027-04-25', '2028-04-29'),
  ('GENERAL',    'IC', 90, 59.41, '2027-04-25', '2028-04-29'),
  ('ELECTRICAL', 'IC', 65, 52.51, '2027-04-25', '2028-04-29'),
  ('ELECTRICAL', 'IC', 90, 59.41, '2027-04-25', '2028-04-29');

-- Règle générale IC/I — 2028
INSERT INTO public.ccq_travel_rates (trade_code, sector, min_km, rate_cad, effective_from, effective_to) VALUES
  ('GENERAL',    'IC', 65, 54.61, '2028-04-30', '2099-12-31'),
  ('GENERAL',    'IC', 90, 61.79, '2028-04-30', '2099-12-31'),
  ('ELECTRICAL', 'IC', 65, 54.61, '2028-04-30', '2099-12-31'),
  ('ELECTRICAL', 'IC', 90, 61.79, '2028-04-30', '2099-12-31');

-- HVAC (Calorifugeur IC/I) — 2025-2028
INSERT INTO public.ccq_travel_rates (trade_code, sector, min_km, rate_cad, effective_from, effective_to) VALUES
  ('HVAC', 'IC', 48, 21.86, '2025-04-27', '2026-04-25'),
  ('HVAC', 'IC', 65, 47.63, '2025-04-27', '2026-04-25'),
  ('HVAC', 'IC', 90, 53.89, '2025-04-27', '2026-04-25'),
  ('HVAC', 'IC', 48, 22.95, '2026-04-26', '2027-04-24'),
  ('HVAC', 'IC', 65, 50.01, '2026-04-26', '2027-04-24'),
  ('HVAC', 'IC', 90, 56.58, '2026-04-26', '2027-04-24'),
  ('HVAC', 'IC', 48, 24.10, '2027-04-25', '2028-04-29'),
  ('HVAC', 'IC', 65, 52.51, '2027-04-25', '2028-04-29'),
  ('HVAC', 'IC', 90, 59.41, '2027-04-25', '2028-04-29'),
  ('HVAC', 'IC', 48, 25.06, '2028-04-30', '2099-12-31'),
  ('HVAC', 'IC', 65, 54.61, '2028-04-30', '2099-12-31'),
  ('HVAC', 'IC', 90, 61.79, '2028-04-30', '2099-12-31');

-- PLUMBING Industrial (Tuyauteur/soudeur I) — 2025-2028
INSERT INTO public.ccq_travel_rates (trade_code, sector, min_km, rate_cad, effective_from, effective_to) VALUES
  ('PLUMBING', 'I', 48, 23.98, '2025-04-27', '2026-04-25'),
  ('PLUMBING', 'I', 72, 41.47, '2025-04-27', '2026-04-25'),
  ('PLUMBING', 'I', 88, 46.91, '2025-04-27', '2026-04-25'),
  ('PLUMBING', 'I', 48, 25.18, '2026-04-26', '2027-04-24'),
  ('PLUMBING', 'I', 72, 43.54, '2026-04-26', '2027-04-24'),
  ('PLUMBING', 'I', 88, 49.26, '2026-04-26', '2027-04-24'),
  ('PLUMBING', 'I', 48, 26.44, '2027-04-25', '2028-04-29'),
  ('PLUMBING', 'I', 72, 45.72, '2027-04-25', '2028-04-29'),
  ('PLUMBING', 'I', 88, 51.72, '2027-04-25', '2028-04-29'),
  ('PLUMBING', 'I', 48, 27.50, '2028-04-30', '2099-12-31'),
  ('PLUMBING', 'I', 72, 47.55, '2028-04-30', '2099-12-31'),
  ('PLUMBING', 'I', 88, 53.79, '2028-04-30', '2099-12-31');

-- ELEVATOR_TECH (Mécanicien d'ascenseur) — 2025-2028
INSERT INTO public.ccq_travel_rates (trade_code, sector, min_km, rate_cad, effective_from, effective_to) VALUES
  ('ELEVATOR_TECH', 'IC', 20,  19.49, '2025-04-27', '2026-04-25'),
  ('ELEVATOR_TECH', 'IC', 40,  31.93, '2025-04-27', '2026-04-25'),
  ('ELEVATOR_TECH', 'IC', 55,  45.03, '2025-04-27', '2026-04-25'),
  ('ELEVATOR_TECH', 'IC', 70,  56.07, '2025-04-27', '2026-04-25'),
  ('ELEVATOR_TECH', 'IC', 90,  63.17, '2025-04-27', '2026-04-25'),
  ('ELEVATOR_TECH', 'IC', 105, 69.51, '2025-04-27', '2026-04-25'),
  ('ELEVATOR_TECH', 'IC', 20,  20.47, '2026-04-26', '2027-04-24'),
  ('ELEVATOR_TECH', 'IC', 40,  33.52, '2026-04-26', '2027-04-24'),
  ('ELEVATOR_TECH', 'IC', 55,  47.29, '2026-04-26', '2027-04-24'),
  ('ELEVATOR_TECH', 'IC', 70,  58.87, '2026-04-26', '2027-04-24'),
  ('ELEVATOR_TECH', 'IC', 90,  66.33, '2026-04-26', '2027-04-24'),
  ('ELEVATOR_TECH', 'IC', 105, 72.98, '2026-04-26', '2027-04-24'),
  ('ELEVATOR_TECH', 'IC', 20,  21.49, '2027-04-25', '2028-04-29'),
  ('ELEVATOR_TECH', 'IC', 40,  35.20, '2027-04-25', '2028-04-29'),
  ('ELEVATOR_TECH', 'IC', 55,  49.65, '2027-04-25', '2028-04-29'),
  ('ELEVATOR_TECH', 'IC', 70,  61.82, '2027-04-25', '2028-04-29'),
  ('ELEVATOR_TECH', 'IC', 90,  69.64, '2027-04-25', '2028-04-29'),
  ('ELEVATOR_TECH', 'IC', 105, 76.63, '2027-04-25', '2028-04-29'),
  ('ELEVATOR_TECH', 'IC', 20,  22.35, '2028-04-30', '2099-12-31'),
  ('ELEVATOR_TECH', 'IC', 40,  36.61, '2028-04-30', '2099-12-31'),
  ('ELEVATOR_TECH', 'IC', 55,  51.64, '2028-04-30', '2099-12-31'),
  ('ELEVATOR_TECH', 'IC', 70,  64.29, '2028-04-30', '2099-12-31'),
  ('ELEVATOR_TECH', 'IC', 90,  72.43, '2028-04-30', '2099-12-31'),
  ('ELEVATOR_TECH', 'IC', 105, 79.70, '2028-04-30', '2099-12-31');

-- CARPENTRY (Métier de la truelle IC/I) — 2025-2028
INSERT INTO public.ccq_travel_rates (trade_code, sector, min_km, rate_cad, effective_from, effective_to) VALUES
  ('CARPENTRY', 'IC', 75, 50.80, '2025-04-27', '2026-04-25'),
  ('CARPENTRY', 'IC', 90, 53.89, '2025-04-27', '2026-04-25'),
  ('CARPENTRY', 'IC', 75, 53.34, '2026-04-26', '2027-04-24'),
  ('CARPENTRY', 'IC', 90, 56.58, '2026-04-26', '2027-04-24'),
  ('CARPENTRY', 'IC', 75, 56.01, '2027-04-25', '2028-04-29'),
  ('CARPENTRY', 'IC', 90, 59.41, '2027-04-25', '2028-04-29'),
  ('CARPENTRY', 'IC', 75, 58.25, '2028-04-30', '2099-12-31'),
  ('CARPENTRY', 'IC', 90, 61.79, '2028-04-30', '2099-12-31');
