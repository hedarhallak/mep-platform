-- Section 67/69 → Section 70 — Drop 4 dead "materials_*" plural tables.
--
-- Identified in Section 66 Audit 4 (DB tables — 30 unused tables found).
-- These four tables form a self-contained group of duplicate / never-built
-- "ticket" feature tables that were superseded long ago by the singular-named
-- equivalents (`material_requests`, `material_request_items`, etc., which
-- ARE actively used by routes/material_requests.js + routes/standup.js).
--
-- Verification recap from Section 66:
--   - Zero references in routes/, lib/, services/, jobs/, middleware/,
--     scripts/, seed.js, app.js (cross-checked via word-boundary grep across
--     ~881 KB of code).
--   - Zero references in mep-frontend/src/ and mep-mobile/src/.
--   - All FKs between these 4 tables stay within the group; no outside
--     reference to any of them. So dropping them in one transaction is safe.
--
-- FK topology (children → parents):
--   materials_ticket_items.ticket_id          → materials_tickets(id)        CASCADE
--   materials_ticket_items.source_request_id  → materials_requests(id)       SET NULL
--   materials_request_items.request_id        → materials_requests(id)       CASCADE
--
-- Drop order chosen below: children first, then parents, to avoid FK
-- violations even without CASCADE. Wrapped in a single transaction so a
-- failure rolls everything back atomically.

BEGIN;

DROP TABLE IF EXISTS public.materials_ticket_items;
DROP TABLE IF EXISTS public.materials_request_items;
DROP TABLE IF EXISTS public.materials_tickets;
DROP TABLE IF EXISTS public.materials_requests;

COMMIT;
