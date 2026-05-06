# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 6, 2026, ~11:40 UTC — after Phase 4 Stage 1 (PR #145) merged.

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
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Section 88)
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
| Latest deployed to prod | Phase 3 (email-based login) — May 6, 2026, ~03:00 UTC |
| Last merged to main | Phase 4 Stage 1 (PR #145) — May 6, 2026, 11:37 UTC — **NOT yet deployed to prod** |
| Active program | **Multi-Tenant Migration** (Section 85, Phases 1-8) — Phase 4 in progress |
| Mobile app | Still on legacy username login — backend keeps backward-compat |

### Multi-tenant migration progress

| Phase | Status | DECISIONS section |
|---|---|---|
| Section 85 — Architecture (Model C single domain) | ✅ Done | 85 |
| Phase 1 — Cloudflare + Origin SSL | ✅ Deployed | 86 |
| Phase 2 — Tenant Resolver | ✅ No-op (Model C) | 87 |
| Phase 3 — DB schema 011 + email login | ✅ Deployed | 87 |
| **Phase 4a — RLS Stage 1 (permissive policies)** | ✅ **Merged, not yet deployed** | 88 |
| **Phase 4b — RLS Stage 2 (req.db middleware)** | ⏳ **NEXT** | TBD (Section 89+) |
| Phase 4c — RLS Stage 3 (strict policies) | ⏳ Pending | TBD |
| Phase 5 — SUPER_ADMIN portal split | ⏳ Pending | TBD |
| Phase 6 — Frontend tenant context + branding | ⏳ Pending | TBD |
| Phase 7 — 2FA + biometric + account security | ⏳ Pending | TBD |
| Phase 8 — Audit + compliance | ⏳ Pending | TBD |
| Email migration SendGrid → Resend (before Phase 6) | ⏳ Pending | TBD |
| UI smoke test (Section 84, 9 tasks) | ⏸️ Paused | Resume after Phase 8 |

---

## Next task: Phase 4b — RLS Stage 2 (req.db middleware)

**Goal:** introduce a per-request transaction wrapper that calls `SET LOCAL app.company_id = $userCompanyId` so backend routes start setting the GUC. Once all routes are migrated, Stage 3 can drop the permissive bypass clause.

**Two parts:**

1. **Pre-work — deploy migration 012 to prod first.** Stage 2 backend code references the GUC; deploying it without RLS infrastructure on prod is wrong order. The deploy is ~5 min: SSH, pre-migration backup, run migration, verify with the queries at the bottom of `migrations/012_rls_stage1_permissive.sql`.

2. **Stage 2 implementation:**
   - `middleware/db_context.js` exposing `req.db` — a per-request transaction wrapper that calls `SET LOCAL app.company_id = $userCompanyId` before any route logic runs.
   - Migrate routes batch by batch (5-10 routes per PR, lowest-risk read-heavy first). For each batch:
     - Replace `pool.query(...)` with `req.db.query(...)`.
     - Add an integration test that confirms cross-tenant queries return 0 rows after middleware sets the GUC.
   - Plan ~5-7 batch PRs over Stage 2.

3. **`mepuser_super` role** — create in Stage 2 first PR (deferred from Stage 1). BYPASSRLS DB role used by SUPER_ADMIN routes that legitimately span tenants (e.g. cross-tenant company listings, billing dashboards).

> NOTE: there are some untracked WIP files on Hedar's local working tree from a previous session (`middleware/tenant_db.js`, `migrations/012_enable_rls_permissive.sql`, `tests/integration/rls.test.js`, `scripts/postgres/`). They were a prior attempt at Stage 2 that didn't ship. The names differ from the canonical ones above (`db_context.js`, not `tenant_db.js`); leave them as untracked reference material or `git clean -df` them when starting Stage 2 fresh.

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

`mepuser_super` DB password (Stage 2, not yet created): will live in password manager + `.env` on prod when Stage 2 ships.

Cost inventory (services + monthly bill ~$37 USD): see `RECOVERY.md` Section 2.4.

---

## Critical pitfalls (encoded from Sections 86 + 87 + 88)

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
13. **RLS doesn't apply to BYPASSRLS roles** (NEW Section 88) — superusers (incl. `postgres`) and roles with the BYPASSRLS attribute bypass every policy. RLS integration tests must `SET LOCAL ROLE mepuser` (or any non-super role) inside the transaction so the policy actually filters. `FORCE ROW LEVEL SECURITY` doesn't help here — it only forces RLS on table OWNERS, not on BYPASSRLS roles.
14. **CI uses `postgres` role for tests** — see `.github/workflows/ci.yml` line 55 (`TEST_DATABASE_URL: postgres://postgres:testpass@...`). The workflow also pre-creates `mepuser` (line 75). Any RLS-specific test should switch to mepuser via `SET LOCAL ROLE mepuser` after granting it needed privileges (GRANT inside the same transaction rolls back cleanly with ROLLBACK, so no testdb pollution).
15. **`git checkout main` fails silently with dirty tree** (NEW Section 88) — if you have uncommitted changes that conflict with the target branch, `git checkout main` quietly stays on the current branch instead of switching. A subsequent `git pull origin main` then merges main into your CURRENT branch (opening vim for the merge message). To switch cleanly: stash first (`git stash push`), then checkout, then pop. To recover from this happening: `git merge --abort` (or `:q!` in vim) → `git stash` → `git checkout` → `git stash pop`.
16. **`git stash pop` can lose cleanly-applied files when there's a conflict in another file** (NEW Section 88) — if stash pop succeeds on most files but conflicts on one, the cleanly-applied ones may revert silently to their pre-pop state in some workflows. After a stash pop with conflict, always Read each previously-stashed file via Claude's Read tool to verify content actually changed. Don't trust the absence of a conflict marker as proof the change applied.
17. **PowerShell's bare `>` redirect uses UTF-16 with BOM** (NEW Section 88) — files written this way come back with spaces between every character when Claude's Read tool parses them, and aren't easy to grep. Always `Out-File -Encoding utf8 -FilePath <name>.log`. See CLAUDE.md Section 4.7 for the full file-based log convention.

---

## Workflow rules (CLAUDE.md highlights)

- **One command at a time** in chat — Hedar pastes one PowerShell or bash block per turn, not bundles.
- **Flow diagrams only for substantive architectural discussions** (not for routine git commands or operational steps).
- **Levantine Arabic in chat** — use `شو`, `هلق`, `بدك`, `لازم`, `منيح`, `بسيط`. Use `شغّل` (not `ركض`) for "run a command". Address Hedar with masculine forms.
- **GitHub CLI + auto-merge** — every PR is one line:
  ```
  gh pr create --fill --base main ; gh pr merge --auto --squash --delete-branch
  ```
- **ALWAYS delete the local branch after merge** (NEW May 6) — `--delete-branch` only deletes the REMOTE. After `gh pr view <num> --json mergedAt` shows merged, run:
  ```
  git checkout main && git pull origin main
  git branch -D <branch-name>
  git push origin --delete <branch-name>   # safety: ensures stale remote is gone
  ```
  Skipping this leads to "Frankenstein PR" issues (Section 88 retro): if a remote branch with the same name lingers from a previous session, `git push -u origin <name>` from a recreated local branch will merge the two histories silently and your PR ends up with extra commits / wrong files.
- **Don't put `"تم"` or any echo-only command inside PowerShell blocks** (NEW May 6) — Hedar types "تم" in chat to signal completion. Embedding it in the script just clutters his terminal without telling Claude anything.
- **File-based log convention for large tool output** (NEW May 6) — see CLAUDE.md Section 4.7. Save big outputs (CI logs, test failures, diffs) to `<workspace>\<purpose>.log` (overwriting, UTF-8). Hedar types one-word ack in chat; Claude reads the file directly. Never paste 1000+ line outputs into chat.
- **DECISIONS.md is the archive**, not the entry point — only read the 2-3 latest sections referenced in this HANDOFF.md.

---

## End-of-session checklist (Claude must run BEFORE saying "session done")

1. **All work merged to main** — verify `gh pr list --state open` is empty (or only has auto-merge-pending PRs that will merge soon).
2. **HANDOFF.md updated** — replace the entire file content to reflect the new state. Update:
   - "Last updated" timestamp
   - "Latest deployed to prod" / "Last merged to main" rows in Current state
   - Multi-tenant migration progress table (mark completed phase, advance NEXT)
   - "Next task" section (rewrite for the new next task)
   - Add any new pitfalls discovered this session
3. **DECISIONS.md** has a new Section (or extended existing one) for any non-trivial work this session. For Phase 4 stages, extend the existing Section (e.g., 88 covers Stage 1 design + closeout) until that stage is fully done; Stage 2 will get its own section once it lands.
4. **Push HANDOFF.md to main** — separate small PR, auto-merge enabled. **Wait for the PR to actually merge before the user closes the session.**
5. **Brief Hedar** with: "PR merged, HANDOFF updated, Phase X done, next session starts on Phase Y."

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
