# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 25, 2026 ~02:30 UTC — **✅ Phase 6-D-4 PR 1+2 SHIPPED + 3 strategic revisions to Section 115.** PR #260 (migrations 018+019 — billing schema + backfill) and PR #261 (application refactor to read from subscriptions table) merged and deployed. Browser-verified end-to-end on `admin.constrai.ca/companies/5/branding` — bracket label + per-seat price now appears alongside the seat counter. Hot-fix applied during PR 1 deploy (Pitfall #49 — postgres-owned tables need explicit GRANTs); permanent fix migration 020 planned for PR 3.
>
> **3 Section 115 revisions documented in Section 117:** (1) bracket prices revised mid-PR-1 from $24/$22/$20/$19/$18 to **$27/$25/$24/$23/$22** ($22 floor); (2) training "mandatory" clarified — initial signup only, additional employees optional; (3) seat-change workflow shifted from pure self-serve to **hybrid DB-audit + email** for legal denial-of-request defense (5-source audit chain via audit_logs immutability).
>
> **Next code task: Phase 6-D-4 PR 3** — Migration 020 (GRANTs + ALTER DEFAULT PRIVILEGES) + seat-request audit endpoints + SUPER_ADMIN training quote + invoice numbering + tax lookup. Scope expanded from 4-5h to 6-8h.
>
> **1 new pitfall this session — #49** (tables created via `sudo -u postgres psql` are owned by postgres; mepuser + mepuser_super need explicit GRANTs).

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

3. **(Section 114 + Section 117) Admin Branding page smoke:** `admin.constrai.ca/login` → login `hedar.hallak@gmail.com` / PIN `hedar2026` → CompaniesList → click `Branding →` on MEP Construction. Should see:
   - Seat counter `50 / 5` amber
   - **Plan line:** `Plan: BASIC · Bracket 1-5 ($27.00/seat/mo) · At capacity — new invites will be rejected with HTTP 402.`
   - The bracket label + per-seat price prove the PR #261 subscription LEFT JOIN refactor is live.

4. **(Section 117 NEW) Verify GRANTs survive any DB restore:** if a backup was restored OR the DB was rebuilt since this session, the 5 billing tables (subscriptions/seat_changes/invoices/payments/tax_rates) need to be regranted to mepuser + mepuser_super. Quick check:
   ```bash
   sudo -u postgres psql mepdb -c "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ('subscriptions','subscription_seat_changes','invoices','payments','tax_rates') AND grantee LIKE 'mep%' ORDER BY table_name, grantee, privilege_type;"
   ```
   Expected: 40 rows (5 tables × 4 privileges × 2 roles). If <40, re-run the hot-fix block from Section 117.5.

5. **Only after all four are green**, continue with the regular task list below.

---

## 🎯 Strategic context — September 2026 conference (hard deadline)

> **~4 months runway from May 25, 2026.** Conference demo + sales readiness by September. ~3.5 months of build + 2 weeks of code freeze before conference.

**Roadmap to conference (Sections 105 / 114 / 115 / 116 / 117):**

| Window | Focus | Phases |
|---|---|---|
| **May 15 — June 15** | Branding stack + pricing model lock + schema build | ✅ Phase 6-D-3 (Section 114) → ✅ Section 115 pricing → ✅ Section 116 schema → ✅ Phase 6-D-4 PR 1+2 → ⏳ **Phase 6-D-4 PR 3** (this session next) |
| **June 2026** | Customer-facing billing UI | ⏳ **Phase 6-D-5** — Subscription page with seat-change request form, Billing/Invoices list (~2 weeks) |
| **June-July 2026** | SUPER_ADMIN training/quotes UI | ⏳ **Phase 6-D-6** — Subscription detail with Apply Change form, Training Quotes, Custom Demands, Payments Log (~1-2 weeks) |
| **July 2026** | Invoice email automation + cron | ⏳ **Phase 6-D-7** — Monthly invoice cron, trial expiry emails, HTML email invoices (PDF deferred per scope-cut option) (~1-2 weeks) |
| **July-August 2026** | Marketing + reference tenant + training materials | ⏳ **Phase 6-D-8** — Marketing site refresh, ToS legal review, reference tenant data, **modular training materials** (per Section 117.6 design guidance) (~2 weeks parallel) |
| **August** | Pre-conference dry-run + code freeze | E2E rehearsal, bug fix only, 2-week freeze |
| **September** | **Conference** | Demo + sales. Manual billing (Hedar invoices manually, bank transfer/cheque) |
| **Post-conference (Q4 2026)** | Phase 9-A Module System + Phase 9-B Stripe + dunning | Real card payments, auto state transitions, customer portal |
| **Q1 2027** | Phase 7 — Security maturity | 2FA + biometric + PIN→password |

