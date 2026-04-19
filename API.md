# API.md — Constrai Backend API Reference

> **Backend:** Node.js + Express. Entry: `index.js`. Routes mounted under `/api/*` (with a few exceptions noted).
>
> **Auth:** JWT Bearer in `Authorization` header (access token, 1h validity). Refresh via `POST /api/auth/refresh`.
>
> **Permissions:** Most endpoints require a specific permission via `requirePermission(...)` middleware. See [`SCHEMA.md`](./SCHEMA.md) Section G + `routes/permissions.js` for the 58-permission registry. The full role × permission matrix lives in `DECISIONS.md` Section 1.
>
> **Multi-tenancy:** Every endpoint that touches business data scopes by `req.user.company_id`. SUPER_ADMIN can pass `?company_id=` to override.

---

## Public Endpoints (no auth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check (returns `{ ok: true, service, time }`) |
| GET | `/api/config` | App config (mapbox_token, feature flags) |
| GET | `/api/geocode/suggest` | Mapbox address autocomplete proxy |

---

## 1. Authentication & Onboarding

### `routes/auth.js` — `/api/auth`
| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/login` | public | Username + PIN. Returns `{ accessToken, refreshToken, user }`. Rate-limited 20/15min. |
| POST | `/refresh` | public | Body: `{ refreshToken }`. Returns new pair (rotation). |
| POST | `/logout` | auth | Revokes current refresh token. |
| POST | `/logout-all` | auth | Revokes all refresh tokens for the user (sign out everywhere). |
| POST | `/signup` | public | Invite-code based signup (employee_code + company_code + invite_code). |
| POST | `/signup-invite` | public | Email-link based activation (token from `user_invites`). |
| GET | `/whoami` | auth | Returns current user object + computed permissions. |
| POST | `/change-pin` | auth | Body: `{ oldPin, newPin }`. Validates old + length rules. |

### `routes/onboarding.js` — `/api/onboarding`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/verify` | public | Verify invite/activation code is valid + not expired |
| POST | `/complete` | public | Set trade/role/rank/home_location after signup |

### `routes/activate.js` — `/activate` (NOT under /api)
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | public | Render activation form (HTML) |
| POST | `/set-pin` | public | One-time PIN setup after email link click |

### `routes/user_invites.js` — `/api/user-invites`
| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/generate` | auth | Creates `user_invites` row + sends email |

### `routes/invite_employee.js` — `/api/invite-employee`
| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/` | `employees.invite` | Creates `employee_invites` + sends email |

---

## 2. Profile & Push

### `routes/profile.js` — `/api/profile`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/dropdowns` | public | Returns trade/role/rank options (used during signup) |
| GET | `/me` | auth | Full profile + employee + app_users data |
| POST | `/` | auth | Upsert profile (trade_code, role_code, rank_code, home_location, contact_email, etc.) |

### `routes/push_tokens_route.js` — `/api/profile/push-token`
| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/profile/push-token` | auth | Register iOS/Android device token for push notifications |

---

## 3. Employees & Users

### `routes/employees.js` — `/api/employees`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `employees.view` | List + filters: search, role, trade, active. SUPER_ADMIN may pass `?company_id` |
| GET | `/:id` | `employees.view` | Full profile + contact |
| PATCH | `/:id` | `employees.edit` | Update name, phone, email, status, etc. |

### `routes/user_management.js` — `/api/users`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `settings.user_management` | List all users for company + roles |
| PATCH | `/:id/role` | `settings.user_management` | Change `app_users.role` |
| PATCH | `/:id/status` | `settings.user_management` | Enable/disable (`is_active`) |
| POST | `/:id/resend` | `settings.user_management` | Resend activation email |

### `routes/admin_users.js` — `/api/admin/users`
| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/` | `settings.user_management` | Super-admin creates new admin users |

---

## 4. Projects

