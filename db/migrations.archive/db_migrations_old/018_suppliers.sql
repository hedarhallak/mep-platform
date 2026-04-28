-- db/migrations/018_suppliers.sql

BEGIN;

-- ── suppliers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT    NOT NULL,
  name         TEXT      NOT NULL,
  email        TEXT      NOT NULL,
  phone        TEXT      NOT NULL,
  address      TEXT,
  trade_code   TEXT,     -- PLUMBING, ELECTRICAL, HVAC, CARPENTRY, GENERAL, ALL
  note         TEXT,
  is_active    BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company    ON public.suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_trade_code ON public.suppliers(trade_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active  ON public.suppliers(is_active);

-- Prevent duplicate supplier name per company
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_name_company
  ON public.suppliers(company_id, LOWER(TRIM(name)));

-- ── Add procurement_email to companies ───────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS procurement_email TEXT;

-- ── updated_at trigger ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
