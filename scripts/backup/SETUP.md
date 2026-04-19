# MEP Database Backup — Setup Guide

> **Goal:** Automated daily PostgreSQL backups uploaded to DigitalOcean Spaces, with 7 daily / 4 weekly / 3 monthly retention.
>
> **Scripts in this folder:**
> - `backup_db.sh` — runs pg_dump + compresses + uploads to Spaces
> - `cleanup_old_backups.sh` — deletes old backups per retention policy
> - `restore_db.sh` — downloads a backup and restores it to a target DB

---

## Part 1 — DigitalOcean Dashboard (browser, ~5 min)

### 1.1 Create a Space

1. Go to https://cloud.digitalocean.com/spaces
2. Click **Create a Space**
3. Settings:
   - **Datacenter region:** `TOR1` (Toronto — closest to Quebec, same region as the Droplet for low-latency transfer, keeps data in Canada)
   - **Enable CDN:** No (not needed for backups)
   - **Restrict File Listing:** Yes (private)
   - **Space name:** `constrai-backups`
   - **Project:** any (default is fine)
4. Click **Create a Space**

### 1.2 Generate Spaces Access Key

1. Go to https://cloud.digitalocean.com/account/api/spaces
2. Click **Generate New Key**
3. Name: `mep-backup-key`
4. Copy both values immediately (the Secret is shown only once):
   ```
   Access Key: DO00XXXXXXXXXXXXXXXX
   Secret Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. Save them in your password manager — you'll paste them into the server config below.

---

## Part 2 — Server Setup (SSH as root, ~10 min)

### 2.1 SSH into the server

```bash
ssh root@143.110.218.84
```

### 2.2 Install s3cmd

```bash
apt-get update
apt-get install -y s3cmd
```

### 2.3 Configure s3cmd for DigitalOcean Spaces

```bash
s3cmd --configure
```

Answer the prompts as follows (press Enter for anything not listed):

| Prompt | Answer |
|---|---|
| Access Key | `<paste Access Key from step 1.2>` |
| Secret Key | `<paste Secret Key from step 1.2>` |
| Default Region | `tor1` |
| S3 Endpoint | `tor1.digitaloceanspaces.com` |
| DNS-style bucket+hostname | `%(bucket)s.tor1.digitaloceanspaces.com` |
| Encryption password | *(leave empty, just press Enter)* |
| Path to GPG program | *(default)* |
| Use HTTPS protocol | `Yes` |
| HTTP Proxy | *(leave empty)* |
| Test access with supplied credentials | `Y` |
| Save settings | `y` |

> **Expected behavior with Limited Access keys:** the test will fail with `403 AccessDenied: Are you sure your keys have s3:ListAllMyBuckets permissions?` — this is correct and expected. Limited Access keys are scoped to a single bucket and don't have account-wide list permissions. Choose `n` (don't retry) and `y` (save settings), then verify against the specific bucket below.
>
> If you see any other error (network failure, authentication error, etc.), re-run `s3cmd --configure` and double-check the endpoint values.

Quick smoke test — list your bucket (should return an empty listing):
```bash
s3cmd ls s3://constrai-backups/
```

### 2.4 Create the backup config file

```bash
nano /etc/mep-backup.env
```

Paste this, filling in your real DB password:

```bash
# /etc/mep-backup.env — loaded by backup scripts; keep mode 600, root only

DB_NAME=mepdb
DB_USER=mepuser
DB_PASSWORD=MepSecure2026X
DB_HOST=localhost
DB_PORT=5432

SPACES_BUCKET=constrai-backups

