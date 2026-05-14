# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 14, 2026 ~11:30 UTC — **Phase 6-C frontend branding bootstrap shipped.** Continuation thread that also closed SendGrid decommission. Today's PRs: #227 (s98 refactor — remove SENDGRID_API_KEY route-level refs), #228 (s98 docs + Pitfall #35), #229 (s99 Phase 6-C frontend bootstrap). DECISIONS Sections 98 + 99 added. Tenant subdomain `<code>.constrai.ca` now loads brand color before React mounts; HTTP cache makes repeat visits ~10ms. Leak remediation FULLY CLOSED. **Next task: Phase 6-D — login response redirect_url + logo swap + admin upload UI.**

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
   - `DECISIONS.md` (read ONLY the latest 2-3 sections referenced below — DON'T read the whole 11,000+ line file). Latest section is **99** (Phase 6-C frontend branding bootstrap). Also relevant: 98 (SendGrid decommission + Pitfall #35), 97 (Phase 6-B closeout + Pitfall #34). **IMPORTANT:** Read DECISIONS.md via the Read tool ONLY (never `bash tail` / `grep`) — Cowork bash mount can lag and miss recently merged sections (Section 96.6 explains; cost us PR #222).
   - `RECOVERY.md` Section 2.4 only if relevant
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 99, Phase 6-C frontend branding bootstrap shipped, next is Phase 6-D admin upload UI + login redirect_url)
   ```
4. **Confirm the next task** in 1-2 lines.
5. **Ask if Hedar is ready to start**, then wait.

---

## Current state (snapshot)

| Item | Value |
|---|---|
| Production URL | `https://app.constrai.ca` |
| Admin portal | `https://admin.constrai.ca` (SUPER_ADMIN only) |
| Login (test) | Email: `hedar.hallak@gmail.com` / PIN: `hedar2026` (SUPER_ADMIN) |
| Server SSH | `ssh root@143.110.218.84` (Ubuntu 24.04 — kernel up-to-date as of May 11, reboot banner cleared) |
| Backend | Node.js + Express + Postgres 16, pm2-managed at `/var/www/mep`. pm2 systemd auto-start configured (Section 93.3). |
| Frontend | React + Vite + Tailwind v4 — branding bootstrap shipped (Section 99) |
| Latest deployed to prod | **Phase 6-C frontend branding bootstrap** — `mep-frontend/src/lib/branding.js` lives in the built bundle; tenant subdomain `<code>.constrai.ca` will load brand color pre-React once the nginx wildcard vhost is verified. Prior deploys still live: SendGrid decommission (May 14 ~10:14), Phase 6-B endpoint, Phase 5.1 Create Company UI. |
| Last merged to main | PR #229 (Phase 6-C frontend bootstrap). Section 99 docs PR follows (this commit). |
| Active program | **Multi-Tenant Migration — Phase 6-D (admin upload UI + login redirect_url + logo swap) is next.** Phase 5 + 6-A + 6-B + 6-C all FULLY closed. Leak remediation FULLY CLOSED. |
| Mobile app | Still on legacy username login — backend keeps backward-compat |

### Multi-tenant migration progress

| Phase | Status |
|---|---|
| Section 85 — Architecture | ✅ Done |
| Phase 1 — Cloudflare + Origin SSL | ✅ Deployed (+ origin cert rotated May 11) |
| Phase 2 — Tenant Resolver | ✅ No-op (Model C) |
| Phase 3 — DB schema 011 + email login | ✅ Deployed |
| Phase 4a — RLS Stage 1 | ✅ Deployed |
| Phase 4b — RLS Stage 2 | ✅ Deployed |
| Phase 4c — RLS Stage 3 | ✅ Deployed and restored after 90-F outage |
| Phase 5 — SUPER_ADMIN portal split | ✅ FULLY CLOSED (May 13) |
| Email migration SendGrid → Resend | ✅ FULLY DECOMMISSIONED (Section 98) |
| Phase 6-A — companies branding columns (migration 014) | ✅ DEPLOYED |
| Phase 6-B — public `GET /api/companies/:code/branding` | ✅ DEPLOYED + smoke-verified (May 13) |
| Phase 6-C — Frontend bootstrap reads branding + applies CSS vars | ✅ **DEPLOYED (May 14, Section 99)** |
| **Phase 6-D — Admin upload UI + login redirect_url + logo swap** | ⏳ **Next** |
| Phase 7 — 2FA + biometric + account security | ⏳ Pending |
| Phase 8 — Audit + compliance | ⏳ Pending |

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
| `ADMIN_API_KEY` + `AUTH_SECRET` | ✅ Deleted (dead env vars, audit-and-delete) |
| `SENDGRID_API_KEY` | ✅ DECOMMISSIONED (Section 98) — code refs removed, env var deleted, dashboard key deleted |
| `SENTRY_DSN` | Optional — DSN is semi-public, skip unless misuse appears |

