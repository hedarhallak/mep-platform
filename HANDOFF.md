# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 13, 2026 ~07:00 UTC — **Two-day marathon (May 11 + May 13) closed.** Session totals: ~14 PRs merged, 7 secret rotations, 2 prod migrations (014 + 015), 4 new pitfalls encoded (#29-#32), Phase 5 CLOSED, Email migration cutover DEPLOYED, Phase 6-A (companies branding columns) DEPLOYED, Section 94.5 starter (`expense_claims` schema + route) DEPLOYED, plus the unplanned secrets-leak incident fully remediated. **Next task: Phase 6-B — public `GET /api/companies/:id/branding` endpoint.** Plus the 24h-post-cutover `SENDGRID_API_KEY` decommission (eligible now, May 13).

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
   - `DECISIONS.md` (read ONLY the latest 2-3 sections referenced below — DON'T read the whole 11,000+ line file). Today's session added Sections 91 + 92 + 93.
   - `RECOVERY.md` Section 2.4 only if relevant
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Sections 91-95, all leak rotations done + Phase 6-A done + 94.5 starter done, next is Phase 6-B branding endpoint)
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
| Backend | Node.js + Express + Postgres 16, pm2-managed at `/var/www/mep`. **pm2 systemd auto-start NOW configured (Section 93.3).** |
| Frontend | React + Vite + Tailwind |
| Latest deployed to prod | **JWT_SECRET rotation + kernel reboot + pm2-root.service enabled** (May 11 ~12:45 UTC). Plus all of today's work: Resend cutover, mepuser pw, Mapbox token, ADMIN/AUTH cleanup, notifyForeman fix. |
| Last merged to main | Section 93 docs PR (todo) |
| Active program | **Multi-Tenant Migration — Phase 6 (Frontend tenant context + branding) is next.** Email migration cutover complete (24h watch ongoing). |
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
| Phase 5 — SUPER_ADMIN portal split | ✅ CLOSED |
| Email migration SendGrid → Resend | ✅ **CUTOVER COMPLETE** (May 11 ~12:00 UTC). 24h watch ends May 12 ~12:00 UTC, then SendGrid decommission. |
| **Phase 6 — Frontend tenant context + branding** | ⏳ **Next** |
| Phase 7 — 2FA + biometric + account security | ⏳ Pending |
| Phase 8 — Audit + compliance | ⏳ Pending |

---

## Pending items from leak remediation (Section 91)

ALL rotations COMPLETE. Only the 24h watch + decommission remains.

