# SCHEMA.md — Constrai Database Reference

> **Database:** `mepdb` (PostgreSQL 16 + PostGIS) on production server.
> **User:** `mepuser` (owner of all application tables).
> **Connection:** `localhost:5432` via `DATABASE_URL` env var.
> **Total tables:** 33. **Migrations:** 11 (`migrations/000_baseline_2026-04-28.sql` + `001-010`).
> **Canonical baseline reference:** [`db/schema_baseline_2026-05-04.sql`](./db/schema_baseline_2026-05-04.sql) (post-Section-80; supersedes all earlier baseline files).
>
> **Multi-tenancy:** All business tables include `company_id` (FK → `companies.id`). Always filter by company in queries unless you're a SUPER_ADMIN explicitly viewing cross-company data.
>
> **Naming gotchas:**
> - The user table is `app_users`, NOT `users`.
> - The active material-request family is `material_requests` (singular). The legacy `materials_requests` plural variant + its `_items`/`_tickets` siblings were dropped in Section 70.

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

### B. Companies & Employees (3 tables)

| Table | Purpose |
|---|---|
| `companies` | Tenant container; one row per customer company |
| `employees` | Worker roster per company (name, contact, location) |
| `employee_profiles` | Extended profile: trade, rank, address, emergency contact, **PostGIS home location** |

> Lookup tables `employee_trades` / `employee_roles` / `employee_ranks` were dropped in Section 72. Trade/role/rank values are stored as plain text on `employee_profiles.trade_code` / `app_users.role` / `employee_profiles.rank_code` and constrained at the application layer.

#### `companies` — key columns
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `company_code` | TEXT UNIQUE | Used during employee signup |
| `name` | TEXT | Display name |
| `status` | TEXT | CHECK constraint: TRIAL / ACTIVE / PAST_DUE / SUSPENDED / CANCELLED (Section 80 — was a FK to `company_statuses` which is now dropped) |
| `plan` | TEXT | CHECK constraint: BASIC / PRO / ENTERPRISE (Section 80) |
| `procurement_email` | TEXT | Recipient for internal procurement POs |

> Section 75 dropped 9 unused columns from `companies`: `travel_origin_policy`, `yard_lat`, `yard_lng`, `dispatch_time`, `dispatch_timezone`, `attendance_mode`, `break_count`, `break_minutes`, `overtime_threshold_hours` — all geofencing/dispatch/attendance config that was never wired to any feature.

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

### H. CCQ Rates & Travel (1 table)

| Table | Purpose |
|---|---|
| `ccq_travel_rates` | ACQ/CCQ travel allowance rates by trade × sector × distance × effective period (updated every 2 years) |

> The duplicate `ccq_travel_allowance_bands` / `ccq_travel_allowance_rates` lookup tables were dropped in Section 75 (they were dead duplicates of the active `ccq_travel_rates` table).

#### `ccq_travel_rates`
- Quebec construction industry standard reimbursements
- Composite key: `(trade_code, sector, min_km, effective_from)` unique
- `rate_cad`: 0 means tax form only (no cash, T2200 + TP-64.3 reimbursement)
- System sends reminder 60 days before `effective_to` expiry
- Trades: GENERAL, ELECTRICAL, PLUMBING, HVAC, ELEVATOR_TECH, CARPENTRY
- Sectors: IC (Institutional/Commercial), I (Industrial), RESIDENTIAL

---

### I. Audit & System (4 tables)

| Table | Purpose |
|---|---|
| `audit_logs` | **Immutable** audit trail of all user actions (triggers prevent UPDATE/DELETE) |
| `daily_dispatch_runs` | One row per company per day; status of dispatch job |
| `employee_daily_dispatch_state` | Last sent digest version per employee per work date (idempotency) |
| `push_tokens` | Mobile device push notification tokens (iOS/Android) |

> `attendance_approvals_audit` was dropped in Section 74 — was scaffolding for an absence-approval feature that never landed.

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

### J. Other (1 table)

| Table | Purpose |
|---|---|
| `standup_sessions` | Daily foreman standup to review tomorrow (assignments + materials) |

> The May 4 schema sprint (Sections 70-74) dropped 10 tables in this section that were "designed in schema but never built in code":
> - `early_checkout_requests`, `borrow_requests`, `absence_reasons`, `attendance_absences` (workflow features never wired)
> - `company_settings` (real config lives directly on the `companies` table)
> - `company_statuses` (replaced by inline CHECK on `companies.status` in Section 80)
> - `company_employee_field_config` / `employee_field_catalog` / `employee_field_values` / `employee_sensitive_values` (entire dynamic-employee-field subsystem)
>
> Also dropped: `parking_claims`, `project_geofences`, `sensitive_access_log`, the `erp` schema (4 tables + 2 functions), and the legacy single-foreman `project_foremen.foreman_employee_id` column. See `db/schema_baseline_2026-05-04.sql` for the complete current state.

---

### K. Billing & Subscriptions (5 tables) — Phase 6-D-4 (Sections 115-118)

Added by **migration 018** (May 24, 2026) + **migration 019** (backfill) + **migration 020** (GRANTs + ALTER DEFAULT PRIVILEGES) + **migration 021** (GST scale normalization, May 26, 2026).

