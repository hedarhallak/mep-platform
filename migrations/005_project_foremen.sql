-- ================================================================
-- Migration: Add project_foremen table
-- Each project can have one foreman per trade
-- ================================================================

-- 1. Add FOREMAN to rank_codes if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'rank_codes'
  ) THEN
    -- rank_code is a free text field on employee_profiles, no lookup table needed
    NULL;
  END IF;
END$$;

-- 2. Create project_foremen junction table
CREATE TABLE IF NOT EXISTS public.project_foremen (
  id            SERIAL PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES public.projects(id)  ON DELETE CASCADE,
  employee_id   INTEGER NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  trade_code    VARCHAR(50) NOT NULL,
  company_id    INTEGER NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One foreman per trade per project
  UNIQUE (project_id, trade_code)
);

CREATE INDEX IF NOT EXISTS idx_project_foremen_project  ON public.project_foremen(project_id);
CREATE INDEX IF NOT EXISTS idx_project_foremen_employee ON public.project_foremen(employee_id);
CREATE INDEX IF NOT EXISTS idx_project_foremen_company  ON public.project_foremen(company_id);

-- 3. Update rank_code on existing employees to mark foremen
-- (Run manually if needed: UPDATE public.employee_profiles SET rank_code = 'FOREMAN' WHERE ...)

COMMENT ON TABLE public.project_foremen IS 
  'Maps one foreman per trade per project. Used for notifications and assignment routing.';
