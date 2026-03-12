-- ================================================================
-- Migration 004: New Roles + Project Trades
-- Run in pgAdmin on database: erp
-- ================================================================

-- ── 1. Update role constraint on app_users ────────────────────
ALTER TABLE public.app_users 
  DROP CONSTRAINT IF EXISTS chk_au_role;

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT chk_au_role CHECK (
    role IN (
      'SUPER_ADMIN',
      'COMPANY_ADMIN',
      'TRADE_ADMIN',
      'PROJECT_MANAGER',
      'WORKER',
      'PURCHASING',
      'ADMIN'          -- legacy, maps to COMPANY_ADMIN
    )
  );

-- ── 2. Create project_trades table ───────────────────────────
CREATE TABLE IF NOT EXISTS public.project_trades (
  id              SERIAL PRIMARY KEY,
  project_id      INT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  trade_type_id   INT NOT NULL REFERENCES public.trade_types(id),
  trade_admin_id  INT REFERENCES public.app_users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','ON_HOLD','COMPLETED','CANCELLED')),
  notes           TEXT,
  company_id      INT NOT NULL REFERENCES public.companies(company_id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, trade_type_id)
);

-- ── 3. Add project_trade_id to assignment_requests ───────────
ALTER TABLE public.assignment_requests
  ADD COLUMN IF NOT EXISTS project_trade_id INT
  REFERENCES public.project_trades(id) ON DELETE SET NULL;

-- ── 4. Trade admin access table ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_trade_access (
  id            SERIAL PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  trade_type_id INT NOT NULL REFERENCES public.trade_types(id),
  company_id    INT NOT NULL REFERENCES public.companies(company_id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, trade_type_id)
);

-- ── 5. Migrate existing projects to project_trades ───────────
-- كل مشروع موجود عنده trade_type → ننشئ له project_trade تلقائياً
INSERT INTO public.project_trades (project_id, trade_type_id, company_id, status)
SELECT 
  p.id,
  p.trade_type_id,
  p.company_id,
  CASE 
    WHEN ps.code = 'ACTIVE'    THEN 'ACTIVE'
    WHEN ps.code = 'ON_HOLD'   THEN 'ON_HOLD'
    WHEN ps.code = 'COMPLETED' THEN 'COMPLETED'
    WHEN ps.code = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'ACTIVE'
  END
FROM public.projects p
LEFT JOIN public.project_statuses ps ON ps.id = p.status_id
WHERE p.trade_type_id IS NOT NULL
ON CONFLICT (project_id, trade_type_id) DO NOTHING;

-- ── 6. Link existing assignments to project_trades ───────────
UPDATE public.assignment_requests ar
SET project_trade_id = pt.id
FROM public.project_trades pt
WHERE pt.project_id   = ar.project_id
  AND pt.trade_type_id = (
    SELECT trade_type_id FROM public.projects WHERE id = ar.project_id
  )
  AND ar.project_trade_id IS NULL;

-- ── 7. Indexes for performance ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_project_trades_project  ON public.project_trades(project_id);
CREATE INDEX IF NOT EXISTS idx_project_trades_company  ON public.project_trades(company_id);
CREATE INDEX IF NOT EXISTS idx_project_trades_admin    ON public.project_trades(trade_admin_id);
CREATE INDEX IF NOT EXISTS idx_user_trade_access_user  ON public.user_trade_access(user_id);
CREATE INDEX IF NOT EXISTS idx_ar_project_trade        ON public.assignment_requests(project_trade_id);

-- ── 8. Update trigger for updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_trades_updated_at ON public.project_trades;
CREATE TRIGGER trg_project_trades_updated_at
  BEFORE UPDATE ON public.project_trades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Done ──────────────────────────────────────────────────────
-- Tables created:
--   public.project_trades      (project + trade unit)
--   public.user_trade_access   (trade admin permissions)
-- Columns added:
--   assignment_requests.project_trade_id
-- Roles now supported:
--   SUPER_ADMIN, COMPANY_ADMIN, TRADE_ADMIN, PROJECT_MANAGER, WORKER, PURCHASING, ADMIN