| Table | Purpose |
|---|---|
| `subscriptions` | One row per company. Tracks `subscribed_seats`, `plan_type` (MONTHLY/ANNUAL/ENTERPRISE), `status` (TRIAL/ACTIVE/PAST_DUE/SUSPENDED/CANCELLED/DELETED), `current_bracket_label`, `current_unit_price_cents`, `next_billing_at`, `trial_ends_at`. Bracket derived from seats: 1-5/6-10/11-20/21-35/36-50/50+ at $27/$25/$24/$23/$22/custom-floor-$22 per Section 115.3 |
| `subscription_seat_changes` | Append-only log of every seat change. `change_type`: ADD / REDUCE / INITIAL (backfill from companies.max_users). `proration_cents` for mid-cycle changes. `effective_date` |
| `invoices` | All invoices: SUBSCRIPTION_RECURRING (monthly/annual cron), TRAINING (manual quote per Section 115.4), CUSTOM_DEMAND (milestone-based), OTHER. Sequential `invoice_number` format `CONS-YYYY-NNNN` (year resets) via `pg_advisory_xact_lock`. Money in INTEGER cents. JSONB `details` column varies by type. Status: DRAFT / QUOTE_SENT / SENT / PARTIAL / PAID / VOID / DELETED |
| `payments` | Records of payment receipts against invoices. Supports full + partial. `payment_method`: BANK_TRANSFER / CHEQUE / OTHER (Stripe deferred to Phase 9-B). Overpayment is blocked at the route layer |
| `tax_rates` | History-aware tax rate registry. Active rate for a given date = row where `effective_from <= date AND (effective_until IS NULL OR date < effective_until)`. Seeded: `QC/QST/9975` and `FEDERAL/GST/5000`. Both stored as **thousandths-of-percent** (1 unit = 0.001%, so QST=9.975% and GST=5%) — see `lib/invoice_numbering.js` |

#### Tax rate scale convention

The `tax_rates.rate_basis_points` column is **misnamed** for historical reasons (migration 018). It actually stores **thousandths-of-percent** (1 unit = 0.001%), not standard basis points. Examples:
- QST 9.975% → 9975 (NOT 997.5 which basis points would require)
- GST 5.000% → 5000

The thousandths scale was chosen so Quebec's 9.975% QST can be an exact integer. The `calculateTaxes()` helper in `lib/invoice_numbering.js` uses divisor `100000` (not `10000`) to match.

**Migration 018** seeded GST inconsistently as `500` (basis points convention, 5% in basis points). **Migration 021** (May 26, 2026) corrects this to `5000`. Any future tax-rate rows MUST follow the thousandths-of-percent convention.

#### Invoice number generation

Sequential, year-prefixed: `CONS-YYYY-NNNN`. Year resets the sequence (so `CONS-2027-0001` follows `CONS-2026-XXXX`). Generated by `lib/invoice_numbering.js#generateInvoiceNumber(db, issueDate)`:

```sql
-- Serialization key (arbitrary unique constant)
SELECT pg_advisory_xact_lock(4242420001);

-- Find the latest invoice in the target year
SELECT invoice_number FROM public.invoices
  WHERE invoice_number LIKE 'CONS-YYYY-%'
  ORDER BY invoice_number DESC
  LIMIT 1;
-- Increment + pad to 4 digits
```

The advisory lock is transaction-scoped (`pg_advisory_xact_lock`), so concurrent generations serialize until both COMMITs complete. Must be called inside a transaction (use `req.db` from `tenantDb`).

#### Billing schema permissions (Pitfall #49)

Tables in this section are created by postgres via `sudo -u postgres psql` and are owned by postgres. **Migration 020** explicitly GRANTs SELECT/INSERT/UPDATE/DELETE to `mepuser` + `mepuser_super` on all 5 tables. The same migration also applies `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ... TO mepuser, mepuser_super` so any future postgres-owned table automatically inherits the grants.

Verification command:
```bash
sudo -u postgres psql mepdb -c "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ('subscriptions','subscription_seat_changes','invoices','payments','tax_rates') AND grantee LIKE 'mep%' ORDER BY table_name, grantee, privilege_type;"
```

Expected: 40 rows (5 tables × 4 privileges × 2 roles).

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

- Files in `/migrations/` are numbered: `000_baseline_2026-04-28.sql` (the historical starting point) + `001_user_invites.sql` through `010_drop_company_statuses_and_plans.sql`.
- Atlas applies them in lexical order on every PR's CI run against a fresh PostGIS-enabled DB; this is the canonical migration sequence.
- The human-readable baseline `db/schema_baseline_2026-05-04.sql` is what you get after applying all of the above. Regenerate it via `.\scripts\regen-baseline.ps1` whenever a new migration ships (see Section 76 for the 5 gotchas the script bakes in).
- **Always create a backup before running a destructive migration on production.** See `RECOVERY.md` Section 3.

---

## Audit Tooling

`scripts/audit-schema.py` — schema-aware unused-objects detector. Schema-qualified, FK-aware, PK-aware, SERIAL-aware. Three modes:
- `--tables` — find tables with no code references.
- `--columns` — find columns with no code references AND no FK relationships.
- `--inserts` — find route INSERT statements that omit NOT NULL columns (the bug class behind the project_foremen issue from Section 65 P1).

Run with the canonical baseline:
```
python3 scripts/audit-schema.py --all
```

After the May 4 sprint, the audit reports zero truly-unused tables and zero truly-unused columns — confirming the schema is clean. See Sections 66-80 for the full sprint history.
- New migrations: increment number, document in commit message what changed
