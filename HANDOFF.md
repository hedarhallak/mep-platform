# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 26, 2026 ~14:00 UTC — **✅ Phase 6-D-4 COMPLETE.** All 5 PRs of the billing schema implementation phase shipped, deployed, verified. The Section 117.7 scope (originally one PR 3) ended up split across PRs #266 (migration 020 grants), #267 (seat-change + apply-change + Resend), and #268 (training/custom-demands/payments + invoice numbering + tax helpers + migration 021 GST scale fix). All Section 118 closeout.
>
> **2 new pitfalls this session:**
> - **#50** — GitHub Actions silently reset `default_workflow_permissions` to `read` mid-session, causing 403 on git clone in every workflow job. Fix: `gh api -X PUT /repos/<owner>/<repo>/actions/permissions/workflow -f default_workflow_permissions=write`. Add a check to end-of-session checkpoint.
> - **#51** — Don't propose pause/break between agreed work items. Hedar decides when to stop. Once a plan is agreed, execute it through; only surface decisions if an architectural choice opens up.
>
> **ci.yml change:** `workflow_dispatch:` trigger added permanently — `gh workflow run "CI" --ref <branch>` works for emergency manual runs.
>
> **Next code task: Phase 6-D-5** — Customer-facing Subscription/Billing UI. Subscription page with Request seat change form (hybrid workflow per Section 117.4), Invoices list page, bracket + per-seat price display. Estimated 1-2 weeks per conference roadmap.

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

3. **Admin Branding page smoke (Sections 114 + 117 + 118):** `admin.constrai.ca/login` → login `hedar.hallak@gmail.com` / PIN `hedar2026` → CompaniesList → click `Branding →` on MEP Construction. Should see:
   - Seat counter `50 / 5` amber
   - **Plan line:** `Plan: BASIC · Bracket 1-5 ($27.00/seat/mo) · At capacity — new invites will be rejected with HTTP 402.`
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

6. **Only after all five are green**, continue with the regular task list below.

---

## 🎯 Strategic context — September 2026 conference (hard deadline)

> **~3.5 months runway from May 26, 2026.** Conference demo + sales readiness by September. ~3 months of build + 2 weeks of code freeze before conference.

**Roadmap to conference (Sections 105 / 114 / 115 / 116 / 117 / 118):**

| Window | Focus | Phases |
|---|---|---|
| **May 15 — May 26** | Branding stack + pricing model lock + schema build | ✅ Phase 6-D-3 (Section 114) → ✅ Section 115 pricing → ✅ Section 116 schema → ✅ **Phase 6-D-4 PR 1-5 ALL SHIPPED (Section 118)** |
| **Late May — mid-June 2026** | Customer-facing billing UI | ⏳ **Phase 6-D-5 (THIS SESSION NEXT)** — Subscription page with seat-change request form, Billing/Invoices list (~2 weeks) |
| **Mid-June — early July 2026** | SUPER_ADMIN training/quotes UI | ⏳ **Phase 6-D-6** — Subscription detail with Apply Change form, Training Quotes, Custom Demands, Payments Log (~1-2 weeks) |
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
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 118, Phase 6-D-4 COMPLETE — all 5 PRs deployed, next code task is Phase 6-D-5 customer-facing Subscription UI)
   ```
4. **Open with Phase 6-D-5 as the active priority.** Scope (full design TBD with Hedar at session start):
   - **Customer-facing Subscription page** at `app.constrai.ca/subscription` (or `mep.constrai.ca/subscription` per Pattern B). Renders current bracket + per-seat price + plan + seat usage + Request seat change form per Section 117.4 hybrid workflow.
   - **Customer-facing Billing/Invoices page** — lists invoices (training quotes, recurring, custom demands) with status + amount + download link.
   - **mailto: button wiring** — Request seat change → POST `/api/admin/subscription/seat-request` (already shipped) → returns mailto URL → JS opens user's email client.
   - **Bilingual EN/FR** per i18n Tier 3 (deferred from Section 81).
   - Estimated: 1-2 weeks (Section 118 roadmap).

   Then ask Hedar one of:
   - "Start Phase 6-D-5 by sketching the Subscription page wireframe?" — recommended first step
   - "Or do you want to demo the Phase 6-D-4 endpoints via curl first to confirm the API contracts?"

---

## Pending tasks at session start (NEXT MAJOR CODE TASK)

### 🎯 Phase 6-D-5 — Customer-facing Subscription/Billing UI

**Scope** (will be locked in at session start):
- Subscription page: current bracket + price + plan + seat usage + Request seat change form + Request cancel + Request plan upgrade.
- Billing/Invoices page: list of invoices with type (SUBSCRIPTION_RECURRING / TRAINING / CUSTOM_DEMAND / OTHER) + status + amount + issue date.
- Wire all 3 customer-facing endpoints (`/api/admin/subscription/seat-request|cancel-request|plan-upgrade-request`) into the UI forms.
- Bilingual EN/FR labels.
- COMPANY_ADMIN-only access.

**Critical references during implementation:**
- Section 115.3 (revised bracket prices, revised self-serve → hybrid)
- Section 117.4 (hybrid audit chain design — UI side now needs implementation)
- Section 118.2 (PR 4 endpoint contracts — body shapes + mailto URL return)
- `API.md` Section 14 (full billing endpoint reference)

**Critical pitfalls to avoid:**
- Pitfall #38 — package.json changes require npm ci on prod
- Pitfall #44 — verify field-name chain end-to-end (psql → curl → frontend lib)
- Pitfall #46 — mep-webhook auto-pulls but doesn't migrate/restart
- Pitfall #50 (NEW) — verify `default_workflow_permissions` is `write` before assuming CI failures are code issues
- Pitfall #51 (NEW) — don't propose pause/break between agreed work items

### After Phase 6-D-5: continues per roadmap (Phase 6-D-6/7/8)

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
| Latest deployed to prod | **Phase 6-D-4 PR 5 — SUPER_ADMIN training/custom-demands/payments + invoice numbering + tax helpers + migration 021** — PR #268, May 26. Backend bundle restart only (no frontend bundle change). |
| Last merged to main | **PR #268** (Phase 6-D-4 PR 5 — final, May 26). |
| Active program | **Phase 6-D-4 COMPLETE.** Next is Phase 6-D-5 (customer UI). |
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
| **Section 118 — Phase 6-D-4 COMPLETE + Pitfalls #50/#51 + ci.yml workflow_dispatch** | ✅ **Recorded (this session)** |
| **Phase 6-D-5 — Customer-facing billing UI (Subscription page with request form)** | ⏳ **NEXT (next session)** |
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

- **⏳ Phase 6-D-5** (next code task) — customer-facing Subscription + Billing pages.
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