### `routes/projects.js` — `/api/projects`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `projects.view` | List for company. SUPER_ADMIN may filter by `?company_id` |
| GET | `/map` | `projects.view` | Projects with site_lat/site_lng (for map) |
| GET | `/meta` | `projects.view` | Dropdowns: trade_types, project_statuses, clients |
| GET | `/clients` | `projects.view` | List active clients |
| GET | `/:id` | `projects.view` | Full project details |
| POST | `/` | `projects.create` | Create project; auto-geocodes address via Mapbox |
| POST | `/clients` | `projects.create` | Create new client |
| PATCH | `/:id` | `projects.edit` | Update fields, status, coords, ccq_sector |
| DELETE | `/:id` | `projects.delete` | Soft/hard delete (only if no active assignments) |

### `routes/project_trades.js` — `/api/project-trades`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/:project_id` | `projects.view` | List trades on project |
| POST | `/:project_id` | `projects.edit` | Add trade |
| PATCH | `/:id` | `projects.edit` | Modify |
| DELETE | `/:id` | `projects.delete` | Remove |

### `routes/project_foremen.js` — `/api/project-foremen`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/:project_id` | `projects.view` | Foremen on project |
| POST | `/:project_id` | `projects.edit` | Assign foreman to project + trade |
| DELETE | `/:project_id/:trade` | `projects.edit` | Unassign |

---

## 5. Assignments

### `routes/assignments.js` + `routes/auto_assign.js` — `/api/assignments`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `assignments.view` | Active assignments. Filters: date, project, employee |
| GET | `/timeslots` | `assignments.view` | Available shift options |
| GET | `/employees-map` | `assignments.view` | Employee homes + active project sites for map |
| GET | `/employees` | `assignments.view` | Available employees by trade/availability |
| GET | `/defaults` | `assignments.view` | Default shift times, roles |
| GET | `/my-today` | auth | Current user's assignments today |
| GET | `/requests` | `assignments.view` | Workflow inbox (PENDING/APPROVED/REJECTED) |
| POST | `/requests` | `assignments.create` | Create new request |
| PATCH | `/requests/:id/approve` | `assignments.edit` | Approve → creates `assignments` row |
| PATCH | `/requests/:id/reject` | `assignments.edit` | Reject + reason |
| PATCH | `/requests/:id/cancel` | `assignments.edit` | Cancel pending or approved |
| PATCH | `/requests/:id/reassign` | `assignments.edit` | Move to different employee |
| PATCH | `/requests/:id/move` | `assignments.edit` | Change dates/shift |
| POST | `/repeat-preview` | `assignments.create` | Preview a recurring assignment series |
| POST | `/repeat-confirm` | `assignments.create` | Create the series |
| POST | `/auto-suggest` | `assignments.smart_assign` | Smart suggestions based on travel distance + trade match |
| POST | `/auto-confirm` | `assignments.smart_assign` | Batch-create suggested assignments |

---

## 6. Attendance

### `routes/attendance.js` — `/api/attendance`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `attendance.view` OR `attendance.view_self` | Filtered records; computed hours |
| GET | `/projects` | `attendance.view` | Projects with assigned employees today |
| POST | `/checkin` | `attendance.checkin` | Record `check_in_time`; create record if missing |
| PATCH | `/:id/checkout` | `attendance.checkin` | Record `check_out_time`; compute paid_minutes + hours (15min paid break, 30min unpaid lunch if shift ≥ 8h) |
| PATCH | `/:id/confirm` | `attendance.approve` | Foreman confirms or adjusts hours |

---

## 7. Materials & Purchase Orders

### `routes/materials.js` + `routes/material_requests.js` — `/api/materials`

**Material requests:**
| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/requests` | `materials.request_submit` | Worker submits items |
| GET | `/requests` | `materials.request_view_own` OR `materials.request_view_all` | Foreman: all; worker: own |
| GET | `/requests/:id` | `materials.request_view_own` | Items + status |
| PATCH | `/requests/:id/review` | `hub.materials_merge_send` | Review surplus availability + qty splits |
| PATCH | `/requests/:id/cancel` | `materials.request_view_own` | Only if PENDING |
| GET | `/catalog` | `materials.catalog_view` | Frequently-used items + autocomplete |

**Surplus:**
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/surplus` | `materials.surplus_view` | Surplus from other projects |
| POST | `/returns` | `materials.surplus_declare` | Declare leftover materials |
| GET | `/returns` | `materials.surplus_view` | List declarations |

