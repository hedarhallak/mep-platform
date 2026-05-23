# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 23, 2026 ~16:30 UTC — **✅ Phase 6-D-3 frontend + `max_users` seat-cap bundle SHIPPED.** PR #257 squash-merged to main (`16c02e4`), migration 017 applied via `sudo -u postgres psql`, backend restarted, frontend rebuilt (bundle `main-B6ojUQ5z.js`), browser-verified end-to-end on `admin.constrai.ca`. The Branding admin page renders correctly for the existing MEP Construction tenant: seat counter shows `50 / 5` with the amber "At capacity" warning (the BASIC-plan tenant is genuinely over-cap — exactly the honest UX Section 113.11 designed for).
>
> **3 new pitfalls captured this session** — #45 (`psql` as Linux root needs `sudo -u postgres` for peer auth), #46 (`mep-webhook` auto-pulls main but does NOT run migrations or restart pm2), #47 (testing-library `getByText` only matches direct text children — for multi-child text use a function matcher walking `textContent`).

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

3. **(NEW — Section 114) Admin Branding page smoke:** Open `https://admin.constrai.ca/login` in incognito → login `hedar.hallak@gmail.com` / PIN `hedar2026` → CompaniesList renders with `Branding →` link in the last column → click it → CompanyBranding page shows seat counter, logo preview, brand color picker, Upgrade plan button. Confirms the Section 114 deploy is still alive. If `SUPER_ADMIN_REQUIRED` banner appears, the session cookie is from a non-SA login — go straight to `/login` and re-auth.

4. **Only after both above are green**, continue with the regular task list below.

---

## 🎯 Strategic context — September 2026 conference (hard deadline)

> **~4 months runway from May 23, 2026.** Hedar has a Quebec construction industry conference in September 2026. The product MUST be demo-ready and ideally sales-ready by then — branded subdomain per company, smooth onboarding, and at least one or two reference tenants set up. This deadline reshapes priority for every session from now until then.

**Roadmap to conference (Sections 105 / Section 114 closeout):**

