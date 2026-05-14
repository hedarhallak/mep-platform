# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 14, 2026 ~10:30 UTC — **SendGrid decommission complete.** Continuation from Section 97 closeout. This thread shipped PR #227 refactor (removed SENDGRID_API_KEY from 4 routes + 2 lib/job files + .env.example + 3 tests), prod env var deletion via sed + pm2 restart + smoke (May 14 ~10:14 UTC), and SendGrid dashboard API key deletion (Twilio-linked account remains dormant, no cost). DECISIONS Section 98 added + new Pitfall #35 (provider migration completeness audit). **Leak remediation loop NOW FULLY CLOSED — all items ✅.** Next task: **Phase 6-C — frontend bootstrap reads branding + applies CSS vars.**

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
   - `DECISIONS.md` (read ONLY the latest 2-3 sections referenced below — DON'T read the whole 11,000+ line file). Latest section is **98** (SendGrid decommission complete + Pitfall #35). Also relevant: 97 (Phase 6-B closeout + Pitfall #34), 96 (Phase 5.1 closeout + Pitfall #33). **IMPORTANT:** Read DECISIONS.md via the Read tool ONLY (never `bash tail` / `grep`) — Cowork bash mount can lag and miss recently merged sections (Section 96.6 explains; cost us PR #222).
   - `RECOVERY.md` Section 2.4 only if relevant
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 98, SendGrid decommission complete, all leak remediation closed, next is Phase 6-C frontend bootstrap)
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
| Frontend | React + Vite + Tailwind |
| Latest deployed to prod | **SendGrid decommission complete** — `SENDGRID_API_KEY` removed from prod `.env` + dashboard key deleted (May 14 ~10:14 UTC). Backend SendGrid-free at runtime. Phase 6-B public branding endpoint live since May 13 ~14:30 UTC. |
| Last merged to main | PR #227 (s98 refactor: remove SENDGRID_API_KEY route-level refs). Section 98 docs PR follows (this commit). |
| Active program | **Multi-Tenant Migration — Phase 6-C (Frontend bootstrap reads branding + applies CSS vars) is next.** Phase 5 + 6-A + 6-B all FULLY closed. Leak remediation loop NOW FULLY CLOSED. |
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
| Phase 5 — SUPER_ADMIN portal split | ✅ **FULLY CLOSED** — login + list + create all live on admin.constrai.ca (May 13). |
| Email migration SendGrid → Resend | ✅ **FULLY DECOMMISSIONED** (May 14, Section 98). Code refs removed (PR #227), env var deleted from prod, SendGrid dashboard API key deleted. |
| Phase 6-A — companies branding columns (migration 014) | ✅ DEPLOYED |
| Phase 6-B — public `GET /api/companies/:code/branding` | ✅ DEPLOYED + smoke-verified (May 13 ~15:00 UTC). |
| **Phase 6-C — Frontend bootstrap reads branding + applies CSS vars** | ⏳ **Next** |
| Phase 6-D — Admin upload UI + Spaces pipeline | ⏳ After 6-C |
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
| `SENDGRID_API_KEY` | ✅ **DECOMMISSIONED** (Section 98) — code refs removed, env var deleted from prod, dashboard key deleted |
| `SENTRY_DSN` | Optional — DSN is semi-public, skip unless misuse appears |

---

## Next task: Phase 6-C — Frontend bootstrap reads branding + applies CSS vars

Phase 6-B shipped the public `GET /api/companies/:code/branding` endpoint. Phase 6-C is the frontend side: load the branding response BEFORE rendering the login screen and apply `brand_color` / `brand_logo_url` to the UI so each tenant sees their own visual identity from the first paint.

**Scope:**

1. **Determine company code from URL.** Strategy options to choose at session start:
   - Subdomain (e.g. `acm.constrai.ca`) — favored by Section 85 architecture; Cloudflare wildcard `*.constrai.ca` already configured.
   - Path prefix (e.g. `constrai.ca/acm`) — requires nginx + backend routing changes.
   - Query param (e.g. `?c=acm`) — simplest, but lowest production polish.
2. **Bootstrap fetch** — in `mep-frontend/src/main.jsx` (and `admin-main.jsx`), fetch `/api/companies/{code}/branding` BEFORE the React tree mounts. Block rendering until the response arrives (or a 200ms timeout falls back to defaults).
3. **CSS variable injection** — apply `--color-primary` from `brand_color` on `:root` via inline `<style>` injected during bootstrap. The `@theme` directive in `src/index.css` already references `--color-primary-*` shades.
4. **Logo handling** — replace the Constrai logo on the login screen with `brand_logo_url` when present; fallback to Constrai default when null.
5. **Caching** — the endpoint already sends `Cache-Control: public, max-age=300`. The browser handles it; no SW caching layer needed in this phase.
6. **404 / network failure handling** — fall back to Constrai defaults silently. Log to console for debugging but don't surface error to user.
7. **Tests** — `mep-frontend/src/App.test.jsx` (or a new `branding.test.jsx`) covering: (a) bootstrap fetches the endpoint; (b) successful response applies CSS vars; (c) 404 falls back to defaults; (d) network error falls back to defaults.

**Decisions to make at session start:**
- Which company-code-from-URL strategy? (subdomain vs path vs query — affects backend routing too if path-based)
- Synchronous block-on-bootstrap vs flash-of-default-styling-then-rebrand?

**Out of scope (Phase 6-D + later):**
- Admin upload UI + DigitalOcean Spaces pipeline — Phase 6-D.
- Mobile app branding — later phase.

**Estimated effort:** 2-3 hours. Branch name suggestion: `feat/s99-phase6c-frontend-branding-bootstrap`.

---

## Backlog items still open

- **`routes/project_trades.js`** redundant top-level `router.use(auth)`. Low-priority.
- **pg DeprecationWarning** — "Calling client.query() when the client is already executing a query". Hygiene PR opportunity.
- **Coverage threshold ratchet** — total test suite is 44+ files now. Run `TEST_DATABASE_URL=… npx jest --coverage` and ratchet if drift ≥3 pp.
- **Stale GitHub blob `0512476`** — remains in object DB until GC; no action needed (all credentials inside revoked).
- **Mapbox `Default public token`** — unused, can't delete (Mapbox UI limitation). Benign.
- **`SENDGRID_FROM_EMAIL` env var name** — still used as the from-address (kept for backward compat; just a name, not a secret). Optional future rename to `EMAIL_FROM` for cleanliness — defer to a hygiene PR.
- **Twilio/SendGrid account itself** — dormant after API key delete. No recurring cost (free trial expired). Don't delete unless Twilio relationship is also being dropped.

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

## Critical pitfalls (encoded from Sections 86 + 87 + 88 + 89 + 90 + 91 + 92 + 93 + 96 + 97 + 98)

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
35. **Provider migration completeness audit before env-var decommission** (NEW — Section 98.6, May 14, 2026). A wrapper / abstraction layer (e.g. `lib/email.js#getMailClient` for the SendGrid→Resend swap) doesn't guarantee every caller goes through it. Routes / jobs / libs can call the legacy SDK directly (`sgMail.setApiKey`, etc.) and bypass the abstraction silently. Before removing the legacy env var, grep for direct SDK references AND direct env-var references across the whole repo — `grep -rn 'sgMail\.\|setApiKey\|mustEnv.*SENDGRID' routes/ jobs/ lib/ middleware/` and `grep -rn 'SENDGRID_API_KEY' . --include='*.js'`. Results outside the abstraction layer = migration is NOT complete. HANDOFF estimated SendGrid decommission as "15-min"; actual scope was 7 production files + 3 tests + a refactor PR. Encoded so future provider migrations don't repeat the audit miss.

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