**Purchase orders:**
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/purchase-orders` | `purchase_orders.view` | Sent POs |
| GET | `/purchase-orders/:id` | `purchase_orders.view` | PO details |
| GET | `/pdf-data` | `purchase_orders.print` | JSON shape for PDF generation (Puppeteer) |
| POST | `/send-order` | `hub.materials_merge_send` | Merge requests → generate PO → email supplier/procurement |

**Foreman inbox:**
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/inbox` | `hub.materials_inbox` | Foreman's request review queue |
| GET | `/inbox/count` | `hub.materials_inbox` | Badge count for My Hub |
| GET | `/foreman/projects` | `hub.materials_inbox` | Projects where foreman has assignments |
| POST | `/foreman/items` | `hub.materials_merge_send` | Add items during review |
| DELETE | `/foreman/requests/:request_id/items/:item_id` | `hub.materials_merge_send` | Remove item |

### `routes/suppliers.js` — `/api/suppliers`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `suppliers.view` | Filter by `trade_code` |
| POST | `/` | `suppliers.create` | New supplier |
| PATCH | `/:id` | `suppliers.edit` | Update fields |
| DELETE | `/:id` | `suppliers.delete` | Soft delete (`is_active=false`) |

---

## 8. Hub (Tasks, Blueprints, Notes)

### `routes/hub.js` — `/api/hub`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/my-projects` | `hub.send_tasks` | Sender's active projects |
| GET | `/workers` | `hub.send_tasks` | All company workers + current assignments |
| POST | `/messages` | `hub.send_tasks` | Multipart upload (PDF/image); send to recipients |
| GET | `/messages/sent` | `hub.send_tasks` | Sender's sent box |
| GET | `/messages/inbox` | `hub.receive_tasks` | Recipient inbox |
| GET | `/messages/unread-count` | `hub.receive_tasks` | Badge count |
| PATCH | `/messages/:id/read` | `hub.receive_tasks` | Mark read (`read_at`) |
| PATCH | `/messages/:id/ack` | `hub.receive_tasks` | Acknowledge (`acknowledged_at`) |
| PATCH | `/messages/:id/complete` | `hub.receive_tasks` | Mark done + upload completion image |

---

## 9. Standup (Foreman Daily Planning)

### `routes/standup.js` — `/api/standup`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/tomorrow` | `standup.manage` | Tomorrow's projects, team, materials |
| POST | `/session` | `standup.manage` | Create or get today's session |
| POST | `/session/:id/complete` | `standup.manage` | Mark complete + notes |
| GET | `/materials/:project_id` | `standup.manage` | Get/create tomorrow's material request |
| POST | `/materials/:request_id/items` | `standup.manage` | Add items |
| PATCH | `/materials/:request_id/items/:item_id` | `standup.manage` | Edit qty |
| DELETE | `/materials/:request_id/items/:item_id` | `standup.manage` | Remove |

---

## 10. Reports & BI

### `routes/reports.js` — `/api/reports`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/hours` | `reports.view` OR `reports.view_self` | Regular + OT by employee/date |
| GET | `/attendance` | `reports.view` | Daily attendance summary |
| GET | `/travel` | `reports.view` OR `reports.view_self` | Distance per employee + CCQ rate lookup |
| GET | `/assignments` | `reports.view` | Active assignments by employee/project |
| GET | `/distance` | `reports.view` | Raw distance data |
| GET | `/my-daily` | `reports.view` OR `reports.view_self` | Personal daily summary |

### `routes/bi.js` — `/api/bi`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/workforce-suggestions` | `bi.access_full` | Optimization suggestions based on travel distance |

---

## 11. Daily Dispatch

