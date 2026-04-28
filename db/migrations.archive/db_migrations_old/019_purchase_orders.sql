-- db/migrations/019_purchase_orders.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id              BIGSERIAL PRIMARY KEY,
  company_id      BIGINT      NOT NULL,
  ref             TEXT        NOT NULL,
  project_id      BIGINT      NOT NULL,
  foreman_id      BIGINT      NOT NULL,
  supplier_id     BIGINT,     -- NULL = procurement
  is_procurement  BOOLEAN     NOT NULL DEFAULT FALSE,
  items           JSONB       NOT NULL DEFAULT '[]',
  note            TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_company   ON public.purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_po_project   ON public.purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_po_foreman   ON public.purchase_orders(foreman_id);
CREATE INDEX IF NOT EXISTS idx_po_sent_at   ON public.purchase_orders(sent_at DESC);

COMMIT;
