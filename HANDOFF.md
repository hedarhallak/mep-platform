# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 14, 2026 ~17:00 UTC — **Phase 6-D-1b frontend cookie consumption + backend inline-JWT cookie fallback shipped.** Continuation thread today closed: Section 97 docs + SendGrid decommission (Section 98) + Phase 6-C frontend branding bootstrap (Section 99) + Phase 6-D-1a backend cookies (Section 100) + Phase 6-D-1b frontend cookies (Section 101). Today's PRs: #226–#233 (8 merged). Frontend now sends cookies on every request; backend's three inline-JWT endpoints (`/whoami`, `/change-pin`, `/logout-all`) accept cookie fallback. Mid-session "committed to wrong branch" incident → clean recovery + new Pitfall #36. **Next task: Phase 6-D-1c — drop tokens-in-body for web responses, or nginx wildcard vhost (hard prereq for end-to-end Pattern B).**

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
   - `DECISIONS.md` (read ONLY the latest 2-3 sections referenced below — DON'T read the whole 11,800+ line file). Latest section is **101** (Phase 6-D-1b frontend cookie consumption + Pitfall #36). Also relevant: 100 (Phase 6-D-1a backend cookies), 99 (Phase 6-C frontend branding bootstrap). **NB:** DECISIONS.md currently has a duplicate Section 99 around line 11767 (leftover from an aborted draft — to be removed in a follow-up docs PR). The canonical Section 99 is at line ~11574. **IMPORTANT:** Read DECISIONS.md via the Read tool ONLY (never `bash tail` / `grep`) — Cowork bash mount can lag and miss recently merged sections (Section 96.6 explains; cost us PR #222).
   - `RECOVERY.md` Section 2.4 only if relevant
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 101, Phase 6-D-1b frontend cookie consumption shipped, next is Phase 6-D-1c drop tokens-in-body)
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
| Backend | Node.js + Express + Postgres 16, pm2-managed at `/var/www/mep`. Cookie auth fully wired: `middleware/auth.js` + `routes/auth.js#extractToken` accept Bearer header OR cookie. |
| Frontend | React + Vite + Tailwind v4. `credentials: 'include'` on every fetch (Section 101). `window.__BRANDING__` populated by `lib/branding.js` (Section 99). |
| Latest deployed to prod | **Phase 6-D-1b frontend cookie consumption** — once PR #233 merge fast-forwards prod via `git pull` on the server. `redirect_url` flow at `app.constrai.ca` login + cookie-based auth at `acm.constrai.ca` post-redirect both work end-to-end IF nginx serves tenant subdomains (see operational backlog). |
| Last merged to main | PR #233 (Phase 6-D-1b frontend cookie consumption). Section 101 docs PR follows (this commit). |
| Active program | **Multi-Tenant Migration — Phase 6-D-1c (drop tokens-in-body for web responses) is next.** Phase 5 + 6-A + 6-B + 6-C + 6-D-1a + 6-D-1b all FULLY closed. |
| Mobile app | Still on Bearer-token + PIN. Backend's Bearer-wins-over-cookie policy keeps mobile unaffected. |

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
| Phase 6-C — Frontend bootstrap reads branding + applies CSS vars | ✅ DEPLOYED (May 14, Section 99) |
| Phase 6-D-1a — Backend cookie auth + login redirect_url | ✅ DEPLOYED (May 14, Section 100) |
| Phase 6-D-1b — Frontend cookie consumption + /whoami cookie fallback | ✅ **DEPLOYED (May 14, Section 101)** |
| **Phase 6-D-1c — Drop tokens-in-body for web auth responses** | ⏳ **Next code task** |
| Phase 6-D-2 — Logo swap on LoginPage | ⏳ After 6-D-1c |
| Phase 6-D-3 — Admin upload UI + DigitalOcean Spaces pipeline | ⏳ After 6-D-2 |
| Phase 7 — 2FA + biometric + PIN→password migration | ⏳ Pending |
| Phase 8 — Audit + compliance | ⏳ Pending |

---

## Pending operational work (hard prereqs / cleanup)

