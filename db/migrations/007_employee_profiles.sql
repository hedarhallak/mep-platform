-- db/migrations/007_employee_profiles.sql
-- Phase 5: Profile Completion (SAFE)
-- Creates employee_profiles + dropdown tables required by /api/profile
-- Safe: IF NOT EXISTS, idempotent, does not break existing schema.

BEGIN;

-- 1) Dropdown tables
CREATE TABLE IF NOT EXISTS public.employee_trades (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_roles (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_ranks (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

-- 2) Profiles table (one per employee)
CREATE TABLE IF NOT EXISTS public.employee_profiles (
  employee_id BIGINT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  trade_code TEXT NOT NULL REFERENCES public.employee_trades(code),
  role_code TEXT NOT NULL REFERENCES public.employee_roles(code),
  rank_code TEXT NOT NULL REFERENCES public.employee_ranks(code),
  home_address TEXT NOT NULL,
  home_location geometry(Point, 4326),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3) Seed dropdowns (minimal defaults, can be extended later)
INSERT INTO public.employee_roles(code,label) VALUES
  ('WORKER','Worker'),
  ('FOREMAN','Foreman'),
  ('ADMIN','Admin')
ON CONFLICT (code) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.employee_ranks(code,label) VALUES
  ('APPRENTICE_1','Apprentice Level 1'),
  ('APPRENTICE_2','Apprentice Level 2'),
  ('APPRENTICE_3','Apprentice Level 3'),
  ('JOURNEYMAN','Journeyman'),
  ('FOREMAN','Foreman')
ON CONFLICT (code) DO UPDATE SET label=EXCLUDED.label;

INSERT INTO public.employee_trades(code,label) VALUES
  ('PLUMBING','Plumbing'),
  ('ELECTRICAL','Electrical'),
  ('HVAC','HVAC'),
  ('CARPENTRY','Carpenter'),
  ('GENERAL','General')
ON CONFLICT (code) DO UPDATE SET label=EXCLUDED.label;

-- 4) updated_at trigger (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS TRIGGER AS $f$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employee_profiles_updated_at') THEN
    CREATE TRIGGER trg_employee_profiles_updated_at
    BEFORE UPDATE ON public.employee_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

COMMIT;
