-- db/migrations/020_material_catalog.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.material_catalog (
  id           BIGSERIAL PRIMARY KEY,
  company_id   BIGINT    NOT NULL,
  item_name    TEXT      NOT NULL,
  default_unit TEXT      NOT NULL DEFAULT 'pcs',
  use_count    INTEGER   NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per company + item name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_company_item
  ON public.material_catalog(company_id, LOWER(TRIM(item_name)));

CREATE INDEX IF NOT EXISTS idx_catalog_company_use
  ON public.material_catalog(company_id, use_count DESC);

COMMIT;
