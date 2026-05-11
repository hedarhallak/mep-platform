# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 11, 2026 ~08:30 UTC — **Phase 4 fully restored, Phase 5 closed.** Piece 90-G shipped (PR #204, squash `d149ac0`, merged 2026-05-11 08:00:53 UTC). db.js now exports `superPool`; routes/auth.js routes all pre-tenant strict-table SELECTs through `authPool = superPool || pool`. Migration 013 re-applied on prod at ~08:00 UTC, SA login + admin-portal login + refresh-token rotation all verified under Stage 3 strict RLS. New regression test `tests/integration/rls_stage3_login.test.js` covers Pitfall #28 end-to-end via `jest.isolateModules`. **Next task: Email migration SendGrid → Resend** (the carried-over pre-Phase-6 item).

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
   - `DECISIONS.md` (read ONLY the latest 2-3 sections referenced below — DON'T read the whole 10,800+ line file)
   - `RECOVERY.md` Section 2.4 only (cost inventory) if relevant to today's task
3. **Echo this exact line** as the first line of your reply so Hedar knows bootstrap completed:
   ```
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 90 / 90-G, Phase 5 closed, next is Email SendGrid → Resend)
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
| Server SSH | `ssh root@143.110.218.84` (Ubuntu 24.04) |
| Backend | Node.js + Express + Postgres 16, pm2-managed at `/var/www/mep` |
| Frontend | React + Vite + Tailwind, deployed to `/var/www/mep/mep-frontend/dist` (tenant) + admin entry served from same dist via Nginx vhost |
| Latest deployed to prod | **90-G fix + migration 013 re-applied** — May 11, 2026 ~08:00 UTC. SA login, admin-portal login, and refresh-token rotation all verified under Stage 3 strict RLS. |
| Last merged to main | 90-G auth.js superPool fix (squash `d149ac0`, PR #204) — May 11, 2026. No code PRs pending; docs PR for 90-G closeout pending. |
| Active program | **Multi-Tenant Migration** (Section 85, Phases 1-8) — **Phase 5 closed** (90-A through 90-G all shipped, Phase 4 Stage 3 strict RLS fully restored on prod) |
| Mobile app | Still on legacy username login — backend keeps backward-compat |

### Multi-tenant migration progress

| Phase | Status | DECISIONS section |
|---|---|---|
| Section 85 — Architecture (Model C single domain) | ✅ Done | 85 |
| Phase 1 — Cloudflare + Origin SSL | ✅ Deployed | 86 |
| Phase 2 — Tenant Resolver | ✅ No-op (Model C) | 87 |
| Phase 3 — DB schema 011 + email login | ✅ Deployed | 87 |
| Phase 4a — RLS Stage 1 (permissive policies) | ✅ Deployed | 88 |
| Phase 4b — RLS Stage 2 (req.db middleware) | ✅ Deployed (22/22 routes on req.db) | 89-A through 89-D |
| **Phase 4c — RLS Stage 3 (strict policies)** | ✅ **Deployed AND restored after 90-F outage** | 89-E/1, 89-E/2, 89-E/3, 90-G |
| **Phase 5 — SUPER_ADMIN portal split** | ✅ **CLOSED** (90-A through 90-G shipped) | 90 |
| Phase 6 — Frontend tenant context + branding | ⏳ Pending | TBD |
| Phase 7 — 2FA + biometric + account security | ⏳ Pending | TBD |
| Phase 8 — Audit + compliance | ⏳ Pending | TBD |
| **Email migration SendGrid → Resend (before Phase 6)** | ⏳ **Next** | TBD |
| UI smoke test (Section 84, 9 tasks) | ⏸️ Paused | Resume after Phase 8 |

### Phase 5 pieces (all done)

| Piece | Scope | Status |
|---|---|---|
| 90-A | DNS + Cloudflare + Nginx for `admin.constrai.ca` | ✅ Deployed (May 9) |
| 90-B | Backend vhost split (adminApp + tenantApp) | ✅ Deployed (May 9) |
| 90-C | Frontend Vite multi-entry | ✅ Deployed (May 10) |
| 90-D | Admin shell + All Companies list | ✅ Deployed (May 10) |
| 90-D-fix | PWA service-worker scoping | ✅ Deployed (May 10) |
| 90-E | Auth gate + AdminLogin form | ✅ Deployed (May 10) |
| 90-F | UAT + critical 013 rollback (incident) | ✅ Closed (May 11 ~05:08 UTC) |
| **90-G** | **auth.js superPool + re-apply 013** | ✅ **Deployed (May 11 ~08:00 UTC)** |

### 89-C bulk route migration progress (Phase 4b — unchanged)

All 22 authenticated routes on `req.db` (RLS-enforced). Phase 4b is closed. See DECISIONS.md Section 89 for the full history.

---

## Next task: Email migration SendGrid → Resend

The carried-over pre-Phase-6 item. SendGrid has been the transactional-email provider since Section 60 (invite emails, daily dispatch, PO PDFs, password reset, etc.). Resend has been on the backlog for a few sessions because (a) it's cheaper at low volumes, (b) the SDK and DX are simpler, (c) Hedar has already obtained an API key (stored in `.secrets/resend.txt`, gitignored).

**Scope (proposed; confirm at session start):**

1. **Add a thin `lib/email.js` abstraction** that wraps the active provider. Today every email call goes directly to `@sendgrid/mail`. Wrap behind a `sendEmail({ to, subject, html, text, from? })` function so the provider can be swapped in one place.
2. **Implement the Resend backend.** Install `resend` npm package, add a `RESEND_API_KEY` env var, route `sendEmail` to Resend when the key is set.
3. **Dual-write transition (one or two sessions).** Keep SendGrid as the default, add an opt-in env flag (`EMAIL_PROVIDER=resend`) for staging-style cutover. Once Resend is verified working, flip the default.
4. **Domain + DNS.** Resend needs SPF + DKIM records for `constrai.ca`. Cloudflare DNS — straightforward. Verify in Resend dashboard.
5. **Cutover.** Set `EMAIL_PROVIDER=resend` on prod, restart pm2, send a test email through each transactional path (invite, PO, dispatch reminder). After 24h with no incidents, remove the SendGrid fallback code.
6. **Cost / cleanup.** Cancel SendGrid subscription after 30 days of clean Resend traffic.

**Out of scope:**
- Email template redesign (current FR-only templates stay).
- Marketing emails (no marketing email today, deferred).
- Bounce/click webhooks (Resend supports them, but only worth wiring if we add analytics).

**Suggested first PR:** the `lib/email.js` abstraction + Resend backend behind a feature flag, no cutover. ~½ day. Followup PR does the actual cutover.

### Backlog items still open (carried forward — not blockers)

These were listed in the previous HANDOFF and remain open. Address opportunistically before Phase 6 starts.

- **`routes/attendance.js` `notifyForeman` helper** still uses `pool.query` for the fire-and-forget DB read inside the SendGrid send. Under Stage 3 strict that read returns 0 rows; the email body would silently come out empty. Apply the 89-E/1 prepareNotifyData / fireNotifyEmails split pattern. **Action:** open a small PR before any feature work that exercises foreman notifications. The Resend migration above is a natural moment to do this since `lib/email.js` will already touch attendance's email path.
- **`routes/project_trades.js`** has a redundant top-level `router.use(auth)` (auth runs twice). Pre-existing, harmless, low-priority cleanup.
- **pg DeprecationWarning: "Calling client.query() when the client is already executing a query"** — visible in pm2 logs after every prod restart. Pre-existing pattern issue (not from 013); a separate hygiene PR should track it down. Likely candidate: a route still doing parallel `Promise.all([client.query(...), client.query(...)])` on a single client. Confirmed still showing in 90-G's pm2 restart output, so it's persistent.
- **Coverage threshold ratchet** — Phase 4 + 90-G added 3 test files total (rls.test.js + rls_stage1.test.js + rls_stage3_login.test.js), all Stage-3-aware. Total integration suite is 42+. After a few quiet days, run `TEST_DATABASE_URL=… npx jest --coverage` and consider ratcheting if the measured value has crept ≥3 pp above the current threshold (per CLAUDE.md Section 4.6 convention).
- **System restart required (kernel update on the Droplet).** Surfaced as a `*** System restart required ***` banner on SSH login during 90-G deploy. Schedule a low-traffic-window reboot at next maintenance window. Not urgent; backend keeps running.

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
| `mepuser_super` DB password | Apple Passwords (`Constrai Prod - mepuser_super DB`) + `/var/www/mep/.env` (`DATABASE_URL_SUPER` — confirmed present on prod during 90-G deploy) |

Cost inventory (services + monthly bill ~$37 USD): see `RECOVERY.md` Section 2.4.

---

## Critical pitfalls (encoded from Sections 86 + 87 + 88 + 89 + 90)

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
15. **`git checkout main` fails silently with dirty tree** (Section 88) — if you have uncommitted changes that conflict with the target branch, `git checkout main` quietly stays on the current branch instead of switching. To switch cleanly: stash first (`git stash push`), then checkout, then pop.
16. **`git stash pop` can lose cleanly-applied files when there's a conflict in another file** (Section 88) — after a stash pop with conflict, always Read each previously-stashed file via Claude's Read tool to verify content actually changed.
17. **PowerShell's bare `>` redirect uses UTF-16 with BOM** (Section 88) — Always `Out-File -Encoding utf8 -FilePath <name>.log`. See CLAUDE.md Section 4.7 for the full file-based log convention.
18. **GitHub web "Update branch" button creates duplicate squash commits when clicked on already-merged branches** (Section 89, May 7, 2026) — after `gh pr merge --squash` succeeds, the local branch should be cleaned up immediately and the GitHub web UI for that branch should NOT be touched.
19. **`openssl rand -hex N` over `-base64 N` for connection-string passwords** (Section 89, May 7, 2026) — base64 produces `+`, `/`, `=` characters that need percent-encoding inside `postgres://user:PASS@host/db` URLs. Hex is URL-safe by construction.
20. **Read untracked WIP files before writing fresh code** (Section 89, May 7, 2026) — when HANDOFF mentions "abandoned WIP files" left untracked, they may actually be 90% production-ready. Convention: `git status` + `Read` each untracked file first.
21. **`middleware/permissions.js` `can()` calls `pool.query` directly** ✅ **CLOSED by 89-D, May 8, 2026.**
22. **Per-request transaction middleware MUST commit BEFORE the response is flushed** (Section 89, 89-C/1-fix, May 7, 2026) — override `res.end` so the response body is held until COMMIT resolves.
23. **`try { INSERT } catch { handle dup }` patterns DO NOT survive inside a tenantDb transaction** (Section 89, 89-C/9, May 8, 2026) — refactor to `INSERT ... ON CONFLICT DO NOTHING RETURNING *` and check `rows.length` instead of catching. **Convention:** when migrating any route, grep for `try ... catch.*query|UNIQUE|ON CONFLICT` patterns BEFORE pushing the migration PR.
24. **Orphan-account 401 from tenantDb is the cross-route contract** (Section 89, 89-C/12, May 8, 2026) — migrating onto tenantDb makes route-level 403 for missing company_id unreachable (tenantDb returns 401 NO_TENANT_IN_TOKEN first). Update `tenant_isolation.test.js` from 403 → 401 in the same PR.
25. **SUPER_ADMIN seedUser needs an explicit 8+ char PIN** (Section 89, 89-C/15, May 8, 2026) — `routes/auth.js#isValidPin` enforces length 8-32 for SUPER_ADMIN. The default `seedUser` PIN `'1234'` (4 chars) is rejected. **Convention:** any test that logs in as SUPER_ADMIN must seed with `pin: 'sa-pin-1234'` or similar.
26. **Test files that pin a transitional stage's contract become blockers at the next stage's cutover** (Section 89, 89-E/3, May 9, 2026) — when a multi-stage migration ratchets behavior over time, tests that assert the **current** stage's exact contract will fail mechanically when the next stage lands. **Convention:** label the test name with the stage + future migration; add a comment near the assertion referencing the future change.
27. (reserved — folded into #28 below.)
28. **Strict RLS breaks pre-tenant queries (login, signup, anything-running-before-tenant)** ✅ **CLOSED by 90-G, May 11, 2026.** (Section 90 / Piece 90-F + 90-G.) Strict RLS on a table that a pre-tenant route needs to SELECT from will silently break those routes in production. The pre-tenant route uses a tenant-unaware connection (no GUC set), strict policies filter every row, route returns "user not found" — but for callers it looks like wrong credentials, bad PIN format, expired invite, etc. **Resolution:** `db.js` now exports a `superPool` (BYPASSRLS via `mepuser_super`), `routes/auth.js` routes every pre-tenant lookup through `authPool = superPool || pool`. CI regression test `tests/integration/rls_stage3_login.test.js` covers the bug shape end-to-end via `jest.isolateModules` — an isolated Express app instance backed by a non-BYPASSRLS pool returns 200 when DATABASE_URL_SUPER is wired and non-200 when not. **General rule (carried forward):** any future pre-tenant code path that SELECTs from a strict-RLS table must use `superPool` (or its equivalent). The `jest.isolateModules` testing pattern is reusable — when a test needs to exercise the actual route handler against a production-shape pool (non-BYPASSRLS), reach for it.

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
  Skipping this leads to "Frankenstein PR" issues (Section 88 retro).
- **Don't put `"تم"` or any echo-only command inside PowerShell blocks** — Hedar types "تم" in chat to signal completion. Embedding it in the script just clutters his terminal without telling Claude anything.
- **File-based log convention for large tool output** — see CLAUDE.md Section 4.7. Save big outputs (CI logs, test failures, diffs) to `<workspace>\<purpose>.log` (overwriting, UTF-8). Hedar types one-word ack in chat; Claude reads the file directly. Never paste 1000+ line outputs into chat.
- **DECISIONS.md is the archive**, not the entry point — only read the 2-3 latest sections referenced in this HANDOFF.md.
- **NEW from 90-G — testing pool-vs-role interactions:** when a test needs to exercise an Express route handler against a non-BYPASSRLS pool (i.e., production-shape pool identity), use `jest.isolateModules` with `process.env.DATABASE_URL` temporarily rewritten to the production role. See `tests/integration/rls_stage3_login.test.js` for the canonical pattern. Set `DATABASE_URL_SUPER=''` (empty string) rather than `delete process.env.DATABASE_URL_SUPER` so `dotenv` doesn't repopulate it from a local `.env` file.

---

## End-of-session checklist (Claude must run BEFORE saying "session done")

1. **All work merged to main** — verify `gh pr list --state open` is empty (or only has auto-merge-pending PRs that will merge soon).
2. **HANDOFF.md updated** — replace the entire file content to reflect the new state. Update:
   - "Last updated" timestamp
   - "Latest deployed to prod" / "Last merged to main" rows in Current state
   - Multi-tenant migration progress table (mark completed phase, advance NEXT)
   - "Next task" section (rewrite for the new next task)
   - Add any new pitfalls discovered this session
3. **DECISIONS.md** has a new Section (or extended existing one) for any non-trivial work this session. Phase 5 / Piece 90-G uses the existing Section 90 — extended, not new.
4. **Push HANDOFF.md to main** — separate small PR, auto-merge enabled. **Wait for the PR to actually merge before the user closes the session.**
5. **Brief Hedar** with: "PR merged, HANDOFF updated, Phase 5 closed, next session starts on Email SendGrid → Resend."

---

## Out-of-band notes (read on demand)

- `CLAUDE.md` — full working rules, naming conventions, code map, communication rules
- `DECISIONS.md` — full decision history (10,800+ lines, archive). Search for specific Section numbers; don't read sequentially.
- `RECOVERY.md` — credentials inventory, cost summary, backup/recovery runbooks
- `SCHEMA.md` — DB schema reference (read when doing DB work)
- `API.md` — backend endpoint reference (read when doing route work)
- `.env.example` — required environment variables
- `migrations/*.sql` — DB migration files, numbered
- `.github/workflows/ci.yml` — CI pipeline definition (read when debugging CI failures or adding test infrastructure)

---

**Maintainer:** Hedar Hallak (hedar.hallak@gmail.com) | **Repo:** hedarhallak/mep-platform | **Production:** https://app.constrai.ca
