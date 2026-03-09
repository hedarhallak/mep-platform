# Phase 4 - UI Cleanup & Stabilization (Patch: employee-invites/recent)

## What changed
- Added an Admin-only helper endpoint to support the Admin UI "Recent Invites" section:
  - `GET /api/employee-invites/recent?limit=20`
  - Returns `{ ok: true, invites: [...] }`

## Why
The Admin UI calls `/api/employee-invites/recent`. Without this endpoint the browser shows 404 (Not Found).

## Files
- REPLACE: `mep-site-backend/routes/employee_invites.js`
- NEW: `mep-site-backend/docs/PATCH_PHASE4_EMPLOYEE_INVITES_RECENT.md`

## Test
1. Start backend: `npm start`
2. Login as admin in `app.html`
3. Confirm in DevTools Network:
   - `GET /api/employee-invites/recent` returns 200