- **nginx wildcard vhost for `*.constrai.ca`** — HARD PREREQ for Pattern B to work end-to-end. Currently nginx serves only explicit `app.constrai.ca` + `admin.constrai.ca`. Without a wildcard server block (or one-per-tenant), `acm.constrai.ca` resolves at DNS (Cloudflare wildcard is in place since Phase 1) but nginx returns its default vhost. Action: add `server { server_name *.constrai.ca; root /var/www/mep/public; ... try_files $uri /index.html; }` after the explicit vhosts. Will require an nginx reload + smoke test against a real tenant subdomain.
- **Docs cleanup — duplicate Section 99 in DECISIONS.md** (~line 11767). Leftover from an aborted draft earlier today. Remove in next docs PR. Harmless but confusing.
- **Pre-commit hook refusing direct commits to `main`** — per Pitfall #36 / Section 101.3. Candidate for next hygiene PR. Snippet in Section 101.3.

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
| `SENDGRID_API_KEY` | ✅ DECOMMISSIONED (Section 98) |
| `SENTRY_DSN` | Optional — DSN is semi-public, skip unless misuse appears |

---

## Next task: Phase 6-D-1c — Drop tokens-in-body for web auth responses

Phase 6-D-1a (Section 100) added cookies as an **additive** layer alongside the existing tokens-in-JSON-body response. Phase 6-D-1b (Section 101) wired the frontend to use cookies. Phase 6-D-1c closes the loop: drop `token` and `refresh_token` from the response body for **web** clients, while keeping them for **mobile** (Bearer header). The frontend doesn't read them anymore (after 6-D-1b's useAuth refactor), so removing them removes a leak surface — the JSON response no longer carries the bearer token where it could be inadvertently logged / cached.

**Scope:**

1. **Backend `routes/auth.js`** — `/login`, `/refresh` responses. Detect "web client" vs "mobile client" and conditionally include / omit `token` + `refresh_token` in the body:
   - Detection signal options (pick one at session start):
     - **A.** User-Agent header: mobile app's User-Agent contains `Constrai-Mobile` or `Expo` — easy to ship, easy for an attacker to spoof, but the security gain isn't about attacker resistance, it's about not leaking the token by default.
     - **B.** Request header `X-Auth-Channel: cookie` from web frontend (set by `lib/api.js`) vs absent for mobile. More explicit, less heuristic.
     - **C.** Differentiate at the route level: a new `POST /api/auth/login/web` endpoint that omits body tokens vs the existing `/login` keeping them for mobile. Cleanest contract but doubles the route surface.
   - Backend keeps the cookie set unconditionally (web ignores body tokens, mobile ignores cookie).
2. **Frontend `mep-frontend/src/lib/api.js`** — verify the frontend doesn't accidentally still read body tokens. The `refreshTokenOnce` helper currently reads `data.token` / `data.refresh_token` on refresh — after 6-D-1c the response body for web will omit these, so the helper should gracefully no-op (the cookie is already set by the backend; no client-side action needed).
3. **Frontend `mep-frontend/src/hooks/useAuth.jsx`** — same: verify no code path expects `data.token` on login success. After 6-D-1b the hook reads `data.redirect_url` and `data.user` but not the tokens themselves; double-check.
4. **Mobile app** — no change. Mobile sends `User-Agent: Constrai-Mobile/...` (or whatever signal we pick) and the backend returns tokens in body as today.
5. **Tests:**
   - Backend: `tests/auth/cookie_session.test.js` — extend to assert that requests with the web signal get NO `token` / `refresh_token` in body, while requests without it (default — mobile-shaped) get them as today.
   - Frontend: `useAuth.test.jsx` / `LoginPage.test.jsx` — assert successful login still works when response has no body token (just cookies).

**Decisions to make at session start:**

- Which detection signal (A / B / C above)? My recommendation: **B (X-Auth-Channel header from web)**. Explicit, doesn't drift if user agents change, easy to mock in tests, no new endpoints.
- Should mobile authentication path also stop returning the body refresh_token someday and move to expo-secure-store-only? Out of scope for 6-D-1c; flag as a Phase 7 candidate alongside PIN→password.

**Estimated effort:** ~1 hour backend + 30 min frontend verify + 1 hour test extend. ~2.5 hours total. Branch name suggestion: `feat/s102-phase6d1c-drop-body-tokens-for-web`.

