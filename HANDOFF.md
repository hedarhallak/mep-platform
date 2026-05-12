# Constrai — Session Handoff

> **Single source of truth for new conversations.** This file is REPLACED (not appended) at the end of every session.
> Last updated: May 11, 2026 ~13:00 UTC — **All Section 91 leak rotations COMPLETE.** Today's session was a marathon: 5 code/docs PRs + 6 secret rotations + 2 dead-env-var deletions + full Resend cutover (verified end-to-end) + JWT_SECRET rotation + first-ever kernel reboot (which uncovered pm2 startup wasn't configured → fixed, Pitfall #32). Phase 5 closed, Email migration cutover deployed (24h watch ongoing). **Next task: Phase 6 — Frontend tenant context + branding** OR `SENDGRID_API_KEY` decommission (after May 12 ~12:00 UTC).

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
   (محادثة استكمال — قرأت HANDOFF.md + DECISIONS.md Sections 91/92/93, all leak rotations done, next is Phase 6 frontend tenant branding)
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

## Next task: Phase 6 — Frontend tenant context + branding

Section 85 architecture queued Phase 6 to follow Phase 5 (which closed today). The Phase 6 deliverable:

> **Per-tenant branding in the tenant React app.** Each company gets its own logo + accent colors, loaded from the backend on app boot. The admin portal stays unbranded (cross-tenant tool).

**Scope (proposed; refine at session start):**

1. **DB schema (migration 014?):** add `companies.brand_color` (varchar 7, hex) + `companies.brand_logo_url` (text, S3/Spaces URL or relative path). Backfill with defaults for existing tenants.
2. **Backend endpoint:** `GET /api/companies/:id/branding` — returns `{ brand_color, brand_logo_url, company_name }`. Public route (no auth) so login screen can load branding before user is authenticated.
3. **Frontend bootstrap:** on app load, resolve tenant from hostname → fetch branding → apply CSS variables (`--color-primary`, `--color-primary-dark`) + swap logo. Login screen shows tenant branding instead of generic Constrai.
4. **Admin upload UI** (probably a Phase 6 sub-piece): tenant admin uploads logo + picks accent color. Stored in DigitalOcean Spaces. Saved to `companies.brand_*` fields.
5. **Mobile app:** later — out of scope for the first PR.

**Out of scope for Phase 6:**
- Multi-region branding (each region = different logo). Not needed today.
- Theming the admin portal per SA preference. Admin stays unbranded.
- Per-user (vs per-tenant) preferences. Tenant-level only.

**Suggested first step at next session:** discuss the schema migration shape (single new table vs columns on existing companies table) + the upload pipeline (DigitalOcean Spaces direct vs. backend-proxied).

### Alternative: SendGrid decommission (after May 12 ~12:00 UTC)

If May 12 has come around and Resend has logged a healthy spread of backend-generated emails (invite, PO, dispatch, foreman) over the past 24 hours, this is the perfect 15-minute task to clear the SendGrid surface:

1. SSH to prod, `sed -i '/^SENDGRID_API_KEY=/d' /var/www/mep/.env`, `pm2 restart mep-backend`, verify SA login + a Resend-routed email path.
2. SendGrid dashboard → Settings → API Keys → delete the Constrai key.
3. SendGrid dashboard → Settings → Account → optionally delete the sub-user.
4. Update HANDOFF "Credentials" section to remove SendGrid entries.

---

## Product roadmap — strategic backlog (DECISIONS.md Section 94, May 11, 2026)

Six items added at end-of-session. NOT next-session tasks — capture-now-design-later. Each has full discussion in Section 94. Suggested sequencing (lightest first):

| # | Item | Effort | Status |
|---|---|---|---|
| 94.5 | Emergency purchase / invoice submission (workers submit receipts for reimbursement) | Small | Ideation |
| 94.3 | Materials return request workflow (surplus material flow back to inventory) | Small-medium | Schema partially exists |
| 94.4 | Equipment and tools request workflow (catalog + dispatch + return) | Medium | New schema needed |
| 94.1 + 94.2 | Subscription billing (Stripe) + renewals (dunning + grace + suspension) | Large (~2-3 weeks) | Critical for scaling past Hedar-as-sole-operator |
| 94.6 | Project achievement methodology + GC market expansion (cross-trade view, safety training records, accident reports) | Very large (~2-3 months) | **Validate with customer interviews FIRST.** Commercial upside if validated. |

These run in parallel with the Multi-Tenant Migration roadmap (Phases 6-8) above. Phase 6 (Frontend tenant branding) is independent and can ship alongside any of these.

---

## Backlog items still open (technical/operational)

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
