# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 24, 2026 ~23:00 UTC — **📋 PRICING MODEL LOCKED + SCHEMA DESIGNED.** Sections 115 (per-seat metered + cliff brackets + flat features + mandatory on-site training) and 116 (5-table schema: subscriptions + subscription_seat_changes + invoices + payments + tax_rates) recorded. Section 115 supersedes Section 113 D3 (which was based on a tier-cap model that didn't match Hedar's actual intended billing). No code changes this session — strategy + design only. The Section 114 max_users infrastructure stays live and gets re-semanticated to "subscribed seats" during Phase 6-D-4.
>
> **Next code task: Phase 6-D-4** — implement Section 116 schema (migrations 018-019), refactor Section 114 code to read from subscriptions, ship backend stubs. 2-3 weeks of build work. Customer UI (Phase 6-D-5) and SUPER_ADMIN UI (Phase 6-D-6) follow.
>
> **1 new pitfall captured this session** — #48 (when restating prior decisions, quote specific values verbatim from source messages; never summarize numerical commitments — caught twice in the Section 115 strategic discussion).

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
   Expected: PM2 status `online`, memory >50mb, Health `200`. If anything off, see Section 104 in DECISIONS.md for the recovery runbook.

2. **Browser smoke test (Pattern B end-to-end):** Open `https://app.constrai.ca` in incognito → login with `seed.worker6@meptest.com` / `1234` (FOREMAN test user) → should cross-origin-hop to `mep.constrai.ca/dashboard`. If browser shows DNS NXDOMAIN for `mep.constrai.ca`, this is the local-resolver cache from Section 107.2 — wait an hour for it to expire OR set Chrome DoH to Google Public DNS as a workaround. Cloudflare wildcard is correctly configured; new tenants will not hit this.

3. **(Section 114) Admin Branding page smoke:** Open `https://admin.constrai.ca/login` in incognito → login `hedar.hallak@gmail.com` / PIN `hedar2026` → CompaniesList renders with `Branding →` link in the last column → click it → CompanyBranding page shows seat counter (50/5 for MEP — still over-cap until Phase 6-D-8), logo preview, brand color picker, Upgrade plan button. Confirms the Section 114 deploy is still alive.

4. **Only after all three are green**, continue with the regular task list below.

---

## 🎯 Strategic context — September 2026 conference (hard deadline)

> **~4 months runway from May 24, 2026.** Hedar has a Quebec construction industry conference in September 2026. The product MUST be demo-ready and ideally sales-ready by then — branded subdomain per company, smooth onboarding, transparent pricing, working seat management, manual billing acceptable. This deadline reshapes priority for every session from now until then.

**Roadmap to conference (Sections 105 / 114 / 115 / 116):**

| Window | Focus | Phases |
|---|---|---|
| **May 15 — June 15** | Finish branding stack + lock pricing model | ✅ Phase 6-D-2 logo swap → ✅ Phase 6-D-3 backend → ✅ Phase 6-D-3 frontend + max_users (Section 114) → ✅ Section 115 pricing lock → ✅ Section 116 schema design |
| **June 2026** | Build subscription schema + backend | ⏳ **Phase 6-D-4** — migrations 018-019, refactor Section 114 code, API endpoints (~2-3 weeks) |
| **June-July 2026** | Customer-facing billing UI | ⏳ **Phase 6-D-5** — Subscription page, Seats Management, Billing/Invoices, Invoice Detail (~2 weeks) |
| **July 2026** | SUPER_ADMIN training/quotes UI | ⏳ **Phase 6-D-6** — Training Quotes, Custom Demands, Payments Log, Overdue dashboard (~1-2 weeks) |
| **July 2026** | Invoice PDF + email automation | ⏳ **Phase 6-D-7** — Quebec-compliant PDF, monthly cron, trial expiry warnings (~1-2 weeks) |
| **July-August 2026** | Marketing + reference tenants | ⏳ **Phase 6-D-8** — Marketing site refresh, ToS legal review, 2 reference tenants, MEP demo posture, mobile build refresh (~2 weeks, parallel) |
| **August** | Pre-conference dry-run + code freeze | End-to-end rehearsal, bug fix only, 2-week freeze before conference |
| **September** | **Conference** | Demo + sales. Manual Stripe-less billing — Hedar invoices manually if a sale happens; customer pays via bank transfer/cheque; recorded in payments table |
| **Post-conference (Q4 2026)** | **Phase 9-A** — Module/Plugin System | Per-tenant feature flags + modular add-on billing (advanced analytics, equipment mgmt, etc. as separate SKUs) |
| **Post-conference (Q4 2026)** | **Phase 9-B** — Stripe integration | Webhook handler + real card payments + automated state transitions + dunning + Customer Portal |
| **Q1 2027** | Phase 7 — Security maturity | 2FA + biometric + PIN→password migration |

