# SCHEMA.md — Constrai Database Reference

> **Database:** `mepdb` (PostgreSQL 14 + PostGIS) on production server.
> **User:** `mepuser` (owner of all application tables).
> **Connection:** `localhost:5432` via `DATABASE_URL` env var.
> **Total tables:** 56. **Migrations:** 31 (in `/migrations/`).
>
> **Multi-tenancy:** All business tables include `company_id` (FK → `companies.id`). Always filter by company in queries unless you're a SUPER_ADMIN explicitly viewing cross-company data.
>
> **Naming gotcha:** the user table is `app_users`, NOT `users`.

---

## How to Query the DB

```bash
# Open psql as superuser (peer auth)
sudo -u postgres psql -d mepdb

# List all tables
\dt

# Describe a table
\d app_users

# Run a one-shot query
sudo -u postgres psql -d mepdb -c "SELECT COUNT(*) FROM employees;"
```

---

## Extensions

| Extension | Purpose | Used by |
|---|---|---|
| **PostGIS** | Geography + geometry types for distance calculations | `employee_profiles.home_location` (Point, SRID 4326); BI workforce optimization queries (ST_Distance) |

---

## Tables by Domain

### A. Auth & Users (4 tables)

| Table | Purpose |
|---|---|
| `app_users` | Primary user accounts with role, PIN auth, company membership |
| `refresh_tokens` | Hashed refresh tokens (7-day TTL) for session rotation |
| `user_invites` | Email-link activation tokens (alternative to invite codes) |
| `employee_invites` | Invite-code based signup (48-hour TTL by default) |

#### `app_users` — key columns
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `username` | TEXT | Login identity |
| `email` | TEXT | Optional; unique per company (case-insensitive) |
| `pin_hash` | TEXT | bcrypt-hashed PIN |
| `role` | TEXT | CHECK constraint: SUPER_ADMIN / IT_ADMIN / COMPANY_ADMIN / TRADE_PROJECT_MANAGER / TRADE_ADMIN / WORKER |
| `company_id` | BIGINT FK → companies | Multi-tenant isolation |
| `employee_id` | BIGINT FK → employees | Unique (one user per employee record) |
| `is_active` | BOOLEAN | Soft-disable without deletion |
| `must_change_pin` | BOOLEAN | Force PIN reset on next login |
| `profile_status` | TEXT | NEW / INCOMPLETE / COMPLETED |
| `activation_sent_at`, `activated_at` | TIMESTAMPTZ | Activation lifecycle |

#### `refresh_tokens`
- One row per active session per user (multiple devices = multiple rows)
- `token_hash` is SHA-256, expires_at = NOW() + 7 days
- Cleaned up by app on rotation; revoked on logout

---

### B. Companies & Employees (5 tables)

| Table | Purpose |
|---|---|
| `companies` | Tenant container; one row per customer company |
| `employees` | Worker roster per company (name, contact, location) |
| `employee_profiles` | Extended profile: trade, rank, address, emergency contact, **PostGIS home location** |
| `employee_trades` | Lookup: PLUMBING, ELECTRICAL, HVAC, CARPENTRY, GENERAL |
| `employee_roles` | Lookup: WORKER, FOREMAN, ADMIN |
| `employee_ranks` | Lookup: APPRENTICE_1-4, JOURNEYMAN, FOREMAN |

#### `companies` — key columns
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `company_code` | TEXT UNIQUE | Used during employee signup |
| `name` | TEXT | Display name |
| `status` | TEXT | ACTIVE / SUSPENDED |
| `travel_origin_policy` | TEXT | `home` or `company_yard` (where employee starts day for distance calcs) |
| `yard_lat`, `yard_lng` | DOUBLE PRECISION | Optional company HQ coords |
| `dispatch_time` | TIME | When daily dispatch fires |
| `dispatch_timezone` | TEXT | Default `'America/Montreal'` |
| `procurement_email` | TEXT | Recipient for internal procurement POs |

#### `employees` — key columns
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `company_id` | BIGINT FK | |
| `employee_code` | TEXT | Unique per company (case-insensitive) |
| `first_name`, `last_name`, `full_name` | TEXT | |
| `phone`, `email` | TEXT | Optional |
| `contact_email` | TEXT | For dispatch notifications (may differ from login email) |
| `home_lat`, `home_lng` | DOUBLE PRECISION | Used for travel distance |
| `is_active` | BOOLEAN | |

