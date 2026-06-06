# Constrai — Program Overview & Conference-Readiness Review

> **Purpose:** a structured walkthrough of the whole platform — every menu, role, admin
> feature, and cross-cutting system — with a **status** and **conference-readiness** flag on
> each. Built June 4, 2026 (Section 134) as the "full program overview" track (priority item #2).
> Walk through it top-to-bottom with Hedar; each ⚠️ / ❓ is a discussion or fix candidate
> before the September demo.
>
> Legend — **Status:** ✅ live & solid · 🟡 live but has a known gap · 🔴 placeholder/missing ·
> ❓ needs verification. **Conf:** 🎤 = part of the demo surface.

---

## 1. Tenant app — side menu (the demo surface 🎤)

The web app (`mep.constrai.ca`) sidebar, in order. Each row is permission-gated; a role only
sees the menus it holds a permission for.

| # | Menu | Route | Gating permission(s) | Status | Notes |
|---|------|-------|----------------------|--------|-------|
| 1 | Dashboard | `/dashboard` | none (always) | ✅ | role-aware home |
| 2 | Employees | `/employees` | `employees.view` | ✅ | |
| 3 | Projects | `/projects` | `projects.view` | ✅ | site address + lat/lng drive CCQ allowances |
| 4 | Suppliers | `/suppliers` | `suppliers.view` | ✅ | |
| 5 | Assignments | `/assignments` | `assignments.view` | ✅ | **4 tabs** (Single / All-Teams wizard / Geographical / List) — Section 131 redesign |
| 6 | Attendance | `/attendance` | `attendance.view*` | ✅ | |
| 7 | Reports | `/reports` | `reports.view`/`view_self` | ✅ | **FIXED §134** — added the route-level `RequirePermission anyOf` wrapper for consistency with siblings |
| 8 | Daily Standup | `/standup` | `standup.manage` | ✅ | |
| 9 | Task Request | `/task-request` | `hub.send_tasks` | ✅ | |
| 10 | Material Request | `/material-request` | `materials.request_*` | ✅ | |
| 11 | Purchase Orders | `/purchase-orders` | `purchase_orders.view*` | ✅ | |
| 12 | Material Returns | `/surplus` | `materials.surplus_*` | ✅ | renamed from "Surplus" (§134); declare + claim leftover material. **§134: foreman project-dropdown fixed (my-today pattern)** |
| 13 | Tools | `/tools` | `materials.request_submit`/`surplus_view` | ✅ | tool request + asset tracking (§128). **§134: foreman project-dropdown fixed (my-today pattern)** |
| 14 | Expenses | `/expenses` | `expense_claims.submit`/`view` | 🟡 | Emergency Purchase (§129); **approver = COMPANY_ADMIN is TEMPORARY (§129.9 → folds into §132 OWNER)** |
| 15 | My Hub | `/my-hub` | none (always) | ✅ | inbox / tasks |
| — | Profile | `/profile` | none | ✅ | |

**Admin section (lower sidebar, gated by `settings.*`):**

| Menu | Route | Status | Notes |
|------|-------|--------|-------|
| User Management | `/user-management` | ✅ | invite/disable users; reads seat count from `subscriptions` |
| Subscription | `/subscription` | ✅ 🎤 | plan card + seat usage + 3 request buttons |
| Billing | `/billing/invoices` | ✅ 🎤 | invoice list + type filter |
| Permissions | `/permissions` | 🟡 | **ROLE matrix only — no per-USER grant UI** (the §132 gap). **§134: added a hint explaining the rank-lock** (own/higher roles are read-only) so it no longer "looks broken" |
| Settings | `/settings` | 🔴 | **placeholder — "Settings — Coming soon"** (§134 finding) |

---

## 2. Roles & permission model

**13 roles** (rank order): `SUPER_ADMIN` › `IT_ADMIN` › `COMPANY_ADMIN` › `TRADE_PROJECT_MANAGER`
› `TRADE_ADMIN` › `FOREMAN` › `JOURNEYMAN` › `APPRENTICE_4/3/2/1` › `WORKER` · `DRIVER`.

- **Role matrix** (`/permissions`): per-role module×action grid; editable only for roles BELOW
  your rank (privilege-escalation guard). ✅ works.
- **Per-user overrides:** `user_permissions` table + `middleware/permissions.js can()` enforce
  them ✅ — but **no UI/endpoint to grant them** 🔴 (§132). This is the biggest permission-model
  gap and the heart of the §132 security program (OWNER role + per-user grants + audit).
- **Separation of duties (designed, §132):** introduce an **OWNER** role (Constrai-provisioned)
  above the technical COMPANY_ADMIN, as the sole audit viewer. Resolves the §129.9 "approver is
  temporary" item.

---

## 3. SUPER_ADMIN portal (`admin.constrai.ca`)

| Feature | Status | Notes |
|---------|--------|-------|
| Companies list | ✅ | per-tenant overview |
| Branding | ✅ | logo + brand color + seat usage |
| Subscription requests inbox | ✅ | apply seat/plan changes |
| Training quotes | ✅ | base + per-role + per-diem + flight |
| Custom demands | ✅ | ad-hoc work invoices |
| Payments | ✅ | record payment + history (leak-fixed §124) |
| **Security** | ✅ | TOTP 2FA enforced + **§133 session hardening: ephemeral cookies + 15-min idle logout + per-tab gate** |
| **Cross-tenant audit view** | 🔴 | designed in §132 (out-of-reach Constrai-held audit copy) — not built |

---

## 4. Billing & subscription

- **Model:** per-seat metered + bracket pricing (e.g. Bracket 6-10 @ $25/seat/mo) + flat features
  + on-site training (§115). ✅ live.
- **Invoices:** subscription (monthly cron, §125) + training + custom demands. Numbering fixed for
  the 10000 rollover (§125.3). ✅
- **Payment:** **manual now** (bank transfer/cheque, Constrai invoices) → **Stripe auto-charge =
  Phase 9-B (Q4 2026)**. Schema is forward-compatible. 🟡 by design.
- **Open billing items:** company logo + bank/remittance details on the invoice PDF; business bank
  account + incorporation decision BEFORE first real revenue (legal, not code).

---

## 5. Cross-cutting systems

| System | Status | Notes |
|--------|--------|-------|
| Auth | ✅ | JWT + PIN, refresh rotation, HttpOnly cookies (web), Bearer (mobile) |
| Multi-tenancy | ✅ | `company_id` + strict RLS (migration 013); tenantDb per-request client |
| Audit log | 🟡 | `audit_logs` append-only via DB trigger ✅; **but project PATCH logs `new_values` only — no old→new diff** (§132.6 gap); no per-user-grant audit yet |
| Anti-tamper / fraud prevention | 🔴 | **§132 design spec done, not built** — OWNER role, sensitive-field diff, allowance-snapshot-at-assignment, Constrai-held audit copy. Flagship conference selling point. |
| Web i18n | 🟡 | EN/FR locale files exist + in active use; some dead keys to prune (hygiene) |
| Mobile app | 🟡 | still Bearer+PIN; full update deferred until web menus done (then a dedicated phase) |
| Backups | ✅ | daily pg_dump → DO Spaces 07:00 UTC |

---

## 6. Conference-readiness summary (September 2026)

**Solid & demo-ready 🎤:** Assignments (4-tab + CCQ wizard), Material Request/Returns, Tools,
Expenses, Subscription, Billing, the SUPER_ADMIN portal (now security-hardened).

**🟡 Polish before demo:**
1. **Settings page is a placeholder** — either build a minimal real Settings or hide the menu for
   the demo. ⏳ NEEDS HEDAR'S CALL (hide vs build).
2. ~~Permissions page hint~~ ✅ **FIXED §134** (rank-lock now explained). Per-user grant UI is the
   larger §132 build.
3. **Expense approver default** is COMPANY_ADMIN (temporary) — decide the real model (§129.9/§132).
   ⏳ DECISION (folds into §132 OWNER).
4. **Invoice PDF** — add logo + bank/remittance details. ⏳ NEEDS ASSETS from Hedar (logo file +
   Constrai bank details).

**🔴 Strategic builds (Security phase / §132) — high differentiation, not yet built:**
- OWNER role + separation of duties + per-user permission grants (audited).
- Sensitive-field old→new audit diff + allowance-snapshot-at-assignment (closes the address-edit
  fraud vector).
- Cross-tenant Constrai-held audit copy + SUPER_ADMIN global audit view.
- Server-side idle + absolute-session-cap (the robust half of §133).

**❓ Verify (quick checks) — both RESOLVED §134:**
- ✅ Reports route — added the route-level `RequirePermission anyOf` wrapper.
- ✅ Tools/Surplus foreman project-dropdown — confirmed the latent bug (both loaded `/projects`
  directly = empty for foremen) and applied the §129.5 my-today pattern to both.

---

## 7. Walkthrough order (suggested)

1. Tenant menus 1→15 (the demo path) — flag anything that feels off in a live click-through.
2. Roles + permissions (the §132 conversation — already designed).
3. Admin portal + billing.
4. Lock the pre-demo polish list (§6 🟡) into a priority order.

> This document is the §134 program-overview artifact. It is a living map — update the status
> flags as items are built or fixed.
