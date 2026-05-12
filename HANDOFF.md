# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 11, 2026 ~12:30 UTC — **Phase 5 closed + Email migration COMPLETE + secrets-leak fully remediated (except JWT_SECRET + kernel reboot, scheduled for evening).** Three code PRs shipped + one docs PR + 5 secret rotations + 1 dead-env-var deletion + Resend cutover deployed and verified end-to-end via Resend dashboard (2 deliveries confirmed). Section 91 (incident) + Section 92 (rotation marathon + cutover) document the full story. **Next task: JWT_SECRET rotation + kernel reboot — schedule for low-traffic evening window** (QC time).

---

## How to start a new session (Hedar — copy this one line)

```
استكمال Constrai. اطلب مجلد C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed (request_cowork_directory)، اقرأ HANDOFF.md من المجلد، اتبع التعليمات فيه بالحرف.
```

---

## Bootstrap protocol (Claude — follow this exactly)

When you receive the one-line command above:

1. **Request folder access** via `request_cowork_directory` for `C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed`.
2. **Read these 4 files** (use the Read tool, NOT bash — bash sandbox can return stale content):
   - `HANDOFF.md` (this file — for current state + next task)
   - `CLAUDE.md` (working rules, Sections 1-9)
   - `DECISIONS.md` (read ONLY the latest 2-3 sections referenced below — DON'T read the whole 11,000+ line file). Today's session added Sections 91 + 92.
   - `RECOVERY.md` Section 2.4 only (cost inventory) if relevant
3. **Echo this exact line** as the first line of your reply:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Sections 91 + 92, leak remediated, only JWT + reboot remain, next is JWT rotation in low-traffic window)
   ```
4. **Confirm the next task** in 1-2 lines.
5. **Ask if Hedar is ready to start**, then wait.

**Do NOT** start coding/changes before Hedar confirms.

---

## Current state (snapshot)

| Item | Value |
|---|---|
| Production URL | `https://app.constrai.ca` |
| Admin portal | `https://admin.constrai.ca` (SUPER_ADMIN only, 90-E gate) |
| Login (test) | Email: `hedar.hallak@gmail.com` / PIN: `hedar2026` (SUPER_ADMIN) |
| Server SSH | `ssh root@143.110.218.84` (Ubuntu 24.04 — kernel restart pending) |
| Backend | Node.js + Express + Postgres 16, pm2-managed at `/var/www/mep` |
| Frontend | React + Vite + Tailwind, deployed to `/var/www/mep/mep-frontend/dist` |
| Latest deployed to prod | **Resend cutover** (May 11, 2026 ~12:00 UTC). `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=Constrai Prod 2026-05-11-v2`, FROM = `Constrai <noreply@constrai.ca>`. Two direct-API smoke tests delivered (verified in Resend dashboard). Plus: PR #207 (abstraction) + PR #210 (notifyForeman) + PR #209 (ADMIN/AUTH cleanup). |
| Last merged to main | Section 92 docs PR — May 11, 2026 ~12:30 UTC. |
| Active program | **Email migration COMPLETE.** Multi-Tenant Migration program — **Phase 5 CLOSED**, **Phase 6 (Frontend tenant branding) is next**. |
| Mobile app | Still on legacy username login — backend keeps backward-compat |

### Multi-tenant migration progress

| Phase | Status |
|---|---|
| Section 85 — Architecture (Model C single domain) | ✅ Done |
| Phase 1 — Cloudflare + Origin SSL | ✅ Deployed (+ origin cert rotated May 11 after leak) |
| Phase 2 — Tenant Resolver | ✅ No-op (Model C) |
| Phase 3 — DB schema 011 + email login | ✅ Deployed |
| Phase 4a — RLS Stage 1 (permissive policies) | ✅ Deployed |
| Phase 4b — RLS Stage 2 (req.db middleware) | ✅ Deployed |
| Phase 4c — RLS Stage 3 (strict policies) | ✅ Deployed AND restored after 90-F outage |
| Phase 5 — SUPER_ADMIN portal split | ✅ CLOSED |
| **Email migration SendGrid → Resend** | ✅ **CUTOVER COMPLETE on prod** (May 11, 2026 ~12:00 UTC). 24h watch period ongoing; SendGrid decommission after. |
| Phase 6 — Frontend tenant context + branding | ⏳ **Next** |
| Phase 7 — 2FA + biometric + account security | ⏳ Pending |
| Phase 8 — Audit + compliance | ⏳ Pending |
| UI smoke test (Section 84, 9 tasks) | ⏸️ Paused (resume after Phase 8) |

---