#### `employee_profiles` — key columns
| Column | Type | Notes |
|---|---|---|
| `employee_id` | BIGINT PK + FK | One profile per employee |
| `trade_code`, `role_code`, `rank_code` | TEXT FK | To respective lookup tables |
| `home_address`, `home_unit`, `city`, `postal_code`, `province`, `country` | TEXT | Defaults: QC / Canada |
| `home_location` | **geometry(Point, 4326)** | PostGIS — used for accurate distance calculations |
| `emergency_contact_name`, `emergency_contact_phone`, `emergency_contact_relationship` | TEXT | |

---

### C. Projects & Assignments (5 tables)

| Table | Purpose |
|---|---|
| `projects` | Job sites (project_code, address, coordinates, CCQ sector) |
| `project_statuses` | Lookup: ACTIVE / CLOSED / ON_HOLD / CANCELLED |
| `project_trades` | Many-to-many: trades assigned to a project |
| `project_foremen` | Many-to-many: foremen assigned to a project + trade |
| `assignment_requests` | Workflow inbox: PM requests employee→project assignments |
| `assignments` | Approved assignments (the actual work calendar) |
| `clients` | Customer registry per company |

#### `projects` — key columns
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `company_id` | BIGINT FK | |
| `project_code` | TEXT | Unique per company |
| `project_name` | TEXT | Display name |
| `status_id` | BIGINT FK → project_statuses | |
| `client_id` | BIGINT FK → clients | |
| `site_address` | TEXT | Geocoded via Mapbox |
| `site_lat`, `site_lng` | DOUBLE PRECISION | Used for distance |
| `ccq_sector` | TEXT | RESIDENTIAL / IC / INDUSTRIAL — determines CCQ travel rate |
| `geocoded_at`, `geocode_source` | TIMESTAMPTZ / TEXT | Geocoding audit |

#### `assignment_requests` — workflow
- `request_type`: CREATE_ASSIGNMENT / UPDATE_ASSIGNMENT / CANCEL_ASSIGNMENT
- `status`: PENDING → APPROVED (creates `assignments` row) / REJECTED / CANCELED
- `assignment_role`: WORKER / FOREMAN / JOURNEYMAN
- `shift`: text like `"06:00-14:30"`, default `'06:00-14:30'`
- `distance_km`: NUMERIC(8,2) — computed at request time for CCQ rate lookup
- Approval audit: `decision_by_user_id`, `decision_note`, `decision_at`

#### `assignments`
- Composite uniqueness: `(employee_id, project_id, start_date, end_date, shift)`
- A trigger fires on INSERT to deliver any pending `task_recipients` for that employee+project pair (Hub task auto-delivery)
- Legacy V1 data lives in `assignments_legacy` if it exists

---

### D. Attendance (1 table)

| Table | Purpose |
|---|---|
| `attendance_records` | Daily check-in/out per employee per project; hours calculation |

#### `attendance_records` — key columns
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `company_id`, `project_id`, `employee_id` | BIGINT FK | |
| `assignment_request_id` | BIGINT FK | Optional link back to source request |
| `attendance_date` | DATE | |
| `shift_start` | TIME | e.g. `'06:00'` |
| `check_in_time`, `check_out_time` | TIME | |
| `raw_minutes` | INTEGER | Raw clock-out minus clock-in |
| `paid_minutes` | INTEGER | Adjusted: + 15 paid break, − 30 unpaid lunch if shift ≥ 8h |
| `regular_hours`, `overtime_hours` | NUMERIC(4,2) | Computed |
| `late_minutes` | INTEGER | Default 0 |
| `status` | TEXT | OPEN / CHECKED_IN / CHECKED_OUT / CONFIRMED / ADJUSTED |
| `confirmed_by`, `confirmed_at`, `confirmed_regular_hours`, `confirmed_overtime_hours` | | Foreman approval audit trail |
| `foreman_note` | TEXT | |

**Uniqueness:** `(company_id, employee_id, project_id, attendance_date)` — one record per worker per project per day.