### `routes/daily_dispatch.js` — `/api/daily-dispatch`
| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/prepare` | `hub.access` | Generate work assignments for today |
| POST | `/commit` | `hub.access` | Send notifications + emails |
| GET | `/preview` | `hub.access` | Preview what will be sent |

---

## 12. Permissions

### `routes/permissions.js` — `/api/permissions`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/matrix` | `settings.permissions` | Full role × module × action matrix |
| GET | `/my-permissions` | auth | My computed permissions `{ module: { action: bool } }` |
| GET | `/role/:role` | `settings.permissions` | Permissions for one role |
| PUT | `/role/:role` | `settings.permissions` | Bulk update role permissions |
| POST | `/reset/:role` | `settings.permissions` | Revert role to seed defaults |
| GET | `/audit` | `settings.permissions` | Permission change history |

---

## 13. Super-Admin (cross-company)

### `routes/super_admin.js` + `routes/ccq_rates.js` — `/api/super/*`

**Companies:**
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/super/stats` | SUPER_ADMIN | System stats (user count, company count, etc.) |
| GET | `/super/companies` | SUPER_ADMIN | All companies |
| GET | `/super/companies/:id` | SUPER_ADMIN | Company details |
| POST | `/super/companies` | SUPER_ADMIN | Provision new tenant |
| PATCH | `/super/companies/:id` | SUPER_ADMIN | Update settings |
| POST | `/super/companies/:id/suspend` | SUPER_ADMIN | Disable all access |
| POST | `/super/companies/:id/activate` | SUPER_ADMIN | Re-enable |

**CCQ rates:**
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/super/ccq-rates/` | SUPER_ADMIN | All rates |
| GET | `/super/ccq-rates/expiring` | SUPER_ADMIN | Rates expiring within 60 days |
| POST | `/super/ccq-rates/` | SUPER_ADMIN | Add new rate row |
| PATCH | `/super/ccq-rates/:id` | SUPER_ADMIN | Update |
| DELETE | `/super/ccq-rates/:id` | SUPER_ADMIN | Remove |

---

## Conventions

### Auth header
```
Authorization: Bearer <accessToken>
```

### Refresh flow
1. App detects 401 from any endpoint
2. App calls `POST /api/auth/refresh` with stored refresh token
3. Server issues new pair (rotates refresh token); revokes old
4. App retries original request

### Permission failures
- HTTP 403 with `{ error: "permission_denied", required: "<permission_code>" }`

### Multi-tenant data scoping
- All "list" endpoints filter by `req.user.company_id` automatically
- SUPER_ADMIN can override via `?company_id=N` query param on most endpoints

### Pagination
- Most list endpoints accept `?page=1&limit=50` (defaults vary by endpoint)
- Response shape: `{ items: [...], total: N, page: 1, limit: 50 }`

### File uploads
- `routes/hub.js` uses `multer` for PDF/image attachments → stored under `/uploads/`
- File metadata persisted in `task_messages.file_url` / `file_name` / `file_type`

---

## Key Workflow Sequences

### Assignment workflow
```
POST /api/assignments/requests        (create PENDING request)
  ↓
PATCH /api/assignments/requests/:id/approve  (admin)
  ↓ (trigger creates `assignments` row + delivers any pending task_recipients)
GET /api/assignments/my-today         (worker sees on Dashboard)
  ↓
POST /api/attendance/checkin          (worker arrives)
PATCH /api/attendance/:id/checkout    (worker leaves)
PATCH /api/attendance/:id/confirm     (foreman confirms hours)
```

### Material request workflow
```
POST /api/materials/requests          (worker submits)
  ↓
PATCH /api/materials/requests/:id/review  (foreman reviews + checks surplus)
  ↓
POST /api/materials/send-order        (merges + creates PO + emails supplier)
```

### Hub task workflow
```
POST /api/hub/messages                (sender uploads file + selects recipients)
  ↓
PATCH /api/hub/messages/:id/read      (recipient opens)
  ↓
PATCH /api/hub/messages/:id/ack       (recipient confirms task complete)
```
