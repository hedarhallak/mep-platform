# PATCH 006 — Employee Signup via Employee-Linked Invite

## Goal
Enable restricted sign up for employees (not public), without requiring admin to enter full employee details.

## Summary
- Adds `public.employee_invites` table (migration 006).
- Adds ADMIN endpoints to generate/list invites.
- Adds employee endpoint to sign up using an invite code.
- Keeps existing `/api/auth/login` and `/api/auth/signup` unchanged (backward compatible).

## Endpoints

### 1) Generate invite (ADMIN)
`POST /api/employee-invites/generate`

Body:
- `employee_id` (required)
- `expires_hours` (optional, default 48)
- `note` (required if employee had any prior invite)

Behavior:
- Revokes any ACTIVE invite for that employee (kept for audit).
- Creates a new ACTIVE invite with expiry.

### 2) List invites (ADMIN)
`GET /api/employee-invites?employee_id=123`

### 3) Sign up with invite (Employee)
`POST /api/auth/signup-invite`

Body:
- `invite_code`
- `username`
- `pin`

Rules:
- Invite must be ACTIVE, unused, and not expired.
- Employee must not already have an `app_users` record.
- Username must be unique.
- On success: creates `app_users` row and marks invite as USED.

## UI
- `/signup_invite.html` allows employees to sign up using Invite Code.