---

### E. Materials & Purchase Orders (7 tables)

| Table | Purpose |
|---|---|
| `material_requests` | Worker/foreman submits material need |
| `material_request_items` | Items within a material request (1-to-many) |
| `material_returns` | Foreman declares surplus available (waiting period for cross-project reuse) |
| `material_return_items` | Items in a surplus declaration |
| `material_catalog` | Frequently-used items per company (autocomplete) |
| `suppliers` | Supplier registry per company, by trade |
| `purchase_orders` | Formal PO sent to supplier or internal procurement |

#### `material_requests` — workflow
- `status` flow: PENDING → REVIEWED → MERGED → SENT (or CANCELLED at any point)
- Foreman uses Merge & Edit screen to combine multiple worker requests
- `merged_into_id` allows tracking merge chains (request A merged into request B)

#### `material_request_items`
- `item_name` is normalized; `item_name_raw` is what the worker typed
- `quantity` CHECK > 0
- `qty_from_surplus` + `qty_from_supplier` allow splitting (some from surplus, rest from supplier)
- `surplus_source_project_id` — if pulling from surplus, references the source project

#### `purchase_orders`
- `is_procurement` BOOLEAN — true = sent to internal procurement email; false = sent to supplier
- `items` JSONB — array of `{ item_name, qty, unit }` snapshots (denormalized for PO immutability)
- `ref` — generated PO reference number

---

### F. Hub & Tasks (2 tables)

| Table | Purpose |
|---|---|
| `task_messages` | Supervisor broadcasts: tasks, blueprints, notes (with file attachments) |
| `task_recipients` | Per-recipient delivery + read/ack tracking |

#### `task_messages`
- `type`: TASK / BLUEPRINT / NOTE
- `priority`: LOW / NORMAL / HIGH / URGENT
- `delivery_status`: SENT / PENDING_ASSIGNMENT (if recipient has no current assignment, queues until they get one)
- File attachments: `file_url` (path to uploaded PDF/image), `file_name`, `file_type`

#### `task_recipients`
- `status`: SENT → READ → ACKNOWLEDGED
- `expected_project_id` — for PENDING_ASSIGNMENT messages, indicates which project should trigger delivery
- Unique per `(message_id, recipient_id)`

---

### G. Permissions & Roles (4 tables)

| Table | Purpose |
|---|---|
| `permissions` | Master registry of 58 permissions (fixed in code, seeded via migration) |
| `role_permissions` | Default permissions per role (mutable from UI) |
| `user_permissions` | Per-user grant/revoke overrides |
| `roles` | Role registry (mostly metadata; role values are stored as text in app_users.role) |

#### `permissions`
- PK: `code` (e.g. `'employees.view'`, `'hub.send_tasks'`)
- `grp` — group name: dashboard, employees, projects, suppliers, assignments, attendance, hub, materials, purchase_orders, bi, settings, audit, standup
- 58 permissions total, see `routes/permissions.js` and migration 021 for full list

#### `role_permissions`
- PK: `(role, permission_code)`
- `role` matches `app_users.role` CHECK values
- 13 roles total: SUPER_ADMIN, IT_ADMIN, COMPANY_ADMIN, TRADE_PROJECT_MANAGER, TRADE_ADMIN, FOREMAN (also assignment_role), JOURNEYMAN, APPRENTICE_4/3/2/1, WORKER, DRIVER
- 284 mappings total — see `DECISIONS.md` Section 1 for the full matrix

#### `user_permissions`
- Used for individual exceptions (grant/revoke a permission outside role default)
- `granted` BOOLEAN — true = explicit grant, false = explicit revoke
- Unique per `(user_id, permission_code)`

---

### H. CCQ Rates & Travel (3 tables)

| Table | Purpose |
|---|---|
| `ccq_travel_rates` | ACQ/CCQ travel allowance rates by trade × sector × distance × effective period (updated every 2 years) |
| `ccq_travel_allowance_bands` | Distance bands (e.g. 41-65 km, 66-90 km, ...) |
| `ccq_travel_allowance_rates` | Allowance amounts by band |

