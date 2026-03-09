# Clean Baseline Notes

## What was fixed
- Removed nested folder: `mep-site-backend/mep-site-backend` (single source of truth).
- Removed `node_modules` from the package for stability.
- Added `scripts/ensure_deps.js` and `prestart` hook so `npm start` auto-installs dependencies if missing.
  This prevents errors like: `Cannot find module 'jsonwebtoken'`.

## How to run
- `npm start` (it will auto-run npm install if needed)
