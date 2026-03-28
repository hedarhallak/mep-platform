-- db/migrations/025_standup_sessions.sql
-- Daily standup sessions for foremen to review tomorrow's materials

BEGIN;

CREATE TABLE IF NOT EXISTS public.standup_sessions (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT NOT NULL,
  project_id      BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  foreman_id      BIGINT NOT NULL,              -- app_users.id
  standup_date    DATE NOT NULL,                -- the date being reviewed (tomorrow)
  status          TEXT NOT NULL DEFAULT 'OPEN', -- 'OPEN' | 'COMPLETED'
  note            TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, project_id, foreman_id, standup_date)
);

CREATE INDEX IF NOT EXISTS idx_standup_company   ON public.standup_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_standup_project   ON public.standup_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_standup_foreman   ON public.standup_sessions(foreman_id);
CREATE INDEX IF NOT EXISTS idx_standup_date      ON public.standup_sessions(standup_date);

-- Permissions
INSERT INTO public.permissions (code, description, grp) VALUES
  ('standup.manage', 'Manage daily standup sessions', 'standup')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('TRADE_ADMIN',           'standup.manage'),
  ('COMPANY_ADMIN',         'standup.manage'),
  ('TRADE_PROJECT_MANAGER', 'standup.manage')
ON CONFLICT DO NOTHING;

COMMIT;
