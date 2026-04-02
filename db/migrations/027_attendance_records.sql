-- Migration 027: Attendance records
-- Tracks daily check-in / check-out per employee per project
-- Hours calculation: raw + 15min paid break; if raw >= 8h subtract 30min unpaid lunch

BEGIN;

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id                       BIGSERIAL PRIMARY KEY,
  company_id               BIGINT      NOT NULL,
  project_id               BIGINT      NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  assignment_request_id    BIGINT      REFERENCES public.assignment_requests(id) ON DELETE SET NULL,
  employee_id              BIGINT      NOT NULL,
  attendance_date          DATE        NOT NULL,
  shift_start              TIME,

  check_in_time            TIME,
  check_out_time           TIME,

  raw_minutes              INTEGER,
  paid_minutes             INTEGER,
  regular_hours            NUMERIC(4,2),
  overtime_hours           NUMERIC(4,2),
  late_minutes             INTEGER      NOT NULL DEFAULT 0,

  status                   TEXT        NOT NULL DEFAULT 'OPEN'
                           CHECK (status IN ('OPEN','CHECKED_IN','CHECKED_OUT','CONFIRMED','ADJUSTED')),

  confirmed_by             BIGINT,
  confirmed_at             TIMESTAMPTZ,
  confirmed_regular_hours  NUMERIC(4,2),
  confirmed_overtime_hours NUMERIC(4,2),
  foreman_note             TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_id, employee_id, project_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_company   ON public.attendance_records(company_id);
CREATE INDEX IF NOT EXISTS idx_attendance_project   ON public.attendance_records(project_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee  ON public.attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date      ON public.attendance_records(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status    ON public.attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_attendance_asgn      ON public.attendance_records(assignment_request_id);

COMMIT;
