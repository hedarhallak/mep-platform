# Phase 3: Roles & Access Control (Worker / Foreman / Admin)

## Goals (Definition of Done)
- UI: hide/show tabs based on authenticated user's role.
- API: protect sensitive endpoints by role (reports, invites).
- Zero regressions: existing login, attendance, parking, materials, assignments remain functional.

## UI Rules
- ADMIN:
  - Can see Admin tab
  - Can see Reports tab
  - Can see Assignments tab
- FOREMAN:
  - Can see Reports tab
  - Can see Assignments tab
- WORKER (default):
  - Cannot see Admin / Reports / Assignments management tabs
- Not signed:
  - Hide Admin / Reports / Assignments tabs

## API Rules
- /api/employee-invites/* :
  - ADMIN only (enforced in index.js via requireRoles)
- /api/reports/* :
  - Auth required, roles allowed: ADMIN, FOREMAN
  - Enforced in routes/reports.js

## Notes
- Roles are normalized to UPPERCASE when evaluating access.
- UI checks are not security; server-side role checks remain the source of truth.
