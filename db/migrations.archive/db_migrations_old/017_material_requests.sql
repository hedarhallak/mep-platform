-- db/migrations/017_material_requests.sql
-- Material request & return system
-- Flow: Worker requests → Foreman reviews/merges → checks surplus → sends to supplier/procurement

BEGIN;

-- ── material_requests ────────────────────────────────────────
-- One request per worker per day per project (can have multiple items)
CREATE TABLE IF NOT EXISTS public.material_requests (
  id             BIGSERIAL PRIMARY KEY,
  company_id     BIGINT      NOT NULL,
  project_id     BIGINT      NOT NULL,
  requested_by   BIGINT      NOT NULL,  -- employee_id (worker or foreman)
  status         TEXT        NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','REVIEWED','MERGED','SENT','CANCELLED')),
  note           TEXT,
  merged_into_id BIGINT      REFERENCES public.material_requests(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_req_company    ON public.material_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_mat_req_project    ON public.material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_mat_req_status     ON public.material_requests(status);
CREATE INDEX IF NOT EXISTS idx_mat_req_created_at ON public.material_requests(created_at);

-- ── material_request_items ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_request_items (
  id             BIGSERIAL PRIMARY KEY,
  request_id     BIGINT      NOT NULL REFERENCES public.material_requests(id) ON DELETE CASCADE,
  item_name      TEXT        NOT NULL,  -- standardized name (AI-normalized later)
  item_name_raw  TEXT,                  -- original text as typed by worker
  quantity       NUMERIC     NOT NULL CHECK (quantity > 0),
  unit           TEXT        NOT NULL DEFAULT 'pcs',
  note           TEXT,
  -- filled by foreman after surplus check
  qty_from_surplus  NUMERIC  DEFAULT 0,
  qty_from_supplier NUMERIC  DEFAULT 0,
  surplus_source_project_id BIGINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_req_items_request ON public.material_request_items(request_id);

-- ── material_returns ─────────────────────────────────────────
-- Foreman declares surplus materials available from their project
CREATE TABLE IF NOT EXISTS public.material_returns (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT    NOT NULL,
  project_id   BIGINT    NOT NULL,
  declared_by  BIGINT    NOT NULL,  -- employee_id (foreman)
  status       TEXT      NOT NULL DEFAULT 'AVAILABLE'
               CHECK (status IN ('AVAILABLE','PARTIALLY_USED','USED')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_ret_company   ON public.material_returns(company_id);
CREATE INDEX IF NOT EXISTS idx_mat_ret_project   ON public.material_returns(project_id);
CREATE INDEX IF NOT EXISTS idx_mat_ret_status    ON public.material_returns(status);

-- ── material_return_items ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_return_items (
  id           BIGSERIAL PRIMARY KEY,
  return_id    BIGINT    NOT NULL REFERENCES public.material_returns(id) ON DELETE CASCADE,
  item_name    TEXT      NOT NULL,
  item_name_raw TEXT,
  quantity     NUMERIC   NOT NULL CHECK (quantity > 0),
  unit         TEXT      NOT NULL DEFAULT 'pcs',
  qty_available NUMERIC  NOT NULL DEFAULT 0,  -- remaining after transfers
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_ret_items_return    ON public.material_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_mat_ret_items_item_name ON public.material_return_items(item_name);

-- ── updated_at triggers ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mat_req_updated_at ON public.material_requests;
CREATE TRIGGER trg_mat_req_updated_at
  BEFORE UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mat_ret_updated_at ON public.material_returns;
CREATE TRIGGER trg_mat_ret_updated_at
  BEFORE UPDATE ON public.material_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
