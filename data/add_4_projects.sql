-- data/add_4_projects.sql
-- Adds 4 sample projects directly into public.projects.
-- Uses safe defaults:
--   trade_type_id=1, status_id=2, client_id=1
-- Detects columns automatically (project_code/code, name/project_name/title, site_lat/site_lng/radius_m, shift_start/shift_end).

BEGIN;

DO $$
DECLARE
  code_col text;
  name_col text;
  lat_col text;
  lng_col text;
  radius_col text;
  shift_start_col text;
  shift_end_col text;

  has_trade boolean;
  has_status boolean;
  has_client boolean;

  sql text;
BEGIN
  -- Find code column
  SELECT column_name INTO code_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'
    AND column_name IN ('project_code','code')
  ORDER BY CASE column_name WHEN 'project_code' THEN 1 ELSE 2 END
  LIMIT 1;

  IF code_col IS NULL THEN
    RAISE EXCEPTION 'public.projects must have project_code or code column';
  END IF;

  -- Find name column (optional)
  SELECT column_name INTO name_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'
    AND column_name IN ('name','project_name','title')
  ORDER BY CASE column_name WHEN 'name' THEN 1 WHEN 'project_name' THEN 2 ELSE 3 END
  LIMIT 1;

  -- Optional geo + shift columns
  SELECT column_name INTO lat_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'
    AND column_name IN ('site_lat','lat','latitude')
  ORDER BY CASE column_name WHEN 'site_lat' THEN 1 WHEN 'lat' THEN 2 ELSE 3 END
  LIMIT 1;

  SELECT column_name INTO lng_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'
    AND column_name IN ('site_lng','lng','longitude')
  ORDER BY CASE column_name WHEN 'site_lng' THEN 1 WHEN 'lng' THEN 2 ELSE 3 END
  LIMIT 1;

  SELECT column_name INTO radius_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'
    AND column_name IN ('radius_m','geofence_radius_m')
  ORDER BY CASE column_name WHEN 'radius_m' THEN 1 ELSE 2 END
  LIMIT 1;

  SELECT column_name INTO shift_start_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'
    AND column_name IN ('shift_start','shift_start_time')
  ORDER BY CASE column_name WHEN 'shift_start' THEN 1 ELSE 2 END
  LIMIT 1;

  SELECT column_name INTO shift_end_col
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'
    AND column_name IN ('shift_end','shift_end_time')
  ORDER BY CASE column_name WHEN 'shift_end' THEN 1 ELSE 2 END
  LIMIT 1;

  -- Required FK columns (your DB has them NOT NULL)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects' AND column_name='trade_type_id'
  ) INTO has_trade;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects' AND column_name='status_id'
  ) INTO has_status;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects' AND column_name='client_id'
  ) INTO has_client;

  -- Build insert dynamically
  sql := 'WITH data(code_val, name_val, lat_val, lng_val, radius_val, shift_start_val, shift_end_val) AS (VALUES
    (''102'',''Project 102 - Sample 1'', 45.5080, -73.5870, 150, ''07:00'', ''15:30''),
    (''103'',''Project 103 - Sample 2'', 45.4900, -73.5650, 150, ''07:00'', ''15:30''),
    (''104'',''Project 104 - Sample 3'', 45.5400, -73.6000, 150, ''07:00'', ''15:30''),
    (''105'',''Project 105 - Sample 4'', 45.4700, -73.5500, 150, ''07:00'', ''15:30'')
  )
  INSERT INTO public.projects (';

  -- Columns list
  sql := sql || format('%I', code_col);
  IF name_col IS NOT NULL THEN sql := sql || format(', %I', name_col); END IF;

  IF has_trade THEN sql := sql || ', trade_type_id'; END IF;
  IF has_status THEN sql := sql || ', status_id'; END IF;
  IF has_client THEN sql := sql || ', client_id'; END IF;

  IF lat_col IS NOT NULL THEN sql := sql || format(', %I', lat_col); END IF;
  IF lng_col IS NOT NULL THEN sql := sql || format(', %I', lng_col); END IF;
  IF radius_col IS NOT NULL THEN sql := sql || format(', %I', radius_col); END IF;
  IF shift_start_col IS NOT NULL THEN sql := sql || format(', %I', shift_start_col); END IF;
  IF shift_end_col IS NOT NULL THEN sql := sql || format(', %I', shift_end_col); END IF;

  sql := sql || ') SELECT d.code_val';

  -- Values list
  IF name_col IS NOT NULL THEN sql := sql || ', d.name_val'; END IF;

  IF has_trade THEN sql := sql || ', 1'; END IF;   -- defaultTradeTypeId
  IF has_status THEN sql := sql || ', 2'; END IF;  -- defaultStatusId
  IF has_client THEN sql := sql || ', 1'; END IF;  -- defaultClientId

  IF lat_col IS NOT NULL THEN sql := sql || ', d.lat_val'; END IF;
  IF lng_col IS NOT NULL THEN sql := sql || ', d.lng_val'; END IF;
  IF radius_col IS NOT NULL THEN sql := sql || ', d.radius_val'; END IF;
  IF shift_start_col IS NOT NULL THEN sql := sql || ', d.shift_start_val'; END IF;
  IF shift_end_col IS NOT NULL THEN sql := sql || ', d.shift_end_val'; END IF;

  -- Avoid duplicates by code
  sql := sql || format(' FROM data d WHERE NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.%I = d.code_val
  );', code_col);

  EXECUTE sql;
END $$;

COMMIT;
