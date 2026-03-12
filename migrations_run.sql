-- Fix status check constraint to allow CANCELLED
ALTER TABLE public.assignment_requests DROP CONSTRAINT IF EXISTS chk_ar_status;
ALTER TABLE public.assignment_requests DROP CONSTRAINT IF EXISTS assignment_requests_status_check;
ALTER TABLE public.assignment_requests ADD CONSTRAINT chk_ar_status 
  CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED'));
