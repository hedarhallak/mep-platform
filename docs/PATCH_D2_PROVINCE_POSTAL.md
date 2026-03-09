# D2 – Province + Canadian Postal Format (QC + A1A 1A1)

## Goal
Fix Home Address geocoding failures in Canada by:
- Including **province** (default **QC**) in the geocoding query.
- Enforcing Canadian postal format **A1A 1A1** (uppercase + required space).

## Changes
### UI (public/app.html, public/app.js)
- Added read-only field **Province** with default value **QC**.
- Postal Code input auto-formats to **A1A 1A1** (uppercase + space).
- Client validation blocks save if postal is not valid.

### Backend (routes/profile.js, services/geocoding.js)
- Accepts `province` from request body (defaults to `QC`).
- Normalizes postal code to `A1A 1A1` server-side for safety.
- Geocoding query now includes: street, city, province, postal, Canada
  with `country=ca` and `permanent=true`.

## DB
No schema changes required in this step.

## Test
1. Restart backend (`node index.js`).
2. In Profile:
   - Street: `1770 Avenue Albert-Murphy`
   - Apt/Unit: `3`
   - City: `Laval`
   - Province: `QC`
   - Postal: `H7T1J1` (auto becomes `H7T 1J1`)
3. Submit Profile → should save successfully.
