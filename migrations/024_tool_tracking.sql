-- migrations/024_tool_tracking.sql
--
-- Phase 6-D-9 (functional features) / DECISIONS §126.1 — Tool Request +
-- asset tracking (Slice A: schema). Hedar's choices (June 2026):
--   - FULL asset tracking (each physical tool unit tracked + its location/history)
--   - GLOBAL ready-made tool catalog (shared reference data, seeded below)
--   - reuse the existing `materials` permission module (no new permission seeding)
--
-- Tables:
--   tool_catalog          — GLOBAL reference list of tools, tagged by trade for
--                           smart filtering. NOT company-scoped, NO RLS (shared).
--   tool_assets           — a company's physical tool units. company-scoped (RLS).
--                           current_project_id = where the unit is now (NULL =
--                           warehouse). status tracks lifecycle.
--   tool_requests         — a foreman's request for a tool at a project (RLS).
--   tool_asset_movements  — history of where each unit moved (RLS).
--
-- RLS: the three company-scoped tables get the same strict tenant_isolation
-- policy as migration 013. tool_catalog is global reference data (no RLS) —
-- it gets a plain SELECT grant to the app roles.
--
-- GRANTs (Pitfall #49): new tables grant nothing automatically.
--
-- Idempotent: re-running is a no-op (IF NOT EXISTS + ON CONFLICT DO NOTHING).

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- tool_catalog (GLOBAL reference — no company_id, no RLS)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tool_catalog (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  trade       TEXT NOT NULL DEFAULT 'GENERAL',
  CONSTRAINT chk_tool_trade CHECK (trade IN (
    'GENERAL', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'LAYOUT'
  )),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tool_catalog_name UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS idx_tool_catalog_trade ON public.tool_catalog(trade) WHERE is_active;

COMMENT ON TABLE public.tool_catalog IS
  'Global reference list of construction tools, tagged by trade. Shared across tenants. DECISIONS §126.1.';

-- Starter catalog (DECISIONS §126.1). ON CONFLICT keeps re-runs a no-op.
INSERT INTO public.tool_catalog (name, trade) VALUES
  -- GENERAL / power
  ('Cordless drill', 'GENERAL'), ('Impact driver', 'GENERAL'), ('Hammer drill', 'GENERAL'),
  ('Rotary hammer (SDS)', 'GENERAL'), ('Angle grinder', 'GENERAL'), ('Reciprocating saw', 'GENERAL'),
  ('Circular saw', 'GENERAL'), ('Jigsaw', 'GENERAL'), ('Oscillating multi-tool', 'GENERAL'),
  ('Heat gun', 'GENERAL'),
  -- GENERAL / hand
  ('Hammer', 'GENERAL'), ('Screwdriver set', 'GENERAL'), ('Wrench set', 'GENERAL'),
  ('Socket set', 'GENERAL'), ('Pliers set', 'GENERAL'), ('Utility knife', 'GENERAL'),
  ('Hacksaw', 'GENERAL'), ('Pry bar', 'GENERAL'), ('Clamps', 'GENERAL'),
  -- ELECTRICAL
  ('Wire strippers', 'ELECTRICAL'), ('Crimping tool', 'ELECTRICAL'), ('Multimeter', 'ELECTRICAL'),
  ('Voltage tester', 'ELECTRICAL'), ('Fish tape', 'ELECTRICAL'), ('Conduit bender', 'ELECTRICAL'),
  ('Cable cutter', 'ELECTRICAL'), ('Knockout punch', 'ELECTRICAL'), ('Megohmmeter', 'ELECTRICAL'),
  -- PLUMBING
  ('Pipe wrench', 'PLUMBING'), ('Tubing cutter', 'PLUMBING'), ('PEX crimp tool', 'PLUMBING'),
  ('PEX expansion tool', 'PLUMBING'), ('Press tool (ProPress)', 'PLUMBING'), ('Propane torch', 'PLUMBING'),
  ('Basin wrench', 'PLUMBING'), ('Drain auger / snake', 'PLUMBING'), ('Flaring tool', 'PLUMBING'),
  ('Pipe reamer', 'PLUMBING'),
  -- MECHANICAL / HVAC
  ('Manifold gauge set', 'MECHANICAL'), ('Vacuum pump', 'MECHANICAL'),
  ('Refrigerant recovery machine', 'MECHANICAL'), ('Swaging tool', 'MECHANICAL'),
  ('Fin comb', 'MECHANICAL'), ('Nitrogen regulator', 'MECHANICAL'), ('Torque wrench', 'MECHANICAL'),
  ('Anemometer', 'MECHANICAL'),
  -- LAYOUT / MEASURE
  ('Laser level', 'LAYOUT'), ('Rotary laser', 'LAYOUT'), ('Plumb bob', 'LAYOUT'),
  ('Framing square', 'LAYOUT'), ('Stud finder', 'LAYOUT'), ('Laser distance meter', 'LAYOUT')
ON CONFLICT (name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- tool_assets (company-scoped physical units)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tool_assets (
  id                  BIGSERIAL PRIMARY KEY,
  company_id          BIGINT NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  catalog_id          BIGINT NOT NULL REFERENCES public.tool_catalog(id),
  asset_tag           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'AVAILABLE',
  CONSTRAINT chk_tool_asset_status CHECK (status IN (
    'AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED'
  )),
  -- Where the unit is NOW. NULL = warehouse.
  current_project_id  BIGINT REFERENCES public.projects(id) ON DELETE SET NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tool_asset_tag UNIQUE (company_id, asset_tag)
);
CREATE INDEX IF NOT EXISTS idx_tool_assets_company_status ON public.tool_assets(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tool_assets_current_project ON public.tool_assets(current_project_id)
  WHERE current_project_id IS NOT NULL;

COMMENT ON TABLE public.tool_assets IS
  'A company''s physical tool units (asset tracking). current_project_id = current location (NULL = warehouse). §126.1.';

-- ──────────────────────────────────────────────────────────────────────────
-- tool_requests (company-scoped)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tool_requests (
  id                   BIGSERIAL PRIMARY KEY,
  company_id           BIGINT NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  project_id           BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by_user_id BIGINT REFERENCES public.app_users(id) ON DELETE SET NULL,
  catalog_id           BIGINT NOT NULL REFERENCES public.tool_catalog(id),   -- tool type requested
  asset_id             BIGINT REFERENCES public.tool_assets(id) ON DELETE SET NULL, -- unit issued (when ISSUED)
  quantity             INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT chk_tool_request_qty CHECK (quantity > 0),
  status               TEXT NOT NULL DEFAULT 'REQUESTED',
  CONSTRAINT chk_tool_request_status CHECK (status IN (
    'REQUESTED', 'APPROVED', 'ISSUED', 'RETURNED', 'REJECTED'
  )),
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_requests_company_status ON public.tool_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tool_requests_project ON public.tool_requests(project_id);

COMMENT ON TABLE public.tool_requests IS
  'Foreman requests for a tool type at a project; fulfilled by issuing a tool_asset. §126.1.';

-- ──────────────────────────────────────────────────────────────────────────
-- tool_asset_movements (company-scoped history)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tool_asset_movements (
  id                BIGSERIAL PRIMARY KEY,
  company_id        BIGINT NOT NULL REFERENCES public.companies(company_id) ON DELETE CASCADE,
  asset_id          BIGINT NOT NULL REFERENCES public.tool_assets(id) ON DELETE CASCADE,
  from_project_id   BIGINT REFERENCES public.projects(id) ON DELETE SET NULL,  -- NULL = warehouse
  to_project_id     BIGINT REFERENCES public.projects(id) ON DELETE SET NULL,  -- NULL = warehouse
  moved_by_user_id  BIGINT REFERENCES public.app_users(id) ON DELETE SET NULL,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_movements_asset ON public.tool_asset_movements(asset_id);
CREATE INDEX IF NOT EXISTS idx_tool_movements_company ON public.tool_asset_movements(company_id);

COMMENT ON TABLE public.tool_asset_movements IS
  'History of tool unit movements between projects/warehouse. §126.1.';

-- ──────────────────────────────────────────────────────────────────────────
-- RLS — strict tenant_isolation (matches migration 013) on the 3 company tables
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  company_tables text[] := ARRAY[
    'tool_assets', 'tool_requests', 'tool_asset_movements'
  ];
BEGIN
  FOREACH t IN ARRAY company_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation ON public.%I
        USING (
          company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
        )
        WITH CHECK (
          company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
        )
    $pol$, t);
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- GRANTs (Pitfall #49)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r text;
  t text;
  roles text[] := ARRAY['mepuser', 'mepuser_super'];
  company_tables text[] := ARRAY[
    'tool_assets', 'tool_requests', 'tool_asset_movements'
  ];
BEGIN
  FOREACH r IN ARRAY roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      -- Global catalog: SELECT is enough for app traffic (managed by SUPER_ADMIN later).
      EXECUTE format('GRANT SELECT ON public.tool_catalog TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.tool_catalog_id_seq TO %I', r);
      FOREACH t IN ARRAY company_tables LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO %I', t, r);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I_id_seq TO %I', t, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

COMMIT;