## Pending rotations from Section 91 leak

Five completed today (Cloudflare cert+key, Resend API key, mepuser_super, mepuser, Mapbox). Two dead-env vars deleted (`ADMIN_API_KEY` + `AUTH_SECRET`). Remaining:

| Secret | Status | Recommended action |
|---|---|---|
| `JWT_SECRET` | ⚠️ Pending — **highest impact** | Generate `openssl rand -hex 32`, update prod `.env`, `pm2 restart`. Invalidates every active access + refresh token — every user logs in again. **Schedule for low-traffic evening window.** Combine with the kernel reboot. |
| `SENDGRID_API_KEY` | Pending — auto-retired | After 24h of clean Resend traffic, delete from prod `.env` + delete SendGrid sub-user account. Apple Passwords entry archived. |
| `SENTRY_DSN` | Optional / negligible | DSN is semi-public by design. Skip unless real misuse appears. |

---

## Next task: JWT_SECRET rotation + kernel reboot (combined evening session)

These two are batched because both invalidate in-flight state:
- JWT rotation → every user logs in again (no in-flight tokens valid).
- Kernel reboot → ~30-60s Droplet downtime (pm2 restarts via `pm2 startup` after boot).

Doing them together = one notification to users about "brief unavailability + you'll need to log in again."

**Sequence:**

1. **Pre-flight check.** Verify HANDOFF + DECISIONS docs PR merged. Verify Resend traffic is healthy (Resend dashboard shows real backend-generated emails over the past few hours). If yes, proceed.

2. **JWT rotation.**
   ```bash
   ssh root@143.110.218.84
   cd /var/www/mep
   # Generate new JWT_SECRET.
   NEW_JWT=$(openssl rand -hex 32)
   echo "$NEW_JWT" > /tmp/new_jwt.txt && chmod 600 /tmp/new_jwt.txt  # save briefly for Apple Passwords
   # Update .env (silent — value already in $NEW_JWT, masked sed).
   sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${NEW_JWT}|" /var/www/mep/.env
   unset NEW_JWT
   # Verify mask.
   grep '^JWT_SECRET=' /var/www/mep/.env | sed -E 's/=[A-Za-z0-9_.-]+$/=***/'
   ```
   Open `/tmp/new_jwt.txt` to copy the value to Apple Passwords. Delete the file: `shred -u /tmp/new_jwt.txt`.

3. **Kernel reboot.**
   ```bash
   shutdown -r now
   ```
   Connection drops. Wait ~60s. Re-SSH.

4. **Post-reboot verification.**
   ```bash
   pm2 status                       # mep-backend + mep-webhook should be 'online'
   pm2 logs mep-backend --lines 30 --nostream | grep -E "error|Error|fail" || echo "Clean ✓"
   curl -sS -o /dev/null -w "SA login: HTTP=%{http_code}\n" \
     -X POST https://app.constrai.ca/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"hedar.hallak@gmail.com","pin":"hedar2026"}'
   # Verify the "*** System restart required ***" banner is gone on the next ssh login.
   ```
   Expected: SA login returns 200 with a fresh access + refresh token (signed with the new JWT_SECRET).

5. **Sanity from external browser:** open `https://app.constrai.ca` in a browser. Previous session should be invalidated → redirect to login. Log in. Should land on the tenant home as usual.

6. **Apple Passwords:** update entry `Constrai Prod - JWT_SECRET` with the new value (from the `/tmp/new_jwt.txt` step before shredding).

7. **Update HANDOFF (next session) noting JWT + reboot done** — replace this Next-task block with the Phase 6 plan.

**Rollback** (if anything goes wrong post-restart):
- Restore from .env backup: `cp /var/www/mep/.env.bak.<TS> /var/www/mep/.env` + `pm2 restart mep-backend`. The OLD JWT_SECRET resumes; users who had pre-rotation tokens still have valid sessions until natural expiry (1h access / 7d refresh).
- Kernel reboot is non-reversible but harmless if pm2 startup is set (which it is per Section 86 prod setup).

---

## Phase 5 pieces (all done — historical)

| Piece | Status |
|---|---|
| 90-A through 90-G | ✅ All deployed and merged. Phase 5 CLOSED. |

---

## Backlog items still open (carried forward)

