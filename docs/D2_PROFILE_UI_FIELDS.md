# D2 Profile UI Fields (Apt/Unit, Country default, Phone format)

## Scope
- Increase Home Address (Street) input space.
- Add **Apt / Unit** field (stored in `employee_profiles.home_unit`).
- Show Country as **Canada** (UI default, not persisted).
- Enforce phone format on input/save: `(111) 111-1111`.

## Data contract
- UI sends `home_unit` (nullable) in `POST /api/profile`.
- Backend stores `home_unit` only when the DB column exists (introspected).
- Geocoding uses **street + city + postal_code** only (unit is excluded).

## DB
- Migration: `db/migrations/012_employee_profiles_home_unit.sql` adds `home_unit TEXT` (safe, nullable).

## Notes
- If a deployment hasn't run the migration yet, the backend remains compatible (it will ignore `home_unit`).