| Window | Focus | Phases |
|---|---|---|
| **May 15 — June 15** | Finish branding stack end-to-end | ✅ Hygiene batch (3/3 closed, Section 108) → ✅ Phase 6-D-2 logo swap → ✅ Phase 6-D-3 backend (Section 112) → ✅ Phase 6-D-3 frontend + `max_users` seat-cap bundle (Section 114, **DEPLOYED May 23**) |
| **June 15 — July 31** | Polish + demo readiness | Bug fixes, performance, **MEP Construction demo posture decision** (drop seed employees to ≤5 OR upgrade to ENTERPRISE so demo doesn't always render amber at-capacity), demo data setup for 1-2 reference tenants, marketing site refresh, mobile build update |
| **August** | Pre-conference dry-run | End-to-end rehearsal flow: signup → branding setup → daily use of 3 core workflows (timesheet, project, materials). ✅ External uptime monitor live (Better Stack, Section 108). |
| **September** | **Conference** | Demo, sales conversations, possible new tenant signups. **No Stripe billing live; admin page honestly shows `current_users / max_users` + `mailto:billing@constrai.ca` for upgrades.** |
| **Post-conference (Q4 2026)** | **Phase 9-A — Module/Plugin System** | Architectural commitment from Section 105. Per-tenant customization runtime (admin-toggleable feature flags driving menu visibility + route gating + per-tenant capability sets). DESIGN can start July; BUILD starts post-conference. |
| **Post-conference (Q4 2026)** | **Phase 9-B — Billing / Subscriptions** | Full Stripe Billing + webhook handler + subscription state machine (TRIAL → ACTIVE → PAST_DUE → SUSPENDED → CANCELLED → DELETED) + Customer Portal + dunning emails + QST/GST tax. Parallel with 9-A, same `companies` table. State machine + tech stack + email cadence locked in Section 113.3 / 113.5 / 113.9. |
| **Q1 2027** | Phase 7 — Security maturity | 2FA + biometric + PIN→password migration |

**What this implies for session priority order:**
1. **Operational stability first** (every session opens with the URGENT FIRST CHECK above). A second 14h outage before the conference is unacceptable.
2. **Branding stack is now CODE-COMPLETE for pre-conference scope** — only Spaces bucket activation (Section 112.2) remains as deferred operational work.
3. **Next focus: demo polish + reference tenants.** Don't start Phase 9 build until conference demo runbook is rehearsed.
4. **Stop adding features in August.** August is rehearsal + bug-fix only. New code freeze 2 weeks before the conference.
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
   - `DECISIONS.md` — read ONLY the latest 2-3 sections (the file is now 13,400+ lines). Latest section is **114** (Phase 6-D-3 frontend + max_users seat-cap SHIPPED). Also relevant: 113 (the strategic decision that locked the bundle scope), 112 (Phase 6-D-3 backend shipped + DO Spaces bucket activation deferred). **IMPORTANT:** Read DECISIONS.md via the Read tool ONLY (never `bash tail` / `grep`) — Cowork bash mount can lag and miss recently merged sections.
   - `RECOVERY.md` Section 2.4 only if relevant
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 114, Phase 6-D-3 frontend + max_users seat-cap deployed, next is demo polish window June 15 → July 31)
   ```
4. **Open with the demo polish window as the active priority.** The first concrete item: decide MEP Construction demo posture (the seed tenant currently shows 50/5 at-capacity; either trim seed employees to ≤5 OR upgrade to ENTERPRISE so the demo defaults to a healthy green state). After that, marketing site refresh + reference-tenant data setup. Confirm in 2-3 lines, then ask Hedar which item to start with — OR if there's a new strategic concern that bumps the queue.

---

## Pending tasks at session start (NEXT MAJOR CODE TASK)

### 🎯 Demo polish window opens — June 15 → July 31 (conference prep)

Branding stack is code-complete for pre-conference scope. The remaining work is operational + cosmetic, not architectural. Items, in rough priority:

#### 1. **MEP Construction demo posture decision** (~15 min, mostly a single SQL UPDATE)

The seed tenant `MEP Construction` has 50 employees on plan BASIC (max_users=5). The Branding page correctly shows `50 / 5` with an amber "At capacity" warning — which is honest, but probably not the first impression we want during a sales demo.

Two options (pick one):

- **Option A — Trim seed employees to ≤5.** Run `UPDATE public.employees SET is_active = false WHERE company_id = <mep_id> AND id NOT IN (<5 chosen ids>);` plus a soft cleanup. Keeps the BASIC tier story intact ("here's a small-shop tenant").
- **Option B — Upgrade MEP Construction to ENTERPRISE.** `UPDATE public.companies SET plan = 'ENTERPRISE', max_users = 100 WHERE company_id = <mep_id>;`. Demo shows `50 / 100` green, room to grow.

**Recommendation:** Option B — bigger-feeling demo, no destructive data change, matches the "we are growing" sales narrative.

#### 2. **DO Spaces bucket activation** (~15 min)

Per Section 112.2 runbook. Trigger to execute: first paying tenant signs OR August dry-run requires the upload UI to work end-to-end. Until then: backend returns `500 SPACES_NOT_CONFIGURED` on logo upload attempts. Brand color changes already work without the bucket.

#### 3. **Marketing site refresh** (effort TBD, lives at `constrai-landing/`)

Conference-driven: the public-facing landing page hasn't been touched in months. At minimum: pricing tiers should match Section 113.6 ($49 / $149 / $399 CAD), feature list should reflect the actual product, screenshots should match the current UI (branded login + admin Branding page are new).

#### 4. **Reference-tenant data setup** (2-4 hours)

Demo will need 1-2 fully-populated tenant accounts beyond MEP Construction. Realistic data: 10-30 employees, a handful of projects, a few weeks of timesheet/assignment history. Should sit at PRO or ENTERPRISE so demos showcase the seat-cap headroom UX.

#### 5. **Mobile build refresh** (effort TBD, lives at `mep-mobile/`)

The mobile app is still on Bearer-token + PIN. Phase 7 migration is Q1 2027. Pre-conference refresh: bump Expo SDK if there's a major version available, smoke-test the build pipeline, push a fresh TestFlight build so demo doesn't show an old build.

#### 6. **Coverage threshold ratchet** (when stable)

Current measured: Lines 63.66%, Branches 54.41%, Functions 62.18%, Statements 62.61%. Ratchet candidate when stable across 3 consecutive CI runs. Set thresholds 2-3 pp below measured (Section 4.6).

### Open architectural questions for the post-conference Phase 9 kickoff

Already enumerated in DECISIONS.md Section 113.12. Not pre-conference work; just listed here so they're visible.

---

## Current state (snapshot)

| Item | Value |
|---|---|
| Production URL | `https://app.constrai.ca` |
| Admin portal | `https://admin.constrai.ca` (SUPER_ADMIN only) |
| Tenant subdomain example | `https://mep.constrai.ca` (DNS live, nginx wildcard active, Pattern B verified end-to-end — Section 107) |
| Login (test) | Email: `hedar.hallak@gmail.com` / PIN: `hedar2026` (SUPER_ADMIN) |
| Server SSH | `ssh root@143.110.218.84` (Ubuntu 24.04) |
| Backend | Node.js + Express + Postgres 16, pm2-managed at `/var/www/mep`. `/login` + `/refresh` return cookie-only response body when `X-Auth-Channel: cookie` is set (Section 103); legacy body-tokens shape preserved for mobile. Tenant logo upload route at `POST /api/super/companies/:id/branding` (Section 112). **NEW (Section 114):** `POST /api/invite-employee` returns HTTP 402 USER_LIMIT_REACHED with bilingual messages when `current_users >= max_users`; `GET /api/super/companies/:id` returns `current_users` field. |
| Frontend | React + Vite + Tailwind v4. Every fetch sends `credentials: 'include'` + `X-Auth-Channel: cookie`. `window.__BRANDING__` populated by `lib/branding.js` (Section 99). LoginPage `<h1>` reads `window.__BRANDING__.company_name` (Section 111). Full 6-variable shade palette via `color-mix()` (Section 111). **NEW (Section 114):** admin route `/companies/:id/branding` renders the per-tenant Branding page (logo upload + brand_color picker + seat counter + mailto upgrade link). |
| Latest deployed to prod | **Phase 6-D-3 frontend + max_users seat-cap bundle (Section 114)** — PR #257, squash on main `16c02e4`, deployed May 23. Migration 017 applied. Frontend bundle `main-B6ojUQ5z.js`. |
| Last merged to main | **PR #257** (Section 114 — Phase 6-D-3 frontend + max_users seat-cap, May 23). Earlier this week: PR #252 (Section 113 docs), PR #251 (Section 111 polish recovery via cherry-pick). |
| Active program | **Multi-Tenant Migration — Phase 6-D-3 CODE-COMPLETE (frontend + backend + seat-cap all live).** Next pre-conference focus: demo polish + reference tenants. Operational deferred: DO Spaces bucket activation (Section 112.2). Post-conference: Phase 9-A Modules + Phase 9-B Billing. |
| Mobile app | Still on Bearer-token + PIN. Backend's mobile path (no `X-Auth-Channel` header → keeps body tokens) is unchanged. Phase 7 will migrate. |

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
| Phase 6-D-1a — Backend cookie auth + login redirect_url | ✅ Deployed (Section 100) |
| Phase 6-D-1b — Frontend cookie consumption + /whoami cookie fallback | ✅ Deployed (Section 101) |
| Phase 6-D-1c — Drop tokens-in-body for web auth responses | ✅ Deployed (May 14, Section 103) |
| Section 102 — nginx wildcard config + prod symlink + reload | ✅ CLOSED (May 15, Section 107.5) |
| Section 106 — `/whoami` 401-reload-loop hotfix | ✅ Deployed (May 15, PR #241) |
| Section 107 — Pattern B verified end-to-end in production | ✅ VERIFIED (May 15) |
| Phase 6-D-2 — Logo swap on LoginPage + remember-me checkbox | ✅ DEPLOYED + VERIFIED on prod (May 15, Sections 109 + 110) |
| Phase 6-D-3 backend (multer + sharp + Spaces client + route) | ✅ DEPLOYED (May 15, Section 112, PR #249) |
| Section 111 polish batch (drop legacy `logo_url` + dynamic `<h1>` + 6-variable color-mix shades) | ✅ MERGED (May 16, PR #251 via cherry-pick of orphan `088f33e`) |
| Section 113 — Subscription/billing strategy decided | ✅ Recorded (May 16) |
| **Phase 6-D-3 frontend + `max_users` seat-cap bundle (Section 114)** | ✅ **DEPLOYED + VERIFIED on prod (May 23, PR #257, migration 017)** |
| Phase 6-D-3 — DO Spaces bucket activation (operational) | ⏳ DEFERRED — execute Section 112.2 runbook when first paying tenant signs OR August dry-run requires it |
| **MEP Construction demo posture decision** | ⏳ **NEXT** — Option A (trim to ≤5) or Option B (upgrade to ENTERPRISE/100). Recommendation: B. |
| Marketing site refresh (`constrai-landing/`) | ⏳ Conference-driven, June 15 → July 31 window |
| Reference-tenant data setup (1-2 fully-populated tenants beyond MEP) | ⏳ June 15 → July 31 window |
| Mobile build refresh (TestFlight) | ⏳ June 15 → July 31 window |
| **August dry-run + code freeze 2 weeks pre-conference** | ⏳ August 2026 |
| **September 2026 conference** | 🎯 Hard deadline (demo + sales). No live Stripe; admin shows `current_users / max_users` + manual upgrade link. Honest "professional-feel" UX per Section 113.11. |
| Phase 9-A — Module/Plugin System (Section 105 / 113.8) | ⏳ DESIGN can start July; BUILD post-conference Q4 2026 |
| Phase 9-B — Billing / Subscriptions (Section 113) | ⏳ Post-conference Q4 2026, parallel with 9-A. Full Stripe + webhook + state machine + Customer Portal + dunning + QST/GST tax. |
| Phase 7 — 2FA + biometric + PIN→password migration | ⏳ Q1 2027 |
| Phase 8 — Audit + compliance | ⏳ Pending |

---

## Backlog items still open (lower priority)

- **⏳ MEP Construction demo posture decision** (Section 114.5, May 23). The seed tenant is 50/5 over-cap on BASIC. Either trim seed employees or upgrade plan. ~15 min sql. Recommended Option B (upgrade to ENTERPRISE/100).
- **⏳ DO Spaces bucket `constrai-tenant-assets` activation** (Section 112.2, May 15). Phase 6-D-3 backend + frontend code is live but the bucket isn't created yet — deliberate deferral to skip the $5/month base fee until a real tenant requires branded onboarding. Full 4-step runbook in Section 112.2. Trigger to execute: first paying tenant signs OR August dry-run needs the upload UI working end-to-end. Until then: backend returns `500 SPACES_NOT_CONFIGURED` if called.
- **⏳ Phase 9-B — Billing / Subscriptions** (Section 113, May 16). Post-conference Q4 2026. Full Stripe Billing: state machine (TRIAL → ACTIVE → PAST_DUE → SUSPENDED → CANCELLED → DELETED) per 113.3, webhook handler at `POST /api/stripe/webhook` per 113.9, hybrid read-only-then-block suspension per 113.5, dunning emails per 113.5, Stripe Customer Portal, QST/GST tax compliance, idempotency table. Plan→price catalog from 113.6. Open questions for 9-B kickoff in 113.12.
- **⏳ Phase 9-A — Module / Plugin System** (Section 105, formalized in 113.8). Per-tenant feature-flag runtime. Post-conference Q4 2026, parallel with 9-B. Design can start in July if conference-prep bandwidth allows.
- **⏳ `mep-webhook` hardening** (Section 114.6, Pitfall #46). Optional: extend `mep-webhook` to detect new files in `migrations/` since previous HEAD and refuse to pull (or alert) until operator runs them. Not built today; cost-benefit not there for 1-tenant deployment, revisit before conference.
- **⏳ Soft-delete column on `employees` table** (Section 114.4 implicit). The seat-cap enforcement counts every employee row. When a UI flow exists to "remove" an employee, the WHERE clause should exclude soft-deleted rows. Today there is no such flow; row counts equal seats consumed.
- `routes/project_trades.js` redundant top-level `router.use(auth)`. Low.
- pg DeprecationWarning ("client.query() when the client is already executing a query"). Hygiene PR opportunity.
- Coverage threshold ratchet — current measured: Lines 63.66%, Branches 54.41%, Functions 62.18%, Statements 62.61%. Ratchet candidate when stable across 3 consecutive CI runs.
- **PIN → password migration** — Phase 7 candidate alongside 2FA + biometric. (Hedar reminder, Section 100 session.)
- **Mobile path migration off body refresh_token** — Phase 7 candidate alongside PIN→password.
- CSRF protection — currently `SameSite=Lax` covers the common threat surface. Layer a CSRF-token middleware if state-changing GET endpoints get added.
- `SENDGRID_FROM_EMAIL` env var name — optional future rename to `EMAIL_FROM`.
- Twilio/SendGrid dormant account — no cost; don't delete unless dropping the Twilio relationship.
- Stale GitHub blob `0512476` — remains in object DB until GC; no action (all credentials inside revoked).
- Mapbox "Default public token" — unused, can't delete (UI limitation). Benign.

---

## Pending items from leak remediation (Section 91)

**ALL items COMPLETE.** No leak-remediation work remains.

| Secret | Status |
|---|---|
| Cloudflare Origin Cert + Key | ✅ Rotated + deployed (Section 91) |
| Resend API key (`v2`) | ✅ Rotated (Section 92.5 / Pitfall #31) |
| `mepuser_super` DB pw | ✅ Rotated (Section 91) |
| `mepuser` DB pw | ✅ Rotated (Section 92.2) |
| `MAPBOX_ACCESS_TOKEN` | ✅ Rotated + leaked default refreshed (Section 92.2) |
| `JWT_SECRET` | ✅ Rotated (Section 93.1) |
| `ADMIN_API_KEY` + `AUTH_SECRET` | ✅ Deleted (dead env vars) |
| `SENDGRID_API_KEY` | ✅ Decommissioned (Section 98) |
| `SENTRY_DSN` | Optional — DSN is semi-public, skip unless misuse appears |

---

## Active credentials & secrets locations

All credentials live in **OneDrive `Constrai Keys` folder** (`C:\Users\Lenovo\OneDrive\Desktop\Constrai Keys\`). Files:

| Secret | File | Last rotated |
|---|---|---|
| Cloudflare Origin Certificate (May 7, 2041) | `Cloudflare Origin Certificate.txt` | 2026-05-11 |
| Cloudflare Origin Private Key | `Cloudflare Private Key.txt` | 2026-05-11 |
| Resend API key (`Constrai Prod 2026-05-11-v2`) | `Resend API key 2026-05-11.txt` | 2026-05-11 |
| `mepuser_super` DB pw | (saved in OneDrive) | 2026-05-11 |
| `mepuser` DB pw | (saved in OneDrive) | 2026-05-11 |
| `MAPBOX_ACCESS_TOKEN` (`Constrai Prod 2026-05-11`) | `Mapbox token 2026-05-11.txt` | 2026-05-11 |
| `JWT_SECRET` | `JWT_SECRET 2026-05-11.txt` | 2026-05-11 |

Prod `/var/www/mep/.env` is in sync. `SENDGRID_API_KEY` no longer present. `DO_SPACES_*` env vars not yet set (bucket activation deferred, Section 112.2).

Cost inventory + DigitalOcean Spaces + Apple Developer keys: see `RECOVERY.md`.

---

## Critical pitfalls (encoded from Sections 86–114)

1. **Bash sandbox file sync lag** — use Read tool to verify file state.
2. **Edit tool can silently lose changes** — Read each file immediately after Edit.
3. **Notepad adds `.txt` to filenames** silently. Use VS Code.
4. **Cloudflare cert/key copy can be swapped** — `head -3` to verify.
5. **CRLF + UTF-8 BOM break PEM parsing** — `dos2unix` before installing.
6. **`npm install --omit=dev` fails on husky** — use `--ignore-scripts`.
7. **Untracked file on server blocks `git pull`** — stash or delete first.
8. **PR auto-merge can flip dependency order** — manual control between dependent PRs.
9. **`gh pr merge` requires branch up-to-date** — `gh pr update-branch <num>` is the right tool when a PR ends up `BEHIND` mid-CI. Falls back to rebase + `--force-with-lease` only when update-branch fails.
10. **Don't open a new session before previous PRs merge** — wait for Merged status.
11. **Cherry-picking can cross feature branches** — verify `git branch --show-current` first.
12. **Replace this file at end of session, don't append** — long history goes in DECISIONS.md.
13. **RLS doesn't apply to BYPASSRLS roles** — use `SET LOCAL ROLE mepuser` in tests.
14. **CI uses `postgres` role for tests** — switch via `SET LOCAL ROLE`.
15. **`git checkout main` fails silently with dirty tree** — stash first.
16. **`git stash pop` can lose cleanly-applied files when there's a conflict elsewhere** — verify content after pop.
17. **PowerShell's bare `>` redirect uses UTF-16 with BOM** — always `Out-File -Encoding utf8`.
18. **GitHub web "Update branch" button creates duplicate squash commits** — never touch UI for a merged branch. The CLI equivalent `gh pr update-branch` is fine (Pitfall #9).
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
29. **NEVER `git add -A` in branches touching credentials** (Section 91) — explicit paths.
30. **NEVER paste `.env` contents/screenshots in any chat** (Section 91).
31. **Sed mask regex MUST include underscores** (Section 92.5) — `sed -E 's/=[A-Za-z0-9_.-]+$/=***/'`.
32. **Verify `pm2-root.service` is enabled BEFORE any planned reboot** (Section 93.4).
33. **Adding router primitives to a tested component requires updating its test wrapper** (Section 96.5).
34. **Never assume case homogeneity across legacy + generated text keys** (Section 97.6) — prefer `LOWER(col) = LOWER($1)`.
35. **Provider migration completeness audit before env-var decommission** (Section 98.6) — grep direct SDK references AND legacy env-var references before declaring scope.
36. **Verify current branch before commit/push during parallel work** (Section 101.3) — `git branch --show-current` before EVERY commit.
37. **Compare pg `bigint` columns via `String()` on both sides in assertions** (Section 103.2). Universal form: `expect(String(res.body.<x>)).toBe(String(seed.<id>))`.
38. **Every deploy that touches `package.json` MUST run `npm ci` on the server BEFORE `pm2 restart`** (Section 104, May 14 incident; updated Section 107.3 with frontend rebuild). Mandatory FULL deploy block (backend AND frontend) — paste verbatim:
    ```bash
    cd /var/www/mep
    git pull origin main
    # Backend deps + restart
    npm ci --omit=dev --ignore-scripts
    pm2 restart mep-backend
    sleep 3
    # Frontend rebuild (Pitfall #41 — git pull alone does NOT rebuild the Vite bundle)
    cd mep-frontend
    npm ci --ignore-scripts
    npm run build 2>&1 | tail -10
    cd /var/www/mep
    # Verify
    pm2 status mep-backend
    curl -sS -o /dev/null -w "Health: %{http_code}\n" https://app.constrai.ca/api/health
    grep -oE 'main-[A-Za-z0-9_-]+\.js' /var/www/mep/mep-frontend/dist/index.html | head -1
    pm2 logs mep-backend --lines 15 --nostream
    ```
    Sub-Pitfall: PM2's `↺ N` restart counter does NOT reset on a manual `pm2 restart`; a high `↺` value is historical and not a sign of a current loop. Use `cpu > 0%` + `memory > 50mb` + `Health: 200` as the real "alive" signal.
39. **Every `/api.js` auth-related state machine needs a "we're already there" guard** (Section 106.4, May 15). Before any `window.location.href = TARGET`, check `if (window.location.pathname !== TARGET) { ... }`.
40. **DNS negative caching survives the record fix and is per-resolver** (Section 107.2, May 15). Don't pre-query a subdomain before its DNS record exists. For stuck cache: use different resolver (Google `8.8.8.8`) or wait the TTL.
41. **`git pull` does NOT rebuild the Vite frontend** (Section 107.3, May 15). `mep-frontend/dist/` is a STATIC artifact. Always include `cd mep-frontend && npm ci --ignore-scripts && npm run build` after every `git pull` that touches frontend source. Fix encoded in Pitfall #38 deploy block.
42. **Don't use `lib/auth_utils` for ad-hoc shell hashing** (Section 107.4, May 15). Use `bcrypt` directly + guard with `[ -n "$HASH" ]` before any UPDATE.
43. **Edit tool can fail on certain repo paths; fall back to `mcp__workspace__bash` on the Linux mount** (Section 108.4, May 15). Workaround: write/edit via the bash Linux mount path.
44. **DB column duplication + verify field-name chain end-to-end before consuming an API field** (Section 110.2, May 15). 3-point chain check: psql `\d <table>` for columns → curl the endpoint for response field → grep frontend lib for property name. All three must match.
45. **(NEW — Section 114) `psql <db>` as Linux root needs `sudo -u postgres psql <db>` for peer auth.** Bare `psql mepdb -f migration.sql` run as Linux root fails with `FATAL: role "root" does not exist` (peer auth, no PG role named root). Every migration command on prod MUST be prefixed:
    ```bash
    sudo -u postgres psql mepdb -f /var/www/mep/migrations/NNN_name.sql
    ```
    CLAUDE.md §7 mentions this for backup restoration; now elevated to a numbered Pitfall because the same trap fires for any migration run as root.
46. **(NEW — Section 114) `mep-webhook` auto-pulls main but does NOT run migrations or restart pm2.** The droplet runs a `mep-webhook` pm2 process (id 0) that fires on push to main and runs `git pull origin main`. This is why a fresh SSH session typically reports `Already up to date.` immediately after a merge — the webhook beat you. **Dangerous when a PR contains schema changes:** source code references new columns, the webhook auto-pulls, but the next `pm2 restart` (for any reason) activates the new code without the schema being migrated → instant 500s. **Mitigation:** the manual deploy block (Pitfall #38) is non-negotiable for any PR that touches `migrations/`. The webhook only handles "fetch latest source", never "make new source effective".
47. **(NEW — Section 114) testing-library `getByText` only matches direct text children, not descendants.** When visual text is split across child elements (e.g., `<p>{a} <span>/</span> {b}</p>`), `getByText('a / b')` fails — RTL inspects each element's direct text content separately, not the wrapper's descendant-included `textContent`. Regex (`getByText(/^a\s*\/\s*b$/)`) hits the same limitation. Fixes (in order of preference): (1) function matcher walking textContent — `screen.getByText((_, el) => el?.tagName === 'P' && el.textContent.replace(/\s+/g,' ').trim() === 'a / b')`; (2) `data-testid` + `getByTestId`; (3) restructure to a single text node (loses ability to style separator). Related sub-trap: pass through backend's `message_en`/`message_fr` rather than maintaining parallel static dict text — backend messages contain live data the dict can't replicate.

---

## Workflow rules (CLAUDE.md highlights)

- **One command at a time** in chat — one PowerShell or bash block per turn.
- **Flow diagrams only for substantive architectural discussions** — not routine ops.
- **Levantine Arabic in chat** — `شو`, `هلق`, `بدك`, `لازم`, `منيح`, `بسيط`. `شغّل` (not `ركض`). `يفتل` for CI/auto-merge churn (Hedar idiom — "it's spinning"). Masculine address.
- **GitHub CLI + auto-merge** — `gh pr create --fill --base main ; gh pr merge --auto --squash --delete-branch`. If a PR ends up `BEHIND` main mid-CI, `gh pr update-branch <num>` is the right escape (Pitfalls #9 / #18).
- **ALWAYS delete the local branch after merge** — `--delete-branch` only removes the remote.
- **Don't put `"تم"` inside PowerShell blocks** — Hedar types it manually.
- **File-based log convention for large output** — `Out-File -Encoding utf8` (NEVER bare `>`).
- **DECISIONS.md is the archive**, not the entry point.
- **Verify current branch before commit/push during parallel work** — `git branch --show-current` before every commit (Section 101.3 / Pitfall #36).
- **Parallel work pattern** — when waiting on CI, prep next-PR code on a separate local branch (don't push). Saves 5–6 min/PR.
- **bigint vs Number in test assertions** — compare via `String()` on both sides (Section 103.2 / Pitfall #37).
- **(NEW — Section 114) Migrations on prod ALWAYS via `sudo -u postgres psql`**, never bare `psql`. Pitfall #45.
- **(NEW — Section 114) `mep-webhook` auto-pulls main but doesn't migrate/restart** — manual deploy block still mandatory for any PR touching `migrations/`. Pitfall #46.

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
- `DECISIONS.md` — full decision history (13,400+ lines after Section 114). Search by Section number.
- `RECOVERY.md` — credentials inventory, cost summary.
- `SCHEMA.md` — DB schema reference.
- `API.md` — backend endpoint reference.
- `.env.example` — required env variables.
- `migrations/*.sql` — DB migration files (latest is 017, max_users seat-cap).
- `.github/workflows/ci.yml` — CI pipeline definition.

---

**Maintainer:** Hedar Hallak (hedar.hallak@gmail.com) | **Repo:** hedarhallak/mep-platform | **Production:** https://app.constrai.ca
