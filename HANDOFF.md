# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 11, 2026 ~10:30 UTC — **Phase 5 closed + Resend abstraction shipped + secrets-leak incident remediated** (Section 91). Two pieces of code work shipped today: PR #204 (Phase 5 Piece 90-G, auth.js superPool + 013 re-apply) and PR #207 (Resend provider behind EMAIL_PROVIDER flag, no cutover yet). Plus an unplanned security incident: a `git add -A` in PR #206 swept four `.secrets/*` files to GitHub for ~15 minutes; force-deleted, Resend key revoked, Cloudflare Origin cert rotated + redeployed + revoked, `mepuser_super` DB password rotated end-to-end on prod. **Several other leaked secrets remain unrotated — see "Pending rotations" below.** **Next task: Resend cutover on prod** (DNS SPF/DKIM + EMAIL_PROVIDER=resend + smoke). This also retires SendGrid and one of the pending rotations.

---

## How to start a new session (Hedar — copy this one line)

```
استكمال Constrai. اطلب مجلد C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed (request_cowork_directory)، اقرأ HANDOFF.md من المجلد، اتبع التعليمات فيه بالحرف.
```

That's it. The receiving Claude reads `HANDOFF.md`, follows the bootstrap protocol below, and is ready to continue work in 1-2 messages.

---

## Bootstrap protocol (Claude — follow this exactly)

When you receive the one-line command above:

1. **Request folder access** via `request_cowork_directory` for `C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed`.
2. **Read these 4 files** (use the Read tool, NOT bash — bash sandbox can return stale content):
   - `HANDOFF.md` (this file — for current state + next task)
   - `CLAUDE.md` (working rules, Sections 1-9)
   - `DECISIONS.md` (read ONLY the latest 2-3 sections referenced below — DON'T read the whole 10,900+ line file). Today's session added Section 91 (the secrets-leak incident); read it in addition to Section 90 / Piece 90-G.
   - `RECOVERY.md` Section 2.4 only (cost inventory) if relevant to today's task
3. **Echo this exact line** as the first line of your reply so Hedar knows bootstrap completed:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 91, leak remediated, JWT_SECRET + others pending, next is Resend cutover)
   ```
4. **Confirm the next task** in 1-2 lines (from "Next task" below).
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
| Frontend | React + Vite + Tailwind, deployed to `/var/www/mep/mep-frontend/dist` (tenant) + admin entry served from same dist via Nginx vhost |
| Latest deployed to prod | **Resend abstraction (PR #207, squash `f8ce5bb`)** + **new Cloudflare Origin cert** (deployed ~09:43 UTC May 11) + **`mepuser_super` DB pw rotated** (~10:15 UTC May 11) |
| Last merged to main | PR #207 `feat(email): Resend provider behind EMAIL_PROVIDER flag (no cutover)` — May 11, 2026 ~09:30 UTC |
| Active program | **Multi-Tenant Migration** (Section 85, Phases 1-8) — **Phase 5 CLOSED**. Currently in Email migration (pre-Phase 6). |
| Mobile app | Still on legacy username login — backend keeps backward-compat |

### Multi-tenant migration progress

| Phase | Status | DECISIONS section |
|---|---|---|
| Section 85 — Architecture (Model C single domain) | ✅ Done | 85 |
| Phase 1 — Cloudflare + Origin SSL | ✅ Deployed (+ origin cert rotated May 11 after leak) | 86, 91 |
| Phase 2 — Tenant Resolver | ✅ No-op (Model C) | 87 |
| Phase 3 — DB schema 011 + email login | ✅ Deployed | 87 |
| Phase 4a — RLS Stage 1 (permissive policies) | ✅ Deployed | 88 |
| Phase 4b — RLS Stage 2 (req.db middleware) | ✅ Deployed (22/22 routes on req.db) | 89-A through 89-D |
| Phase 4c — RLS Stage 3 (strict policies) | ✅ Deployed AND restored after 90-F outage | 89-E/1..3, 90-G |
| Phase 5 — SUPER_ADMIN portal split | ✅ CLOSED (90-A through 90-G shipped) | 90 |
| **Email migration SendGrid → Resend** | 🟡 **In progress** — abstraction shipped (PR #207); cutover pending | 91-adjacent (TBD) |
| Phase 6 — Frontend tenant context + branding | ⏳ Pending | TBD |
| Phase 7 — 2FA + biometric + account security | ⏳ Pending | TBD |
| Phase 8 — Audit + compliance | ⏳ Pending | TBD |
| UI smoke test (Section 84, 9 tasks) | ⏸️ Paused | Resume after Phase 8 |

---

## Pending rotations (from Section 91 leak — May 11, 2026)

Three rotations completed today (Cloudflare cert+key, Resend API key, `mepuser_super` DB pw). The remaining secrets were also in the leaked `.secrets/Constrai Prod -Keys.txt` and need rotation. Priority order:

| Secret | Risk | Recommended action | When |
|---|---|---|---|
| `JWT_SECRET` | **HIGH** — anyone with this can forge access + refresh tokens for any user, including SUPER_ADMIN. Token forgery = full backend compromise. | Generate `openssl rand -hex 32`, update `.env`, `pm2 restart`. **Invalidates every active session** — every user logs in again. | Dedicated session in a low-traffic window (e.g., late evening Quebec time). |
| `SENDGRID_API_KEY` | MEDIUM — abusable for sending emails as Constrai (reputation risk). | **No standalone rotation.** The Resend cutover (next task) decommissions SendGrid entirely. | Auto-retired by Resend cutover. |
| `mepuser` DB pw (`MepSecure2026X`) | MEDIUM — DB is `localhost`-only, so exploit requires SSH access to the Droplet. Still: rotate. | Same flow as `mepuser_super`: psql `\password mepuser`, sed-edit `DATABASE_URL` in `.env`, `pm2 restart`. | Can be batched with JWT_SECRET (one combined restart). |
| `ADMIN_API_KEY` | LOW — `.env.example` says "optional shared secret … fall back to role-based auth only" if unset. Verify actual usage first. | Audit codebase for `ADMIN_API_KEY` references. If unused, delete from `.env` instead of rotating. | Low priority. |
| `AUTH_SECRET` | LOW — not documented in `.env.example`. Purpose unclear. | Audit codebase. May be safe to delete entirely. | Low priority. |
| `MAPBOX_ACCESS_TOKEN` | LOW — `pk.` public token, abuse = quota theft. | Generate new in Mapbox dashboard, update `.env`, restart. | Low priority. |
| `SENTRY_DSN` | NEGLIGIBLE — DSN is semi-public by design. | Skip unless misuse appears. | Optional. |

---

## Next task: Resend cutover on prod

The Resend abstraction shipped in PR #207 — `lib/email.js#getMailClient()` dispatches between `@sendgrid/mail` (default) and the Resend SDK (when `EMAIL_PROVIDER=resend`). Production currently runs with `EMAIL_PROVIDER` unset (= SendGrid). This task flips the switch.

