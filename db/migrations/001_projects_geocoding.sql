ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS site_address TEXT,
  ADD COLUMN IF NOT EXISTS site_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS site_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocode_source TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_site_lat_lng
  ON projects (site_lat, site_lng)
  WHERE site_lat IS NOT NULL AND site_lng IS NOT NULL;
