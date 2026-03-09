# Phase 5 — Profile Completion (SAFE)

## What is fixed / added
- Database tables required for Profile are created via migration 007.
- Profile API uses employee_id from JWT (correct linkage).
- Profile creation is UPSERT (create or update) to avoid dead-ends.
- Protected modules require a completed profile (backend returns 412 PROFILE_INCOMPLETE).
- Frontend auto-opens the profile modal and retries automatically.

## Apply steps (local)
1) Run: db/migrations/007_employee_profiles.sql (pgAdmin Query Tool).
2) Restart backend.
3) Hard refresh browser (Ctrl+Shift+R).

## Notes
- ADMIN bypass is enabled in middleware/profile_required.js for safety.
