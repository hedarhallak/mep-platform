-- MC_F1_2__dispatch_state_company_unique_SAFE.sql
-- F1.2: Make employee_daily_dispatch_state multi-company safe
--
-- Goal:
--   - Replace UNIQUE(employee_id, work_date) with UNIQUE(company_id, employee_id, work_date)
--   - This matches the updated ON CONFLICT target in routes/daily_dispatch.js

BEGIN;

-- Drop legacy unique index (single-company assumption)
DROP INDEX IF EXISTS public.uq_employee_daily_dispatch_state_emp_date;

-- Create company-aware unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_daily_dispatch_state_company_emp_date
  ON public.employee_daily_dispatch_state (company_id, employee_id, work_date);

COMMIT;
