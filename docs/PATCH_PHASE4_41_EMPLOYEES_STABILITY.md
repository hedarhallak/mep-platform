# Phase 4.1 — Employees/Projects dropdown stability (SAFE)

## Goal
Prevent empty Employee/Project dropdowns caused by missing/late auth token in embedded Assignments V2.

## Changes
- Expose `window.getMepAuthToken()` and dispatch `mep-auth-changed` event in `public/app.js`.
- In `public/assignments_v2.html`, read token from localStorage keys (`mep_auth_token`, `mep_token`, legacy `token`) and from parent bridge.
- Wait briefly for token on page load and re-load lists on auth change / storage updates.

## Result
Assignments V2 no longer "loses" employees/projects due to token timing or iframe context.
