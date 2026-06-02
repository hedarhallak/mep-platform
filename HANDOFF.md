# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: June 1, 2026 ~23:30 UTC — **Big session, all resolved. Three things shipped + Phase 6-D-6 PR 4 DONE:**
> 1. **✅ TOTP enrollment bug FIXED (Section 123, PR #284).** Enrollment never persisted (QR re-appeared every login) because `POST /auth/totp/confirm-setup` wrote `app_users` via the RLS-enforced `pool` instead of `authPool`. Fixed with `authPool` + `rowCount` guard. Pitfall #59.
> 2. **✅ `TOTP_ENCRYPTION_KEY` ROTATED** (accidentally printed in chat → rotated; new key in OneDrive `Constrai Keys`; Hedar re-enrolled). Exposed key is dead.
> 3. **✅ Phase 6-D-6 PR 4 (Payments UI) — shipped, caused an incident, ROOT-CAUSED, fixed, and re-shipped LIVE + verified stable.** Full arc in Section 124:
>    - PR #286 deployed Payments → admin portal went down: `mepuser_super` superPool (max 10) exhausted by "idle in transaction" pile-up. Reverted (PR #287).
>    - **Root cause (Section 124.7):** `tenantDb` acquired one pool client **per `/api/super` mount the request traversed** (app.js mounts it 8×, once per router). The 7th-mounted `super_payments` route borrowed 7 clients/request; the Payments page fires **two** parallel requests both in that router → up to 14 concurrent checkouts > 10 → deadlock. (Other pages were fine because their two requests hit shallower mounts: e.g. custom-demands = router 6 + router 1 = 7 ≤ 10.) The hang was at pool checkout, not the SQL (which ran in 4 ms).
>    - **Fix:** idempotency guard in `middleware/tenant_db.js` — `if (req.db) return next();` → one client + one transaction per request, app-wide. Shipped + deployed.
>    - **Re-shipped Payments** (`git revert 003ea8d`, PR #290) → **leak smoke PASSED**: `/payments` loaded 12× with `mepuser_super | idle in transaction` staying at **0**. Payments is now LIVE at `admin.constrai.ca/payments` and stable. **Phase 6-D-6 is COMPLETE.**
>
> **Prod safety net (kept):** `ALTER ROLE mepuser_super/mepuser SET idle_in_transaction_session_timeout = '30s';` — defense-in-depth against any future leak.
>
> 4. **✅ Phase 6-D-7 PR1 (monthly subscription invoice cron) SHIPPED + verified (Section 125).** `jobs/monthlyInvoiceJob.js` — 1st-of-month 14:00 UTC, generates + auto-approves `SUBSCRIPTION_RECURRING` invoices for ACTIVE monthly subs (idempotent, superPool, reuses `lib/invoice_numbering`). Hedar chose **full automation** (generate + approve + email); PR1 = generate+approve (no email), PR2 = email, PR3 = trial-expiry. Prod smoke created MEP's June invoice **CONS-2026-10001 = $229.95** (8 seats × $25 + QST/GST) — math correct, idempotent.
> 5. **✅ Invoice-numbering bug fixed (Section 125.3, Pitfall #61).** The shared `generateInvoiceNumber` used a **string** `ORDER BY` to find the latest sequence → `'CONS-2026-9999' > 'CONS-2026-10000'` lexically → next computed 10000 → UNIQUE collision. Fixed to numeric `MAX(suffix::int)`. Caught by the PR1 prod smoke (the integration test never crossed 10000; real data did). Benefits training + custom-demand numbering too.
>
> **Prod safety net (kept):** `ALTER ROLE mepuser_super/mepuser SET idle_in_transaction_session_timeout = '30s';` — defense-in-depth against any future leak.
>
> **🎯 NEXT CODE TASK: Phase 6-D-7 PR2 — invoice email automation.** Wire HTML invoice email (Resend) onto the APPROVED `SUBSCRIPTION_RECURRING` invoices `monthlyInvoiceJob` produces (env flag to toggle), reaching the full-auto end state. Then PR3 = trial-expiry warning emails. Reuse `lib/email_training_quote.js` (HTML email pattern) + `lib/email.js`.
>
> **State note:** MEP Construction = **BASIC · Bracket 6-10 · $25.00/seat/mo · 50/8 seats (at capacity)**. Billing now shows **4** invoices (the 3 prior + the new June subscription **CONS-2026-10001 $229.95 APPROVED** from the PR1 smoke). Payments page empty (no payment recorded yet).
>
> **New pitfalls this session — #59 (auth pre-tenant writes need `authPool`), #60 (one leaked `tenantDb` client kills the whole admin portal; superPool max=10; root cause was the per-mount client multiplication, now fixed).**

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
   - Latest section is **125** (Phase 6-D-7 PR1 monthly invoice cron + **125.3** invoice-numbering numeric-MAX fix / Pitfall #61). 124 = Payments leak → tenantDb per-mount fix (124.7) / Pitfall #60. 123 = TOTP fix + key rotation (#59).
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 125, prod stable, Payments live + monthly invoice cron shipped/verified, next task is Phase 6-D-7 PR2 invoice email automation)
   ```
4. **Open with Phase 6-D-6 PR 4 as the active priority.** Scope:
   - **No new backend endpoint** — `POST /api/super/payments/record` already exists (Phase 6-D-4 PR 5 / Section 118.4). Server transitions invoice status to PARTIAL_PAID / PAID automatically when sum of payments meets the total.
   - **New endpoint to ADD:** `GET /api/super/payments` — cross-tenant payments list with invoice + company joined. Mirror the `GET /custom-demands/quotes` shape from Section 122.1 (status optional, limit default 50/max 200, ORDER BY paid_at DESC).
   - **Frontend:** new `mep-frontend/src/admin/PaymentsPage.jsx` at `/payments`. Cross-company table (Payment date / Invoice # / Company / Method / Amount / External ref) + `+ Record payment` modal wrapping `POST /api/super/payments/record`. Modal pickers: invoice (any type — query `GET /super/invoices` if it exists, else add it), amount (CAD), method (BANK_TRANSFER / CHEQUE / E-TRANSFER / CARD enum from `payments.method` check constraint), external_ref (optional, max 200 chars), paid_at (date, default today).
   - **Sidebar nav:** add "Payments" link in CompaniesList toolbar between "Custom demands" and "+ New company".
   - **Logout button** already in `AdminLogoutButton`; reuse.
   - **EN-only** (SUPER_ADMIN portal).
   - **Tests:** integration for GET endpoint + Vitest smoke for PaymentsPage.
   - **Pitfall #57 (NEW):** When asserting the Record Payment modal opened, use `getByRole('heading', { name: /Record payment/i })` — the "+ Record payment" button shares the same text. Same lesson learned from PR 3 Custom Demands modal.
   - **Pitfall #58 (NEW):** Prod deploy block MUST use `HUSKY=0 npm ci --omit=dev` on the backend step.
   - **Estimated:** 1-2 days (smaller than PR 3 — single new endpoint, payments are simpler than custom demands).

   Then ask Hedar one of:
   - "Start Phase 6-D-6 PR 4 by adding the GET endpoint to super_payments.js?" — recommended first step
   - "Or, before PR 4, revisit the Custom Demands UX (e.g. add a Send action / per-invoice detail page)?"

---

## Pending tasks at session start (NEXT MAJOR CODE TASK)

### 🎯 Phase 6-D-7 PR2 — invoice email automation (Resend)

Phase 6-D-6 COMPLETE. **Phase 6-D-7 PR1 (monthly invoice cron) is DONE** — `jobs/monthlyInvoiceJob.js` generates + auto-approves `SUBSCRIPTION_RECURRING` invoices on the 1st of the month, deployed + prod-smoked (MEP June invoice CONS-2026-10001 $229.95). Hedar chose **full automation** (generate + approve + email). PR2 adds the email leg:

**Scope (PR2):**
- Send an **HTML invoice email (Resend)** to the COMPANY_ADMIN for each APPROVED `SUBSCRIPTION_RECURRING` invoice the cron produces. Wire it into `monthlyInvoiceJob` after the COMMIT (per invoice), and/or expose a sender so failed sends can be retried.
- **Env flag** (e.g. `INVOICE_EMAIL_ENABLED`) to toggle auto-send — keep it OFF until verified, then flip ON.
- Reuse `lib/email_training_quote.js` (HTML email builder pattern) + `lib/email.js` (`getMailClient()` / Resend wrapper, as in `jobs/ccqRatesReminderJob.js`).
- Tests: assert the cron calls the mailer once per created invoice (mock `lib/email`).

**Then PR3:** trial-expiry warning emails (read `trial_ends_at`, warn N days before).

**Pitfalls still live:** #60 (load any new `/api/super` route ~12× → `idle in transaction` stays ~0), **#61** (numeric MAX for sequences, never string sort), #58 (`HUSKY=0 npm ci --omit=dev`), #38/#41 (deploy = backend restart + frontend rebuild).

### After Phase 6-D-7: Phase 6-D-8 (marketing refresh + ToS + reference tenant + training materials).

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
| Latest deployed to prod | **Payments UI re-applied (PR #290) on top of the tenantDb one-client-per-request fix** — June 1 night (frontend rebuild + backend restart). `/payments` live + leak-smoke-verified (idle-in-tx = 0 after 12× load). |
| Last merged to main | **PR #290** (reapply Payments). Earlier today: tenantDb fix PR, #288 (Section 124 docs), #287 (revert), #286 (Payments), #285, #284 (TOTP fix). |
| Prod DB safety net | `idle_in_transaction_session_timeout = '30s'` on `mepuser_super` + `mepuser` (ALTER ROLE, persists) — defense-in-depth from the Section 124 incident. |
| TOTP secret | Re-enrolled June 1 under the rotated `TOTP_ENCRYPTION_KEY`. Login = PIN → 6-digit code (no QR). Recovery (lost phone): Section 121.6 SQL reset. |
| Active program | **Phase 6-D-6 COMPLETE** (all SUPER_ADMIN billing UI shipped; Payments live + stable). Next = Phase 6-D-7 (invoice cron + email automation). |
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
| **Phase 6-D-7 PR2 — invoice email automation (Resend)** | ⏳ **NEXT** |
| **Phase 6-D-7 PR3 — trial-expiry warning emails** | ⏳ after PR2 |
| Phase 6-D-6 — SUPER_ADMIN UI (Subscription detail with Apply Change, Training Quotes, etc.) | ⏳ June-July 2026 |
| Phase 6-D-7 — Invoice email automation + monthly cron + trial expiry warnings | ⏳ July 2026 |
| Phase 6-D-8 — Marketing site refresh + ToS legal review + reference tenant + training materials | ⏳ July-Aug 2026 |
| DO Spaces bucket activation (Section 112.2 deferred) | ⏳ Trigger: first paying tenant OR August dry-run |
| August dry-run + 2-week code freeze | ⏳ August 2026 |
| **September 2026 conference** | 🎯 Hard deadline |
| Phase 9-A Module System + Phase 9-B Stripe | ⏳ Q4 2026 (parallel) |
| Phase 7 — Security maturity | ⏳ Q1 2027 |

---

## Backlog items still open (lower priority)

- **⏳ Constrai bank / remittance details on the invoice** (near-term, fits Phase 6-D-7/8). The manual payment flow needs the invoice to show *where customers send the bank transfer / cheque* — a Settings field for Constrai's **business** bank account + render it as payment instructions on invoices + emails. Not present today. (Hedar flagged June 1.)
- **⏳ Business structure + dedicated business bank account — DECIDE BEFORE FIRST REAL REVENUE** (business/legal/accounting, not a code task). All payments must land in a **separate company account, never Hedar's personal account** (liability separation, clean bookkeeping, QST/GST, professional trust, and Stripe payouts require a business account in Phase 9-B). Confirm sole-prop vs incorporation with an accountant; likely incorporate before taking real money. Ties to the $30K Revenu Québec QST/GST threshold item below. (Hedar raised June 1.)
- **⏳ Subscription auto-charge (telecom-style)** — the professional end-state Hedar wants: stored payment method + recurring auto-charge (card via Stripe Billing, OR PAD/pre-authorized debit from the customer's bank account). Deliberately deferred to **Phase 9-B** (the schema is already forward-compatible: `STRIPE_CARD` method enum + `external_ref` for `payment_intent_id`). Strategy: manual now → fully automated later, layered on top of the existing system-of-record (no rewrite). Sensitive parts (PCI, PAD mandates, dunning, refunds) are handled by Stripe.
- **⏳ MEP Construction demo posture** — Now achievable via SUPER_ADMIN Apply Change endpoint (`POST /api/super/subscriptions/:id/apply-change` with `change_type='PLAN_CHANGE'`). Recommended: bump MEP to ENTERPRISE plan with subscribed_seats=100, removes the over-cap amber warning. Can do now via curl; UI will come in Phase 6-D-6.
- **⏳ Modular training materials** (Section 117.6) — design materials by topic (concepts, workflows, UI walkthroughs) with versioning.
- **⏳ DO Spaces bucket activation** (Section 112.2). Trigger: first paying tenant OR August dry-run.
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

---

## Workflow rules (CLAUDE.md highlights)

- **One command at a time** in chat.
- **Flow diagrams only for substantive architectural discussions** — not routine ops.
- **Levantine Arabic in chat** — `شو`, `هلق`, `بدك`, `لازم`, `منيح`, `بسيط`. `شغّل` (not `ركض`). Masculine address.
- **GitHub CLI + auto-merge** — `gh pr create --fill --base main ; gh pr merge --auto --squash --delete-branch`.
- **ALWAYS delete local branch after merge** — `--delete-branch` only removes the remote.
- **Don't put `"تم"` inside PowerShell blocks** — Hedar types it manually.
- **File-based log convention for large output** — `Out-File -Encoding utf8`.
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