- **`routes/project_trades.js`** has a redundant top-level `router.use(auth)` (auth runs twice). Pre-existing, harmless, low-priority cleanup.
- **pg DeprecationWarning** — "Calling client.query() when the client is already executing a query" — pre-existing pattern issue. Likely a route with parallel `Promise.all([client.query(...), client.query(...)])` on a single client. Hygiene PR opportunity.
- **Coverage threshold ratchet** — Phase 4 + 90-G + Resend PR + notifyForeman PR added 5 test files. Total integration + smoke suite is 44+. After a few quiet days, run `TEST_DATABASE_URL=… npx jest --coverage` and consider ratcheting (per CLAUDE.md Section 4.6).
- **Stale GitHub blob `0512476`** (the original leak commit) — remains in GitHub's object DB until automatic GC. Unreferenced; all credentials inside are revoked. No action needed unless residual concerns require contacting GitHub Support.
- **Mapbox `Default public token`** — sits in dashboard unused (Mapbox doesn't allow deleting defaults; only refreshing). Benign.
- **`hedar.hallak@gmail.com` SendGrid single-sender verification** — still on file. Will go away when SendGrid sub-user is deleted post-Resend-24h-watch.

---

## Active credentials & secrets locations

All credentials live in Hedar's password manager + OneDrive `Constrai Keys` folder (workstation-side, OUTSIDE the repo).

| Secret | Location | Last rotated |
|---|---|---|
| Cloudflare Origin Certificate (`May 7, 2041` validity) | OneDrive + `/etc/nginx/ssl/cloudflare/cloudflare-origin.pem` on prod | 2026-05-11 (this session, Section 91) |
| Cloudflare Origin Private Key | OneDrive + `/etc/nginx/ssl/cloudflare/cloudflare-origin.key` on prod | 2026-05-11 |
| Resend API key (`Constrai Prod 2026-05-11-v2`, Sending access, constrai.ca scope) | OneDrive `Resend API key 2026-05-11.txt` + need to add to Apple Passwords | 2026-05-11 (rotated mid-session due to Pitfall #31) |
| Server `/var/www/mep/.env` | Password-manager secure note (kept in sync after rotations) | Updated 2026-05-11 |
| DigitalOcean Spaces keys | Password manager | (not rotated this session) |
| Apple Developer / Expo / GitHub | Password manager | (not rotated this session) |
| `mepuser_super` DB password | Apple Passwords + `DATABASE_URL_SUPER` in prod `.env` | 2026-05-11 |
| `mepuser` DB password | OneDrive + `DATABASE_URL` in prod `.env` + add to Apple Passwords | 2026-05-11 |
| `MAPBOX_ACCESS_TOKEN` (`Constrai Prod 2026-05-11`, scoped to constrai.ca) | OneDrive + `MAPBOX_ACCESS_TOKEN` in prod `.env` + Apple Passwords | 2026-05-11 |
| `JWT_SECRET` | ⚠️ **Pending rotation this evening** | (not yet rotated) |

---

## Critical pitfalls (encoded from Sections 86 + 87 + 88 + 89 + 90 + 91 + 92)

1. **Bash sandbox file sync lag** — use Read tool, not bash, to verify file state.
2. **Edit tool can silently lose changes** — Read each edited file immediately after Edit calls.
3. **Notepad adds `.txt` to filenames** silently. Use VS Code, or change "Save as type" to "All Files".
4. **Cloudflare cert/key copy can be swapped** — `head -3` to verify file content matches filename.
5. **CRLF + UTF-8 BOM break PEM parsing** — `dos2unix` on the server before installing.
6. **`npm ci --omit=dev` (and `npm install --omit=dev`) fail on husky** — use `--ignore-scripts`.
7. **Untracked file on server blocks `git pull`** — delete or stash before pulling.
8. **PR auto-merge can flip dependency order** — manual control between dependent PRs.
9. **`gh pr merge` requires branch up-to-date with main** — rebase + `--force-with-lease`.
10. **Don't open a new session before previous PRs merge** — wait for `gh pr view <num>` to show Merged.
11. **Cherry-picking can cross feature branches** — verify `git branch --show-current` before any commit.
12. **Replace this file at end of session, don't append** — long history goes in DECISIONS.md.
13. **RLS doesn't apply to BYPASSRLS roles** — use `SET LOCAL ROLE mepuser` in tests.
14. **CI uses `postgres` role for tests** — RLS-specific tests must switch roles.
15. **`git checkout main` fails silently with dirty tree** — stash first.
16. **`git stash pop` can lose cleanly-applied files when there's a conflict in another file** — verify content after pop.
17. **PowerShell's bare `>` redirect uses UTF-16 with BOM** — always `Out-File -Encoding utf8`.
18. **GitHub web "Update branch" button creates duplicate squash commits** — never touch the UI for a merged branch.
19. **`openssl rand -hex N` over `-base64 N`** — hex is URL-safe in connection strings.
20. **Read untracked WIP files before writing fresh code** — `git status` + Read first.
21. **`middleware/permissions.js can()` uses `pool.query` directly** ✅ CLOSED by 89-D.
22. **Per-request transaction middleware MUST commit BEFORE the response is flushed** — override `res.end`, not `res.on('finish')`.
23. **`try { INSERT } catch { handle dup }` patterns DO NOT survive inside a tenantDb transaction** — use `ON CONFLICT DO NOTHING RETURNING *`.
24. **Orphan-account 401 from tenantDb is the cross-route contract** — update `tenant_isolation.test.js` expectations when migrating routes.
25. **SUPER_ADMIN seedUser needs an explicit 8+ char PIN** — `seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' })`.
26. **Tests pinning a transitional stage's contract become blockers** — label tests with stage + future migration.
27. (reserved — folded into #28.)
28. **Strict RLS breaks pre-tenant queries** ✅ CLOSED by 90-G. Fix: `authPool = superPool || pool`.
29. **NEVER `git add -A` in branches that touch credential-adjacent areas** (Section 91) — use explicit paths. `.gitignore` MUST have `.secrets/`, `*.key`, `*.pem`, `*.p12`, `*.pfx`.
30. **NEVER paste `.env` contents/screenshots in any chat** (Section 91) — even private chats are logged. Edit `.env` with commands that don't display the body (`read -rsp` + `sed -i`). Mask for diagnostics: `grep '^FOO=' .env | sed 's/=.*/=***/'`.
31. **Sed mask regex MUST include underscores when masking API keys** (NEW — Section 92, May 11, 2026, the Resend rotation incident). The character class `[A-Za-z0-9]` misses `_` (used by Resend) and `-` (used by Cloudflare API tokens). Use the universal form: `sed -E 's/=[A-Za-z0-9_.-]+$/=***/'` — masks everything after `=` regardless of provider format. ALWAYS eyeball the masked output before sharing for diagnostics: a 5-second check catches a wrong regex.

---

## Workflow rules (CLAUDE.md highlights)

- **One command at a time** in chat — Hedar pastes one PowerShell or bash block per turn.
- **Flow diagrams only for substantive architectural discussions**, not routine operational steps.
- **Levantine Arabic in chat** — `شو`, `هلق`, `بدك`, `لازم`, `منيح`, `بسيط`. `شغّل` (not `ركض`). Masculine address.
- **GitHub CLI + auto-merge** — `gh pr create --fill --base main ; gh pr merge --auto --squash --delete-branch`.
- **ALWAYS delete the local branch after merge** — `--delete-branch` only deletes the remote.
- **Don't put `"تم"` or any echo-only command inside PowerShell blocks** — Hedar types "تم" in chat.
- **File-based log convention for large tool output** — see CLAUDE.md Section 4.7. `Out-File -Encoding utf8` (NEVER bare `>`).
- **DECISIONS.md is the archive**, not the entry point.
- **Testing pool-vs-role interactions** — use `jest.isolateModules` with `process.env.DATABASE_URL` rewritten to production role.
- **(Section 91)** — **explicit `git add <file>` paths** for any commit touching credentials.
- **(Section 92)** — **`sed -E 's/=[A-Za-z0-9_.-]+$/=***/'`** for universal `.env` value masking. Always eyeball the masked output before sharing.

---

## End-of-session checklist (Claude must run BEFORE saying "session done")

1. **All work merged to main** — verify `gh pr list --state open` is empty.
2. **HANDOFF.md replaced** — update timestamp, latest-deployed, last-merged, migration table, next-task. Add new pitfalls.
3. **DECISIONS.md** has a new Section for any non-trivial work. Today: Sections 91 + 92.
4. **Push HANDOFF + DECISIONS** as a small docs PR. Wait for merge.
5. **Brief Hedar** with: "PR merged, HANDOFF updated, next session starts on <X>."

---

## Out-of-band notes (read on demand)

- `CLAUDE.md` — full working rules.
- `DECISIONS.md` — full decision history (11,000+ lines). Search by Section number.
- `RECOVERY.md` — credentials inventory, cost summary.
- `SCHEMA.md` — DB schema reference.
- `API.md` — backend endpoint reference.
- `.env.example` — required env variables (updated PR #207 for EMAIL_PROVIDER + RESEND_API_KEY; PR #209 removed ADMIN_API_KEY block).
- `migrations/*.sql` — DB migration files.
- `.github/workflows/ci.yml` — CI pipeline definition.

---

**Maintainer:** Hedar Hallak (hedar.hallak@gmail.com) | **Repo:** hedarhallak/mep-platform | **Production:** https://app.constrai.ca