---

## Backlog items still open

- **`routes/project_trades.js`** redundant top-level `router.use(auth)`. Low-priority.
- **pg DeprecationWarning** — "Calling client.query() when the client is already executing a query". Hygiene PR opportunity.
- **Coverage threshold ratchet** — total test suite is now 46+ files. Run `TEST_DATABASE_URL=… npx jest --coverage` and ratchet if drift ≥3 pp.
- **Stale GitHub blob `0512476`** — remains in object DB until GC; no action needed (all credentials inside revoked).
- **Mapbox `Default public token`** — unused, can't delete (Mapbox UI limitation). Benign.
- **`SENDGRID_FROM_EMAIL` env var name** — still used as the from-address (kept for backward compat). Optional future rename to `EMAIL_FROM`.
- **Twilio/SendGrid account itself** — dormant, no cost. Don't delete unless Twilio relationship is also being dropped.
- **Color shades from `brand_color`** — Section 99.5. Currently only `--color-primary` and `--color-sidebar-active` track the tenant brand; shades stay Constrai green. Visual polish for hover/active states.
- **PIN → password migration** (Hedar reminder from Section 100 session). Queue for Phase 7 alongside 2FA + biometric.
- **nginx wildcard vhost for `*.constrai.ca`** — see "Pending operational work" above.
- **Docs cleanup — duplicate Section 99 in DECISIONS.md** — see Section 101.4.
- **Pre-commit hook refusing direct commits to `main`** — see Pitfall #36 in Section 101.3.
- **CSRF protection** — currently `SameSite=Lax` covers the common threat surface. If state-changing GET endpoints get added, layer a CSRF-token middleware.

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

Prod `/var/www/mep/.env` is in sync with all of the above. `SENDGRID_API_KEY` no longer present.

Cost inventory + DigitalOcean Spaces + Apple Developer keys: see `RECOVERY.md`.

---

## Critical pitfalls (encoded from Sections 86 + 87 + 88 + 89 + 90 + 91 + 92 + 93 + 96 + 97 + 98 + 101)

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
35. **Provider migration completeness audit before env-var decommission** (Section 98.6). Wrapper / abstraction layer doesn't guarantee every caller goes through it. Grep direct SDK references AND legacy env-var references before declaring decommission scope.
36. **Verify current branch before commit/push during parallel work** (NEW — Section 101.3, May 14, 2026). When juggling multiple branches in parallel (the "do other work while CI runs" pattern), a `git commit` may accidentally land on `main` instead of the intended feature branch — the source-of-truth branch gets polluted with code that hasn't been CI-gated. Detection: `gh pr create` errors silently; `gh pr view` says "no PR for branch main"; `gh run list --branch main` shows no CI for the latest local commit; `git ls-remote --heads origin main` differs from `.git/refs/heads/main`. Recovery: save the commit on a side branch (`git branch <save> <bad-sha>`), `git reset --hard origin/<bad-branch>`, rename `<save>` to the intended branch name, push. **Convention:** `git branch --show-current` before EVERY commit during parallel work; configure shell prompt to display current branch always; pre-commit hook to refuse `main` commits (snippet in Section 101.3 — candidate for next hygiene PR). The May 14 incident was caught only because `gh pr create` failed silently AND `gh run list` was checked — without those, the bad commit could have landed on origin/main without CI gate.

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
- **Verify current branch before commit/push during parallel work** — `git branch --show-current` before every commit (Section 101.3 / Pitfall #36).
- **Parallel work pattern** — when waiting on CI, prep next-PR work in a separate local branch (don't push). After current PR merges, rebase and push the prepared work. Saves ~5-6 minutes per PR.

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
- `DECISIONS.md` — full decision history (11,800+ lines). Search by Section number.
- `RECOVERY.md` — credentials inventory, cost summary.
- `SCHEMA.md` — DB schema reference.
- `API.md` — backend endpoint reference.
- `.env.example` — required env variables.
- `migrations/*.sql` — DB migration files.
- `.github/workflows/ci.yml` — CI pipeline definition.

---

**Maintainer:** Hedar Hallak (hedar.hallak@gmail.com) | **Repo:** hedarhallak/mep-platform | **Production:** https://app.constrai.ca