| Secret | Status |
|---|---|
| Cloudflare Origin Cert + Key | ✅ Rotated + deployed (Section 91) |
| Resend API key (`v2`) | ✅ Rotated (Section 92.5 / Pitfall #31) |
| `mepuser_super` DB pw | ✅ Rotated (Section 91) |
| `mepuser` DB pw | ✅ Rotated (Section 92.2) |
| `MAPBOX_ACCESS_TOKEN` | ✅ Rotated + leaked default refreshed (Section 92.2) |
| `JWT_SECRET` | ✅ **Rotated** (Section 93.1) |
| `ADMIN_API_KEY` + `AUTH_SECRET` | ✅ **Deleted** (dead env vars, audit-and-delete) |
| `SENDGRID_API_KEY` | ⏳ Auto-retire after 24h Resend watch (May 12 ~12:00 UTC) |
| `SENTRY_DSN` | Optional — DSN is semi-public, skip unless misuse appears |

---

## Next task: Phase 6-B — public `GET /api/companies/:id/branding` endpoint

Phase 6-A shipped (migration 014). Columns `companies.brand_color` + `companies.brand_logo_url` exist on prod. 6-B exposes them via a public endpoint so the login screen can load tenant branding BEFORE the user authenticates.

**Scope:**

1. **Backend endpoint** — `GET /api/companies/:id/branding`. Returns `{ ok, branding: { brand_color, brand_logo_url, company_name } }`. **Public route** (no `auth` middleware). Mount on BOTH adminApp and tenantApp via `mountPublicRoutes()` in app.js. The endpoint uses `superPool` (BYPASSRLS) because it runs pre-tenant — same pattern as `routes/auth.js#login` (Pitfall #28 / Section 90-G).
2. **Caching headers** — `Cache-Control: public, max-age=300` (5 minutes). Logos + colors change rarely; the frontend can refresh on its own boot cycle.
3. **Error handling** — 404 if company not found, 400 if `:id` isn't a positive integer.
4. **Audit log** — NO (public endpoint, no user context). Frequency could be high (every frontend boot); no useful signal in audit_logs.
5. **Tests** — `tests/integration/companies_branding.test.js` covering: (a) GET on existing company returns branding fields; (b) GET on missing company returns 404; (c) NULL values returned as-is (frontend handles defaults).

**Out of scope (Phase 6-C + 6-D):**
- Frontend bootstrap reads branding + applies CSS variables — Phase 6-C.
- Admin upload UI + DigitalOcean Spaces pipeline — Phase 6-D.
- Mobile app branding — later.

**Suggested first step:** Write the route + smoke test + PR. ~1-1.5 hours. Then Phase 6-C in a follow-up session.

### Alternative: SendGrid decommission (eligible May 12 ~12:00 UTC onward)

Now eligible. 24h Resend watch period passed. ~15-min task to clear the SendGrid surface:

1. SSH to prod: `sed -i '/^SENDGRID_API_KEY=/d' /var/www/mep/.env` + `pm2 restart mep-backend` + verify SA login (and trigger one Resend-routed email path manually for sanity).
2. SendGrid dashboard → Settings → API Keys → delete the Constrai key.
3. SendGrid dashboard → Settings → Account → optionally delete the sub-user.
4. Update HANDOFF "Credentials" section to remove SendGrid entries.

Worth doing first (smaller scope) before tackling Phase 6-B.

---

## Backlog items still open

- **`routes/project_trades.js`** redundant top-level `router.use(auth)`. Low-priority.
- **pg DeprecationWarning** — "Calling client.query() when the client is already executing a query". Hygiene PR opportunity.
- **Coverage threshold ratchet** — total test suite is 44+ files now. Run `TEST_DATABASE_URL=… npx jest --coverage` and ratchet if drift ≥3 pp.
- **Stale GitHub blob `0512476`** — remains in object DB until GC; no action needed (all credentials inside revoked).
- **Mapbox `Default public token`** — unused, can't delete (Mapbox UI limitation). Benign.
- **Apple Passwords → OneDrive migration of all credential entries** — Hedar uses OneDrive `Constrai Keys` folder, not Apple Passwords. Earlier HANDOFFs referenced "Apple Passwords entries" inaccurately. Update next time you do a credentials inventory pass.

---

## Active credentials & secrets locations

All credentials live in **OneDrive `Constrai Keys` folder** (`C:\Users\Lenovo\OneDrive\Desktop\Constrai Keys\`). Files:

| Secret | File | Last rotated |
|---|---|---|
| Cloudflare Origin Certificate (May 7, 2041) | `Cloudflare Origin Certificate.txt` | 2026-05-11 |
| Cloudflare Origin Private Key | `Cloudflare Private Key.txt` | 2026-05-11 |
| Resend API key (`Constrai Prod 2026-05-11-v2`) | `Resend API key 2026-05-11.txt` | 2026-05-11 (rotated mid-session) |
| `mepuser_super` DB pw | (saved this session in OneDrive) | 2026-05-11 |
| `mepuser` DB pw | (saved this session in OneDrive) | 2026-05-11 |
| `MAPBOX_ACCESS_TOKEN` (`Constrai Prod 2026-05-11`) | `Mapbox token 2026-05-11.txt` | 2026-05-11 |
| `JWT_SECRET` | `JWT_SECRET 2026-05-11.txt` | 2026-05-11 |

Prod `/var/www/mep/.env` is in sync with all of the above.

Cost inventory + DigitalOcean Spaces + Apple Developer keys: see `RECOVERY.md`.

---

## Critical pitfalls (encoded from Sections 86 + 87 + 88 + 89 + 90 + 91 + 92 + 93)

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
32. **Verify `pm2-root.service` is enabled BEFORE any planned reboot** (NEW — Section 93.4, May 11, 2026). The first kernel reboot of the prod Droplet took prod down for ~2 min because `pm2 startup` was never run — no systemd unit to spawn the pm2 daemon on boot. Fixed via `pm2 startup systemd -u root --hp /root && pm2 save`. **Convention going forward:** run `systemctl is-enabled pm2-root` before any planned reboot; expected output `enabled`. If `disabled` or `not-found`, run the `pm2 startup` + `pm2 save` pair BEFORE rebooting. Also: after ANY new `pm2 start` of a new app, run `pm2 save` immediately so the dump captures the new process.

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