**What this implies for session priority order:**
1. **Operational stability first** (URGENT FIRST CHECK every session).
2. **Phase 6-D-4 PR 3 next** — closes the schema implementation phase.
3. **Phase 6-D-5/6/7 in sequence** — customer UI, then SUPER_ADMIN UI, then email automation.
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
   - `DECISIONS.md` — read ONLY the latest 2-3 sections (the file is now 14,400+ lines). Latest section is **117** (Phase 6-D-4 PR 1+2 shipped + 3 revisions to Section 115). Also relevant: 116 (schema design), 115 (pricing model lock — note 115.3 brackets + 115.7 training mandatory + 115.3 self-serve all REVISED in 117).
   - `RECOVERY.md` Section 2.4 only if relevant
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 117, Phase 6-D-4 PR 1+2 deployed with Pitfall #49 hot-fixed, next code task is PR 3 with expanded scope)
   ```
4. **Open with Phase 6-D-4 PR 3 as the active priority.** Updated scope (see Section 117.7):
   - **Migration 020** — GRANTs on billing schema + ALTER DEFAULT PRIVILEGES (Pitfall #49 permanent fix)
   - **Customer-facing endpoints** — POST seat-request, cancel-request, plan-upgrade-request (hybrid audit pattern)
   - **SUPER_ADMIN endpoints** — POST apply-change, training quote, custom-demands quote, manual payments record, extend-trial
   - **Helpers** — sequential invoice numbering, tax rate lookup
   - **Resend integration** — auto-email confirmation on subscription change apply
   - Estimated: ~6-8 hours

   Then ask Hedar one of:
   - "Start with migration 020 (Pitfall #49 fix)?" — recommended first step
   - "Or do you want to revisit any Section 117 decision first?"

---

## Pending tasks at session start (NEXT MAJOR CODE TASK)

### 🎯 Phase 6-D-4 PR 3 — Migration 020 + seat-request endpoints + SUPER_ADMIN training/payments + numbering/tax helpers

**Scope:** see Section 117.7 for full table. Combines the PR 3 original scope (training quotes, payments, numbering, tax) with the new seat-change request endpoints (Section 117.4 hybrid model) + Pitfall #49 grants migration.

**Estimated effort:** 6-8 hours total, suggest split into ~3-4 commits within one PR.

**Suggested commit order:**
1. Migration 020 — billing schema GRANTs + ALTER DEFAULT PRIVILEGES (`sudo -u postgres psql`)
2. Customer-facing seat-change request endpoints (POST seat-request, cancel-request, plan-upgrade-request) — all use audit_logs for request side
3. SUPER_ADMIN apply-change endpoint + Resend confirmation email helper + integration tests
4. SUPER_ADMIN training quote / custom demands / payments / extend-trial endpoints
5. Invoice numbering function + tax rate lookup helper + unit tests

**Critical references during implementation:**
- Section 115.3 (revised bracket prices, revised self-serve → hybrid)
- Section 115.4 (training fees structure — unchanged)
- Section 115.7 (training mandatory — initial only per Section 117.3)
- Section 116.4-116.6 (invoice + payment + tax schema shapes)
- Section 117.4 (hybrid audit chain design)
- Section 117.5 (Pitfall #49 GRANT pattern)

**Critical pitfalls to avoid:**
- Pitfall #38 — package.json changes require npm ci on prod
- Pitfall #45 — migration 020 needs `sudo -u postgres psql`
- Pitfall #46 — mep-webhook auto-pulls but doesn't migrate/restart
- Pitfall #48 — quote numerical commitments verbatim from source
- Pitfall #49 (NEW) — every new table created via sudo -u postgres needs explicit GRANTs

### After Phase 6-D-4 PR 3: continues per roadmap (Phase 6-D-5/6/7/8)

---

## Current state (snapshot)

| Item | Value |
|---|---|
| Production URL | `https://app.constrai.ca` |
| Admin portal | `https://admin.constrai.ca` (SUPER_ADMIN only) |
| Tenant subdomain | `https://mep.constrai.ca` (DNS live, nginx wildcard) |
| Login (test) | `hedar.hallak@gmail.com` / PIN `hedar2026` (SUPER_ADMIN) |
| Server SSH | `ssh root@143.110.218.84` (Ubuntu 24.04) |
| Backend | Node.js + Express + Postgres 16, pm2 at `/var/www/mep`. invite-employee reads from `subscriptions.subscribed_seats` (Section 117 refactor). GET /super/companies/:id LEFT JOINs subscriptions. |
| Frontend | React + Vite + Tailwind v4. CompanyBranding.jsx shows bracket + per-seat price (Section 117 refactor). |
| Latest deployed to prod | **Phase 6-D-4 PR 2 — application refactor (Section 117)** — PR #261, May 24. Frontend bundle `main-DvMeFYgC.js`. Migrations 018+019 from PR #260 also live. Hot-fix GRANTs applied per Pitfall #49. |
| Last merged to main | **PR #261** (Phase 6-D-4 PR 2 refactor, May 24). |
| Active program | **Phase 6-D-4 PR 1+2 SHIPPED.** PR 3 next (Section 117.7 scope). |
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
| **Section 117 — Phase 6-D-4 PR 1+2 closeout + 3 revisions to S115 + Pitfall #49** | ✅ **Recorded (this session)** |
| **Phase 6-D-4 PR 3 — Migration 020 GRANTs + seat-request audit endpoints + SUPER_ADMIN endpoints + numbering/tax helpers** | ⏳ **NEXT (this session continues OR next session)** |
| Phase 6-D-5 — Customer-facing billing UI (Subscription page with request form) | ⏳ June 2026 |
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