**Scope:**

1. **Cloudflare DNS — SPF + DKIM for Resend.** In the Cloudflare dashboard, add the TXT records Resend provides at `https://resend.com/domains` (after adding `constrai.ca` as a sending domain). Wait for verification (usually <5 min).
2. **Create a fresh Resend API key.** Name it `Constrai Prod - 2026-05-XX` with the actual day. **Do not reuse** the old "Onboarding" key (revoked May 11 after the leak). Sending-access scope is sufficient.
3. **Update prod `.env`:**
   - Set `EMAIL_PROVIDER=resend`.
   - Set `RESEND_API_KEY=re_<new-key>`.
   - Leave `SENDGRID_API_KEY` in place for one more deploy (rollback safety).
4. **`pm2 restart mep-backend`** + verify `pm2 logs` shows no errors at startup.
5. **Smoke test each transactional path** (these together cover every direct-`sgMail.send` site that the abstraction now routes through Resend):
   - SA-triggered invite email (e.g., create a test user via `/api/admin/users`).
   - PO PDF send (create a small material request + send PO).
   - Daily dispatch reminder (manual cron trigger or wait for next scheduled run).
   - Foreman notify (any attendance check-in that triggers it). **Note:** the `routes/attendance.js#notifyForeman` helper still has the pool-without-GUC pre-tenant-read bug from the 90-G carryforward list — fix that BEFORE this smoke test if a foreman notify gets exercised. Otherwise the email body comes out empty regardless of which provider sends it.
6. **Verify in Resend dashboard** that emails actually arrived (sender stats + recipient delivery).
7. **After ~24 hours of clean Resend traffic:** remove `SENDGRID_API_KEY` from prod `.env` and delete the SendGrid sub-user account. Update CLAUDE.md / HANDOFF to remove SendGrid references.

**Out of scope (separate follow-up PRs):**
- The `routes/attendance.js#notifyForeman` Pitfall #28 carryforward fix (split prepareNotifyData / fireNotifyEmails like 89-E/1). Should ship as its own small PR before the Resend cutover if the smoke test will exercise foreman notify.
- JWT_SECRET rotation (separate dedicated session, see Pending rotations).

