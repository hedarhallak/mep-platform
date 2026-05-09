# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 8, 2026 — after Phase 4c Piece 89-E/1 (notifyAssignment refactored to req.db) deployed to prod. **Phase 4b: 22/22 authenticated routes on req.db (100% ✅)**. Phase 4c: 89-D ✅, 89-E/1 ✅. Remaining: 89-E/2 (calcDistanceKm + logAudit + audit() helpers) + 89-E/3 (migration 013 strict RLS flip).

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
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 89)
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
| Latest deployed to prod | **Phase 4c Piece 89-E/1 (notifyAssignment → req.db)** — May 8, 2026 |
| Last merged to main | Piece 89-E/1 (squash `cb6f341`) — May 8, 2026 |
| Active program | **Multi-Tenant Migration** (Section 85, Phases 1-8) — Phase 4 in progress |
| Mobile app | Still on legacy username login — backend keeps backward-compat |

### Multi-tenant migration progress

| Phase | Status | DECISIONS section |
|---|---|---|
| Section 85 — Architecture (Model C single domain) | ✅ Done | 85 |
| Phase 1 — Cloudflare + Origin SSL | ✅ Deployed | 86 |
| Phase 2 — Tenant Resolver | ✅ No-op (Model C) | 87 |
| Phase 3 — DB schema 011 + email login | ✅ Deployed | 87 |
| **Phase 4a — RLS Stage 1 (permissive policies)** | ✅ **Deployed to prod** | 88 |
| **Phase 4b — RLS Stage 2 (req.db middleware)** | ⏳ **In progress** (89-A + 89-B + 89-C/1 deployed; 89-C/2..N next) | 89 |
| Phase 4c — RLS Stage 3 (strict policies) | ⏳ Pending | TBD |
| Phase 5 — SUPER_ADMIN portal split | ⏳ Pending | TBD |
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
| 89-E/2 | calcDistanceKm + logAudit + audit() helpers → req.db | ⏳ Pending |
| 89-E/3 | migration 013 strict RLS flip | ⏳ Pending |

---

## Next task: Phase 4c Piece 89-E/2 — calcDistanceKm + logAudit + audit() helpers → req.db

**Goal:** continue migrating remaining ~21 protected routes off `pool.query` onto `req.db.query`, batch by batch. Target batch size: 1-3 routes per PR (smaller is easier — see lessons captured in DECISIONS Section 89-C/1-fix). Once 100% of routes are on `req.db`, Stage 3 (89-E) can drop the "GUC unset = bypass" clause and RLS goes strict.

**Status entering this task** (per Section 89 in DECISIONS.md, sub-sections 89-C/1, 89-C/1-fix, 89-C/2):

- 89-C/1 migrated `/api/bi`, `/api/project-foremen`, `/api/project-trades`. Deployed to prod May 7, 2026.
- 89-C/1-fix corrected the tenantDb COMMIT race (override `res.end` instead of `res.on('finish')`). Deployed to prod same day.
- 89-C/2 migrated `/api/attendance`. Merged to main, awaiting prod deploy.
- The migration pattern is now fully proven across both small (1-handler) and medium (5-handler) routes, including helpers that need to retain pool access for fire-and-forget paths (notifyForeman pattern).

**Suggested 89-C/3 candidates (low-risk):**

1. **`auto_assign.js`** (6 queries) — small, mounted under `/api/assignments` alongside `assignments.js`. Both share the prefix; if migrating either, both mount lines need `tenantDb`. auto_assign alone is the smallest practical batch.
2. **`reports.js`** (11 queries) — read-heavy, similar shape to bi.js. Single-route batch.
3. **`profile.js` + `push_tokens_route.js`** — both mounted on `/api/profile`. profile.js uses a custom `q()` helper + module-level caches that need refactoring. Mid-complexity batch, do alone.

**89-D (SUPER pool wiring) and 89-E (Stage 3 graduation) come AFTER 89-C is 100% done.**

### Backlog items surfaced during 89-C/1 + 89-C/2

- **`middleware/permissions.js` `can()` uses `pool.query` directly.** Under Stage 1 permissive RLS this works (queries against `user_permissions` return rows when GUC is unset on the pool client). **Under Stage 3 strict RLS, every authenticated request will fail** because `can()` will see 0 user_permissions rows and reject. Fix planned for 89-D or 89-E: refactor `can()` to either consume `req.db` or use a SUPER-pool fallback.
- **`routes/attendance.js` `notifyForeman` helper** still uses pool.query (fire-and-forget after `res.json`). Stage 3 strict would block its SELECT (no GUC on the shared pool connection). Refactor pattern: prefetch the email-data fields via `req.db` BEFORE `res.json`, then fire-and-forget the SendGrid send (no DB) afterwards. Same pattern will apply to any future fire-and-forget DB-backed helper.
- **`routes/project_trades.js`** has a redundant top-level `router.use(auth)` (auth runs twice on every request — once from `app.js` mount, once internally). Pre-existing, harmless, but should be removed in a future cleanup PR. Out of scope for 89-C batches.

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
