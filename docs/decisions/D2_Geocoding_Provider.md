# D2 – Professional Profile Save with Auto Home Location

## Context
- The profile save endpoint (`POST /api/profile`) must persist `employee_profiles.home_location`.
- UI does **not** submit manual `lat/lng`.
- In some deployments, `employee_profiles.home_location` is `NOT NULL`, so saving a profile must auto-populate it.

## Decision
**Provider:** Mapbox Forward Geocoding API (Search/Geocoding v6)

**Reason:** We store the coordinates in our database. Mapbox supports a **Permanent** mode (`permanent=true`) intended for cases where results are stored.

## Implementation
- Backend builds an address from: `street + city + postal_code`.
- Backend calls Mapbox forward geocoding with:
  - `country=ca`
  - `limit=1`
  - `permanent=true`
- If no result / invalid address / timeout: return **400** with a clear message.
- If the Mapbox token is missing: return **500** (server misconfiguration).
- If the `home_location` column does not exist in the DB schema, the endpoint keeps baseline behavior and does not geocode.

## Environment
Add to `.env`:
- `MAPBOX_ACCESS_TOKEN=...`

## Notes
- `home_location` is stored as `geometry(Point, 4326)` using `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