**Suggested first message after bootstrap:** "بدي ابدأ بـ Resend cutover. أنشأت الـ DNS records على Cloudflare؟"

---

## Phase 5 pieces (all done — historical)

| Piece | Scope | Status |
|---|---|---|
| 90-A | DNS + Cloudflare + Nginx for `admin.constrai.ca` | ✅ Deployed (May 9) |
| 90-B | Backend vhost split (adminApp + tenantApp) | ✅ Deployed (May 9) |
| 90-C | Frontend Vite multi-entry | ✅ Deployed (May 10) |
| 90-D | Admin shell + All Companies list | ✅ Deployed (May 10) |
| 90-D-fix | PWA service-worker scoping | ✅ Deployed (May 10) |
| 90-E | Auth gate + AdminLogin form | ✅ Deployed (May 10) |
| 90-F | UAT + critical 013 rollback (incident) | ✅ Closed (May 11 ~05:08 UTC) |
| 90-G | auth.js superPool + re-apply 013 | ✅ Deployed (May 11 ~08:00 UTC) |

### 89-C bulk route migration progress (Phase 4b — unchanged)

All 22 authenticated routes on `req.db` (RLS-enforced). Phase 4b is closed. See DECISIONS.md Section 89 for the full history.

---

## Backlog items still open (carried forward — not blockers)

These were on the list before today and remain open. Address opportunistically.

- **`routes/attendance.js#notifyForeman` Pitfall #28 carryforward.** Helper still uses `pool.query` for the fire-and-forget DB read inside the SendGrid send. Under Stage 3 strict that read returns 0 rows; email body silently comes out empty. Apply 89-E/1 prepareNotifyData / fireNotifyEmails split pattern. **Action:** small PR before the Resend cutover smoke test if foreman notifications will be exercised.
- **`routes/project_trades.js`** has a redundant top-level `router.use(auth)` (auth runs twice). Pre-existing, harmless, low-priority cleanup.
- **pg DeprecationWarning: "Calling client.query() when the client is already executing a query"** — visible in pm2 logs after every prod restart. Pre-existing pattern issue (not from 013); a separate hygiene PR should track it down. Likely candidate: a route still doing parallel `Promise.all([client.query(...), client.query(...)])` on a single client.
- **Coverage threshold ratchet** — Phase 4 + 90-G + Resend PR added 4 test files total (rls.test.js, rls_stage1.test.js, rls_stage3_login.test.js, email_resend_wrapper.test.js). Total integration + smoke suite is 43+. After a few quiet days, run `TEST_DATABASE_URL=… npx jest --coverage` and consider ratcheting if the measured value has crept ≥3 pp above the current threshold (per CLAUDE.md Section 4.6 convention).
- **System restart required (kernel update on the Droplet).** `*** System restart required ***` banner on SSH login persists. Schedule a low-traffic-window reboot at next maintenance window. Coordinate with the JWT_SECRET rotation (since both invalidate in-flight sessions).
- **Stale GitHub blob `0512476` (the leak commit).** Remains in GitHub's object DB until automatic GC. Not referenced by any branch. All credentials inside are revoked. No action needed unless residual concerns require contacting GitHub Support to expedite GC.

---

## Active credentials & secrets locations

All credentials live in Hedar's password manager. Secrets repo-side:

