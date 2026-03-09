# Phase 4 - UI Cleanup & De-duplication (SAFE)

## What this patch does
1) Adds missing `/public/attendance_fix.css` to eliminate 404 + MIME stylesheet errors.
2) Makes event binding in `public/assignments_v2.html` null-safe to prevent JS crashes (e.g., addEventListener on null).
3) Adds `GET /api/employee-invites/recent` (ADMIN-only) to support Admin UI without 404.
4) Provides a cleanup script to remove duplicate/old UI files that can cause the wrong version to load.

## How to apply
1) Replace project files using the SAFE package.
2) From the `mep-site-backend` folder run:
   powershell -ExecutionPolicy Bypass -File .\tools\cleanup_duplicates.ps1
3) Restart server.
4) Hard reload browser (Ctrl+Shift+R). If PWA is enabled: unregister service worker + clear site data once.

## Files removed by the script
- public/assignments_v2.REPLACEMENT.step2.html
- public/assignments_v2backup.html
- public/assignments.html
- public/assignments.js
- public/003_rebuild_assignments_table.sql
- public/assignments-v2/ (folder)

## Files kept as canonical
- public/assignments_v2.html (embedded by app.html)
- public/assignments_v2.js
- public/app.html, app.js, app.css
