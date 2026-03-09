# PATCH: Admin UI -> Add Employee + Send Invite (Minimal)

Date: 2026-02-13

## Goal
Replace the Admin page multi-section flow with a single "Add Employee" section containing:
1) Create Employee
2) Send Invite (email) for the employee created above

## UI
- Renamed nav tab label: "Admin" -> "Add Employee" (data-view remains `admin`)
- `view-admin` now contains only one card with:
  - Employee form fields
  - Button: Create Employee
  - Button: Send Invite (disabled until employee is created)

## API
- Create Employee uses existing: `POST /api/employees`
- Send Invite uses existing: `POST /api/admin/users` with:
  - `email`
  - `role: "WORKER"` (default)
  - `employee_id`
  - `full_name` (optional)

## Files changed
- REPLACE public/app.html
- REPLACE public/app.js
