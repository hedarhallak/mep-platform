# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 10, 2026 — **Phase 4 done (May 9).** **Phase 5 in progress: 90-A + 90-B + 90-C + 90-D ✅ DONE.** 90-D shipped the first real admin screen (All Companies list with search + sort), the `GET /api/super/companies/overview` backend endpoint, 7 RTL tests, and tenant Nginx admin.html anti-leak + h2c smuggling cleanup (mirrored existing constrai.conf to `infra/nginx/constrai.conf`). **Next task: Piece 90-E — Auth flow validation across portals**: SA login on admin works, COMPANY_ADMIN can't reach admin login UI, cookie scope enforced separately per portal, audit log for cross-portal attempts. Plus a small follow-up cleanup deferred from 90-D: tighten `vite-plugin-pwa` so admin entry doesn't auto-register the SW.

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
   - `DECISIONS.md` (read ONLY the latest 2-3 sections referenced below — DON'T read the whole 8500+ line file)
   - `RECOVERY.md` Section 2.4 only (cost inventory) if relevant to today's task
3. **Echo this exact line** as the first line of your reply so Hedar knows bootstrap completed:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 90 / 90-D, next is 90-E)
   ```
4. **Confirm the next task** in 1-2 lines (from "Next task" below).
5. **Ask if Hedar is ready to start**, then wait.

**Do NOT** start coding/changes before Hedar confirms.

---

## Current state (snapshot)

| Item | Value |
|---|---|
| Production URL | `https://app.constrai.ca` |
| Login (test) | Email: `hedar.hallak@gmail.com` / PIN: `hedar2026` (SUPER_ADMIN) |
| Server SSH | `ssh root@143.110.218.84` (Ubuntu 24.04) |
| Backend | Node.js + Express + Postgres 16, pm2-managed at `/var/www/mep` |
| Frontend | React + Vite + Tailwind, deployed to `/var/www/mep/mep-frontend/dist` |
| Latest deployed to prod | **All Companies list (90-D)** — May 10, 2026. (90-C Vite multi-entry deployed earlier today; 90-B vhost split ~16:17 UTC; 90-A subdomain May 9.) |
| Last merged to main | 90-C Vite multi-entry (squash `d6fdb7e`) — May 10, 2026. 90-D PR pending. |
| Active program | **Multi-Tenant Migration** (Section 85, Phases 1-8) — **Phase 5 in progress** (90-A + 90-B + 90-C + 90-D done, 90-E next) |
| Mobile app | Still on legacy username login — backend keeps backward-compat |

### Multi-tenant migration progress

| Phase | Status | DECISIONS section |
|---|---|---|
| Section 85 — Architecture (Model C single domain) | ✅ Done | 85 |
| Phase 1 — Cloudflare + Origin SSL | ✅ Deployed | 86 |
| Phase 2 — Tenant Resolver | ✅ No-op (Model C) | 87 |
| Phase 3 — DB schema 011 + email login | ✅ Deployed | 87 |
| **Phase 4a — RLS Stage 1 (permissive policies)** | ✅ **Deployed to prod** | 88 |
| **Phase 4b — RLS Stage 2 (req.db middleware)** | ✅ **Deployed to prod** (22/22 routes on req.db) | 89-A through 89-D |
| **Phase 4c — RLS Stage 3 (strict policies)** | ✅ **Deployed to prod** (May 9, 2026, migration 013) | 89-E/1, 89-E/2, 89-E/3 |
| **Phase 5 — SUPER_ADMIN portal split** | ⏳ **Next** | TBD |
| Phase 6 — Frontend tenant context + branding | ⏳ Pending | TBD |
| Phase 7 — 2FA + biometric + account security | ⏳ Pending | TBD |
| Phase 8 — Audit + compliance | ⏳ Pending | TBD |
| Email migration SendGrid → Resend (before Phase 6) | ⏳ Pending | TBD |
| UI smoke test (Section 84, 9 tasks) | ⏸️ Paused | Resume after Phase 8 |

### 89-C bulk route migration progress

