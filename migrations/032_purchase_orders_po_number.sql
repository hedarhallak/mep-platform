-- migrations/032_purchase_orders_po_number.sql  (DECISIONS §142.4 follow-up)
--
-- routes/material_requests.js GET /pdf-data inserts into public.purchase_orders
-- with a `po_number` column (the "save purchase order record" step), but NO
-- migration ever created that column and it is absent from the baseline schema
-- (db/schema_baseline_2026-05-04.sql). This is schema drift: prod likely had the
-- column added by a manual ALTER that was never captured as a migration, so prod
-- worked while CI (which builds the schema purely from migrations) had no
-- po_number — surfaced when the §142.4 tenant-isolation regression tests first
-- exercised the pdf-data happy path (the prior test only hit the 400 branch).
--
-- Fix = capture the column as a real, idempotent additive migration. IF NOT
-- EXISTS makes it a safe no-op where the column already exists (prod) and a
-- clean add where it does not (CI, any fresh DB).
--
-- GRANTs: none needed — ADD COLUMN inherits the table's existing grants.
-- Additive + idempotent; apply on prod BEFORE merging the code (§139.2).

BEGIN;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS po_number text;

COMMIT;