#### `ccq_travel_rates`
- Quebec construction industry standard reimbursements
- Composite key: `(trade_code, sector, min_km, effective_from)` unique
- `rate_cad`: 0 means tax form only (no cash, T2200 + TP-64.3 reimbursement)
- System sends reminder 60 days before `effective_to` expiry
- Trades: GENERAL, ELECTRICAL, PLUMBING, HVAC, ELEVATOR_TECH, CARPENTRY
- Sectors: IC (Institutional/Commercial), I (Industrial), RESIDENTIAL

---

### I. Audit & System (5 tables)

| Table | Purpose |
|---|---|
| `audit_logs` | **Immutable** audit trail of all user actions (triggers prevent UPDATE/DELETE) |
| `daily_dispatch_runs` | One row per company per day; status of dispatch job |
| `employee_daily_dispatch_state` | Last sent digest version per employee per work date (idempotency) |
| `push_tokens` | Mobile device push notification tokens (iOS/Android) |
| `attendance_approvals_audit` | Specific audit for foreman-approved hours adjustments |

#### `audit_logs`
- Triggers: `prevent_update`, `prevent_delete` enforce immutability
- Indexed on `(company_id, user_id, created_at DESC)` for fast company timelines
- `details` JSONB — flexible metadata per action type
- `entity_type` examples: 'user', 'project', 'assignment', 'material_request', 'permission'

#### `daily_dispatch_runs`
- Unique per `(company_id, dispatch_date)` — prevents duplicate runs
- `status`: STARTED / SENT / FAILED
- `summary_json` — aggregate stats for the run

---

### J. Other (3 tables)

| Table | Purpose |
|---|---|
| `standup_sessions` | Daily foreman standup to review tomorrow (assignments + materials) |
| `early_checkout_requests` | Worker requests to leave early; foreman approves |
| `borrow_requests` | Inter-project employee/equipment borrowing (lighter-weight than assignment workflow) |
| `absence_reasons` | Lookup: vacation, sick, leave, etc. |
| `attendance_absences` | Recorded absences |
| `company_settings` | Per-company runtime settings (key-value) |
| `company_statuses` | Lookup for company status |
| `company_employee_field_config` | Per-company customization of which employee fields are required/optional |
| `employee_field_catalog` | Master list of all possible employee fields |
| `employee_field_values` | Custom field values per employee |
| `employee_sensitive_values` | PII storage (separate from main employee table for access control) |

---

## Common Query Patterns

```sql
-- Get all employees for a company with their profile + trade
SELECT e.id, e.full_name, ep.trade_code, ep.role_code, ep.rank_code,
       ep.home_address, ep.city
FROM employees e
LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
WHERE e.company_id = $1 AND e.is_active = true
ORDER BY e.full_name;

-- Get current assignments for an employee
SELECT a.*, p.project_name, p.project_code
FROM assignments a
JOIN projects p ON p.id = a.project_id
WHERE a.employee_id = $1
  AND CURRENT_DATE BETWEEN a.start_date AND a.end_date
ORDER BY a.start_date;

-- Get a user's effective permissions (role defaults + user overrides)
SELECT DISTINCT permission_code FROM (
  SELECT permission_code FROM role_permissions WHERE role = $1
  UNION ALL
  SELECT permission_code FROM user_permissions WHERE user_id = $2 AND granted = true
) all_perms
WHERE permission_code NOT IN (
  SELECT permission_code FROM user_permissions WHERE user_id = $2 AND granted = false
);

-- Distance from employee home to project (PostGIS)
SELECT ST_Distance(
  ep.home_location::geography,
  ST_MakePoint(p.site_lng, p.site_lat)::geography
) / 1000.0 AS distance_km
FROM employee_profiles ep, projects p
WHERE ep.employee_id = $1 AND p.id = $2;
```

---

## Migration Conventions

- Files in `/migrations/` are numbered: `001_*.sql`, `002_*.sql`, ..., `031_*.sql`
- Some "SAFE_" prefixed files are corrective/idempotent migrations
- Run via `node scripts/migrate.js` (top-level) or `node scripts/run_sql_file.js <file>`
- **Always create a backup before running a destructive migration on production.** See `RECOVERY.md` Section 3.
- New migrations: increment number, document in commit message what changed
