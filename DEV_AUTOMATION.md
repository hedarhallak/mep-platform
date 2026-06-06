# DEV_AUTOMATION.md — faster build loop (DECISIONS §139)

Free productivity tooling so a one-hour session ships more, with fewer manual
steps. Nothing here changes app behavior; it changes the *workflow*.

---

## 1. `ship.ps1` — one-command PR

Instead of the 7-step ritual (branch → add → status → commit → push → pr
create → pr merge), run **one line** from PowerShell at the repo root, after
your edits are on disk:

```powershell
.\ship.ps1 -Message "feat(x): short summary" -Files routes/x.js,tests/x.test.js
```

It branches off `origin/main`, stages **only the files you name** (explicit
paths — Pitfall #29, so EOL churn never sneaks in), commits, pushes, opens the
PR, and arms squash auto-merge. Watch CI with `gh pr checks`. After it merges:

```powershell
git checkout main; git pull; git branch -D <the-branch>
```

Requires `git` + `gh` (GitHub CLI) authenticated.

---

## 2. CD — auto-deploy code on merge (`.github/workflows/deploy.yml`)

When **CI passes on `main`**, a Deploy workflow SSHes to the droplet and runs
the existing `scripts/deploy.sh` (pull → change-detect → frontend build → pm2
restart → health check). So for a normal **code-only** PR: *merge = deployed,
hands-free.*

It is **inert until you add three secrets** (the guard step skips otherwise),
so the file is safe to merge now and turn on later.

### One-time setup (when you're ready to enable it)

1. Make a **dedicated** deploy keypair (NOT your personal key) on any machine:
   ```bash
   ssh-keygen -t ed25519 -C "constrai-cd" -f constrai_cd_key
   ```
2. Put the **public** key on the server:
   ```bash
   # on the droplet
   cat constrai_cd_key.pub >> ~/.ssh/authorized_keys
   ```
3. Add three repo secrets (GitHub → Settings → Secrets and variables →
   Actions → New repository secret):
   - `DEPLOY_HOST` = `143.110.218.84`
   - `DEPLOY_USER` = `root` (or a dedicated deploy user)
   - `DEPLOY_SSH_KEY` = the **private** key file contents (`constrai_cd_key`)
4. Delete the local private key copy once it's in the secret.

**Security note (engineers should review):** this stores a prod-reaching key in
GitHub secrets and auto-deploys to prod on green CI. CI is the gate; `deploy.sh`
runs a health check. Use a dedicated, revocable key. This is a deliberate
speed/safety trade — see DECISIONS §138 G4.

---

## 3. Database migrations — now one command (after a one-time backfill)

`scripts/deploy.sh` and the CD **do NOT run migrations** (deliberate — schema
changes stay explicit). But applying them is now a single command instead of
per-file `psql`.

### One-time backfill (do this once on prod, before first `npm run migrate`)

Prod migrations 000–028 were applied manually, so the tracking table is empty.
Record them as already-applied:

```bash
# on the droplet
sudo -u postgres psql mepdb -f /var/www/mep/scripts/postgres/backfill_schema_migrations.sql
sudo -u postgres psql mepdb -c "SELECT count(*) FROM schema_migrations;"   # expect 29
```

### From then on

When a PR adds a migration, apply it with one command. Because our migrations
are **additive** (`ADD COLUMN`), apply them on prod **BEFORE merging** — old
code ignores the new columns, so there's no broken window:

```bash
cd /var/www/mep && git pull origin main   # or just have the file
npm run migrate                            # applies only PENDING migrations, records them
```

`scripts/migrate.js` applies forward migrations only (it now skips
`*.rollback.sql`) inside a transaction each, and records them in
`schema_migrations`.

**Migration-PR deploy order:** migrate on prod → merge PR → CD deploys the code.

---

## 4. Smaller speedups (process)

- **Batch related work into one PR** instead of one-per-task (fewer round-trips).
- **Claude self-verifies in the sandbox** when it's stable (e.g. `npx jest <file>`)
  before pushing, to avoid burning a CI cycle on a typo.
- **Execution decisions: Claude just picks the default**; only architectural
  (hard-to-undo) choices get a question (CLAUDE.md rule #3 / §8.9).

---

## TL;DR per PR, before vs after

| Step | Before | After |
|---|---|---|
| Open PR | ~7 pastes | `.\ship.ps1 -Message … -Files …` (1) |
| Deploy code | ssh + 4 cmds | automatic on green CI |
| Apply a migration | per-file `sudo psql` | `npm run migrate` (1) |
