# Constrai / MEP Platform — Recovery & Business Continuity

> **Purpose:** If Hedar is unavailable (sick, traveling, incapacitated) OR if the production system fails catastrophically, this document tells a trusted person exactly how to recover the service and keep the business running.
>
> **Audience:** Hedar (primary) + one designated technical backup contact.
>
> **Review cadence:** Every 3 months, or after any major infrastructure change.
>
> **Last reviewed:** April 18, 2026

---

## 0. Emergency Summary — Start Here

If you are the backup contact and Hedar is unreachable:

1. **First priority:** Don't panic, don't change anything. Read this document end-to-end.
2. **Credentials:** Every password/key referenced here is in Hedar's password manager. Access instructions are in Section 2.
3. **Production URLs:**
   - Web app: https://app.constrai.ca
   - Marketing site: https://www.constrai.ca
   - Server: `ssh root@143.110.218.84`
4. **Status check (non-destructive):**
   ```bash
   ssh root@143.110.218.84 'pm2 status && systemctl status nginx postgresql'
   curl -I https://app.constrai.ca
   ```

---

## 1. System Inventory (What We Own)

| Asset | Provider | Registered Under | Notes |
|---|---|---|---|
| Domain `constrai.ca` | Namecheap | Hedar Hallak (personal) | TODO: transfer to business account |
| Production server (Droplet) | DigitalOcean | Hedar Hallak | IP `143.110.218.84`, Ubuntu 22.04 |
| Backup storage (Spaces) | DigitalOcean | Hedar Hallak | Bucket `constrai-backups`, region NYC3 |
| Database | Self-hosted Postgres on Droplet | — | `mepdb` / `mepuser` |
| Apple Developer account | Apple | Hedar Al-Hallak (Individual, Team ID DX6L994VNU) | **Single point of failure** — see Section 6 |
| Expo EAS account | expo.dev | `hedarhallak75` | Builds iOS/Android |
| TestFlight app | Apple | App ID `6762187466`, bundle `ca.constrai.app` | — |
| Email (transactional) | SendGrid | Hedar | For supplier POs + auth emails |
| Maps | Mapbox | Hedar | Geocoding + map tiles |
| Source control | GitHub | `hedarhallak/mep-platform` | Private repo |
| SSL certificates | Let's Encrypt (certbot) | — | Auto-renews on server |

---

## 2. Credential Storage (Password Manager)

> **Source of truth:** All credentials live in Hedar's password manager.
>
> **Backup contact access:** Hedar should share an emergency vault with one trusted person (spouse, business partner, or lawyer holding sealed envelope).

### 2.1 What must be in the password manager

