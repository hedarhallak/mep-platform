# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: **June 19, 2026 (session 9)** — **§148 professional-permissions program: Phases 1–4 COMPLETE + LIVE; §147 fully closed (trade-lock + the root-cause that had silently disabled ALL trade-scoping).** Highlights, newest first:
> • **§148 — PROFESSIONAL PERMISSIONS PROGRAM — COMPLETE end-to-end (Phases 1–5 LIVE).** Roles = a FIXED **data-driven** catalog (`roles` table w/ rank+category, migration 035; `app_users.role` FK so adding a role = one INSERT, migration 036). The matrix (`PermissionsPage.jsx`) is fully data-driven — renders every real code from the `/matrix` catalog, opens on the first EDITABLE role (fixes the §134 open-on-own-locked-role trap), light theme (§148.10); reads current role from `useAuth()` not localStorage (the bug that made everything look locked). PRs #400–#403. **Layered resolution LIVE** (`middleware/permissions.js userHasPermission`): user_permissions ▸ **company_role_permissions** (migration 037, strict RLS) ▸ role_permissions global default — `can()`/`canAny()` pass `req.user.company_id` (§148.12 Phase 3a, PR #407). **Phase 3b (PR #408):** the matrix WRITES per-company — a company admin (OWNER/COMPANY_ADMIN/IT_ADMIN) edits THEIR company's overrides (stored as a DIFF vs the global default); SUPER_ADMIN edits the global defaults; `GET /matrix` + `/my-permissions` overlay the company tuning; reset clears it. **Phase 4 (PR #409):** +18 construction/MEP roles (CONSTRUCTION_MANAGER, PROJECT_MANAGER [now first-class — removed the legacy `PROJECT_MANAGER→TRADE_PROJECT_MANAGER` alias], SUPERINTENDENT, MEP/PROJECT/SITE_ENGINEER, ESTIMATOR, ACCOUNTANT, BIM_COORDINATOR, HR/PAYROLL/PROCUREMENT/SAFETY/QA_QC_OFFICER, GENERAL_FOREMAN, DISPATCHER, OFFICE_CLERK, OPERATOR) via migration 038 + defaults in `lib/role_defaults.js`. **Canonical per-role defaults = `lib/role_defaults.js` (single source);** `scripts/apply_role_defaults.js` applies them live (ADDITIVE, never revokes; run with `node -r dotenv/config` or after deploy). audit.view stays OWNER-only. **Phase 5 (PRs #411/#412) — COMPLETE:** backend `GET/PUT /permissions/user/:id` (rank-locked, company-scoped, stored as a DIFF vs the user's inherited role+company baseline); UI = a **Permissions** action per row in User Management → modal matrix with an amber-dot marking each personal override. **§148 is DONE end-to-end** (data-driven roles → dynamic matrix → per-company layer+writes → +18 roles → per-user overrides); resolution everywhere = `user_permissions` ▸ `company_role_permissions` ▸ `role_permissions`. Open follow-ups (minor): audit.view is enforced only by defaults (no hard guard blocks granting it via a company/user override — a §132 hardening if wanted); `user_permissions.granted_by` column is absent in some envs (insert omits it).
> • **§147 — PROJECT-CENTRIC ASSIGNMENTS: now FULLY closed (trade separation end-to-end).** Phase 0/1/2 (demand → coverage red/green → fill-the-gap) were already live; this session added **§147.13 full trade-lock** (a foreman sees/authors requirements ONLY for their own trade — picker filtered in `ProjectStaffingPage.jsx`, backend POST/PATCH/DELETE enforce `tradeScopeFor`) AND found **§147.14 the ROOT CAUSE: `middleware/auth.js` never copied `trade_code` onto `req.user`** (only `_token_payload`), so `tradeScopeFor()` returned null for EVERYONE and the entire §147 scoping layer had been silently inert. One-line fix (`trade_code: payload.trade_code || null`) activated all of it. All 5 seeded foremen (`seed.worker6-10`) already have a `trade_code`, so the lock is visible immediately. PR #406.
> • **§147.12 — TRADE-SCOPING, LIVE (PR #395):** a user's specialty is derived from their employee profile (`ep.trade_code`, now on the JWT via `buildTokenPayload`); `middleware/roles.js tradeScopeFor()` returns it for trade-level roles (foreman/trade mgr) and null for company-level roles (admin/owner/dispatcher = see all). Backend auto-filters Project Staffing demand/coverage, the `/available` picker (a foreman can't pull other trades — scope overrides the `?trade=` param), and Pending Requests. UX gap found while testing: a plain FOREMAN sees the Project Staffing nav (has `assignments.view`) but its project dropdown is empty (lacks `projects.view`) and has no Submit Request (lacks `assignments.create`) — these are the §148 permission-config gaps Hedar will fix via the matrix once Phase 2 lands.
> • **§147 — PROJECT-CENTRIC ASSIGNMENT REDESIGN (the big program) — now Phase 0→2 all LIVE.** Phase 1 (Project Staffing page: phased demand + coverage red/green, PR #391) + Phase 2 (Fill-the-gap from a red coverage row → assign only-available workers of that trade + §144 allowance, PRs #392/#393) + UX refinements (PR #394). **migration 034 IS applied on prod now** (it was the gate; Project Staffing is its consumer). The loop is verified LIVE: define demand → see red gap → Fill → assign → coverage greens. Earlier this program (Cowork session 7): After Hedar pushed back that assignments had "too many overlapping ways → wasteful," we redesigned via a long design discussion (decisions in DECISIONS §147.1–.7). **Principle (§147.4): assignment METHODS are a CATALOG, never deleted** — Method 1 manual / 2 wizard+suggest / 3 crew-deploy / 4 two-stage gated daily — each company will enable its own (per-company "assignment method" setting = future). **Method 4 (Hedar's chosen "most practical") is DONE end-to-end:** foreman picks project+date+team on **`/assignments/submit`** (`ForemanRequestPage`) → one PENDING `assignment_request` per name → dispatcher reviews on **`/assignments/requests`** (`PendingRequestsPage`, grouped by project) → **gated** approve / reject / edit → APPROVED → §144 distance+allowance. It RIDES ON the existing `assignment_requests` request/approve primitive (no new tables). PRs #388 (dispatcher) + #389 (foreman + shared `MemberSelector` extracted to `components/shared/`). **§147 Phase 0 = `project_labor_requirements`** (time-phased demand `{trade,count,from,to}`) + CRUD + `/coverage` endpoint (`routes/project_requirements.js`, **migration 034**, PR #386) — this is the foundation for the planning/coverage methods (NOT Method 4). ⚠️ **migration 034 is MERGED to main but DELIBERATELY NOT applied on prod** (no consumer yet — Hedar's call). **NEXT on this program:** Method-4 polish (pre-fill foreman screen with "today's team", needs employee_id on GET /requests; per-company method toggle) + §147 Phase 1 (project demand-entry UI + coverage red/green + fill-the-gap).
> • **§144 — G5 payroll-grade CCQ travel allowance, LIVE on prod.** `lib/road_distance.js` (Google Routes → Mapbox → haversine fallback) + `lib/assignment_allowance.js` persist real road distance + `allowance_cents` on **all 6 assignment write paths** (single create/approve/reassign/move + the 2 bulk paths auto-confirm/repeat-confirm via concurrency-capped post-commit backfill). PRs #379/#380/#381. **Google ACTIVE on prod:** `GOOGLE_MAPS_API_KEY` in `/var/www/mep/.env` (key restricted to IP 143.110.218.84 + Routes API; GCP free trial ~$414/90d). Verified live: `roadDistanceKm(MTL,QC)` → 263 km (real road, not the ~303 haversine fallback). Optional later: tighten the key to Routes-API-only (currently the broad 33-API Maps set, but IP-locked).
> • **§145 — Web i18n EN+FR COMPLETE for the tenant app, LIVE.** Audit found it ~98% done; translated the one real gap (`WorkerPicker`) + added a **permanent vitest locale-parity test** (`src/i18n/locales/parity.test.js`) that fails CI on any EN/FR key drift. PR #382. (Admin portal `AdminApp.jsx` stays English-only by design.)
> • **§146 — CREWS finished end-to-end:** Slice 3 crews-management page (`/crews`, PR #384) + recovered the lost Slice 2b wizard "Deploy crew" basis + §146.3 smart **MemberSelector** (browse + trade-filter + select-all) (PR #387). Also merged 4 parked Dependabot PRs (#376/#377/#378/#350).
> • **DEPLOY STATE (June 19, session 9):** prod deployed through **#409**. **Latest migration ON PROD = 038** (037 company_role_permissions was applied BEFORE its merge — `can()` queries it so missing-table = 500; 038 roles-catalog-expansion is additive-INSERT so order is flexible — run it + `node scripts/apply_role_defaults.js` + `pm2 restart` post-merge to light up the 18 new roles + repopulate role_permissions). After any `apply_role_defaults.js` run, **pm2 restart** to refresh the 5-min role-permission cache in `middleware/permissions.js`. §147 trade-lock is LIVE incl. the `middleware/auth.js` fix that now puts `trade_code` on `req.user`. (Backend PRs deploy via `git pull` + `pm2 restart`; migration PRs run `sudo -u postgres psql -f migrations/NNN.sql` first when the code needs the table, Pitfall #46; frontend PRs run `bash scripts/deploy.sh`, Pitfall #41.) ⚠️ If you ever see a `cat >> DECISIONS.md` note "go missing" after a ship, it's because the append raced the `git add` — §148.13 was lost this way and restored; verify new section numbers exist after committing.
> — June 11, 2026 (session 6) — **§132 OWNER role now DEMOABLE END-TO-END:** provisioned MEP's real OWNER from `admin.constrai.ca` ("Owner →", email `hedar.hallak+worker123@gmail.com`) → logged in as OWNER → `/owner-audit` ("Audit (Owner)" Shield nav) renders MEP's sensitive-edit diffs, **scoped to MEP only** (separation of duties confirmed; Constrai SUPER_ADMIN still sees cross-tenant `admin/audit`). **Pitfall #67 struck** (first non-incognito login showed no Audit nav despite the prod grant — stale PWA SW; fresh Incognito fixed it). **BUG fixed same session (PR #366 + prod env):** welcome/OWNER email "Sign In" link was `http://localhost:3000/login.html` → now `https://app.constrai.ca/login` (set `APP_URL` on prod `.env`, restarted `--update-env`; `lib/email.js` `/login.html`→`/login`). Both LIVE + verified by inspection. **THEN ran a multi-agent TENANT-ISOLATION SECURITY AUDIT (§138 G4 first pass, §142.4):** 48 agents (auditor-per-route + adversarial verifier), 10 raw → **2 confirmed, both fixed + LIVE:** (#1 HIGH) cross-tenant leak in `GET /api/materials/pdf-data` — `material_request_items` (no company_id, no RLS) read by client `request_ids` with no company-scoped JOIN → company A could read company B's line items; fixed via JOIN+`company_id` filter + regression tests (PR #368). (#2 MEDIUM) TOTP `/verify`+`/confirm-setup` had no rate limiter → 2FA brute-force on the SUPER_ADMIN portal; fixed with `totpLimiter` 10/15min (PR #369). **Bonus #1:** the Finding-#1 regression tests surfaced a REAL prod outage — `purchase_orders.po_number` column was MISSING on prod (PO-save 500'd whenever hit); fixed via **migration 032** (`ADD COLUMN IF NOT EXISTS`, applied on prod). **Bonus #2 (§142.5, PR #370):** the audit's *refuted* hub finding led to a THIRD prod outage — `POST /api/hub/messages` ("Task Request"/Hub send) ran a manual `pool.connect()` transaction with NO `app.company_id` GUC, so under strict RLS the `task_messages` INSERT threw "new row violates row-level security policy" — **the Hub send-task feature was broken on prod ~1 month** (since strict RLS May 9). Confirmed by prod smoke (RLS error in UI), fixed by `set_config('app.company_id', …, true)` after BEGIN (a prior session's uncommitted WIP), re-smoked GREEN. **CI never caught it: CI's pool runs as BYPASSRLS `postgres` → masks RLS failures in any manual `pool.connect()` transaction (Pitfall #14, sharpened).** See DECISIONS §142.4 + §142.5. **Bonus #3 (§142.5, PR #371):** the two sibling suspects — `activate.js` (`GET /` + `/set-pin`) + `onboarding.js` (`/verify` + `/complete`), the invite-acceptance/activation flows — were broken the SAME way (pre-tenant `pool` queries on RLS-strict `user_invites`/`app_users` → "Invalid activation link"/404 since May 9). Fixed by switching them to the documented `authPool = superPool || pool` BYPASSRLS pattern (same as `auth.js` login; Pitfall #28/#59). **Every live `pool.connect()` RLS gap in the route layer is now closed** (auto_assign ✅, hub ✅, activate ✅, onboarding ✅). Verified-by-pattern (identical to the daily-working login path); an invite-flow prod smoke is the optional belt-and-suspenders. **THEN started Assignments Phase 2 — CREWS (§131.2/§143). Slice 1 SHIPPED + LIVE (PR #373, migration 033):** Hedar chose the **static-roster** model (crew = foreman + fixed member list; deploy expands roster → individual assignment_requests, which ARE the history). `crews` + `crew_members` tables (both own company_id + strict RLS + GRANTs, §142.4/#49), `routes/crews.js` CRUD (reuses `assignments.*` perms; explicit company_id filters everywhere = defense-in-depth + holds under CI BYPASSRLS), tests incl. tenant-isolation. Migration 033 applied on prod (16 grants + 2 RLS policies verified). **Slice 2a SHIPPED + LIVE (PR #375, §143.4):** `POST /api/crews/:id/plan` expands a crew roster into a wizard-compatible block that drops straight into `/api/assignments/auto-confirm` (reuses the §130 confirm + §132 snapshot + email pipeline unchanged; foreman→FOREMAN, members→WORKER, already-assigned marked; allowance via `lib/ccq_travel`; **auto_assign.js NOT touched**). Tests incl. cross-tenant 404. **NEXT = CREWS Slice 2b** (frontend: a "Deploy crew" basis in `BulkAssignWizard.jsx` → calls `/plan` → existing preview → `/auto-confirm`); then Slice 3 (a crews-management page). Other open tracks: auth-track §138 G2/G3 + deeper TOTP hardening (per-token jti/single-use); invite-flow prod smoke.
> — June 6, 2026 (session 5 — ~10 PRs) — **ALL LIVE + DEPLOYED:** §135 REAL project-edit audit diff (PR #341), §136 assignment location-snapshot (PR #342, migration 027), §137 server-side SUPER_ADMIN session caps idle 1h/abs 8h (PR #343, migration 028), §138 program assessment + KNOWN-GAPS REGISTER (G1–G7), §139 dev automation (ship.ps1 + CD + migrate backfill), §140 **OWNER role Slice 1** (PR #347, migration 029 — role + 60-perm superset + canAssignRole guard), §141 faster CI (coverage/knip push-only + Playwright cache). **Two engineers will review/test the platform in 2–3 weeks — DECISIONS §138 G1–G7 is their map.**
> 📄 **`PROGRAM_OVERVIEW.md`** is the new conference-readiness map (every menu/role/feature + status). §134 fixed Reports route guard + Tools/Surplus foreman dropdown + Permissions read-only hint.
> ⏳ **2 items need Hedar's input** (not code-blockable): Invoice PDF logo + Constrai bank/remittance details (needs the assets), Expense approver model (§129.9 → §132 OWNER). (Settings page = ✅ BUILT §134.4 — real shift+contact page, `routes/company.js`.)
> ⚠️ NOTE: the June 4 closeout PR (#316) was never merged (Pitfall #66) — Sections 129-131 (PRs #310-#326) were re-recorded in the June 5 update; sections 131.12-131.13 added June 4 session 4 (PR #328).
>
> **🔁 PRIORITY ORDER (Hedar, June 2 — still governs):**
> 1. **Add ALL un-built side menus as real, designed pages matching the program (NOT placeholders), page by page, WEB FIRST.** Mobile is a separate full update later (long neglected — done after web). ← **the original menu list is now DONE** (Surplus, Tools, Expenses, Smart Assignment).
> 2. Then Hedar does a full program overview/walkthrough.
> 3. Then security.
> 4. Then infra / hygiene / tech debt (incl. Dependabot #297/#298/#299, parked green).
> 5. **Billing finished LAST** (it's already automated + live, so it's parked).
>
> **Shipped June 4-5 (Sections 130-131 — ASSIGNMENTS REDESIGN Phase 1, PRs #317-#326, LIVE):**
> 1. **Hedar REJECTED the two-menu split** after testing → ONE Assignments surface; Workforce Planner page + BI sidebar section DELETED (routes redirect to /assignments).
> 2. **4 tabs in Hedar's exact order:** Single Assignment (default, inline form) → All Teams Assignment (bulk WIZARD) → Geographical (map) → Assignments List (sorted by nearest start_date to today).
> 3. **Bulk wizard = sequential questions:** date → basis (Repeat today / Plan everything / One project) → optimizations (distance+CCQ allowances, fill gaps) → editable preview with **$ allowance cost per row + plan total** → confirm → assignments + emails. **REPEAT skips the optimizations question.** Footer viewport-pinned (`max-h-[calc(100vh-360px)]`). NO unsolicited suggestion banners (OptimizePanel removed same-day per Hedar; `/bi/workforce-suggestions` backend kept for a possible future wizard basis).
> 4. **CCQ allowance engine `lib/ccq_travel.js`** — reads the EXISTING `ccq_travel_rates` table (per-trade/sector brackets, SUPER_ADMIN-managed, NOTHING hardcoded). road_km ≈ haversine×1.3 ESTIMATE (CCQ official = Google Maps road distance; Mapbox Matrix backlogged before payroll use). `auto-suggest`: modes FULL/REPEAT/PROJECT + flags + per-row `{distance_km, allowance_cents}` + totals.
> 5. **auto-confirm was DEAD since migration 013** (no UI ever called it) — TWO fatal bugs fixed: missing RLS GUC in its manual transaction + nonexistent `notes` column (= `decision_note`). Happy-path test pins it now.
> 6. **Phases locked (§131.2):** Phase 2 = CREW concept (crews table, wizard asks crews-or-individuals). Phase 3 (post-conference) = Board/Gantt drag-drop screen.
>
> **Shipped June 3-4 (Section 129 — Emergency Purchase + Spaces, PRs #310-#315, LIVE + verified e2e):**
> 1. **DO Spaces ACTIVATED** (closes the 112.2 deferral): bucket `constrai-tenant-assets` (TOR1 + CDN), bucket-scoped R/W/D key in OneDrive `Constrai Keys`, 6 `DO_SPACES_*` vars in prod `.env`. Verified e2e; also unblocked logo upload. Debug trail = Pitfall #63.
> 2. **Emergency Purchase menu (§126.2/S129):** backend mostly pre-existed (S94.5, migration 015). Added review PATCH (APPROVED/REJECTED+reason/PAID), receipt photo upload (EXIF-rotate + ≤1600px JPEG → Spaces `receipts/<company>/`), vendor autocomplete, projects JOIN. `ExpensesPage.jsx` (`/expenses`): Submit (today-assignment project card + vendor datalist + photo) + Claims (badges, review actions, receipt View). Migrations 025 (GRANTs retrofit — Pitfall #65) + 026 (approval = COMPANY_ADMIN only) applied on prod.
> 3. **Approval model (Hedar):** purchasing-function approval, single level, NO chains. ⚠️ COMPANY_ADMIN-as-default is TEMPORARY (his role is really technical admin) — revisit during the program overview (§129.9/§131.11). Payroll tie-in for reimbursed claims backlogged.
> 4. **lib/api.js now passes FormData through** (multipart boundary — Pitfall #64: it's a custom fetch wrapper, NOT axios).
>
> **Earlier sessions still LIVE:** Tools + Surplus menus (S127-128, June 2; Pitfall #62 lesson). Billing automation parked (S125): next real cron = July 1 (June invoice CONS-2026-10001 exists → idempotent skip).
>
> **June 4 session 4 shipped:** PR #328 (§131.12 — wizard silent-skip: `already_assigned` rows + `assignments_skipped`, deployed + smoked ✅; Pitfall #37 strikes again in CI) and the §131.13 fix (requester INNER→LEFT JOIN in GET /assignments + /requests — 50/58 rows were vanishing because their requester account was deleted; test pins it).
> **Session order agreed June 4 (still governs):** finish remaining URGENT FIRST CHECK browser smokes (Hedar did prod-health/SQL/gh checks + wizard + list smokes) → (2) Hedar's full program overview/walkthrough (approver-role revisit §129.9 belongs here) → (3) Assignments Phase 2 — CREW concept (§131.2).
> Also queued: employee_code beside same-name employees in wizard preview (§131.8 note); Mapbox Matrix road distances before payroll use; FK hygiene migration (§131.13 backlog); mobile full update (after web).
>
> **Prod safety net (kept):** `ALTER ROLE mepuser_super/mepuser SET idle_in_transaction_session_timeout = '30s';` **Server pending reboot** (kernel updates — check `pm2-root.service` enabled first, Pitfall #32).
>
> **Live pitfalls — #59 (authPool for pre-tenant writes), #60 (tenantDb client leak kills admin portal), #61 (numeric MAX for sequences), #62 (grep routes/migrations/LIBS before building anything "missing" — bit us TWICE: Surplus backend + ccq rates table), #63 (DO Spaces debugging: 400-on-everything = malformed creds, print LENGTHS not values; LIST-ok-PUT-403 = key Read-only), #64 (`@/lib/api` = custom fetch wrapper NOT axios; FormData passthrough added §129.6), #65 (pre-migration-020 tables have ZERO app-role grants; CI's postgres role hides 42501 — check `role_table_grants` before wiring a page), #66 (conflicted PR gets NO checks ever — `gh pr view --json mergeable` when status icons are missing; docs closeouts merge SAME-DAY or rebuild from main via `git checkout <branch> -- <files>`), #67 (tenant app is a PWA — smoke deployed UI in Incognito; SW serves stale bundles through hard refreshes).**

---

## ✅ URGENT FIRST CHECK (next session — do this BEFORE any other work)

1. **Verify prod is still healthy:**
   ```
   ssh root@143.110.218.84
   ```
   ```bash
   pm2 status mep-backend
   curl -sS -o /dev/null -w "Health: %{http_code}\n" https://app.constrai.ca/api/health
   ```
   Expected: PM2 status `online`, memory >50mb, Health `200`.

2. **Browser smoke test (Pattern B end-to-end):** Open `https://app.constrai.ca` in incognito → login with `seed.worker6@meptest.com` / `1234` → should cross-origin-hop to `mep.constrai.ca/dashboard`. If browser shows DNS NXDOMAIN — see Pitfall #40.

3. **Admin Branding page smoke (Sections 114 + 117 + 118):** `admin.constrai.ca/login` → login `hedar.hallak@gmail.com` / PIN `hedar2026`. **TOTP step appears after PIN** (PIN → 6-digit code, no QR — enrollment is now sticky after the Section 123 fix). Then CompaniesList → click `Branding →` on MEP Construction. Should see:
   - Seat counter `50 / 8` amber (was 5; Hedar tested an 8-seat change)
   - **Plan line:** `Plan: BASIC · Bracket 6-10 ($25.00/seat/mo) · At capacity — new invites will be rejected with HTTP 402.`
   - The bracket label + per-seat price prove PR #261 subscription LEFT JOIN refactor is live.

4. **(Section 118) Verify tax_rates scale + GRANTs survive any DB restore:**
   ```bash
   sudo -u postgres psql mepdb -c "SELECT jurisdiction, tax_name, rate_basis_points FROM public.tax_rates WHERE effective_until IS NULL ORDER BY tax_name;"
   ```
   Expected: `FEDERAL/GST/5000` + `QC/QST/9975`. If GST shows 500, migration 021 was lost — re-run from `/var/www/mep/migrations/021_fix_gst_rate_scale.sql`.

   ```bash
   sudo -u postgres psql mepdb -c "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ('subscriptions','subscription_seat_changes','invoices','payments','tax_rates') AND grantee LIKE 'mep%' ORDER BY table_name, grantee, privilege_type;"
   ```
   Expected: 40 rows (5 tables × 4 privileges × 2 roles). If <40, re-run the migration 020 block from Section 117.5.

5. **(Section 118 — Pitfall #50) Verify GitHub Actions permissions didn't drift again:**
   ```powershell
   gh api /repos/hedarhallak/mep-platform/actions/permissions/workflow
   ```
   Expected: `{"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}`. If `read`, re-apply via the PUT command in Section 118.5.

6. **(Section 119) Smoke the Subscription page in incognito** — open `https://mep.constrai.ca/subscription` → login as `admin@mep.constrai.app` / PIN `1234`. Should see Plan card (Monthly + Bracket 6-10 + $25.00/seat/month + Active badge + Next billing date), Seat usage 50/8 amber, three Request action buttons. Sidebar shows "Subscription" between User Management and Permissions with Receipt icon.

7. **(Section 119.6) Smoke the Billing page** — same login → click "Billing" in sidebar (CreditCard icon below Subscription). Should show 2 invoices (CONS-2026-9999 Subscription Approved $155.22 + CONS-2026-0001 Training Draft $1092.26). If they're missing, the data may have been cleaned — re-seed via SQL (Section 119.7) or call `POST /api/super/training/quotes`.

8. **(Section 120) Smoke admin.constrai.ca apply-change loop** — login `hedar.hallak@gmail.com` / `hedar2026` on admin.constrai.ca. After PIN, a TOTP verification step now appears (Section 121); enter the 6-digit code from your authenticator app. Click "Subscription requests" in CompaniesList toolbar → should see audit row #143 (or any pending requests) with company / change summary / Apply button. Click "Training quotes" → should see CONS-2026-0001. Click "Sign out" top-right → should land on `/login` with localStorage cleared.

9. **(Section 121) Confirm TOTP_ENFORCE is on** — `grep '^TOTP_' /var/www/mep/.env` should show `TOTP_ENCRYPTION_KEY=...`, `TOTP_ENFORCE=true`, `TOTP_ISSUER=Constrai Admin`. If `TOTP_ENFORCE=false`, the SA portal is unprotected — flip via `sed -i 's/TOTP_ENFORCE=false/TOTP_ENFORCE=true/' .env && pm2 restart mep-backend --update-env`.

10. **(Section 122) Smoke admin.constrai.ca/custom-demands** — after TOTP login, click "Custom demands" in CompaniesList toolbar (between "Training quotes" and "+ New company"). Page should render with header "Custom demands" + subtitle "Section 115.5 · Ad-hoc work (custom integrations, reports, migrations)." and the table row for `CONS-2026-10000` (MEP Construction / Test custom demand / DRAFT / $1724.63 CAD / $0.00 / 2026-05-30). If 401 — backend restart took longer than expected, re-check pm2 status.

11. **Only after all ten are green**, continue with the regular task list below.

---

## 🎯 Strategic context — September 2026 conference (hard deadline)

> **~3.5 months runway from May 26, 2026.** Conference demo + sales readiness by September. ~3 months of build + 2 weeks of code freeze before conference.

**Roadmap to conference (Sections 105 / 114 / 115 / 116 / 117 / 118 / 119):**

| Window | Focus | Phases |
|---|---|---|
| **May 15 — May 26** | Branding stack + pricing model lock + schema build | ✅ Phase 6-D-3 (Section 114) → ✅ Section 115 pricing → ✅ Section 116 schema → ✅ **Phase 6-D-4 PR 1-5 ALL SHIPPED (Section 118)** |
| **May 28 (AM)** | Customer Subscription page (PR 1 of Phase 6-D-5) | ✅ **Phase 6-D-5 PR 1 SHIPPED (Section 119.1)** — Subscription page with 3 request forms live on mep.constrai.ca |
| **May 28 (PM)** | Customer Invoices page (PR 2 of Phase 6-D-5) | ✅ **Phase 6-D-5 PR 2 SHIPPED (Section 119.6)** — Invoices list with type filter live; cross-PR e2e proven with CONS-2026-0001 |
| **May 28 (evening)** | SUPER_ADMIN apply UI PR 1+2 | ✅ **Phase 6-D-6 PR 1+2 SHIPPED (Section 120)** — Subscription Request Inbox + Training Quotes UI + AdminLogoutButton on all admin pages |
| **May 30 (afternoon)** | TOTP 2FA pulled forward from Phase 7 | ✅ **Phase 6-D-6.5 SHIPPED (Section 121)** — TOTP 2FA live on `admin.constrai.ca` |
| **May 30 (evening)** | SUPER_ADMIN apply UI PR 3 | ✅ **Phase 6-D-6 PR 3 SHIPPED (Section 122)** — Custom Demands UI live on `admin.constrai.ca/custom-demands` |
| **Early June 2026** | SUPER_ADMIN apply UI PR 4 | ⏳ **Phase 6-D-6 PR 4 (NEXT)** — Payments UI (Record Payment + history) |
| **July 2026** | Invoice email automation + cron | ⏳ **Phase 6-D-7** — Monthly invoice cron, trial expiry emails, HTML email invoices (PDF deferred per scope-cut option) (~1-2 weeks) |
| **July-August 2026** | Marketing + reference tenant + training materials | ⏳ **Phase 6-D-8** — Marketing site refresh, ToS legal review, reference tenant data, **modular training materials** (per Section 117.6 design guidance) (~2 weeks parallel) |
| **August** | Pre-conference dry-run + code freeze | E2E rehearsal, bug fix only, 2-week freeze |
| **September** | **Conference** | Demo + sales. Manual billing (Hedar invoices manually, bank transfer/cheque) |
| **Post-conference (Q4 2026)** | Phase 9-A Module System + Phase 9-B Stripe + dunning | Real card payments, auto state transitions, customer portal |
| **Q1 2027** | Phase 7 — Security maturity | 2FA + biometric + PIN→password |

**What this implies for session priority order:**
1. **Operational stability first** (URGENT FIRST CHECK every session).
2. **Phase 6-D-5 next** — customer-facing Subscription page is the highest-leverage UI work for the conference demo.
3. **Phase 6-D-6/7/8 in sequence** — SUPER_ADMIN UI, then email automation, then marketing/training.
4. **No new features in August** — rehearsal + bug-fix only.
5. **Training materials anchored on CONCEPTS + WORKFLOWS, not specific UI** (per Section 117.6 — product evolves fast, screen-based materials go stale).

---

## How to start a new session (Hedar — copy this one line)

```
استكمال Constrai. اطلب مجلد C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed (request_cowork_directory)، اقرأ HANDOFF.md من المجلد، اتبع التعليمات فيه بالحرف.
```

---

## Bootstrap protocol (Claude — follow this exactly)

1. **Request folder access** via `request_cowork_directory` for `C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed`.
2. **Read these 4 files** (use the Read tool, NOT bash):
   - `HANDOFF.md` (this file)
   - `CLAUDE.md` (working rules)
   - `DECISIONS.md` — read ONLY the latest 2-3 sections (the file is now 14,700+ lines). Latest section is **118** (Phase 6-D-4 COMPLETE — all 5 PRs shipped + Pitfalls #50/#51). Also relevant: 117 (PR 1+2 closeout + 3 strategic revisions to S115 + Pitfall #49), 116 (schema design), 115 (pricing model lock — note 115.3 brackets + 115.7 training mandatory + 115.3 self-serve all REVISED in 117).
   - `RECOVERY.md` Section 2.4 only if relevant
   - Latest section is **142** (June 11 session log — MEP OWNER provisioned + email login-link bug fix, PR #366). **141** = faster CI. **140** = OWNER role (DECISION "superset + exclusive audit" + slice plan; **all slices DONE+LIVE**; §140.7 has the slice trail; §140.5 three CI-caught bugs; §140.6 merge-friction pitfall). **139** = dev automation (ship.ps1 + CD + migrate backfill). **138** = KNOWN-GAPS REGISTER G1–G7 for the incoming reviewing engineers. **137** = server-side SUPER_ADMIN session caps (migration 028, PR #343). **136** = assignment location-snapshot (migration 027, PR #342). **135** = REAL project-edit audit diff (PR #341). 134 = program overview + Settings page. 133 = SA session hardening. 132 = anti-tamper DESIGN SPEC (OWNER role etc.).
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md §140+§142، prod stable، §132 OWNER role 100% كامل ونازل وdemoable e2e (OWNER متزوّد لـMEP)، الجاي: تراك جديد — CREWS §131.2 مرشّح)
   ```
4. **The track order is AGREED ("all", June 6) — execute, don't re-ask (Pitfall #51). NEXT = pick a new track (CREWS recommended).**
   - **🏁 §132 OWNER role = 100% COMPLETE + LIVE + DEMOABLE E2E.** Full anti-tamper stack deployed: OWNER role + guards + old→new diffs + allowance snapshot + OWNER-exclusive audit page (`/owner-audit`) + Constrai cross-tenant audit page (`admin /audit`, PR #364) + OWNER provisioning (endpoint + "Owner →" button). **MEP's OWNER provisioned June 11** (`hedar.hallak+worker123@gmail.com` — §142) so `/owner-audit` is live + demoable for the conference. **Only remainder = future INFRA** (out-of-tenant-reach audit copy, §132.6 layer 6 — not code). To demo: log in as that OWNER → "Audit (Owner)" Shield nav → MEP-only sensitive-edit diffs. (Pitfall #67: smoke in Incognito — a missing nav with a confirmed backend grant = stale PWA SW.)
   - **Then:** per-user permission grants UI/endpoints (audited + expiry) — ship ONLY together with the detection layer, never before; then cross-tenant Constrai audit copy (§132.6/§132.8).
   - **Then Assignments Phase 2 — CREWS** (§131.2): crews table + wizard crews-or-individuals. grep first, one architectural question (fixed crews vs per-day composition).
   - **2 items waiting on Hedar:** invoice PDF logo + Constrai bank/remittance details (needs assets); expense approver model (§129.9 → folds into §132 OWNER).
   - **Reviewing engineers incoming** — two engineers will test/review the platform; **DECISIONS §138 + the KNOWN-GAPS REGISTER below (G1–G7)** is their map. Help close those in the post-conference Security/Hygiene tracks.

---

## Pending tasks at session start (NEXT MAJOR CODE TASK)

### 🎯 Phase 6-D-8 — marketing + ToS + reference tenant + training materials

**Phase 6-D-7 is COMPLETE and LIVE** — full billing automation: monthly invoice cron (PR1) → auto-email + A4 PDF (PR2/PR2.1, `INVOICE_EMAIL_ENABLED=true`) → trial-expiry warnings (PR3, daily). All deployed + verified.

Next major area is **Phase 6-D-8** (per the roadmap): marketing site refresh, ToS legal review (mandatory training + Quebec consumer protection + audit-trail evidence policy), reference tenant data, and **modular training materials** anchored on concepts + workflows (Section 117.6), not screen-by-screen (product evolves fast). This is largely non-code / content + parallelizable.

Or pick a backlog item (logo + bank details on the invoice PDF; MEP→ENTERPRISE demo posture; Dependabot triage; integration test for TOTP confirm-setup).

**Pitfalls still live:** #60 (load any new `/api/super` route ~12× → `idle in transaction` stays ~0), #61 (numeric MAX for sequences), #58 (`HUSKY=0 npm ci --omit=dev`), #38/#41 (deploy = backend restart + frontend rebuild), #46 (migrations are manual on prod — `sudo -u postgres psql mepdb -f migrations/NNN.sql` BEFORE `pm2 restart`). **puppeteer needs Chrome system libs on prod** (installed this session); any new PDF feature relies on them.

---

## Current state (snapshot)

| Item | Value |
|---|---|
| Production URL | `https://app.constrai.ca` |
| Admin portal | `https://admin.constrai.ca` (SUPER_ADMIN only) |
| Tenant subdomain | `https://mep.constrai.ca` (DNS live, nginx wildcard) |
| Login (test) | `hedar.hallak@gmail.com` / PIN `hedar2026` (SUPER_ADMIN) |
| Server SSH | `ssh root@143.110.218.84` (Ubuntu 24.04) |
| Backend | Node.js + Express + Postgres 16, pm2 at `/var/www/mep`. invite-employee reads from `subscriptions.subscribed_seats`. GET /super/companies/:id LEFT JOINs subscriptions. 6 new SUPER_ADMIN billing endpoints live (training quotes / custom demands / payments / extend-trial / apply-change). |
| Frontend | React + Vite + Tailwind v4. CompanyBranding.jsx shows bracket + per-seat price (Section 117 refactor). Customer-facing subscription UI = Phase 6-D-5 (next). |
| Latest deployed to prod | **June 11 (session 6), all LIVE:** PR #375 (CREWS Slice 2a — `/crews/:id/plan` deploy-preview, backend-only), PR #373 (CREWS Slice 1 — **migration 033** crews + crew_members: 16 grants + 2 RLS policies verified), PR #371 (pre-tenant invite/activate authPool RLS fix), PR #370 (Hub send RLS GUC fix), PR #369 (TOTP rate-limit), PR #368 (material pdf-data cross-tenant fix + **migration 032** `purchase_orders.po_number`), PR #366 (welcome-email login link fix) + prod `.env` gained `APP_URL`. Also MEP's OWNER provisioned (operational). Prior (June 6): §135–§137 + §140 OWNER Slice 1. **Latest migration on prod = 033.** |
| Last merged to main | **PR #375** (CREWS Slice 2a). Session 6: #366–#373 + #375 (374 = docs). June 6: #341–#348. OPEN: Dependabot #297/#298/#299 only (parked, green — hygiene phase). |
| Prod DB safety net | `idle_in_transaction_session_timeout = '30s'` on `mepuser_super` + `mepuser` (ALTER ROLE, persists). **Server pending kernel reboot** — verify `pm2-root.service` first (Pitfall #32). |
| Prod env / ops | `INVOICE_EMAIL_ENABLED=true`, `TRIAL_WARN_DAYS=3`, **6 `DO_SPACES_*` vars (Spaces ACTIVE: `constrai-tenant-assets` TOR1+CDN)** in `/var/www/mep/.env`. Chrome libs for puppeteer. **Latest migration = 031** (027 = assignment snapshot, 028 = session caps cols, 029 = OWNER role + role_permissions copy + app_users_role_check allows OWNER, 030 = `audit.view` permission + OWNER grant, 031 = revoke audit.view from COMPANY_ADMIN+IT_ADMIN → OWNER-exclusive — all applied on prod June 6; 024-026 earlier). New env (optional, have defaults): `SA_IDLE_MAX_MIN=60`, `SA_SESSION_ABS_MAX_MIN=480` for §137 caps. **schema_migrations backfill (§139) still NOT run on prod** — until then keep applying migrations manually via `sudo -u postgres psql -f` (not `npm run migrate`). `git config --global core.editor notepad` on Hedar's machine (vim trap closed). |
| TOTP secret | Re-enrolled June 1 under the rotated `TOTP_ENCRYPTION_KEY`. Login = PIN → 6-digit code (no QR). Recovery (lost phone): Section 121.6 SQL reset. |
| Active program | **§132/§133 security track (June 6):** §135 audit diff + §136 allowance snapshot + §137 server session caps ALL LIVE. **NEXT (agreed "all" order): §132 OWNER role** (Constrai-provisioned, sole audit viewer, separation-of-duties — resolves §129.9; big architectural build, one focused question at a time §8.9) → then per-user permission grants UI (only WITH the detection layer) + cross-tenant Constrai audit → then **Assignments Phase 2 CREWS** (§131.2). Then hygiene → billing last. Mobile after web. **§138 = KNOWN-GAPS REGISTER (G1–G7) for the two incoming reviewing engineers — see below + DECISIONS §138.** |
| Mobile app | Still on Bearer-token + PIN. Phase 7 (Q1 2027). |

### Multi-tenant migration progress

| Phase | Status |
|---|---|
| Sections 85-107 (architecture through Pattern B verification) | ✅ Done |
| Phase 6-D-3 backend + frontend (Sections 112 + 114) | ✅ Deployed |
| Section 113 — Original tier-cap strategy | ⚠️ SUPERSEDED by Section 115 |
| Section 115 — Per-seat metered + flat features + on-site training | ✅ Recorded |
| Section 116 — Subscription + billing schema design | ✅ Recorded |
| **Phase 6-D-4 PR 1 — Migrations 018+019 (billing schema + backfill)** | ✅ **Deployed (PR #260, May 24)** |
| **Phase 6-D-4 PR 2 — Application refactor to read from subscriptions** | ✅ **Deployed (PR #261, May 24)** |
| **Phase 6-D-4 PR 3 — Migration 020 (GRANTs + ALTER DEFAULT PRIVILEGES)** | ✅ **Deployed (PR #266, May 25)** |
| **Phase 6-D-4 PR 4 — Seat-change request endpoints + apply-change + Resend** | ✅ **Deployed (PR #267, May 25)** |
| **Phase 6-D-4 PR 5 — Training/custom-demands/payments + numbering/tax helpers + migration 021** | ✅ **Deployed (PR #268, May 26)** |
| **Section 117 — PR 1+2 closeout + 3 revisions to S115 + Pitfall #49** | ✅ **Recorded** |
| **Section 118 — Phase 6-D-4 COMPLETE + Pitfalls #50/#51 + ci.yml workflow_dispatch** | ✅ **Recorded** |
| **Phase 6-D-5 PR 1 — Customer-facing Subscription page** | ✅ **Deployed (PR #270, May 28 AM)** |
| **Phase 6-D-5 PR 2 — Customer-facing Invoices list page** | ✅ **Deployed (PR #272, May 28 PM)** |
| **Section 119 — Phase 6-D-5 PR 1+2 closeout + Pitfall #52 (Vitest vi.hoisted)** | ✅ **Recorded** |
| **Phase 6-D-6 PR 1 — Subscription Request Inbox** | ✅ **Deployed (PR #274, May 28 evening)** |
| **Phase 6-D-6 PR 2 — Training Quotes UI + AdminLogoutButton** | ✅ **Deployed (PR #275, May 28 evening)** |
| **Section 120 — Phase 6-D-6 PR 1+2 closeout + 2FA decision** | ✅ **Recorded** |
| **Phase 6-D-6.5 — TOTP 2FA for SUPER_ADMIN** | ✅ **Deployed (PRs #277/#278/#280, May 30)** |
| **Section 121 — Phase 6-D-6.5 closeout + Pitfalls #52-#56** | ✅ **Recorded** |
| **Phase 6-D-6 PR 3 — Custom Demands UI** | ✅ **Deployed (PR #282, May 30 evening)** |
| **Section 122 — Phase 6-D-6 PR 3 closeout + Pitfalls #57, #58** | ✅ **Recorded** |
| **Section 123 — TOTP enrollment RLS-pool fix + key rotation + Pitfall #59** | ✅ **Deployed (PR #284, June 1) + verified** |
| **Phase 6-D-6 PR 4 — Payments UI** | ✅ **LIVE** — shipped (#286) → incident → reverted (#287) → root-caused (124.7) → tenantDb fix → re-shipped (#290), leak-smoke verified. |
| **Section 124 — Payments leak: incident + root cause (tenantDb per-mount client multiplication) + fix + Pitfall #60** | ✅ **Recorded; fix deployed; Payments live + stable** |
| **tenantDb one-client-per-request fix** | ✅ **Deployed** — `if (req.db) return next()` guard; app-wide improvement. |
| **Section 125 — Phase 6-D-7 PR1 monthly invoice cron** | ✅ **Shipped + deployed + prod-smoked** (MEP June invoice CONS-2026-10001 $229.95). |
| **Section 125.3 — invoice-numbering numeric-MAX fix (Pitfall #61)** | ✅ **Deployed (PR #294)** — was string-ordering, collided at 10000. |
| **Section 125.4/125.5 — Phase 6-D-7 PR2/PR2.1 auto-email + PDF invoice** | ✅ **LIVE** — branded email + A4 PDF; `INVOICE_EMAIL_ENABLED=true` on prod; Chrome libs installed for puppeteer. |
| **Section 125.6 — Phase 6-D-7 PR3 trial-expiry warnings** | ✅ **LIVE** — daily job + migration 023 (`trial_warned_at`) applied on prod. **Phase 6-D-7 COMPLETE.** |
| **Section 126 — Feature specs: §126.1 Tool Request, §126.2 Emergency Purchase + starter tool catalog** | ✅ **Recorded** |
| **Section 127 — Surplus / Material-Return page (frontend; backend pre-existed)** | ✅ **LIVE** — SurplusPage.jsx over `/materials/returns`+`/materials/surplus`. |
| **Section 128 — Tool Request + asset tracking (backend §128 + frontend §128.2)** | ✅ **LIVE** — migration 024 + routes/tools.js (PR #307) + ToolsPage.jsx (PR #308), deployed + verified. |
| **Section 129 — Emergency Purchase + DO Spaces activation** | ✅ **LIVE + verified e2e** — PRs #310-#315, migrations 025+026 applied. Approver default TEMPORARY (§129.9). |
| **Sections 130-131 — Assignments redesign Phase 1 (wizard + CCQ allowances + 4-tab restructure)** | ✅ **LIVE** — PRs #317-#326. auto-confirm revived (2 fatal dormant bugs). |
| **Assignments Phase 2 — CREW concept (§131.2)** | ⏳ Candidate next (Hedar picks vs program overview) |
| **Assignments Phase 3 — Board/Gantt screen** | ⏳ Post-conference |
| **Phase 6-D-8 — marketing + ToS + reference tenant + training** | ⏳ Deprioritized below functional menus |
| Phase 6-D-6 — SUPER_ADMIN UI (Subscription detail with Apply Change, Training Quotes, etc.) | ⏳ June-July 2026 |
| Phase 6-D-7 — Invoice email automation + monthly cron + trial expiry warnings | ⏳ July 2026 |
| Phase 6-D-8 — Marketing site refresh + ToS legal review + reference tenant + training materials | ⏳ July-Aug 2026 |
| DO Spaces bucket activation (Section 112.2 deferred → **DONE June 3, §129.2**) | ✅ ACTIVE (`constrai-tenant-assets` TOR1+CDN) |
| August dry-run + 2-week code freeze | ⏳ August 2026 |
| **September 2026 conference** | 🎯 Hard deadline |
| Phase 9-A Module System + Phase 9-B Stripe | ⏳ Q4 2026 (parallel) |
| Phase 7 — Security maturity | ⏳ Q1 2027 |

---

## ⭐ KNOWN-GAPS REGISTER (G1–G7) — for the two incoming reviewing engineers (full detail = DECISIONS §138)

> Recorded June 6 at Hedar's request. Honest map of the platform's known gaps so the reviewers have a starting punch list. Context: the platform was **built end-to-end via AI direction with a non-developer owner**. None of these are hidden defects; all have a fix path. **Top recommendation: one independent code + security review before any real revenue / enterprise contract** (the review now being arranged).

| # | Gap | Severity | Fix path / status |
|---|---|---|---|
| **G1** | Single droplet, single DB, **no HA, no load testing** — one node down = all tenants down; restore from daily backup is hours not instant | High (ops) | Managed Postgres w/ failover → 2nd app node + LB → monitoring. Pre-scale, not pre-conference. |
| **G2** | **PIN instead of password** (weaker vs brute-force; rate-limited) | Medium (sec) | PIN→password — Phase 7 |
| **G3** | **Mobile still Bearer-token + PIN** (older/less-secure than web HttpOnly cookies) | Medium (sec) | Mobile auth modernization — Phase 7 |
| **G4** | **No independent security audit / pen-test**; RLS-bypass/IDOR could expose another tenant's payroll-adjacent data → reputational + **Quebec Law 25** liability | High (sec) | Independent pen-test + code review (being arranged) + Law-25 pass |
| **G5** | **CCQ allowance is an ESTIMATE** (haversine×1.3, not road distance) — fine for planning, NOT payroll-grade | Medium (correctness) | Mapbox Matrix (§131.3). Already gated: `allowance_cents` left unpopulated (§136.2). Be explicit with prospects. |
| **G6** | **Test coverage ~50–63%** — `routes/*` happy paths under-covered; regressions can ship silent | Medium (quality) | Raise to 70–85% incrementally (route + DB fixtures) |
| **G7** | **Bus-factor = 1 + AI-authored** — latent bugs surface only under expert/load review (evidence: §124 portal-down leak, §130 dead auto-confirm, §131.13 hidden rows, §135 phantom) | High (org) | Onboard the two reviewers as maintainers; keep DECISIONS/HANDOFF current; independent review = knowledge transfer |

**Suggested reviewer focus:** (1) tenant-isolation/RLS adversarial testing across every route; (2) auth/session (PIN/TOTP/refresh-rotation + the new §137 caps); (3) the un-covered `routes/*` paths; (4) ops resilience (restore drill + basic load test); (5) Law 25 / privacy posture.

---

## Backlog items still open (lower priority)

### Functional feature backlog (app menus / field workflows — building these WEB-FIRST per Hedar's June 2 priority order)
- **✅ DONE — Material Return / Surplus page** (DECISIONS §8 / §127) — SurplusPage.jsx (Declare/Available) over the pre-existing `material_returns` backend. LIVE. (Advanced flow — 3-day hold / cross-site claim / driver transfer / surplus-check on new PO — still backlog as enhancements.)
- **✅ DONE — Tool Request + asset tracking** (DECISIONS §126.1 / §128) — full feature, backend (migration 024 + routes/tools.js) + ToolsPage.jsx. LIVE.
- **✅ DONE — Emergency / petty purchase** (§126.2/§129) — LIVE, PRs #310-#315 (receipt photo → Spaces, single-level purchasing approval, vendor recall).
- **✅ DONE — Smart Assignment Phase 1** (§10/§130-131) — wizard + CCQ allowance optimization LIVE, PRs #317-#326. Driver routing (the §10 leftover) folds into a later phase.
- **⏳ Assignments Phase 2 — CREWS** (§131.2) — crews table + wizard crews-or-individuals. Candidate next (vs program overview).
- **⏳ Quick win — Tools/Surplus foreman project-dropdown fix** (§129.5 pattern) — same bug ExpensesPage had; apply my-today to both.
- **⏳ employee_code beside same-name employees in the wizard preview** (§131.8) — cosmetic confusion from duplicate display names.
- **⏳ Mapbox Matrix road distances** (§131.3) — replace haversine×1.3 before allowance figures touch payroll (CCQ reference = Google Maps).
- **⏳ Expense approver default + payroll tie-in — revisit at the program overview** (§129.9/§131.11).
- **⏳ Dependabot #297/#298/#299** (all green) — parked for the hygiene phase.
- **⏳ Server kernel reboot pending** — verify `pm2-root.service` first (Pitfall #32).
- **⏳ i18n dead-key cleanup** (bi.workforcePlanner.*, nav.bi, assignments.optimize.*, …) — hygiene pass.
- **⏳ FK hygiene migration (§131.13):** `assignment_requests.requested_by_user_id → app_users(id) ON DELETE SET NULL` + audit `decision_by_user_id` and sibling FK-less user-reference columns across tables — prevents the dangling-requester class permanently.
- **⏳ UTC-midnight date-render sweep (§131.14):** AssignmentsPage fixed; same class suspected in `ProjectsPage.jsx:334`, `utils/formatters.js:37` (fmtDate callers), MyHubPage/TaskRequestPage `due_date`. One shared local-midnight helper in utils/formatters.js, then migrate callers.
- **✅ DONE — §133 SUPER_ADMIN session hardening (3 layers, all LIVE):** (133.1-3) **ephemeral cookies** — browser close ends the SA session, re-entry forces login+TOTP (`lib/cookie_options.js` `isEphemeralSessionRole` + `{ephemeral}`; `routes/auth.js` login/TOTP/refresh; tenant cookies unchanged; VERIFIED in DevTools `Expires: Session`). (133.4) **idle auto-logout** — `AdminIdleGuard.jsx`, 15-min unattended → logout + `?reason=idle` banner. (133.5) **per-tab gate** — `RequireAdminTab.jsx` gates every protected admin route on a `sessionStorage` marker set at login; close tab / new tab → `/login` + TOTP (reload stays in; 2nd admin tab needs its own login). **REMAINING robust layer (Security phase): SERVER-side idle + absolute-session-cap enforcement on `/refresh` so it doesn't depend on client JS (§132/§133).**
- **⭐ Anti-Tamper / Owner-Audit security model (§132 — DESIGN SPEC done, NOT built):** flagship anti-fraud feature for the conference. Key decisions locked: (1) OWNER role provisioned by Constrai per tenant, sole audit viewer, separation-of-duties above the technical COMPANY_ADMIN (resolves §129.9); (2) defense-in-depth — append-only audit (exists) + old→new diff on sensitive fields (GAP: PATCH /projects logs new_values only) + allowance from project-location SNAPSHOT at assignment time + permission-grant audit w/ expiry + out-of-reach Constrai-parent audit copy; (3) per-user grants UI (model A) ships ONLY bundled with the detection layer. Implementation = Security phase (priority #3, elevated by payroll exposure). Full spec in DECISIONS §132.
- **⏳ Full mobile-app update** — long neglected; happens AFTER all web menus are built (Hedar's explicit sequencing).
- **⏳ CCQ Labor Marketplace** (DECISIONS §9, 💡 future/large) — company job posts + worker availability, CCQ-verified.
- **⏳ Web app i18n** (CLAUDE.md — still TODO; mobile already i18n'd).

### Billing / ops / infra backlog
- **⏳ Company logo + final design polish on the invoice PDF** (final stages, Hedar June 1). The PDF invoice (`lib/email.js` `sendSubscriptionInvoice`) currently uses a text wordmark header (`#041b76`). Add the Constrai logo image + any final design refinements before launch. Same place to add the bank/remittance details below.
- **⏳ Constrai bank / remittance details on the invoice** (near-term, fits Phase 6-D-7/8). The manual payment flow needs the invoice to show *where customers send the bank transfer / cheque* — a Settings field for Constrai's **business** bank account + render it as payment instructions on invoices + emails. Not present today. (Hedar flagged June 1.)
- **⏳ Business structure + dedicated business bank account — DECIDE BEFORE FIRST REAL REVENUE** (business/legal/accounting, not a code task). All payments must land in a **separate company account, never Hedar's personal account** (liability separation, clean bookkeeping, QST/GST, professional trust, and Stripe payouts require a business account in Phase 9-B). Confirm sole-prop vs incorporation with an accountant; likely incorporate before taking real money. Ties to the $30K Revenu Québec QST/GST threshold item below. (Hedar raised June 1.)
- **⏳ Subscription auto-charge (telecom-style)** — the professional end-state Hedar wants: stored payment method + recurring auto-charge (card via Stripe Billing, OR PAD/pre-authorized debit from the customer's bank account). Deliberately deferred to **Phase 9-B** (the schema is already forward-compatible: `STRIPE_CARD` method enum + `external_ref` for `payment_intent_id`). Strategy: manual now → fully automated later, layered on top of the existing system-of-record (no rewrite). Sensitive parts (PCI, PAD mandates, dunning, refunds) are handled by Stripe.
- **⏳ MEP Construction demo posture** — Now achievable via SUPER_ADMIN Apply Change endpoint (`POST /api/super/subscriptions/:id/apply-change` with `change_type='PLAN_CHANGE'`). Recommended: bump MEP to ENTERPRISE plan with subscribed_seats=100, removes the over-cap amber warning. Can do now via curl; UI will come in Phase 6-D-6.
- **⏳ Modular training materials** (Section 117.6) — design materials by topic (concepts, workflows, UI walkthroughs) with versioning.
- **✅ DONE — DO Spaces activation** (§129.2, June 3) — bucket live with CDN; receipts + logos uploading.
- **⏳ Migrate CompanyBranding.jsx off its raw-fetch bypass** — lib/api supports FormData now (§129.6); collapse when next touched. Low.
- **⏳ Phase 9-B — Stripe integration** (Q4 2026). Full Stripe Billing + webhook + state machine + Customer Portal + dunning + QST/GST tax automation.
- **⏳ Phase 9-A — Module/Plugin System** (Q4 2026, parallel with 9-B).
- **⏳ Annual billing logic** — Schema ready (Section 116); cron logic deferred to Phase 6-D-7 or 9-B.
- **⏳ Inbound email ingestion for true Message-ID threading** (Section 117.4 Interpretation 1).
- **⏳ `mep-webhook` hardening** (Pitfall #46) — extend to detect new `migrations/` files and refuse pull / alert until operator runs them.
- **⏳ Soft-delete column on `employees` table**.
- **⏳ Custom discount UI** — deferred per Section 115.10.
- **⏳ Tax registration timing** — plan when crosses Revenu Québec $30K threshold.
- **⏳ ToS legal review** (Phase 6-D-8) — mandatory training + Quebec consumer protection + audit-trail evidence policy.
- `routes/project_trades.js` redundant `router.use(auth)`. Low.
- pg DeprecationWarning. Hygiene opportunity.
- Coverage threshold ratchet — Lines 63.66%, Branches 54.41%, Functions 62.18%, Statements 62.61%.
- **PIN → password migration** — Phase 7.
- **Mobile path migration off body refresh_token** — Phase 7.
- CSRF middleware if state-changing GET endpoints get added.

---

## Pending items from leak remediation (Section 91)

**ALL items COMPLETE.** No leak-remediation work remains.

---

## Active credentials & secrets locations

All credentials live in **OneDrive `Constrai Keys` folder** (`C:\Users\Lenovo\OneDrive\Desktop\Constrai Keys\`):

| Secret | File | Last rotated |
|---|---|---|
| Cloudflare Origin Certificate (May 7, 2041) | `Cloudflare Origin Certificate.txt` | 2026-05-11 |
| Cloudflare Origin Private Key | `Cloudflare Private Key.txt` | 2026-05-11 |
| Resend API key (`Constrai Prod 2026-05-11-v2`) | `Resend API key 2026-05-11.txt` | 2026-05-11 |
| `mepuser_super` DB pw | (saved in OneDrive) | 2026-05-11 |
| `mepuser` DB pw | (saved in OneDrive) | 2026-05-11 |
| `MAPBOX_ACCESS_TOKEN` | `Mapbox token 2026-05-11.txt` | 2026-05-11 |
| `JWT_SECRET` | `JWT_SECRET 2026-05-11.txt` | 2026-05-11 |

Prod `/var/www/mep/.env` is in sync. `DO_SPACES_*` env vars not yet set (deferred).

---

## Critical pitfalls (encoded from Sections 86–118)

1. **Bash sandbox file sync lag** — use Read tool to verify file state.
2. **Edit tool can silently lose changes** — Read each file immediately after Edit.
3. **Notepad adds `.txt` to filenames** silently. Use VS Code.
4. **Cloudflare cert/key copy can be swapped** — `head -3` to verify.
5. **CRLF + UTF-8 BOM break PEM parsing** — `dos2unix` before installing.
6. **`npm install --omit=dev` fails on husky** — use `--ignore-scripts`.
7. **Untracked file on server blocks `git pull`** — stash or delete first.
8. **PR auto-merge can flip dependency order** — manual control between dependent PRs.
9. **`gh pr merge` requires branch up-to-date** — `gh pr update-branch <num>` is the right tool when `BEHIND` mid-CI.
10. **Don't open a new session before previous PRs merge** — wait for Merged status.
11. **Cherry-picking can cross feature branches** — verify `git branch --show-current` first.
12. **Replace HANDOFF.md at end of session, don't append** — long history goes in DECISIONS.md.
13. **RLS doesn't apply to BYPASSRLS roles** — use `SET LOCAL ROLE mepuser` in tests.
14. **CI uses `postgres` role for tests** — switch via `SET LOCAL ROLE`.
15. **`git checkout main` fails silently with dirty tree** — stash first.
16. **`git stash pop` can lose cleanly-applied files when there's a conflict elsewhere** — verify content after pop.
17. **PowerShell's bare `>` redirect uses UTF-16 with BOM** — always `Out-File -Encoding utf8`.
18. **GitHub web "Update branch" button creates duplicate squash commits** — never touch UI for merged branch.
19. **`openssl rand -hex N` over `-base64 N`** — hex is URL-safe.
20. **Read untracked WIP files before writing fresh code** — `git status` + Read first.
21. **`middleware/permissions.js can()` uses `pool.query` directly** ✅ CLOSED by 89-D.
22. **Per-request transaction middleware MUST commit BEFORE the response is flushed** — override `res.end`. **AND** `audit_logs` is append-only via DB trigger — never DELETE / UPDATE it.
23. **`try { INSERT } catch { handle dup }` patterns DO NOT survive inside a tenantDb transaction** — use `ON CONFLICT DO NOTHING RETURNING *`.
24. **Orphan-account 401 from tenantDb is the cross-route contract** — update tests accordingly.
25. **SUPER_ADMIN seedUser needs an explicit 8+ char PIN** — `seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' })`.
26. **Tests pinning transitional stage contracts** — label with future-migration reference.
27. (reserved — folded into #28.)
28. **Strict RLS breaks pre-tenant queries** ✅ CLOSED by 90-G. `authPool = superPool || pool`.
29. **NEVER `git add -A` in branches touching credentials** — explicit paths.
30. **NEVER paste `.env` contents/screenshots in any chat**.
31. **Sed mask regex MUST include underscores** — `sed -E 's/=[A-Za-z0-9_.-]+$/=***/'`.
32. **Verify `pm2-root.service` is enabled BEFORE any planned reboot**.
33. **Adding router primitives to a tested component requires updating its test wrapper**.
34. **Never assume case homogeneity across legacy + generated text keys** — prefer `LOWER(col) = LOWER($1)`.
35. **Provider migration completeness audit before env-var decommission**.
36. **Verify current branch before commit/push during parallel work** — `git branch --show-current` before EVERY commit.
37. **Compare pg `bigint` columns via `String()` on both sides** — `expect(String(res.body.<x>)).toBe(String(seed.<id>))`.
38. **Every deploy that touches `package.json` MUST run `npm ci` on server BEFORE `pm2 restart`** + frontend rebuild. Full deploy block in HANDOFF history.
39. **Every `/api.js` auth-related state machine needs a "we're already there" guard** — before `window.location.href = TARGET`, check `if (window.location.pathname !== TARGET)`.
40. **DNS negative caching survives the record fix and is per-resolver** — don't pre-query a subdomain before its DNS record exists.
41. **`git pull` does NOT rebuild the Vite frontend** — always include `cd mep-frontend && npm ci --ignore-scripts && npm run build`.
42. **Don't use `lib/auth_utils` for ad-hoc shell hashing** — use `bcrypt` directly + guard with `[ -n "$HASH" ]`.
43. **Edit tool can fail on certain repo paths; fall back to `mcp__workspace__bash` on the Linux mount**.
44. **DB column duplication + verify field-name chain end-to-end** — psql `\d <table>` → curl endpoint → grep frontend lib.
45. **`psql <db>` as Linux root needs `sudo -u postgres psql <db>` for peer auth**:
    ```bash
    sudo -u postgres psql mepdb -f /var/www/mep/migrations/NNN_name.sql
    ```
46. **`mep-webhook` auto-pulls main but does NOT run migrations or restart pm2** — fresh SSH session after a merge typically reports `Already up to date.` because the webhook beat you. Manual deploy block is non-negotiable for any PR touching `migrations/`.
47. **testing-library `getByText` only matches direct text children, not descendants** — for `<p>{a} <span>/</span> {b}</p>`, use a function matcher walking `textContent`.
48. **When restating decisions from prior messages, quote source verbatim — never summarize numerical commitments.**
49. **Tables created via `sudo -u postgres psql` are owned by postgres; mepuser + mepuser_super get ZERO privileges automatically.** Two prevention strategies, apply both: in-migration GRANTs + `ALTER DEFAULT PRIVILEGES`. Migration 020 implements both.
50. **(NEW — Section 118) GitHub Actions can silently reset `default_workflow_permissions` to `read`**, causing every workflow job to fail at the `Checkout` step with HTTP 403 on git clone. There is no warning or notification — the symptoms are: (a) new pushes don't trigger workflow runs at all, OR (b) workflows trigger but every job fails immediately at `actions/checkout@v4` with `403`. **Fix** (via gh CLI; UI equivalent is Settings → Actions → General → Workflow permissions → "Read and write permissions"):
    ```bash
    gh api -X PUT /repos/<owner>/<repo>/actions/permissions/workflow \
      -f default_workflow_permissions=write \
      -F can_approve_pull_request_reviews=true
    ```
    **Add to end-of-session checkpoint:** `gh api /repos/<owner>/<repo>/actions/permissions/workflow` should return `default_workflow_permissions: "write"`. If it drifts to `read`, re-apply immediately. Root cause for the drift is unknown (possibly automated security policy on GitHub's side); re-check after any Dependabot batch or GitHub Actions security advisory. Section 118.5 has the full diagnostic + symptoms walkthrough.
51. **(NEW — Section 118) Don't propose pause/break between agreed work items.** Once Hedar locks a multi-step plan (e.g., "C then B then A" for PR sequencing, or "deploy and verify and document"), execute it end-to-end without "should we pause?" prompts between steps. Hedar decides when to stop. Asking burns turns and signals distrust of stated intent. Applies to: multi-step plans where each step depends on the previous succeeding, long debug loops. Does NOT apply to: when a NEW architectural decision opens up mid-execution (surface that, but ONE focused question per Section 8.9), or after a discrete unit of work completes and the next is a different shape (e.g., asking "should I write the docs PR now or later?" after a code PR ships is fine because docs is a separate discrete unit). Section 118.7 has the verbatim user statement that anchored this rule.
52. **(NEW — Section 119) Vitest does NOT honor Jest's `mock*` prefix convention in `vi.mock` factories.** A top-level `const mockApi = ...` referenced directly inside `vi.mock('@/lib/api', () => ({ default: mockApi }))` will throw `ReferenceError: Cannot access 'mockApi' before initialization` because `vi.mock` is hoisted above all top-level statements. **Two correct patterns:**
    1. **`vi.hoisted()` (preferred — explicit):**
       ```js
       const mockApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
       vi.mock('@/lib/api', () => ({ default: mockApi }))
       ```
    2. **Function-body deferral (works when the factory returns functions):**
       ```js
       vi.mock('@/hooks/useAuth', () => ({
         useAuth: () => ({ login: mockLogin }),   // mockLogin resolved at hook-call time
       }))
       ```
    Pattern #1 is required when the factory needs the variable's value at hoist time (direct assignment to `default` or a property). Pattern #2 is what existing tests like `LoginPage.test.jsx` use successfully — but only because the variable is referenced inside a returned function, not as a value at the top level. *(Note: Section 121 re-numbered this pitfall to clarify it was the original #52 from Phase 6-D-5. The lib-name #52 about otplib/Jest below was introduced after.)*

53. **(NEW — Section 121) Semgrep `gcm-no-tag-length` blocks AES-GCM cipher construction without `authTagLength`.** Any call to `crypto.createCipheriv('aes-256-gcm', key, iv)` or `crypto.createDecipheriv('aes-256-gcm', key, iv)` triggers Semgrep rule `javascript.node-crypto.security.gcm-no-tag-length` — the cipher would accept any tag length the attacker provides at decrypt time, enabling shortened-tag forgery. **Fix:** pass `{ authTagLength: 16 }` to *both* `createCipheriv` and `createDecipheriv`. Symmetric — encrypt and decrypt must agree on the tag size. Encode this in our diff template / any future custom Semgrep rule layer.

54. **(NEW — Section 121) TOTP `window=1` (±30s) is too tight in the field; use `window=2` (±60s).** RFC 6238 §5.2 nominally allows ±1 step, but phone clocks routinely drift ~30s from NTP-perfect time (especially under battery-saver), and read+type+submit adds 10-15s on top. A code from counter K can hit the server at counter K+1 — `window=1` (which checks K, K-1, K+1) won't accept K-2. **Rule:** start TOTP impls at `window=2` (accepts K±2, ±60s). Standard practice across Google/Authy/1Password/Microsoft. Marginal security cost is 30 extra seconds of valid codes; brute-force resistance is still 1-in-1,000,000 per step.

55. **(NEW — Section 121) `middleware/auth.js` rebuilds `req.user` field-by-field; any new JWT claim must be added explicitly to the constructor.** When `routes/auth.js` adds a new JWT claim (e.g. Section 121's `totp_verified`), the middleware decoder has to be updated separately. It does NOT `Object.assign(req.user, payload)` — every field is explicit. Forgetting to copy a new claim means downstream middleware sees `undefined`. This broke PR #277 (TOTP returned `TOTP_REQUIRED` on every `/api/super/*` call even after a successful 2FA login); fixed in PR #280. **Rule:** when adding a new JWT claim, update *both* the token-build site in `routes/auth.js` *and* the `req.user = {...}` constructor in `middleware/auth.js` in the same PR. Code-search safety net: `grep "req.user = {" -R` lists every materialization site.

56. **(NEW — Section 121) Jest's default transform pipeline cannot handle ESM-only deps like `@scure/base` (transitive of `otplib`).** Most tests in this repo require `app.js` which transitively pulls in the auth/totp libs. Adding `otplib` broke ~100+ test suites with `SyntaxError: Unexpected token 'export'` because Jest skips `node_modules` transformation and we have no babel-jest preset. The `transformIgnorePatterns: ['/node_modules/(?!@scure|...)']` whitelist *requires* a babel preset (`@babel/preset-env`) to do the actual transform — without one, Jest still chokes. **Rule:** before adding any crypto/auth library, try `node -e "require('lib-name')"` from a Jest test file context — if it fails on ESM syntax, either (a) configure babel-jest + preset, OR (b) write the algorithm directly against `node:crypto`. For RFC 6238 TOTP, the algorithm is ~30 lines (base32 + HMAC-SHA1 + dynamic truncation); we did (b) and it works perfectly. Worth the 30-min implementation vs the days of CI debugging.

57. **(NEW — Section 122) `screen.getByText(/Modal title/)` matches BOTH the toolbar button that opens the modal AND the modal's heading.** Discovered in PR #282 (`CustomDemandsPage.test.jsx`). The page has a `+ New custom demand` button on the toolbar and a `<h3>New custom demand</h3>` inside the modal — both match `/New custom demand/i`, so `getByText` throws `TestingLibraryElementError: Found multiple elements`. **Rule:** when asserting "the modal opened", always disambiguate by role:

    ```jsx
    // ❌ Brittle — collides with the open-modal button
    expect(screen.getByText(/New custom demand/i)).toBeInTheDocument()

    // ✅ Scoped to heading element only
    expect(
      screen.getByRole('heading', { name: /New custom demand/i })
    ).toBeInTheDocument()
    ```

    Symmetric for the close assertion — use `queryByRole('heading', ...)` not `queryByText`. Applies to every Create/Edit modal in the admin UI. Next time a similarly-named button+modal pair is added (e.g. "+ Record payment" / `<h3>Record payment</h3>`), apply the heading-role pattern from the first commit, not after CI fails.

58. **(NEW — Section 122) Prod deploy MUST use `HUSKY=0 npm ci --omit=dev` for the backend step.** Reaffirms + expands the earlier pitfall #6. Bare `npm ci --omit=dev` exits 127 at the `husky` postinstall script (husky is a devDep and is not installed with `--omit=dev`):

    ```
    > mep-site-backend@1.0.0 prepare
    > husky
    sh: 1: husky: not found
    npm error code 127
    ```

    **Today (PR #282) the failure was cosmetic** — no new backend deps, so node_modules stayed intact. **Risk:** if a future PR adds a backend prod dep and the same bare command is used, the new package WILL be installed (packages install before scripts) but the exit 127 may confuse CI-driven deploy automation. **Canonical deploy line for backend:**

    ```bash
    HUSKY=0 npm ci --omit=dev          # preferred — husky postinstall no-ops cleanly
    # OR
    npm ci --omit=dev --ignore-scripts # safer fallback if other devDep scripts appear
    ```

    Stop pasting bare `npm ci --omit=dev` in any future deploy command set.

59. **(NEW — Section 123) Pre-tenant writes to RLS-strict tables from `/api/auth/*` MUST use `authPool`, never `pool`.** `/api/auth/*` is mounted via `mountPublicRoutes` and runs BEFORE any `tenantDb` middleware sets `app.company_id`. The regular `pool` connects as `mepuser` under strict RLS (migration 013), so a write with no GUC set matches **zero rows and no-ops silently** — no error thrown. This is exactly why TOTP enrollment never persisted: `POST /auth/totp/confirm-setup` did its `UPDATE public.app_users SET totp_* ...` through `pool`, the update hit 0 rows, but the endpoint returned `ok:true` and issued the JWT, so `totp_enabled_at` stayed NULL and every later login re-showed the setup QR. Reads were already correct (`authPool` for the login SELECT and change-pin); only this one write slipped through. **Rules:** (a) any pre-tenant `app_users`/`refresh_tokens` query in `routes/auth.js` uses `authPool` (= `superPool` / BYPASSRLS); (b) every state-changing pre-tenant query checks `rowCount` and returns an error on 0 — a silent 0-row write is worse than an error. Code-search net: `grep -n "pool.query" routes/auth.js` and confirm each write targets `authPool`. Fixed in PR #284.

60. **(NEW — Section 124) One SUPER_ADMIN route that leaks a single `tenantDb` client takes down the WHOLE admin portal — superPool `max` is only 10.** Discovered shipping Payments UI (PR #286, reverted in #287). Symptoms: admin pages hang then 502; nginx `error.log` shows `upstream timed out ... reading response header` then `no live upstreams` (which makes even `/api/health` 502 → Better Stack/Sentry fire); `SELECT usename,state,count(*) FROM pg_stat_activity GROUP BY 1,2` shows `mepuser_super | idle in transaction` climbing toward 10, OR "phantom exhaustion" (requests stuck at pool checkout with ZERO live mepuser_super connections). **The route's SQL can be fast in isolation** — run it directly as `postgres` to prove it (Payments query was 4.6 ms); the hang is at pool checkout, not in the query. **Recovery:** `SELECT pg_terminate_backend(pid) ... WHERE usename='mepuser_super' AND state='idle in transaction';` **AND** `pm2 restart mep-backend` (BOTH — terminate alone leaves the node pool's phantom checked-out count; only a restart rebuilds the pool). **Prevention (done):** `idle_in_transaction_session_timeout='30s'` on the app roles. **Before shipping any new SUPER_ADMIN route:** load it ~12× and confirm `idle in transaction` for `mepuser_super` stays ~0. Consider raising superPool `max`.

61. **(NEW — Section 125.3) Never derive a numeric sequence via a STRING `ORDER BY` on a zero-padded text key.** `lib/invoice_numbering.js` found the latest invoice via `ORDER BY invoice_number DESC` (string). Once the sequence crossed the 4-digit pad width, `'CONS-2026-9999'` sorted ABOVE `'CONS-2026-10000'` (`'9' > '1'`), so the computed "next" was 10000 → `uq_invoice_number` collision. Fixed to `MAX((substring(invoice_number FROM '-([0-9]+)$'))::int)`. **Two lessons:** (a) cast the numeric part and MAX it, never lexical-sort padded sequences; (b) **a prod smoke before trusting an automated job pays off** — the integration test passed because its seeded data never crossed 10000, but real prod data did. Run new billing/sequence jobs once manually on prod and read the result before relying on the cron.

62. **(NEW — Section 127/128) Before building a "missing" side menu, `grep routes/ migrations/` first — the backend may already exist.** While starting the Surplus menu this session, the page was missing but the **entire backend already existed** (`material_returns` table + `/materials/returns` + `/materials/surplus` routes from a prior phase). A duplicate `024_material_surplus.sql` migration was written before catching this, then discarded (never committed). Wasted a few turns. **Rule:** for every functional-menu task, FIRST run `grep -ri "<feature>" routes/ migrations/ services/` (e.g. `surplus`, `return`, `tool`, `emergency`, `petty`, `expense`). If a backend exists → frontend-only task. If not → backend-first slice. This is the field-workflow analogue of "read before write". (Contrast: Tool Request had NO backend → full backend+frontend build was correct.)

---

## Workflow rules (CLAUDE.md highlights)

- **One command at a time** in chat.
- **Flow diagrams only for substantive architectural discussions** — not routine ops.
- **Levantine Arabic in chat** — `شو`, `هلق`, `بدك`, `لازم`, `منيح`, `بسيط`. `شغّل` (not `ركض`). Masculine address.
- **GitHub CLI + auto-merge** — `gh pr create --fill --base main ; gh pr merge --auto --squash --delete-branch`.
- **ALWAYS delete local branch after merge** — `--delete-branch` only removes the remote.
- **Don't put `"تم"` inside PowerShell blocks** — Hedar types it manually.
- **File-based log convention for large output** — `Out-File -Encoding utf8`.
- **Don't let PRs queue — merge each fully BEFORE opening the next (§140.6, reinforces Pitfall #9).** Branch protection requires up-to-date branches; if another PR merges ahead, a green PR goes `BEHIND` and auto-merge silently stalls. `--admin` does NOT bypass ("required checks expected"). Fix: `gh pr update-branch <num>` → CI re-runs → auto-merge completes. **Never trust "green" as "merged" — verify `gh pr view <n> --json mergedAt`.** (This bit us hard: §135/#341 sat unmerged-behind for hours and was NOT actually on prod despite being recorded "LIVE".)
- **Productivity automation (§139, `DEV_AUTOMATION.md`):** `ship.ps1` = one-line PR (`.\ship.ps1 -Message "…" -Files a,b`); CD (`.github/workflows/deploy.yml`) auto-runs `scripts/deploy.sh` on green CI on main (INERT until `DEPLOY_HOST/USER/SSH_KEY` secrets added — code-only, NOT migrations); migrations = `npm run migrate` (one command) AFTER the one-time `scripts/postgres/backfill_schema_migrations.sql`. Apply additive migrations on prod BEFORE merging.
- **DECISIONS.md is the archive**, not the entry point.
- **Verify current branch before commit/push** during parallel work (Pitfall #36).
- **bigint vs Number in test assertions** — compare via `String()` on both sides (Pitfall #37).
- **Migrations on prod ALWAYS via `sudo -u postgres psql`**, never bare `psql` (Pitfall #45).
- **`mep-webhook` auto-pulls but doesn't migrate/restart** — manual deploy block mandatory (Pitfall #46).
- **When presenting decisions back to the user, quote source verbatim** — never summarize numerical commitments (Pitfall #48).
- **Every new migration that creates tables MUST include GRANTs to mepuser + mepuser_super** (Pitfall #49). Also apply `ALTER DEFAULT PRIVILEGES` once in migration 020 for belt-and-suspenders future protection.
- **Verify GitHub Actions `default_workflow_permissions` is `write`** before assuming CI failures are code issues (Pitfall #50).
- **Don't propose pause/break between agreed work items** (Pitfall #51).

---

## End-of-session checklist (Claude must run BEFORE saying "session done")

1. **All work merged to main** — `gh pr list --state open` empty (or explicitly noted as in-flight with reason).
2. **HANDOFF.md replaced** — update timestamp, latest-deployed, last-merged, migration table, next-task. Add new pitfalls.
3. **DECISIONS.md** has a new Section for any non-trivial work.
4. **Push HANDOFF + DECISIONS** as small docs PR. Wait for merge.
5. **Verify GitHub Actions permissions** — `gh api /repos/<owner>/<repo>/actions/permissions/workflow` returns `default_workflow_permissions: "write"` (Pitfall #50).
6. **Brief Hedar** with: "PR merged, HANDOFF updated, next session starts on <X>."

---

## Out-of-band notes (read on demand)

- `CLAUDE.md` — full working rules.
- `DECISIONS.md` — full decision history (14,700+ lines after Section 118). Search by Section number.
- `RECOVERY.md` — credentials inventory, cost summary.
- `SCHEMA.md` — DB schema reference (Section K covers the 5 billing tables from migrations 018/019/020/021).
- `API.md` — backend endpoint reference (Section 14 covers the 6 new billing endpoints from PR 5 + 3 customer-facing from PR 4).
- `.env.example` — required env variables.
- `migrations/*.sql` — DB migration files (latest is 021; 020 + 021 shipped in this session).
- `.github/workflows/ci.yml` — CI pipeline definition (now includes `workflow_dispatch:` trigger for emergency runs).

---
