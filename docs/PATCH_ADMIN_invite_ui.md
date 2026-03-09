# PATCH: Admin Invite UI

## Goal
Add a professional UI in **Admin** tab to generate employee-linked invite codes (non-public signup).

## What changed
- REPLACE `public/app.html`: Admin section now includes Invite generator UI.
- REPLACE `public/app.js`: Added `wireAdminInvites()` and wired it into `boot()`.

## How to use
1. Login as ADMIN.
2. Open **Admin** tab.
3. Enter `employee_id` and (optional) note.
4. Click **Generate**.
5. Copy invite code and send to employee.

## Notes
- Codes expire in 48 hours (server logic).
- If re-generating for the same employee, server may require a note.
