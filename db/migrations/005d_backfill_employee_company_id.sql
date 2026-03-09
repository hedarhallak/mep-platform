-- db/migrations/005d_backfill_employee_company_id.sql
-- Backfill employees.company_id if NULL (when only 1 company exists), and trim employee_code.
BEGIN;

UPDATE public.employees
SET employee_code = BTRIM(employee_code)
WHERE employee_code IS NOT NULL
  AND employee_code <> BTRIM(employee_code);

DO $$
DECLARE
  c_count INT;
  c_id BIGINT;
BEGIN
  SELECT COUNT(*) INTO c_count FROM public.companies;
  IF c_count = 1 THEN
    SELECT company_id INTO c_id FROM public.companies LIMIT 1;
    UPDATE public.employees
    SET company_id = c_id
    WHERE company_id IS NULL;
  END IF;
END$$;

COMMIT;