| Batch | Routes | Status |
|---|---|---|
| 89-C/1 | `/api/bi`, `/api/project-foremen`, `/api/project-trades` | ✅ **Deployed to prod** (May 7, 2026) |
| 89-C/2 | `/api/attendance` (single-route batch — see DECISIONS.md 89-C/2) | ✅ **Deployed to prod** (May 7, 2026) |
| 89-C/3 | `/api/reports` (single-route batch — see DECISIONS.md 89-C/3) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/4 | `/api/assignments/auto-*` (auto_assign.js — see DECISIONS.md 89-C/4) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/5 | `/api/users` (user_management.js — see DECISIONS.md 89-C/5) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/6 | `/api/hub` (hub.js — see DECISIONS.md 89-C/6) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/7 | `/api/standup` (standup.js — see DECISIONS.md 89-C/7) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/8 | `/api/projects` (projects.js — see DECISIONS.md 89-C/8) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/9 | `/api/daily-dispatch` (daily_dispatch.js — see DECISIONS.md 89-C/9) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/10 | `/api/materials` (material_requests.js — see DECISIONS.md 89-C/10) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/11 | `/api/assignments` + `/api/permissions` (bundled — see DECISIONS.md 89-C/11) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/12 | `/api/employees` (employees.js — see DECISIONS.md 89-C/12) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/13 | `/api/profile` + push-token (paired, q() helper refactor — see DECISIONS.md 89-C/13) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/14 | `/api/invite-employee` + `/api/admin/users` (bundled — see DECISIONS.md 89-C/14) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-C/15 | `/api/super` + `/api/super/ccq-rates` (bundled SUPER_ADMIN routes — see DECISIONS.md 89-C/15) | ✅ **Deployed to prod** (May 8, 2026) |
| Phase 4b status | ✅ **22 of 22 authenticated routes on req.db (100%)** — confirmed by audit at end of 89-C/15 (the "~25" estimate was high; actual is 22) |
| 89-D | middleware/permissions.js → req.db (Pitfall #21 closed) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-E/1 | notifyAssignment helper → req.db (split DB-reads from email-sends) | ✅ **Deployed to prod** (May 8, 2026) |
| 89-E/2 | audit + logAudit + calcDistanceKm helpers → req.db | ✅ **Deployed to prod** (May 8, 2026) |
| 89-E/3 | migration 013 strict RLS flip + audit_logs INSERT permissive policy | ✅ **Deployed to prod** (May 9, 2026) |

---

## Next task: Piece 90-E — Auth flow validation across portals

**Phase 5 architecture is fully wired and the first real screen ships:**

- **A**: subdomain `admin.constrai.ca` ✅ live (90-A)
- **B2**: Vite multi-entry frontend ✅ live (90-C). Tenant Nginx now blocks `/admin.html` static access (90-D).
- **C2**: Express vhost split ✅ live (90-B). 12 vhost_isolation assertions in CI.
- **First real admin screen**: All Companies list with search + sort + 7 RTL tests ✅ live (90-D).

**90-E scope:** make the auth flow work end-to-end on the admin portal, with proper isolation from the tenant flow.

1. **Admin login UI**: add `/login` route to `AdminApp.jsx` rendering a `<AdminLogin />` component. Posts to `/api/auth/login` (existing public endpoint). On success, stashes the token in a **separate** localStorage key — e.g. `mep_admin_token` — so admin and tenant tokens don't share a slot. The shared `lib/api.js` reads `mep_token` by default; either fork it (admin uses `lib/api-admin.js` reading the admin key) OR make `api.js` aware of the current portal and pick the right key based on hostname.
2. **Role gate at login**: server-side, when authenticating on Host=admin.constrai.ca, only accept `SUPER_ADMIN` role. Reject COMPANY_ADMIN with a clear "Use the tenant portal at app.constrai.ca" error. Conversely, when authenticating on Host=app.constrai.ca, allow any non-SA role; SA logging in here gets either a friendly "Use admin.constrai.ca" message OR a successful tenant-context login (decision to be made — Section 90's intent suggests SA can log into tenant view for testing).
3. **Cookie scope assertion**: integration test that proves `Set-Cookie` from the admin Host doesn't leak to the tenant Host (separate localStorage keys + no Domain attribute on cookies if we ever switch to cookie auth).
4. **Audit log entries** for cross-portal login attempts: every COMPANY_ADMIN trying to log into admin.constrai.ca gets an `AUDIT_BLOCKED_PORTAL_LOGIN` row so the next session reading `audit_logs` sees the attempt history.
5. **PWA scope tightening (cleanup deferred from 90-D)**: set `vite-plugin-pwa`'s `injectRegister: null` and call `registerSW()` explicitly only in `main.jsx`. Verify in dev that admin SW does NOT register.

**Out of scope for 90-E:**
- No 2FA or biometric. That's Phase 7.
- No SUPPORT_AGENT role (read-only cross-tenant access). Architecture stays open for it but no implementation in 90-E.
- No password reset / forgot-PIN UI for admin. Hedar is the only SA today; he doesn't need self-service.

**Suggested PR title:** `feat(s90-e): admin login flow + cross-portal auth validation`.

**Backlog items still open after Phase 4** (carried forward — not blockers for Phase 5 but should be tracked):

**Backlog items still open after Phase 4** (carried forward — not blockers for Phase 5 but should be tracked):

- **`routes/attendance.js` `notifyForeman` helper** still uses pool.query for the fire-and-forget DB read inside the SendGrid send. Under Stage 3 strict that read returns 0 rows; the email body would silently come out empty. Apply the 89-E/1 prepareNotifyData / fireNotifyEmails split pattern. **Action:** open a small PR before any feature work that exercises foreman notifications.
- **`routes/project_trades.js`** has a redundant top-level `router.use(auth)` (auth runs twice). Pre-existing, harmless, low-priority cleanup.
- **pg DeprecationWarning: "Calling client.query() when the client is already executing a query"** — visible in pm2 logs after every prod restart. Pre-existing pattern issue (not from 013); a separate hygiene PR should track it down. Likely candidate: a route still doing parallel `Promise.all([client.query(...), client.query(...)])` on a single client.
- **Coverage threshold ratchet** — Phase 4 added 2 new test files (rls.test.js + rls_stage1.test.js), both Stage-3-aware. Total integration suite is 41+. After a few quiet days, run `TEST_DATABASE_URL=… npx jest --coverage` and consider ratcheting if the measured value has crept ≥3 pp above the current threshold (per CLAUDE.md Section 4.6 convention).

---

## Active credentials & secrets locations

All credentials live in Hedar's password manager. Secrets repo-side:

| Secret | Location |
|---|---|
| Cloudflare Origin Certificate | `.secrets/cloudflare-origin.pem` (gitignored) |
| Cloudflare Origin Private Key | `.secrets/cloudflare-origin.key` (gitignored) |
| Resend API key | `.secrets/resend.txt` (gitignored) |
| Server `.env` (full contents) | Password manager secure note |
| DigitalOcean Spaces keys | Password manager |
| Apple Developer / Expo / GitHub | Password manager |
| `mepuser_super` DB password | Apple Passwords (`Constrai Prod - mepuser_super DB`) + `/var/www/mep/.env` (`DATABASE_URL_SUPER`) on prod |

Cost inventory (services + monthly bill ~$37 USD): see `RECOVERY.md` Section 2.4.

---

## Critical pitfalls (encoded from Sections 86 + 87 + 88 + 89)

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
13. **RLS doesn't apply to BYPASSRLS roles** (Section 88) — superusers (incl. `postgres`) and roles with the BYPASSRLS attribute bypass every policy. RLS integration tests must `SET LOCAL ROLE mepuser` (or any non-super role) inside the transaction so the policy actually filters. `FORCE ROW LEVEL SECURITY` doesn't help here — it only forces RLS on table OWNERS, not on BYPASSRLS roles.
14. **CI uses `postgres` role for tests** — see `.github/workflows/ci.yml` line 55 (`TEST_DATABASE_URL: postgres://postgres:testpass@...`). The workflow also pre-creates `mepuser` (line 75) and (after PR #153) GRANTs it table privileges. Any RLS-specific test should switch to mepuser via `SET LOCAL ROLE mepuser` after granting it needed privileges.
15. **`git checkout main` fails silently with dirty tree** (Section 88) — if you have uncommitted changes that conflict with the target branch, `git checkout main` quietly stays on the current branch instead of switching. A subsequent `git pull origin main` then merges main into your CURRENT branch (opening vim for the merge message). To switch cleanly: stash first (`git stash push`), then checkout, then pop. To recover from this happening: `git merge --abort` (or `:q!` in vim) → `git stash` → `git checkout` → `git stash pop`.
16. **`git stash pop` can lose cleanly-applied files when there's a conflict in another file** (Section 88) — if stash pop succeeds on most files but conflicts on one, the cleanly-applied ones may revert silently to their pre-pop state in some workflows. After a stash pop with conflict, always Read each previously-stashed file via Claude's Read tool to verify content actually changed. Don't trust the absence of a conflict marker as proof the change applied.
17. **PowerShell's bare `>` redirect uses UTF-16 with BOM** (Section 88) — files written this way come back with spaces between every character when Claude's Read tool parses them, and aren't easy to grep. Always `Out-File -Encoding utf8 -FilePath <name>.log`. See CLAUDE.md Section 4.7 for the full file-based log convention.
18. **GitHub web "Update branch" button creates duplicate squash commits when clicked on already-merged branches** (Section 89, May 7, 2026) — after `gh pr merge --squash` succeeds, the local branch should be cleaned up immediately (`git branch -D` + `git push origin --delete`) and the GitHub web UI for that branch should NOT be touched. If "Update branch" is clicked, GitHub creates a new merge commit on top of the just-merged branch, which (combined with `gh pr merge --auto` still being enabled or a "Compare & pull request" yellow banner) can produce a second PR with the same content that auto-merges into a duplicate squash commit on main. Today's main has duplicate `(#150)` and `(#151)` for the 89-A docs — file content is correct, but git history has noise. Lesson: the merge button is the LAST web interaction with a PR; everything after is local-terminal cleanup only.
19. **`openssl rand -hex N` over `-base64 N` for connection-string passwords** (Section 89, May 7, 2026) — base64 produces `+`, `/`, `=` characters that need percent-encoding inside `postgres://user:PASS@host/db` URLs, which adds friction during prod deploy. Hex is URL-safe by construction. 64 hex chars (32 bytes entropy = 256 bits) is plenty. Used for `mepuser_super` password during 89-A deployment.
20. **Read untracked WIP files before writing fresh code** (Section 89, May 7, 2026) — when HANDOFF mentions "abandoned WIP files" left untracked, they may actually be 90% production-ready. The `middleware/tenant_db.js` and `tests/integration/rls.test.js` WIPs from a prior session were both shippable as-is, saving hours of re-implementation in 89-B. Convention: at the start of any session that targets a feature with WIP files mentioned in HANDOFF, run `git status` + `Read` each untracked file first. Document any deviations from the HANDOFF naming in DECISIONS.md (e.g., 89-B kept `tenant_db.js` rather than renaming to the original `db_context.js`).
21. **`middleware/permissions.js` `can()` calls `pool.query` directly** ✅ **CLOSED by 89-D, May 8, 2026.** (Original observation, Section 89, 89-C/1: under Stage 1 permissive RLS this works, but under Stage 3 strict RLS every authenticated request will be rejected because `user_permissions` queries will return 0 rows when the GUC is unset on the pool client. Refactor must happen before 89-E ships.) **Resolution:** 89-D (squash `1c8bd8f`) added an optional `db` parameter to `userHasPermission(userId, role, permCode, db = pool)` and updated `can()`/`canAny()` to pass `req.db || pool`. Under Stage 2 either path works; under Stage 3 the pool fallback fails-closed. All 22 authenticated routes already mount tenantDb before `can()` fires, so `req.db` is always available; the pool fallback is defense-in-depth.
22. **Per-request transaction middleware MUST commit BEFORE the response is flushed** (Section 89, 89-C/1-fix, May 7, 2026) — the original `tenantDb` design used `res.on('finish', () => release('commit'))`, which fires AFTER the response body reaches the client. Tests (and any client) doing a write via the API followed immediately by a read on a separate pool connection can see stale data because the SELECT executes BEFORE the COMMIT lands. Fix: override `res.end` so the response body is held until COMMIT resolves. Surfaced when CI #418 on main went red on `tests/integration/project_foremen.test.js` "DELETE removes the foreman" — same code that passed CI #416 on the 89-C/1 PR (race won that time). Convention: any future per-request transaction middleware (e.g., a future `req.db.write` or a refactor of `tenantDb` for SUPER pool) MUST follow the `res.end` override pattern, not 'finish' / 'close' listeners alone, to avoid resurrecting this race.
23. **`try { INSERT } catch { handle dup }` patterns DO NOT survive inside a tenantDb transaction** (Section 89, 89-C/9, May 8, 2026) — under `pool.query` each query auto-commits, so an INSERT that fails on UNIQUE violation can be caught and the catch block can run a fresh SELECT. Under `req.db.query` (per-request transaction wrapping the whole handler), the INSERT failure aborts the transaction; subsequent queries fail with `current transaction is aborted, commands ignored until end of transaction block`. Refactor to `INSERT ... ON CONFLICT DO NOTHING RETURNING *` and check `rows.length` instead of catching. CI #452 on the 89-C/9 PR caught this — `daily_dispatch.test.js` "POST /prepare twice on same date returns 409 already_prepared" failed because the catch-block SELECT couldn't run after the dup INSERT poisoned the transaction. **Convention:** when migrating any route, grep for `try ... catch.*query|UNIQUE|ON CONFLICT` patterns BEFORE pushing the migration PR. Other patterns to watch: `try { UPDATE } catch { /* assume not found */ }` → use `RETURNING * + check rows.length`. For rare cases where catching a query error is unavoidable, use `SAVEPOINT` to wall off the failing query.
24. **Orphan-account 401 from tenantDb is the cross-route contract — route-level 403 for missing company_id becomes dead code** (Section 89, 89-C/12, May 8, 2026) — when a route had its own `if (!companyId) return res.status(403).json({ error: 'COMPANY_CONTEXT_REQUIRED' })` defensive branch (e.g. `routes/employees.js` line 35), migrating onto tenantDb makes that branch unreachable: tenantDb's own missing-company guard returns **401 NO_TENANT_IN_TOKEN** before the route handler ever runs. Existing tests in `tenant_isolation.test.js` written around the 403 contract will fail with `Expected: 403, Received: 401`. **Convention:** before pushing a migration PR for a route that has its own 403 for missing company_id, grep `tests/integration/tenant_isolation.test.js` for the route's path + 403 expectation, and update the test to expect 401 NO_TENANT_IN_TOKEN. Keep the route-level 403 in code as defense-in-depth (in case anything ever bypasses tenantDb), but document it as dead code under the normal middleware chain. CI #465 on the 89-C/12 PR caught this; fixed in commit `c0c2c8f`.
25. **SUPER_ADMIN seedUser needs an explicit 8+ char PIN** (Section 89, 89-C/15, May 8, 2026) — `routes/auth.js#isValidPin` enforces stricter format for SUPER_ADMIN: length 8-32 vs 4-8 for other roles. The default `seedUser` PIN `'1234'` (4 chars) is rejected by the auth/login endpoint with **400 INVALID_PIN_FORMAT** for SA, before any test logic runs. Surfaced when CI #480 on the 89-C/15 PR failed at test setup. Already documented in DECISIONS.md from CI #73 era but not previously encoded in HANDOFF's pitfalls list — re-encoding here. **Convention:** any test that logs in as SUPER_ADMIN must seed with an explicit `pin` override of length 8-32 chars: ``await seedUser({ role: 'SUPER_ADMIN', pin: 'sa-pin-1234' })``. Default `'1234'` works for every other role but not SA. Same gotcha applies if production ever ships a UI flow that creates SA accounts — the create endpoint must enforce ≥8 chars or the login will silently break.
26. **Test files that pin a transitional stage's contract become blockers at the next stage's cutover** (Section 89, 89-E/3, May 9, 2026) — when a multi-stage migration ratchets behavior over time (Stage 1 permissive → Stage 3 strict), tests that assert the **current** stage's exact contract (`expect(rows).toHaveLength(2)` for the GUC-unset case under Stage 1) will fail mechanically when Stage 3 lands. Discovery is delayed: CI #497 for migration 013 went red on `tests/integration/rls.test.js` + `tests/integration/rls_stage1.test.js` even though the migration logic was correct. Fix is mechanical (flip the assertions), but cost is one extra CI cycle per affected test file. **Convention:** when writing tests for a known-transitional stage, label the test name with the stage + future migration (e.g., "Stage 1 permissive baseline (will flip in migration 013, Stage 3)") and add a comment near the assertion referencing the future change. The next session reading the test then knows it's expected to change without re-deriving the dependency chain. Note: `employee_profiles` was deliberately kept at 2 rows in the Stage-3 update because that table isn't in 013's strict_tables list (no `company_id` column; it's joined through `employees` for tenant scope). When Stage 3 affects only some tables, document which tables aren't affected at the assertion site.

---

## Workflow rules (CLAUDE.md highlights)

- **One command at a time** in chat — Hedar pastes one PowerShell or bash block per turn, not bundles.
- **Flow diagrams only for substantive architectural discussions** (not for routine git commands or operational steps).
- **Levantine Arabic in chat** — use `شو`, `هلق`, `بدك`, `لازم`, `منيح`, `بسيط`. Use `شغّل` (not `ركض`) for "run a command". Address Hedar with masculine forms.
- **GitHub CLI + auto-merge** — every PR is one line:
  ```
  gh pr create --fill --base main ; gh pr merge --auto --squash --delete-branch
  ```
- **ALWAYS delete the local branch after merge** — `--delete-branch` only deletes the REMOTE. After `gh pr view <num> --json mergedAt` shows merged, run:
  ```
  git checkout main && git pull origin main
  git branch -D <branch-name>
  git push origin --delete <branch-name>   # safety: ensures stale remote is gone
  ```
  Skipping this leads to "Frankenstein PR" issues (Section 88 retro): if a remote branch with the same name lingers from a previous session, `git push -u origin <name>` from a recreated local branch will merge the two histories silently and your PR ends up with extra commits / wrong files.
- **Don't put `"تم"` or any echo-only command inside PowerShell blocks** — Hedar types "تم" in chat to signal completion. Embedding it in the script just clutters his terminal without telling Claude anything.
- **File-based log convention for large tool output** — see CLAUDE.md Section 4.7. Save big outputs (CI logs, test failures, diffs) to `<workspace>\<purpose>.log` (overwriting, UTF-8). Hedar types one-word ack in chat; Claude reads the file directly. Never paste 1000+ line outputs into chat.
- **DECISIONS.md is the archive**, not the entry point — only read the 2-3 latest sections referenced in this HANDOFF.md.

---

## End-of-session checklist (Claude must run BEFORE saying "session done")

1. **All work merged to main** — verify `gh pr list --state open` is empty (or only has auto-merge-pending PRs that will merge soon).
2. **HANDOFF.md updated** — replace the entire file content to reflect the new state. Update:
   - "Last updated" timestamp
   - "Latest deployed to prod" / "Last merged to main" rows in Current state
   - Multi-tenant migration progress table (mark completed phase, advance NEXT)
   - 89-C bulk route migration progress table (advance batch progress)
   - "Next task" section (rewrite for the new next task)
   - Add any new pitfalls discovered this session
3. **DECISIONS.md** has a new Section (or extended existing one) for any non-trivial work this session. For Phase 4 stages, extend the existing Section (e.g., 89 covers all Stage 2 pieces) until that stage is fully done; Stage 3 will get its own section once it lands.
4. **Push HANDOFF.md to main** — separate small PR, auto-merge enabled. **Wait for the PR to actually merge before the user closes the session.**
5. **Brief Hedar** with: "PR merged, HANDOFF updated, batch X done, next session starts on batch Y."

---

## Out-of-band notes (read on demand)

- `CLAUDE.md` — full working rules, naming conventions, code map, communication rules
- `DECISIONS.md` — full decision history (8500+ lines, archive). Search for specific Section numbers; don't read sequentially.
- `RECOVERY.md` — credentials inventory, cost summary, backup/recovery runbooks
- `SCHEMA.md` — DB schema reference (read when doing DB work)
- `API.md` — backend endpoint reference (read when doing route work)
- `.env.example` — required environment variables
- `migrations/*.sql` — DB migration files, numbered
- `.github/workflows/ci.yml` — CI pipeline definition (read when debugging CI failures or adding test infrastructure)

---

**Maintainer:** Hedar Hallak (hedar.hallak@gmail.com) | **Repo:** hedarhallak/mep-platform | **Production:** https://app.constrai.ca