# Optional: healthchecks.io URL (see Part 4). Leave empty to disable.
HEALTHCHECK_URL=
```

Lock it down so only root can read it (contains the DB password):
```bash
chmod 600 /etc/mep-backup.env
chown root:root /etc/mep-backup.env
```

### 2.5 Pull the latest code (contains the scripts)

```bash
cd /var/www/mep
git pull origin main
```

### 2.6 Make scripts executable

```bash
chmod +x /var/www/mep/scripts/backup/*.sh
```

### 2.7 Create the log file

```bash
touch /var/log/mep-backup.log
chown root:root /var/log/mep-backup.log
chmod 644 /var/log/mep-backup.log
```

### 2.8 Run a test backup manually

```bash
/var/www/mep/scripts/backup/backup_db.sh
```

Expected output (last line): `===== Backup complete =====`

Verify the file landed in Spaces:
```bash
s3cmd ls s3://constrai-backups/daily/
```

You should see one `.sql.gz` file with today's date.

### 2.9 Schedule the cron jobs

Open root's crontab:
```bash
crontab -e
```

Add these lines at the bottom:
```cron
# MEP DB backup — daily 07:00 UTC (= 03:00 Quebec EDT / 02:00 EST)
0 7 * * * /var/www/mep/scripts/backup/backup_db.sh >> /var/log/mep-backup.log 2>&1

# MEP DB retention cleanup — daily 07:30 UTC (after backup finishes)
30 7 * * * /var/www/mep/scripts/backup/cleanup_old_backups.sh >> /var/log/mep-backup.log 2>&1
```

> Server time is UTC. We schedule at `07:00 UTC` so backups run during the early-morning quiet window in Quebec (3 AM EDT / 2 AM EST), well outside business hours.

Save and exit (Ctrl+O, Enter, Ctrl+X in nano).

Verify:
```bash
crontab -l | grep mep-backup
```

### 2.10 Check server timezone

```bash
timedatectl
```

Cron uses the server's local time. If you want backups at 03:00 Montreal time, confirm `Time zone: America/Toronto` (or Montreal). To change:
```bash
timedatectl set-timezone America/Toronto
```

---

## Part 3 — Restore Test (IMPORTANT — do this once)

A backup you've never tested to restore is not a backup. Run this once after setup:

```bash
# Find your latest backup
s3cmd ls s3://constrai-backups/daily/

# Restore to a TEST DB (safe — does NOT touch mepdb)
/var/www/mep/scripts/backup/restore_db.sh \
    s3://constrai-backups/daily/mepdb_<DATE>.sql.gz \
    mepdb_restoretest
```

Answer `yes` when prompted.

Verify the restore looks correct:
```bash
sudo -u postgres psql -d mepdb_restoretest -c "SELECT COUNT(*) FROM users;"
sudo -u postgres psql -d mepdb_restoretest -c "SELECT COUNT(*) FROM employees;"
sudo -u postgres psql -d mepdb_restoretest -c "SELECT COUNT(*) FROM projects;"
```

Counts should match production. If yes — backups are legit.

Clean up the test DB:
```bash
sudo -u postgres psql -d postgres -c "DROP DATABASE mepdb_restoretest;"
```

---

## Part 4 — Optional: Dead-Man's-Switch Monitoring

The scripts work silently — if they break, you won't know unless you check the logs. To get an email/SMS if backups stop running:

1. Sign up free at https://healthchecks.io (free tier: 20 checks)
2. Create a check: name `MEP DB Backup`, schedule `daily`, grace period `6 hours`
3. Copy the ping URL: `https://hc-ping.com/<uuid>`
4. Paste into `/etc/mep-backup.env`:
   ```bash
   HEALTHCHECK_URL=https://hc-ping.com/<uuid>
   ```
5. Next successful backup will ping. If the ping doesn't arrive for 24h + 6h grace, you'll get an email.

---

## Part 5 — Ongoing Operations

### View recent backup activity
```bash
tail -50 /var/log/mep-backup.log
```

### List all backups in Spaces
```bash
s3cmd ls s3://constrai-backups/daily/
s3cmd ls s3://constrai-backups/weekly/
s3cmd ls s3://constrai-backups/monthly/
```

### Disk usage in Spaces
```bash
s3cmd du s3://constrai-backups/
```

### Restore after an incident
See `restore_db.sh` header for full procedure. Summary:
```bash
# 1. Stop the app
pm2 stop mep-backend

# 2. Restore to a staging DB name
/var/www/mep/scripts/backup/restore_db.sh s3://constrai-backups/daily/<file>.sql.gz mepdb_recovered

# 3. Verify row counts match expectations

# 4. Swap DB names
sudo -u postgres psql -d postgres -c "ALTER DATABASE mepdb RENAME TO mepdb_broken;"
sudo -u postgres psql -d postgres -c "ALTER DATABASE mepdb_recovered RENAME TO mepdb;"

# 5. Start the app
pm2 start mep-backend
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `s3cmd: command not found` | `apt-get install -y s3cmd` |
| `access denied` on s3cmd | Re-run `s3cmd --configure`; check keys, endpoint `tor1.digitaloceanspaces.com` |
| `pg_dump: role does not exist` | Check `DB_USER` in `/etc/mep-backup.env` |
| `pg_dump: password authentication failed` | Check `DB_PASSWORD` in `/etc/mep-backup.env` |
| Backups run but nothing appears in Spaces | Check `SPACES_BUCKET` name matches exactly |
| Log shows `another backup is already running` | A previous run is stuck — `rm /var/run/mep-backup.lock` |
| Cron runs but backups don't appear | Check the cron user (should be root) — `sudo crontab -l` |
| Restore: `permission denied to create extension "postgis"` | Restore must use postgres superuser. Confirm `restore_db.sh` uses `sudo -u postgres psql` (already fixed in current version) |
| Restore: `psql: error: ... Permission denied` reading SQL file | postgres OS user can't read root's `/tmp` dirs. Confirm restore script pipes via `cat \| psql` (already fixed in current version) |
| `git pull` fails with "would be overwritten" on `scripts/backup/*.sh` | File-mode (chmod +x) drift. Run `git checkout scripts/backup/ && git pull && chmod +x scripts/backup/*.sh` |
