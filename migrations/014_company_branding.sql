-- ============================================================================
-- 014_company_branding.sql
--
-- Phase 6 (Frontend tenant context + branding) — Piece 6-A.
--
-- Adds two nullable columns to public.companies so each tenant can
-- override the frontend's default Constrai branding:
--
--   brand_color     varchar(7)  — hex color (#RRGGBB) used as the tenant's
--                                  primary accent. NULL = use the Constrai
--                                  default. No CHECK constraint at DB layer;
--                                  validation lives in the backend (regex
--                                  `^#[0-9A-Fa-f]{6}$`) so we can return a
--                                  400 with a sensible error message rather
--                                  than letting Postgres reject with a
--                                  cryptic constraint violation.
--   brand_logo_url  text        — public URL of the tenant's logo (typically
--                                  DigitalOcean Spaces). NULL = use the
--                                  Constrai default logo. Storage decision
--                                  (Spaces vs S3 vs locally-served) lives at
--                                  the application layer; the column just
--                                  holds whatever URL the backend computes
--                                  on upload.
--
-- Why nullable + no default: we deliberately do NOT backfill existing
-- tenants with "the Constrai default color" — leaving NULL lets the
-- frontend distinguish "tenant hasn't customized" from "tenant chose
-- Constrai's color on purpose". The default-rendering logic lives in
-- one place (the frontend bootstrap) so a future Constrai re-brand
-- only touches one file.
--
-- Phase 6 sub-pieces (each a separate PR; this migration is 6-A only):
--   6-A:  this migration                                ← here
--   6-B:  public GET /api/companies/:id/branding        ← next PR
--   6-C:  frontend bootstrap reads branding + applies   ← then
--   6-D:  admin upload UI + Spaces upload pipeline      ← finally
--
-- Rollback: 014_company_branding.rollback.sql drops the two columns.
-- ============================================================================

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN brand_color    varchar(7),
  ADD COLUMN brand_logo_url text;

COMMENT ON COLUMN public.companies.brand_color IS
  'Hex color (#RRGGBB) used as the tenant''s primary accent in the frontend. NULL = use Constrai default. Backend validates format; no DB CHECK constraint.';

COMMENT ON COLUMN public.companies.brand_logo_url IS
  'Public URL of the tenant''s logo (typically DigitalOcean Spaces). NULL = use Constrai default. Frontend bootstrap swaps the <img src> based on this value.';

-- Sanity check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'companies'
       AND column_name  = 'brand_color'
  ) THEN
    RAISE EXCEPTION 'Migration 014 abort: companies.brand_color column was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'companies'
       AND column_name  = 'brand_logo_url'
  ) THEN
    RAISE EXCEPTION 'Migration 014 abort: companies.brand_logo_url column was not created';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration manual verification (run after COMMIT to confirm):
-- ============================================================================
--
-- \d+ public.companies
-- -- Expect to see brand_color (character varying(7)) and brand_logo_url (text)
-- -- among the columns, both nullable, no default.
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'companies'
--    AND column_name IN ('brand_color', 'brand_logo_url')
--  ORDER BY column_name;
-- -- Expect 2 rows: both is_nullable=YES, both column_default IS NULL.