**What this implies for session priority order:**
1. **Operational stability first** (every session opens with the URGENT FIRST CHECK above).
2. **Phase 6-D-4 next** — implement the Section 116 schema before any other work.
3. **Phase 6-D-5/6/7 in sequence** — customer UI, then SUPER_ADMIN UI, then PDF/email automation.
4. **No new features in August.** August is rehearsal + bug-fix only. New code freeze 2 weeks before conference.
5. **Plugin architecture design CAN start in July** (low-pressure, design only, no code). Build waits for Q4.

---

## How to start a new session (Hedar — copy this one line)

```
استكمال Constrai. اطلب مجلد C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed (request_cowork_directory)، اقرأ HANDOFF.md من المجلد، اتبع التعليمات فيه بالحرف.
```

---

## Bootstrap protocol (Claude — follow this exactly)

When you receive the one-line command above:

1. **Request folder access** via `request_cowork_directory` for `C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed`.
2. **Read these 4 files** (use the Read tool, NOT bash):
   - `HANDOFF.md` (this file)
   - `CLAUDE.md` (working rules)
   - `DECISIONS.md` — read ONLY the latest 2-3 sections (the file is now 13,800+ lines). Latest section is **116** (Subscription + Billing Schema Design). Also relevant: 115 (pricing model lock that supersedes 113 D3), 114 (Phase 6-D-3 frontend + max_users shipped). **IMPORTANT:** Read DECISIONS.md via the Read tool ONLY (never `bash tail` / `grep`) — Cowork bash mount can lag.
   - `RECOVERY.md` Section 2.4 only if relevant
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Sections 115 + 116, pricing model locked + schema designed, next code task is Phase 6-D-4 implementation)
   ```
4. **Open with Phase 6-D-4 as the active priority.** Confirm scope in 2-3 lines:
   - Migration 018: create 5 new tables (subscriptions, subscription_seat_changes, invoices, payments, tax_rates)
   - Migration 019: backfill subscriptions for existing companies from `companies.max_users` (Section 116.8)
   - Refactor `routes/invite_employee.js` + `routes/super_admin.js` + `CompanyBranding.jsx` to read from new tables
   - New API endpoints (customer + SUPER_ADMIN per Section 116.9)
   - Mock payment integration only (no Stripe pre-Phase 9-B)
   
   Then ask Hedar one of:
   - "Start with migration 018 (the schema)?" — most natural first step
   - "Or do you want to revisit any Section 116 decision first?"
   
   **Don't dump 20 questions.** Pick the obvious first step and propose it.

---

## Pending tasks at session start (NEXT MAJOR CODE TASK)

### 🎯 Phase 6-D-4 — Subscription + Billing Schema Implementation

**Scope:** Section 116 schema → live in DB + Section 114 code refactored to use it. No customer-facing UI in this phase; backend only.

**Estimated effort:** 2-3 weeks total, split into ~5-7 PRs.

**PR plan (proposed):**

| PR # | Scope | Estimated effort |
|---|---|---|
| 1 | `migration 018` — Create 5 tables + enums + indexes | 4-6 hours |
| 2 | `migration 019` — Backfill subscriptions from companies.max_users | 2-3 hours |
| 3 | Backend refactor — `invite_employee.js`, `super_admin.js`, tests | 4-6 hours |
| 4 | New customer-facing API endpoints — subscription, invoices | 1-2 days |
| 5 | New SUPER_ADMIN API endpoints — training quotes, payments | 1-2 days |
| 6 | Sequential invoice numbering function + tax rate lookup | 4-6 hours |
| 7 | Monthly subscription invoice generation cron job | 1 day |

**Key references during implementation:**
- Section 115 → all pricing decisions (brackets, training fees, geography, etc.)
- Section 116 → all schema columns, state machines, JSONB shapes
- Section 116.8 → exact migration scripts for backfill
- Section 116.13 → 10 open decisions to address as encountered

**Critical pitfalls to avoid (from Section 114 experience):**
- Pitfall #45 — every migration on prod via `sudo -u postgres psql`
- Pitfall #46 — `mep-webhook` auto-pulls but doesn't migrate; FULL deploy block mandatory
- Pitfall #48 — when documenting decisions, quote source values verbatim

### After Phase 6-D-4: continues per roadmap above (6-D-5 → 6-D-8)

---

## Current state (snapshot)

| Item | Value |
|---|---|
| Production URL | `https://app.constrai.ca` |
| Admin portal | `https://admin.constrai.ca` (SUPER_ADMIN only) |
| Tenant subdomain example | `https://mep.constrai.ca` (DNS live, nginx wildcard active, Pattern B verified — Section 107) |
| Login (test) | Email: `hedar.hallak@gmail.com` / PIN: `hedar2026` (SUPER_ADMIN) |
| Server SSH | `ssh root@143.110.218.84` (Ubuntu 24.04) |
| Backend | Node.js + Express + Postgres 16, pm2-managed at `/var/www/mep`. Branding upload route at `POST /api/super/companies/:id/branding` (Section 112). Invite enforcement HTTP 402 USER_LIMIT_REACHED with bilingual messages (Section 114). |
| Frontend | React + Vite + Tailwind v4. `window.__BRANDING__` populated by `lib/branding.js` (Section 99). Admin route `/companies/:id/branding` (Section 114). |
| Latest deployed to prod | **Phase 6-D-3 frontend + max_users seat-cap bundle (Section 114)** — PR #257, May 23 (`16c02e4` + post-merge fixes). Migration 017 applied. Frontend bundle `main-B6ojUQ5z.js`. |
| Last merged to main | **PR #258** (Section 114 docs PR — HANDOFF + DECISIONS Section 114, May 23). |
| Active program | **Multi-Tenant Migration — Phase 6-D-3 CODE-COMPLETE.** Section 115 + 116 strategy/design done (this session). Next code: Phase 6-D-4 schema implementation. |
| Mobile app | Still on Bearer-token + PIN. Phase 7 migration is Q1 2027. |

