MEP Site Workforce – Baseline Technical Status

Baseline Name:
MEP_SITE_WORKFORCE_BASELINE_PROFILE_ASSIGNMENTS_DEDUP_NULLSAFE_v1

Date:
2026-02-21

============================
STABLE MODULES
============================

Auth
- Login with email + pin
- JWT Bearer token
- whoami used for identity + role

Profile
- Source of truth = DB
- Fetch profile on Profile tab click (dynamic)
- Completeness badge + missing fields checklist
- home_address alignment fixed (UI reads backend key)

Assignments (V2)
- Assignments is embedded inside app.html (NO iframe)
- Create / List / Requests tabs present
- Admin workflow supported (Approve/Reject requests) if available
- Requests/Assignments refresh works without console crashes

Duplication cleanup
- Duplicate standalone Assignments pages removed (legacy + standalone v2)
- Assignments is now embedded-only via app.html/app.js

Stability fix (root cause)
- Fixed JS crash: "Cannot read properties of null (reading 'classList')"
- Implemented null-safe message helpers (clearMsg / setOk / setErr)
- Kept compatibility with early inline execution in app.html

============================
ARCHITECTURAL DECISIONS
============================
- DB is the only source of truth for profile + assignments data
- UI views are unified under app.html tabs (no nested tabs/iframe)
- No silent failures: UI must not crash if an optional message element is missing

============================
KNOWN LIMITATIONS (ACCEPTED)
============================
- Some legacy element IDs may still exist in code paths, but are harmless due to null-safety
- Further refactor/cleanup postponed by contract (step-by-step only)

============================
NEXT STEPS (NOT DONE)
============================
- Verify full assignments end-to-end:
  request -> approve -> real assignment -> attendance uses it
- Decide role-based access rules for tabs (ADMIN vs WORKER)
- Optional: remove remaining unused code paths after explicit approval

BASELINE STATUS:
SAFE – APPROVED – READY TO BUILD ON