| Secret | Location |
|---|---|
| Cloudflare Origin Certificate (`May 7, 2041` validity) | `C:\Users\Lenovo\OneDrive\Desktop\Constrai Keys\` on workstation + `/etc/nginx/ssl/cloudflare/cloudflare-origin.pem` on prod. **NEVER inside the repo's `.secrets/` directory** (Pitfall #29 / #30). |
| Cloudflare Origin Private Key | Same workstation folder as cert + `/etc/nginx/ssl/cloudflare/cloudflare-origin.key` on prod. |
| Resend API key | **No key currently exists.** Create at the start of the cutover task. Store in Apple Passwords as `Constrai Prod - Resend YYYY-MM-DD`. Do NOT save in `.secrets/`. |
| Server `/var/www/mep/.env` | Password-manager secure note (kept in sync after any rotation). |
| DigitalOcean Spaces keys | Password manager. |
| Apple Developer / Expo / GitHub | Password manager. |
| `mepuser_super` DB password | Apple Passwords (`Constrai Prod - mepuser_super DB`) — **updated 2026-05-11 ~10:15 UTC**. `DATABASE_URL_SUPER` in `/var/www/mep/.env` reflects the new value. |

Cost inventory (services + monthly bill ~$37 USD): see `RECOVERY.md` Section 2.4.

---

## Critical pitfalls (encoded from Sections 86 + 87 + 88 + 89 + 90 + 91)

1. **Bash sandbox file sync lag** — bash may return stale file content. Always use the Read tool to verify file state, or use PowerShell from Hedar's machine.
2. **Edit tool can silently lose changes** — after a sequence of Edit calls, verify each change with Read tool immediately. Don't assume "successfully" means "persisted on disk".
3. **Notepad adds `.txt` to filenames** silently. Use VS Code, or change "Save as type" to "All Files (*.*)" before saving.
4. **Cloudflare cert/key copy can be swapped** — after saving cert/key files, run `head -3` on each to confirm the file content matches the filename (`-----BEGIN CERTIFICATE-----` for `.pem`, `-----BEGIN PRIVATE KEY-----` for `.key`).
5. **CRLF + UTF-8 BOM break PEM parsing** — run `dos2unix file.pem file.key` on the server before installing.
6. **`npm ci --omit=dev` fails on husky** — use `npm ci --omit=dev --ignore-scripts`, or skip the npm step entirely if no new dependencies.
7. **Untracked file on server blocks `git pull`** — if a file was SCP'd ahead of its PR, delete it on the server before pulling.
8. **PR auto-merge can flip dependency order** — when two PRs depend on each other, enable `--auto` only on the leaf PR; manually merge the dependency PR after confirming order.
9. **`gh pr merge` requires branch up-to-date with main** — after a sibling PR merges, rebase the still-open PR's branch with `git rebase origin/main` + `git push --force-with-lease`.
10. **Don't open a new session before previous PRs merge** — wait for `gh pr view <num>` to show `Merged`. Otherwise the next session inherits a dirty working tree and merge conflicts.
11. **Cherry-picking can cross feature branches** — run `git status` (or `git branch --show-current`) immediately before any `git add` / `git commit` to verify the target branch.
12. **Replace this file at end of session, don't append** — `HANDOFF.md` is meant to be small and current. Long history goes in `DECISIONS.md`.
13. **RLS doesn't apply to BYPASSRLS roles** — superusers + roles with the BYPASSRLS attribute bypass every policy. RLS integration tests must `SET LOCAL ROLE mepuser` inside the transaction.
14. **CI uses `postgres` role for tests** — any RLS-specific test should switch to mepuser via `SET LOCAL ROLE mepuser` after granting it needed privileges.
15. **`git checkout main` fails silently with dirty tree** — stash first.
16. **`git stash pop` can lose cleanly-applied files when there's a conflict in another file** — verify file contents via Read tool after pop.
17. **PowerShell's bare `>` redirect uses UTF-16 with BOM** — always `Out-File -Encoding utf8 -FilePath <name>.log`. CLAUDE.md Section 4.7.
18. **GitHub web "Update branch" button creates duplicate squash commits when clicked on already-merged branches** — never touch GitHub UI for a branch after `gh pr merge`.
19. **`openssl rand -hex N` over `-base64 N` for connection-string passwords** — hex is URL-safe.
20. **Read untracked WIP files before writing fresh code** — `git status` + `Read` each untracked file first.
21. **`middleware/permissions.js` `can()` calls `pool.query` directly** ✅ CLOSED by 89-D.
22. **Per-request transaction middleware MUST commit BEFORE the response is flushed** — override `res.end`, not `res.on('finish')`.
23. **`try { INSERT } catch { handle dup }` patterns DO NOT survive inside a tenantDb transaction** — refactor to `INSERT ... ON CONFLICT DO NOTHING RETURNING *`.
24. **Orphan-account 401 from tenantDb is the cross-route contract** — update tenant_isolation.test.js from 403 → 401 when migrating routes that had their own 403 for missing company_id.
25. **SUPER_ADMIN seedUser needs an explicit 8+ char PIN** — `seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' })`.
26. **Test files that pin a transitional stage's contract become blockers at the next stage's cutover** — label tests with stage + future migration in the test name.
27. (reserved — folded into #28.)
28. **Strict RLS breaks pre-tenant queries** ✅ CLOSED by 90-G. The fix: `authPool = superPool || pool` in `routes/auth.js`. Tests via `jest.isolateModules` ensure regression coverage.
29. **NEVER use `git add -A` in branches that touch credential-adjacent areas** (NEW — Section 91, May 11, 2026). Use explicit `git add <file1> <file2> ...` paths. Always run `git status --short` before `git commit` and verify every entry. `.gitignore` MUST have `.secrets/`, `*.key`, `*.pem`, `*.p12`, `*.pfx` rules (these were added in Section 91; rules now live in `.gitignore`). Periodically prune stray files from the working tree — they don't belong in untracked state for long.
30. **NEVER paste `.env` contents or screenshots into any chat** (NEW — Section 91, May 11, 2026). Multimodal AI assistants, chat platforms, screen-sharing tools all log conversations and may store images. Even private chats are subpoena-accessible and may be in training pipelines. When editing `.env` interactively, prefer commands that don't display the file body (`read -rsp` + `sed -i` is canonical; see Section 91). To show a value safely, mask it: `grep '^FOO=' .env | sed 's/=.*/=***/'`.

---

## Workflow rules (CLAUDE.md highlights)

- **One command at a time** in chat — Hedar pastes one PowerShell or bash block per turn, not bundles.
- **Flow diagrams only for substantive architectural discussions** (not for routine git commands or operational steps).
- **Levantine Arabic in chat** — use `شو`, `هلق`, `بدك`, `لازم`, `منيح`, `بسيط`. Use `شغّل` (not `ركض`) for "run a command". Address Hedar with masculine forms.
- **GitHub CLI + auto-merge** — every PR is one line:
  ```
  gh pr create --fill --base main ; gh pr merge --auto --squash --delete-branch
  ```
- **ALWAYS delete the local branch after merge** — `--delete-branch` only deletes the REMOTE. After `gh pr view <num> --json mergedAt` shows merged:
  ```
  git checkout main && git pull origin main
  git branch -D <branch-name>
  git push origin --delete <branch-name>
  ```
- **Don't put `"تم"` or any echo-only command inside PowerShell blocks** — Hedar types "تم" in chat to signal completion.
- **File-based log convention for large tool output** — see CLAUDE.md Section 4.7. Save outputs to `<workspace>\<purpose>.log` (overwriting, UTF-8). Hedar types one-word ack in chat; Claude reads the file directly.
- **DECISIONS.md is the archive**, not the entry point — only read the 2-3 latest sections referenced in this HANDOFF.md.
- **Testing pool-vs-role interactions** — use `jest.isolateModules` with `process.env.DATABASE_URL` rewritten to the production role. See `tests/integration/rls_stage3_login.test.js`. Set `DATABASE_URL_SUPER=''` (empty string) rather than `delete process.env.DATABASE_URL_SUPER` so dotenv doesn't repopulate.
- **(NEW from Section 91)** — **explicit `git add <file>` paths for any commit that could touch credentials**. NEVER `git add -A` near the `.secrets/` area or anywhere that might pick up untracked workstation files. The `.gitignore` rules added in Section 91 are a safety net, not the primary defense.

---

## End-of-session checklist (Claude must run BEFORE saying "session done")

1. **All work merged to main** — verify `gh pr list --state open` is empty (or only has auto-merge-pending PRs).
2. **HANDOFF.md updated** — replace entire file content. Update "Last updated" timestamp, "Latest deployed to prod", "Last merged to main", migration progress table, and "Next task". Add any new pitfalls.
3. **DECISIONS.md** has a new Section (or extended existing) for any non-trivial work. Section 91 covers the May 11 leak incident.
4. **Push HANDOFF + DECISIONS to main** — separate small docs PR, auto-merge enabled. Wait for actual merge before closing the session.
5. **Brief Hedar** with: "PR merged, HANDOFF updated, <next-task-summary>."

---

## Out-of-band notes (read on demand)

- `CLAUDE.md` — full working rules, naming conventions, code map, communication rules.
- `DECISIONS.md` — full decision history (10,900+ lines, archive). Search for specific Section numbers; don't read sequentially.
- `RECOVERY.md` — credentials inventory, cost summary, backup/recovery runbooks.
- `SCHEMA.md` — DB schema reference.
- `API.md` — backend endpoint reference.
- `.env.example` — required environment variables (NB: `EMAIL_PROVIDER` + `RESEND_API_KEY` added in PR #207).
- `migrations/*.sql` — DB migration files, numbered.
- `.github/workflows/ci.yml` — CI pipeline definition.

---

**Maintainer:** Hedar Hallak (hedar.hallak@gmail.com) | **Repo:** hedarhallak/mep-platform | **Production:** https://app.constrai.ca