### Multi-tenant migration progress

| Phase | Status |
|---|---|
| Section 85 — Architecture | ✅ Done |
| Phase 1 — Cloudflare + Origin SSL | ✅ Deployed |
| Phase 2 — Tenant Resolver | ✅ No-op (Model C) |
| Phase 3 — DB schema 011 + email login | ✅ Deployed |
| Phase 4a–c — RLS Stage 1–3 | ✅ Deployed |
| Phase 5 — SUPER_ADMIN portal split | ✅ Closed |
| Email migration SendGrid → Resend | ✅ Fully decommissioned (Section 98) |
| Phase 6-A — companies branding columns (migration 014) | ✅ Deployed |
| Phase 6-B — public `GET /api/companies/:code/branding` | ✅ Deployed |
| Phase 6-C — Frontend bootstrap reads branding + applies CSS vars | ✅ Deployed (Section 99) |
| Phase 6-D-1a/b/c — Cookie auth + redirect_url + drop body tokens | ✅ Deployed |
| Section 102 — nginx wildcard config | ✅ Deployed (May 15) |
| Section 106 — `/whoami` 401-reload-loop hotfix | ✅ Deployed (May 15) |
| Section 107 — Pattern B verified end-to-end | ✅ Verified (May 15) |
| Phase 6-D-2 — Logo swap + remember-me | ✅ Deployed + verified (May 15) |
| Phase 6-D-3 backend (multer + sharp + Spaces client + route) | ✅ Deployed (May 15, PR #249) |
| Section 111 polish batch | ✅ Merged (May 16, PR #251) |
| Section 113 — Subscription/billing strategy V1 | ✅ Recorded (May 16) — **SUPERSEDED by Section 115** |
| Phase 6-D-3 frontend + `max_users` seat-cap bundle (Section 114) | ✅ Deployed + verified on prod (May 23, PR #257, migration 017) |
| **Section 115 — Pricing model lock (per-seat metered)** | ✅ **Recorded (May 24)** |
| **Section 116 — Subscription + billing schema design** | ✅ **Recorded (May 24)** |
| **Phase 6-D-4 — Subscription schema implementation** | ⏳ **NEXT — June 2026 (~2-3 weeks)** |
| Phase 6-D-5 — Customer-facing billing UI | ⏳ June-July 2026 |
| Phase 6-D-6 — SUPER_ADMIN training/quotes UI | ⏳ July 2026 |
| Phase 6-D-7 — Invoice PDF + monthly cron + trial emails | ⏳ July 2026 |
| Phase 6-D-8 — Marketing site + reference tenants + MEP demo posture + mobile build | ⏳ July-August 2026 |
| Phase 6-D-3 — DO Spaces bucket activation (operational) | ⏳ DEFERRED — execute Section 112.2 runbook when first paying tenant signs OR August dry-run requires |
| August dry-run + code freeze 2 weeks pre-conference | ⏳ August 2026 |
| **September 2026 conference** | 🎯 Hard deadline. Manual billing acceptable (Hedar invoices manually). |
| Phase 9-A — Module/Plugin System (modular add-ons) | ⏳ Q4 2026 |
| Phase 9-B — Stripe integration | ⏳ Q4 2026 |
| Phase 7 — 2FA + biometric + PIN→password | ⏳ Q1 2027 |
| Phase 8 — Audit + compliance | ⏳ Pending |

---

## Backlog items still open (lower priority)

- **⏳ MEP Construction demo posture** — DEFERRED until after Phase 6-D-4 + Phase 6-D-8. Will be addressed when the new subscription schema is live; MEP will be created as an ENTERPRISE-plan subscription with `subscribed_seats=100` to show 50/100 green during demo. Section 115/116 schema makes this cleaner than the old Option A/B/C decision.
- **⏳ DO Spaces bucket activation** (Section 112.2). Trigger to execute: first paying tenant signs OR August dry-run needs upload UI end-to-end. Until then: backend returns `500 SPACES_NOT_CONFIGURED`.
- **⏳ Phase 9-B — Stripe integration** (Section 113.9). Post-conference Q4 2026. Full Stripe Billing + webhook + state machine + Customer Portal + dunning + QST/GST tax automation.
- **⏳ Phase 9-A — Module/Plugin System** (Section 105 / 113.8 / 115.6). Post-conference Q4 2026, parallel with 9-B. Per-tenant feature flags + modular add-on billing for advanced features. Design CAN start in July.
- **⏳ Annual billing logic** — Schema ready in Section 116; implementation deferred to Phase 6-D-7 or Phase 9-B.
- **⏳ `mep-webhook` hardening** (Pitfall #46). Optional: extend `mep-webhook` to detect new `migrations/` files since previous HEAD and refuse to pull until operator runs them.
- **⏳ Soft-delete column on `employees` table** — Section 114.4. When a UI flow exists to "remove" an employee, the WHERE clause should exclude soft-deleted rows.
- **⏳ Custom discount UI** — Deferred per Section 115.10. Build only if real demand emerges from a customer ask.
- **⏳ Tax registration timing** — Plan when Constrai crosses Revenu Québec's $30K threshold (estimated by first paying customer in Q3 2026).
- **⏳ ToS legal review** (Phase 6-D-8) — Required before any real paying customer; mandatory training + Quebec consumer protection clauses.
- `routes/project_trades.js` redundant top-level `router.use(auth)`. Low.
- pg DeprecationWarning. Hygiene PR opportunity.
- Coverage threshold ratchet — current measured: Lines 63.66%, Branches 54.41%, Functions 62.18%, Statements 62.61%.
- **PIN → password migration** — Phase 7 candidate.
- **Mobile path migration off body refresh_token** — Phase 7 candidate.
- CSRF protection — currently `SameSite=Lax` covers common threat. Layer CSRF middleware if state-changing GET endpoints get added.
- `SENDGRID_FROM_EMAIL` env var name — optional rename to `EMAIL_FROM`.
- Stale GitHub blob `0512476` — remains until GC; no action.

---

## Pending items from leak remediation (Section 91)

**ALL items COMPLETE.** No leak-remediation work remains.

| Secret | Status |
|---|---|
| Cloudflare Origin Cert + Key | ✅ Rotated + deployed (Section 91) |
| Resend API key (`v2`) | ✅ Rotated (Section 92.5) |
| `mepuser_super` DB pw | ✅ Rotated (Section 91) |
| `mepuser` DB pw | ✅ Rotated (Section 92.2) |
| `MAPBOX_ACCESS_TOKEN` | ✅ Rotated (Section 92.2) |
| `JWT_SECRET` | ✅ Rotated (Section 93.1) |
| `ADMIN_API_KEY` + `AUTH_SECRET` | ✅ Deleted (dead env vars) |
| `SENDGRID_API_KEY` | ✅ Decommissioned (Section 98) |
| `SENTRY_DSN` | Optional — DSN is semi-public, skip unless misuse appears |

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
| `MAPBOX_ACCESS_TOKEN` (`Constrai Prod 2026-05-11`) | `Mapbox token 2026-05-11.txt` | 2026-05-11 |
| `JWT_SECRET` | `JWT_SECRET 2026-05-11.txt` | 2026-05-11 |

Prod `/var/www/mep/.env` is in sync. `SENDGRID_API_KEY` no longer present. `DO_SPACES_*` env vars not yet set (deferred).

Cost inventory + DigitalOcean Spaces + Apple Developer keys: see `RECOVERY.md`.

---

## Critical pitfalls (encoded from Sections 86–116)

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
22. **Per-request transaction middleware MUST commit BEFORE the response is flushed** — override `res.end`.
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
35. **Provider migration completeness audit before env-var decommission** — grep direct SDK references AND legacy env-var references.
36. **Verify current branch before commit/push during parallel work** — `git branch --show-current` before EVERY commit.
37. **Compare pg `bigint` columns via `String()` on both sides** — `expect(String(res.body.<x>)).toBe(String(seed.<id>))`.
38. **Every deploy that touches `package.json` MUST run `npm ci` on server BEFORE `pm2 restart`** + frontend rebuild. Mandatory FULL deploy block:
    ```bash
    cd /var/www/mep
    git pull origin main
    npm ci --omit=dev --ignore-scripts
    pm2 restart mep-backend
    sleep 3
    cd mep-frontend
    npm ci --ignore-scripts
    npm run build 2>&1 | tail -10
    cd /var/www/mep
    pm2 status mep-backend
    curl -sS -o /dev/null -w "Health: %{http_code}\n" https://app.constrai.ca/api/health
    grep -oE 'main-[A-Za-z0-9_-]+\.js' /var/www/mep/mep-frontend/dist/index.html | head -1
    pm2 logs mep-backend --lines 15 --nostream
    ```
39. **Every `/api.js` auth-related state machine needs a "we're already there" guard** — before `window.location.href = TARGET`, check `if (window.location.pathname !== TARGET)`.
40. **DNS negative caching survives the record fix and is per-resolver** — don't pre-query a subdomain before its DNS record exists. For stuck cache: use Google `8.8.8.8` or wait the TTL.
41. **`git pull` does NOT rebuild the Vite frontend** — always include `cd mep-frontend && npm ci --ignore-scripts && npm run build` after any frontend-touching pull.
42. **Don't use `lib/auth_utils` for ad-hoc shell hashing** — use `bcrypt` directly + guard with `[ -n "$HASH" ]`.
43. **Edit tool can fail on certain repo paths; fall back to `mcp__workspace__bash` on the Linux mount**.
44. **DB column duplication + verify field-name chain end-to-end** — psql `\d <table>` → curl endpoint → grep frontend lib. All three must match.
45. **`psql <db>` as Linux root needs `sudo -u postgres psql <db>` for peer auth** — bare `psql` fails with `FATAL: role "root" does not exist`. Every migration command on prod MUST be prefixed:
    ```bash
    sudo -u postgres psql mepdb -f /var/www/mep/migrations/NNN_name.sql
    ```
46. **`mep-webhook` auto-pulls main but does NOT run migrations or restart pm2** — fresh SSH session after a merge typically reports `Already up to date.` because the webhook beat you. **Dangerous when PR has schema changes:** source code references new columns, webhook auto-pulls, next `pm2 restart` activates new code without schema migrated → instant 500s. Manual deploy block (Pitfall #38) is non-negotiable for any PR touching `migrations/`.
47. **testing-library `getByText` only matches direct text children, not descendants** — for `<p>{a} <span>/</span> {b}</p>`, `getByText('a / b')` fails. Fix: function matcher walking `textContent`:
    ```js
    screen.getByText((_, el) => el?.tagName === 'P' &&
      el.textContent.replace(/\s+/g, ' ').trim() === 'a / b')
    ```
48. **(NEW — Section 115) When restating decisions from prior messages, quote specific values verbatim from source; never summarize numerical commitments.** During the Section 115 strategic conversation, twice I dropped specific details when recapping (the mandatory-training cost line and the flight-cost-pass-through clause for >200km training). Hedar caught both. Pattern to avoid: paraphrasing previously locked numbers/policies in a "summary" — even unintentionally — erodes trust in documentation and forces the user to double-check every recap. Correct pattern: when re-presenting prior decisions, copy the source values verbatim from the original message, paste into the current document, and verify nothing is missing before sending. This applies to: marketing copy that recaps pricing, schema designs that recap business rules, summaries in HANDOFF replacements, and any "table of what we decided" view.

---

## Workflow rules (CLAUDE.md highlights)

- **One command at a time** in chat — one PowerShell or bash block per turn.
- **Flow diagrams only for substantive architectural discussions** — not routine ops.
- **Levantine Arabic in chat** — `شو`, `هلق`, `بدك`, `لازم`, `منيح`, `بسيط`. `شغّل` (not `ركض`). `يفتل` for CI/auto-merge churn. Masculine address.
- **GitHub CLI + auto-merge** — `gh pr create --fill --base main ; gh pr merge --auto --squash --delete-branch`. If `BEHIND` mid-CI: `gh pr update-branch <num>` (Pitfalls #9 / #18).
- **ALWAYS delete the local branch after merge** — `--delete-branch` only removes the remote.
- **Don't put `"تم"` inside PowerShell blocks** — Hedar types it manually.
- **File-based log convention for large output** — `Out-File -Encoding utf8` (NEVER bare `>`).
- **DECISIONS.md is the archive**, not the entry point.
- **Verify current branch before commit/push during parallel work** — `git branch --show-current` before every commit (Pitfall #36).
- **bigint vs Number in test assertions** — compare via `String()` on both sides (Pitfall #37).
- **Migrations on prod ALWAYS via `sudo -u postgres psql`**, never bare `psql` (Pitfall #45).
- **`mep-webhook` auto-pulls main but doesn't migrate/restart** — manual deploy block mandatory for any PR touching `migrations/` (Pitfall #46).
- **(NEW from Section 115) When presenting decisions back to the user, quote source verbatim — never summarize numerical commitments** (Pitfall #48).
- **(NEW from Section 115) For irreversible architectural decisions, ask one focused question at a time** — explicitly reinforced this session via Hedar's feedback "بفضل لما بدك تعطيني خيارات تشرح عنها قبل ما تسألني". Give context in prose BEFORE invoking AskUserQuestion; the tool's option-label fields are too short to convey trade-offs.

---

## End-of-session checklist (Claude must run BEFORE saying "session done")

1. **All work merged to main** — `gh pr list --state open` empty (or explicitly noted as in-flight with reason).
2. **HANDOFF.md replaced** — update timestamp, latest-deployed, last-merged, migration table, next-task. Add new pitfalls.
3. **DECISIONS.md** has a new Section for any non-trivial work.
4. **Push HANDOFF + DECISIONS** as small docs PR. Wait for merge.
5. **Brief Hedar** with: "PR merged, HANDOFF updated, next session starts on <X>."

---

## Out-of-band notes (read on demand)

- `CLAUDE.md` — full working rules.
- `DECISIONS.md` — full decision history (13,800+ lines after Section 116). Search by Section number.
- `RECOVERY.md` — credentials inventory, cost summary.
- `SCHEMA.md` — DB schema reference.
- `API.md` — backend endpoint reference.
- `.env.example` — required env variables.
- `migrations/*.sql` — DB migration files (latest is 017; 018-020 designed in Section 116, implementation in Phase 6-D-4).
- `.github/workflows/ci.yml` — CI pipeline definition.

---

**Maintainer:** Hedar Hallak (hedar.hallak@gmail.com) | **Repo:** hedarhallak/mep-platform | **Production:** https://app.constrai.ca