---

## Next task: Phase 6-D — Admin upload UI + login redirect_url + logo swap

Phase 6-C shipped the frontend bootstrap (tenant subdomain → brand color from `<style>` injection at `:root`). Phase 6-D closes the multi-tenant branding loop with the remaining three pieces. Likely splits into 2–3 sub-PRs depending on appetite.

**Scope (3 sub-pieces, sequenceable in any order):**

1. **Login response `redirect_url`** (backend + frontend, small)
   - Backend `POST /api/auth/login` returns `{ ok, token, refresh_token, user, company: { code, name }, redirect_url: 'https://<code>.constrai.ca/dashboard?...token...' }`.
   - Frontend on `app.constrai.ca/login`: after successful login, `window.location.assign(redirect_url)` so the browser hops to the tenant subdomain. The tenant's bootstrap (Section 99) then re-loads the page on the new origin with branding applied.
   - Tests: login response shape includes redirect_url; frontend hops on successful login.

2. **Logo swap on LoginPage** (frontend, small)
   - `mep-frontend/src/pages/auth/LoginPage.jsx` reads `window.__BRANDING__.brand_logo_url`. When non-null, render the tenant logo `<img>` in place of the Constrai logo. Null → Constrai default stays.
   - Optionally wrap `window.__BRANDING__` in a small React Context (`BrandingContext` in `src/contexts/`) so later components can read it without touching window.
   - Tests: render branch with logo URL set + null fallback render branch.

3. **Admin upload UI + DigitalOcean Spaces pipeline** (full-stack, medium)
   - Admin portal screen: SUPER_ADMIN selects a company, sees current branding, can pick a new `brand_color` (color picker) and upload a new `brand_logo_url` (logo file).
   - Backend: `PATCH /api/admin/companies/:id/branding` (SUPER_ADMIN-only) — accepts color hex + uploaded logo file. Logo upload goes through multer → DigitalOcean Spaces (`constrai-branding` bucket, TOR1, public-read CDN). Returns the public CDN URL to persist in `companies.brand_logo_url`.
   - DO Spaces setup: new bucket `constrai-branding` (separate from `constrai-backups` for clarity + ACL boundaries), CDN endpoint enabled, access keys saved to OneDrive + prod `.env`.
   - Tests: PATCH endpoint guards (SUPER_ADMIN only, hex color validation, file size + mime), logo upload happy path.

**Decisions to make at session start:**
- Sub-piece order. Recommended: redirect_url first (unblocks Pattern B email-routing), then logo swap (low-cost visual polish), then admin upload UI last.
- Color picker library — `react-colorful` (3kb, popular) vs raw `<input type="color">` (zero deps, less polish).
- DO Spaces bucket name + region — propose `constrai-branding` in TOR1 (same region as `constrai-backups`).

**Out of scope (later phases):**
- Color shades (`--color-primary-dark`, etc.) — compute via HSL or CSS `color-mix()`. Phase 6-E or hygiene.
- Mobile app branding — separate phase.
- nginx wildcard vhost for `*.constrai.ca` — operational task, see below.

**Estimated effort:** sub-piece 1 + 2 = ~1.5 hours together; sub-piece 3 = ~3-4 hours (UI + Spaces setup + backend route + tests). Branch name suggestion: `feat/s100-phase6d-login-redirect-and-logo`.

---

## Operational follow-up (Phase 6-C tail)

- **Verify nginx wildcard vhost for `*.constrai.ca`** before declaring tenant subdomains production-ready. Currently nginx has explicit blocks for `app.constrai.ca` and `admin.constrai.ca`. The wildcard config (or one block per onboarded tenant) needs to exist before `acm.constrai.ca` actually resolves to the backend. Cloudflare DNS wildcard is already in place. This is the one piece between Phase 6-C and "tenants can actually visit their subdomain" that wasn't in PR scope.

