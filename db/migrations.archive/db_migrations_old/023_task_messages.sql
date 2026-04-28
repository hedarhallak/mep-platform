-- db/migrations/023_task_messages.sql
-- Task & Blueprint messaging system for My Hub
-- TRADE_ADMIN sends tasks/blueprints to workers
-- WORKERS receive and acknowledge

BEGIN;

-- ── 1. task_messages ─────────────────────────────────────────
-- A message sent from a supervisor to one or more workers
CREATE TABLE IF NOT EXISTS public.task_messages (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT NOT NULL,
  project_id   BIGINT REFERENCES public.projects(id) ON DELETE SET NULL,
  sender_id    BIGINT NOT NULL,              -- app_users.id (TRADE_ADMIN)
  type         TEXT NOT NULL DEFAULT 'TASK', -- 'TASK' | 'BLUEPRINT' | 'NOTE'
  title        TEXT NOT NULL,
  body         TEXT,                          -- optional text instructions
  file_url     TEXT,                          -- path to uploaded PDF/image
  file_name    TEXT,                          -- original file name
  file_type    TEXT,                          -- mime type
  priority     TEXT NOT NULL DEFAULT 'NORMAL', -- 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  due_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_messages_company   ON public.task_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_project   ON public.task_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_sender    ON public.task_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_created   ON public.task_messages(created_at DESC);

-- ── 2. task_recipients ───────────────────────────────────────
-- Each message can be sent to multiple workers
CREATE TABLE IF NOT EXISTS public.task_recipients (
  id             BIGSERIAL PRIMARY KEY,
  message_id     BIGINT NOT NULL REFERENCES public.task_messages(id) ON DELETE CASCADE,
  recipient_id   BIGINT NOT NULL,              -- app_users.id (WORKER)
  status         TEXT NOT NULL DEFAULT 'SENT', -- 'SENT' | 'READ' | 'ACKNOWLEDGED'
  read_at        TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_recipients_message   ON public.task_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_task_recipients_recipient ON public.task_recipients(recipient_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_recipients_unique ON public.task_recipients(message_id, recipient_id);

-- ── 3. Seed permissions ───────────────────────────────────────
INSERT INTO public.permissions (code, description, grp) VALUES
  ('hub.send_tasks',       'Send tasks and blueprints to workers', 'hub'),
  ('hub.receive_tasks',    'Receive tasks and blueprints',         'hub')
ON CONFLICT (code) DO NOTHING;

-- TRADE_ADMIN can send tasks
INSERT INTO public.role_permissions (role, permission_code)
VALUES
  ('TRADE_ADMIN',           'hub.send_tasks'),
  ('COMPANY_ADMIN',         'hub.send_tasks'),
  ('TRADE_PROJECT_MANAGER', 'hub.send_tasks'),
  ('WORKER',                'hub.receive_tasks'),
  ('TRADE_ADMIN',           'hub.receive_tasks')
ON CONFLICT DO NOTHING;

COMMIT;
