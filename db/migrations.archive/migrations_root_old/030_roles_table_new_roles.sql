-- ================================================================
-- Migration 030: Add New Roles to roles table
-- Run on: psql -U mepuser -d mepdb -h localhost
-- ================================================================

-- Add SUPER_ADMIN and new field roles to roles table
INSERT INTO public.roles (role_key, label, is_active) VALUES
  ('SUPER_ADMIN',  'Super Administrator', true),
  ('FOREMAN',      'Foreman',             true),
  ('JOURNEYMAN',   'Journeyman',          true),
  ('APPRENTICE_1', 'Apprentice Level 1',  true),
  ('APPRENTICE_2', 'Apprentice Level 2',  true),
  ('APPRENTICE_3', 'Apprentice Level 3',  true),
  ('APPRENTICE_4', 'Apprentice Level 4',  true),
  ('DRIVER',       'Driver',              true)
ON CONFLICT DO NOTHING;

-- ── Done ──────────────────────────────────────────────────────
-- Roles added to roles table:
--   SUPER_ADMIN, FOREMAN, JOURNEYMAN,
--   APPRENTICE_1, APPRENTICE_2, APPRENTICE_3, APPRENTICE_4, DRIVER