---

## Backlog items still open

- **`routes/project_trades.js`** redundant top-level `router.use(auth)`. Low-priority.
- **pg DeprecationWarning** — "Calling client.query() when the client is already executing a query". Hygiene PR opportunity.
- **Coverage threshold ratchet** — total test suite is 44+ files now. Run `TEST_DATABASE_URL=… npx jest --coverage` and ratchet if drift ≥3 pp.
- **Stale GitHub blob `0512476`** — remains in object DB until GC; no action needed (all credentials inside revoked).
- **Mapbox `Default public token`** — unused, can't delete (Mapbox UI limitation). Benign.
- **`SENDGRID_FROM_EMAIL` env var name** — still used as the from-address (kept for backward compat; just a name, not a secret). Optional future rename to `EMAIL_FROM` for cleanliness — defer to a hygiene PR.
- **Twilio/SendGrid account itself** — dormant after API key delete. No recurring cost. Don't delete unless Twilio relationship is also being dropped.
- **Color shades from brand_color** — Section 99.5. Currently only `--color-primary` and `--color-sidebar-active` track the tenant brand; shades stay Constrai green. Visual polish for hover/active states; queue as Phase 6-E or hygiene.

---

## Active credentials & secrets locations

All credentials live in **OneDrive `Constrai Keys` folder** (`C:\Users\Lenovo\OneDrive\Desktop\Constrai Keys\`). Files:

| Secret | File | Last rotated |
|---|---|---|
| Cloudflare Origin Certificate (May 7, 2041) | `Cloudflare Origin Certificate.txt` | 2026-05-11 |
| Cloudflare Origin Private Key | `Cloudflare Private Key.txt` | 2026-05-11 |
| Resend API key (`Constrai Prod 2026-05-11-v2`) | `Resend API key 2026-05-11.txt` | 2026-05-11 (rotated mid-session) |
| `mepuser_super` DB pw | (saved in OneDrive) | 2026-05-11 |
| `mepuser` DB pw | (saved in OneDrive) | 2026-05-11 |
| `MAPBOX_ACCESS_TOKEN` (`Constrai Prod 2026-05-11`) | `Mapbox token 2026-05-11.txt` | 2026-05-11 |
| `JWT_SECRET` | `JWT_SECRET 2026-05-11.txt` | 2026-05-11 |

Prod `/var/www/mep/.env` is in sync with all of the above. `SENDGRID_API_KEY` no longer present (Section 98).

Cost inventory + DigitalOcean Spaces + Apple Developer keys: see `RECOVERY.md`.

---

## Critical pitfalls (encoded from Sections 86 + 87 + 88 + 89 + 90 + 91 + 92 + 93 + 96 + 97 + 98 — Section 99 added none)

1. **Bash sandbox file sync lag** — use Read tool to verify file state.
2. **Edit tool can silently lose changes** — Read each file immediately after Edit.
3. **Notepad adds `.txt` to filenames** silently. Use VS Code.
4. **Cloudflare cert/key copy can be swapped** — `head -3` to verify.
5. **CRLF + UTF-8 BOM break PEM parsing** — `dos2unix` before installing.
6. **`npm install --omit=dev` fails on husky** — use `--ignore-scripts`.
7. **Untracked file on server blocks `git pull`** — stash or delete first.
8. **PR auto-merge can flip dependency order** — manual control between dependent PRs.
9. **`gh pr merge` requires branch up-to-date** — rebase + `--force-with-lease`.
10. **Don't open a new session before previous PRs merge** — wait for Merged status.
11. **Cherry-picking can cross feature branches** — verify `git branch --show-current` first.
12. **Replace this file at end of session, don't append** — long history goes in DECISIONS.md.
13. **RLS doesn't apply to BYPASSRLS roles** — use `SET LOCAL ROLE mepuser` in tests.
14. **CI uses `postgres` role for tests** — switch via `SET LOCAL ROLE`.
15. **`git checkout main` fails silently with dirty tree** — stash first.
16. **`git stash pop` can lose cleanly-applied files when there's a conflict elsewhere** — verify content after pop.
17. **PowerShell's bare `>` redirect uses UTF-16 with BOM** — always `Out-File -Encoding utf8`.
18. **GitHub web "Update branch" button creates duplicate squash commits** — never touch UI for a merged branch.
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
29. **NEVER `git add -A` in branches touching credentials** (Section 91) — explicit paths. `.gitignore` MUST cover `.secrets/`, `*.key`, `*.pem`, `*.p12`, `*.pfx`.
30. **NEVER paste `.env` contents/screenshots in any chat** (Section 91) — use `read -rsp` + `sed -i`. Mask via `sed 's/=.*/=***/'`.
31. **Sed mask regex MUST include underscores** (Section 92.5) — universal form: `sed -E 's/=[A-Za-z0-9_.-]+$/=***/'`. Eyeball masked output before sharing.
32. **Verify `pm2-root.service` is enabled BEFORE any planned reboot** (Section 93.4). Run `systemctl is-enabled pm2-root` before reboots. Run `pm2 save` after any new `pm2 start`.
33. **Adding router primitives to a tested component requires updating its test wrapper** (Section 96.5). Use `MemoryRouter` + `renderWithRouter` helper.
34. **Never assume case homogeneity across legacy + generated text keys** (Section 97.6). `SELECT DISTINCT` against prod before locking a text-key lookup; prefer `LOWER(col) = LOWER($1)` when in doubt.
35. **Provider migration completeness audit before env-var decommission** (Section 98.6). Wrapper / abstraction layer doesn't guarantee every caller goes through it. Grep direct SDK references AND legacy env-var references across the whole repo before declaring decommission scope.

---

## Workflow rules (CLAUDE.md highlights)

- **One command at a time** in chat — one PowerShell or bash block per turn.
- **Flow diagrams only for substantive architectural discussions** — not routine ops.
- **Levantine Arabic in chat** — `شو`, `هلق`, `بدك`, `لازم`, `منيح`, `بسيط`. `شغّل` (not `ركض`). Masculine address.
- **GitHub CLI + auto-merge** — `gh pr create --fill --base main ; gh pr merge --auto --squash --delete-branch`.
- **ALWAYS delete the local branch after merge** — `--delete-branch` only removes the remote.
- **Don't put `"تم"` inside PowerShell blocks** — Hedar types it manually.
- **File-based log convention for large output** — `Out-File -Encoding utf8` (NEVER bare `>`).
- **DECISIONS.md is the archive**, not the entry point.
- **Testing pool-vs-role interactions** — `jest.isolateModules` with `process.env.DATABASE_URL` rewritten.
- **Explicit `git add <file>` paths** for any credential-adjacent commit (Section 91).
- **Universal sed mask** — `sed -E 's/=[A-Za-z0-9_.-]+$/=***/'` (Section 92.5).
- **Verify pm2 systemd unit before reboots** — `systemctl is-enabled pm2-root` (Section 93.4).
- **Provider migration completeness check** — grep direct SDK calls + env-var refs before decommissioning (Section 98.6 / Pitfall #35).
- **AskUserQuestion for irreversible architectural decisions** — confirm user-flow + strategy BEFORE writing code (Section 99.1 — the pre-code clarification saved us from coding the wrong shape).

---

## End-of-session checklist (Claude must run BEFORE saying "session done")

1. **All work merged to main** — `gh pr list --state open` empty.
2. **HANDOFF.md replaced** — update timestamp, latest-deployed, last-merged, migration table, next-task. Add new pitfalls.
3. **DECISIONS.md** has a new Section for any non-trivial work.
4. **Push HANDOFF + DECISIONS** as small docs PR. Wait for merge.
5. **Brief Hedar** with: "PR merged, HANDOFF updated, next session starts on <X>."

---

## Out-of-band notes (read on demand)

- `CLAUDE.md` — full working rules.
- `DECISIONS.md` — full decision history (11,000+ lines). Search by Section number.
- `RECOVERY.md` — credentials inventory, cost summary.
- `SCHEMA.md` — DB schema reference.
- `API.md` — backend endpoint reference.
- `.env.example` — required env variables.
- `migrations/*.sql` — DB migration files.
- `.github/workflows/ci.yml` — CI pipeline definition.

---

**Maintainer:** Hedar Hallak (hedar.hallak@gmail.com) | **Repo:** hedarhallak/mep-platform | **Production:** https://app.constrai.ca