- [ ] DigitalOcean login (email + password + 2FA recovery codes)
- [ ] DigitalOcean Spaces Access/Secret keys (`mep-backup-key`)
- [ ] Namecheap login (email + password + 2FA recovery codes)
- [ ] GitHub login (email + password + 2FA recovery codes, Personal Access Token)
- [ ] Apple ID / Apple Developer account (email + password + 2FA recovery codes + Team ID)
- [ ] Expo/EAS account (email + password)
- [ ] SendGrid account + API key
- [ ] Mapbox account + API key
- [ ] Server root SSH private key (export from Hedar's laptop)
- [ ] Database password (`MepSecure2026X`)
- [ ] `JWT_SECRET` value from `/var/www/mep/.env` on server
- [ ] `server.env` file contents (full) — stored as secure note

### 2.2 Emergency access protocol

- Emergency contact knows how to unlock the password manager (recovery phrase / emergency kit).
- 1Password Emergency Kit or Bitwarden Emergency Access is set up for the backup contact.
- Sealed envelope alternative: printed recovery codes + master password in a physical safe or with lawyer.

---

## 3. Database Recovery

### 3.1 Daily automated backups

Backups run daily at 03:00 server time via cron, uploaded to DigitalOcean Spaces:
- `s3://constrai-backups/daily/` — last 7 days
- `s3://constrai-backups/weekly/` — last 4 Sundays
- `s3://constrai-backups/monthly/` — last 3 months

### 3.2 Restore procedure

See `scripts/backup/SETUP.md` Part 5 and `scripts/backup/restore_db.sh --help`. Summary:

```bash
ssh root@143.110.218.84

# 1. Find the right backup
s3cmd ls s3://constrai-backups/daily/

# 2. Restore to a staging DB (safe — does not touch production)
/var/www/mep/scripts/backup/restore_db.sh \
    s3://constrai-backups/daily/mepdb_<DATE>.sql.gz \
    mepdb_recovered

# 3. Verify
sudo -u postgres psql -d mepdb_recovered -c "SELECT COUNT(*) FROM users;"
sudo -u postgres psql -d mepdb_recovered -c "SELECT COUNT(*) FROM employees;"
sudo -u postgres psql -d mepdb_recovered -c "SELECT COUNT(*) FROM projects;"

# 4. Cut over
pm2 stop mep-backend
sudo -u postgres psql -d postgres -c "ALTER DATABASE mepdb RENAME TO mepdb_broken_$(date +%Y%m%d);"
sudo -u postgres psql -d postgres -c "ALTER DATABASE mepdb_recovered RENAME TO mepdb;"
pm2 start mep-backend

# 5. Smoke-test the app
curl https://app.constrai.ca/api/health
```

### 3.3 Expected RPO / RTO

- **RPO (data loss):** up to 24 hours (backup runs once/day at 03:00).
- **RTO (recovery time):** 15–30 minutes from incident detection to app back online.

---

## 4. Server Recovery (Droplet failure)

### 4.1 DigitalOcean Droplet snapshots

Weekly snapshots are enabled on the Droplet (configure if not already):
1. Go to https://cloud.digitalocean.com/droplets
2. Select the Droplet → Backups tab
3. Enable weekly backups ($2/month addition)

### 4.2 Restore from snapshot (full server loss)

1. DigitalOcean → Droplets → restore from most recent snapshot.
2. Wait for Droplet to boot (~5 min). IP address stays the same.
3. SSH in and verify services:
   ```bash
   ssh root@143.110.218.84
   pm2 status
   systemctl status nginx postgresql
   ```
4. If DB is older than latest Spaces backup — restore DB from Spaces (Section 3.2).
5. Verify backend responds: `curl https://app.constrai.ca/api/health`

### 4.3 Rebuild from scratch (worst case — no snapshot)

If there is no usable snapshot, follow this order:

1. Provision new Ubuntu 22.04 Droplet on DigitalOcean, region NYC3.
2. Point `app.constrai.ca` and `www.constrai.ca` DNS (Namecheap) to new IP.
3. Install stack:
   ```bash
   apt update && apt install -y nodejs npm postgresql postgresql-contrib \
       nginx certbot python3-certbot-nginx s3cmd git
   npm install -g pm2
   ```
4. Install PostGIS: `apt install -y postgresql-14-postgis-3` (verify version match).
5. Create DB:
   ```bash
   sudo -u postgres psql -c "CREATE USER mepuser WITH PASSWORD 'MepSecure2026X';"
   sudo -u postgres psql -c "CREATE DATABASE mepdb OWNER mepuser;"
   sudo -u postgres psql -d mepdb -c "CREATE EXTENSION postgis;"
   ```
6. Clone the repo:
   ```bash
   mkdir -p /var/www && cd /var/www
   git clone https://github.com/hedarhallak/mep-platform.git mep
   cd mep && npm install --production
   ```
7. Restore DB from latest Spaces backup (Section 3.2, restoring directly to `mepdb`).
8. Restore `/var/www/mep/.env` from password manager (secure note).
9. Restore Nginx configs:
   - `/etc/nginx/sites-enabled/default` — serves both constrai.ca and app.constrai.ca
   - Template in repo: `constrai-landing/nginx.example.conf` (TODO: commit this)
10. Issue SSL: `certbot --nginx -d constrai.ca -d www.constrai.ca -d app.constrai.ca`
11. Start backend: `cd /var/www/mep && pm2 start index.js --name mep-backend && pm2 save && pm2 startup`
12. Build frontend: `cd mep-frontend && npm install && npm run build` (output to `/var/www/mep/public/`)
13. Restore backup cron jobs (see `scripts/backup/SETUP.md` Part 2.9).
14. Smoke-test: `curl https://app.constrai.ca/api/health` and log in.

**RTO for full rebuild:** 2–4 hours.

---

## 5. Domain Recovery

If `constrai.ca` goes offline (DNS misconfiguration, transfer issue, expired):

1. Check registration status at https://www.namecheap.com (log in with Hedar's Namecheap credentials).
2. Verify auto-renew is enabled and payment method is current.
3. DNS records to verify:
   - `constrai.ca` → A → `143.110.218.84`
   - `www.constrai.ca` → A → `143.110.218.84`
   - `app.constrai.ca` → A → `143.110.218.84`

If the domain is lost (expired + grace period missed):
- Namecheap grace period ends 30 days after expiry, then 30 more days of redemption ($$$).
- After that, domain releases publicly. No recovery possible — rebrand required.
- **Mitigation:** Namecheap auto-renew enabled + payment method with long validity.

---

## 6. Mobile App Recovery

### 6.1 Apple Developer Account — SINGLE POINT OF FAILURE

The Apple Developer account is registered under **Hedar Al-Hallak (Individual)** with Team ID `DX6L994VNU`. **If this Apple ID is lost, all iOS distribution stops**.

**Mitigations (to implement):**
- [ ] Set up Apple ID 2FA recovery contacts (spouse + backup contact).
- [ ] Store Apple ID recovery key in password manager.
- [ ] Consider upgrading to Apple Developer **Organization** account (requires D-U-N-S number + business entity). This allows adding team members with distinct Apple IDs.

### 6.2 Expo / EAS Account

- Username: `hedarhallak75`
- If lost, builds stop. Mitigation: store login + 2FA codes in password manager. Consider EAS Organization.

### 6.3 Rebuilding mobile app after account loss

If Apple account is permanently lost:
1. Create new Apple Developer account under business entity.
2. Generate new signing certs + provisioning profiles.
3. Users must reinstall from new App Store listing (old installs continue working until iOS update or reinstall).
4. Existing TestFlight testers are lost — must re-invite.

This is a MONTHS-long recovery — prevention is critical.

---

## 7. GitHub / Source Code Recovery

- Repo: `hedarhallak/mep-platform` (private).
- If GitHub account is lost:
  - Local clone on Hedar's laptop is a full backup (every clone is a full repo).
  - Local clone on the production server (`/var/www/mep`) is a full backup.
  - Restore: push either clone to a new GitHub account/org.
- **Mitigation:** Add a second GitHub user as collaborator with admin rights.

---

## 8. Quarterly Verification Checklist

Run through this list the 1st of every quarter (Jan / Apr / Jul / Oct):

- [ ] Perform a manual restore test to a staging DB (Section 3.2) and verify row counts.
- [ ] Verify DigitalOcean Droplet snapshots are running and recent (<= 7 days old).
- [ ] Verify DigitalOcean Spaces has daily/weekly/monthly backups at expected intervals.
- [ ] Verify password manager emergency access is still configured.
- [ ] Verify all domains have `auto-renew = ON` and payment method valid.
- [ ] Verify Apple Developer account renewal ($99/year) — paid, not expiring soon.
- [ ] Verify SSL certs auto-renew: `certbot renew --dry-run` on server.
- [ ] Update `RECOVERY.md` with any new infrastructure added this quarter.

---

## 9. Incident Log

Record every production incident here. Short entries: date, what broke, what fixed it, what we changed to prevent recurrence.

| Date | Incident | Fix | Prevention |
|---|---|---|---|
| — | — | — | — |

---

## 10. TODO — Hardening Items (Prioritized)

### Critical (do within 30 days)
- [ ] **Password manager emergency access** — set up Bitwarden Emergency Access or 1Password Emergency Kit with one trusted contact.
- [ ] **Apple ID 2FA recovery contacts** — add trusted contacts.
- [ ] **DigitalOcean Droplet weekly snapshots** — enable in dashboard.
- [ ] **Second GitHub admin** — add a trusted collaborator.
- [ ] **Healthchecks.io dead-man's-switch** — follow `scripts/backup/SETUP.md` Part 4.

### Important (next 90 days)
- [ ] **Second technical contact** — bring one trusted developer/contractor up to speed on the codebase; share this doc.
- [ ] **Apple Developer → Organization account** — transition from Individual to business entity.
- [ ] **Transfer domain to business entity** — once business is incorporated.
- [ ] **Commit Nginx config template to repo** — `constrai-landing/nginx.example.conf` with redacted values.
- [ ] **Document `.env` schema** — commit a `.env.example` showing all required keys (without values).

### Nice-to-have (next 6 months)
- [ ] CI/CD via GitHub Actions — automated deploys instead of manual git pull + pm2 restart.
- [ ] Off-cloud backup copy — monthly dump downloaded to Hedar's laptop or second cloud provider.
- [ ] Uptime monitoring (UptimeRobot free tier).