- **⏳ Phase 6-D-4 PR 3** (next code task) — see "Pending tasks" above. Migration 020 + seat-request endpoints + SUPER_ADMIN endpoints + helpers. 6-8h.
- **⏳ Modular training materials** (Section 117.6) — design materials by topic (concepts, workflows, UI walkthroughs) with versioning. Concepts deck = stable 80%, refresh quarterly. UI deck = re-record per release. Tag materials with product version. Anchor training on CORE workflows not specific screens (product evolves fast).
- **⏳ MEP Construction demo posture** — Now achievable via SUPER_ADMIN Apply Change endpoint when PR 3 ships. Recommended: bump MEP to ENTERPRISE plan with subscribed_seats=100, removes the over-cap amber warning.
- **⏳ DO Spaces bucket activation** (Section 112.2). Trigger: first paying tenant OR August dry-run needs upload UI end-to-end.
- **⏳ Phase 9-B — Stripe integration** (Q4 2026). Full Stripe Billing + webhook + state machine + Customer Portal + dunning + QST/GST tax automation.
- **⏳ Phase 9-A — Module/Plugin System** (Q4 2026, parallel with 9-B). Per-tenant feature toggles + modular add-on billing.
- **⏳ Annual billing logic** — Schema ready (Section 116); cron logic deferred to Phase 6-D-7 or 9-B.
- **⏳ Inbound email ingestion for true Message-ID threading** (Section 117.4 Interpretation 1) — if "Re:" subject pattern (Interpretation 2) generates customer complaints, upgrade. Resend Inbound or Mailgun Routes (paid). Defer until problem proven.
- **⏳ `mep-webhook` hardening** (Pitfall #46) — extend to detect new `migrations/` files and refuse pull / alert until operator runs them.
- **⏳ Soft-delete column on `employees` table** — needed when "remove employee" UI flow lands.
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

## Critical pitfalls (encoded from Sections 86–117)

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
40. **DNS negative caching survives the record fix and is per-resolver** — don't pre-query a subdomain before its DNS record exists.
41. **`git pull` does NOT rebuild the Vite frontend** — always include `cd mep-frontend && npm ci --ignore-scripts && npm run build`.
42. **Don't use `lib/auth_utils` for ad-hoc shell hashing** — use `bcrypt` directly + guard with `[ -n "$HASH" ]`.
43. **Edit tool can fail on certain repo paths; fall back to `mcp__workspace__bash` on the Linux mount**.
44. **DB column duplication + verify field-name chain end-to-end** — psql `\d <table>` → curl endpoint → grep frontend lib.
45. **`psql <db>` as Linux root needs `sudo -u postgres psql <db>` for peer auth**:
    ```bash
    sudo -u postgres psql mepdb -f /var/www/mep/migrations/NNN_name.sql
    ```
46. **`mep-webhook` auto-pulls main but does NOT run migrations or restart pm2** — fresh SSH session after a merge typically reports `Already up to date.` because the webhook beat you. Manual deploy block (Pitfall #38) is non-negotiable for any PR touching `migrations/`.
47. **testing-library `getByText` only matches direct text children, not descendants** — for `<p>{a} <span>/</span> {b}</p>`, use a function matcher walking `textContent`.
48. **When restating decisions from prior messages, quote source verbatim — never summarize numerical commitments.** Forces correct copy-paste of dollar amounts, exact configuration values, payment terms, etc. Avoids "I think it was around $20" drift.
49. **(NEW — Section 117) Tables created via `sudo -u postgres psql` are owned by postgres; mepuser + mepuser_super get ZERO privileges automatically.** This is the standard Postgres behavior — new tables grant nothing to non-owners unless explicit GRANT statements are issued. The failure mode is `permission denied for table X` (Postgres code 42501) at runtime. Two prevention strategies, apply both:
    1. **In-migration GRANTs** (per-migration responsibility — bundle in same migration SQL):
       ```sql
       CREATE TABLE public.new_table (...);
       GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_table TO mepuser;
       GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_table TO mepuser_super;
       GRANT USAGE, SELECT ON SEQUENCE public.new_table_id_seq TO mepuser;
       GRANT USAGE, SELECT ON SEQUENCE public.new_table_id_seq TO mepuser_super;
       ```
    2. **`ALTER DEFAULT PRIVILEGES`** (cluster-wide, one-time setup — applied in migration 020):
       ```sql
       ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mepuser, mepuser_super;
       ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
         GRANT USAGE, SELECT ON SEQUENCES TO mepuser, mepuser_super;
       ```
    Strategy #2 is cleaner long-term but doesn't retro-apply (only new tables after the ALTER). Use both as belt-and-suspenders. Verification command after any migration that creates tables:
    ```bash
    sudo -u postgres psql mepdb -c "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ('<NEW_TABLES>') AND grantee LIKE 'mep%' ORDER BY table_name, grantee, privilege_type;"
    ```

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
- `DECISIONS.md` — full decision history (14,400+ lines after Section 117). Search by Section number.
- `RECOVERY.md` — credentials inventory, cost summary.
- `SCHEMA.md` — DB schema reference.
- `API.md` — backend endpoint reference.
- `.env.example` — required env variables.
- `migrations/*.sql` — DB migration files (latest is 019; 020 planned in PR 3 for grants).
- `.github/workflows/ci.yml` — CI pipeline definition.

---

**Maintainer:** Hedar Hallak (hedar.hallak@gmail.com) | **Repo:** hedarhallak/mep-platform | **Production:** https://app.constrai.ca
