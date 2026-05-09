# `infra/` — server-side configs tracked in git

This folder holds production server configs that live outside the Express app — primarily Nginx server blocks and any static placeholders served by Nginx directly. The actual files live on the Droplet at the paths documented inside each file's header; the copies here exist for **traceability** (so a Droplet rebuild can reconstruct the setup from the repo) and for **change history** (so an Nginx tweak shows up in git diff like any other code change).

## Layout

```
infra/
├── README.md                         (this file)
├── nginx/
│   ├── admin-constrai.conf           → /etc/nginx/sites-available/admin-constrai
│   └── (other server blocks come here as Phase 5/6/7 progresses)
└── admin-placeholder/
    └── index.html                    → /var/www/admin-placeholder/index.html
```

## Conventions

- **Files here are NOT auto-deployed.** Editing `infra/nginx/admin-constrai.conf` does not change prod. The deploy step for any change is manually SCP-ing or `cat`-ing the new file into place on the Droplet, running `nginx -t`, then `systemctl reload nginx`. Each Nginx-touching DECISIONS section captures the exact deploy commands used.
- **Each file has a header comment** noting the canonical path on the Droplet and the DECISIONS section that introduced it. When a file is replaced (e.g., 90-A's placeholder gets superseded by 90-C's real Vite build), the header's "superseded by" note is updated.
- **Pre-existing configs (`default`, `www-constrai`, `constrai`) are NOT mirrored here yet.** They predate this convention. They'll be migrated into `infra/nginx/` opportunistically — for now they stay only on the Droplet, with a copy in `/root/nginx-backup-<timestamp>/` taken before each Phase 5 change.

## Why this folder exists (instead of leaving Nginx server-only)

Phase 4 ended with several Section-89 deploy steps that touched Nginx implicitly (the new `app.constrai.ca` API mount existed before in `/etc/nginx/sites-available/constrai` but was never tracked in git — the only record was DECISIONS.md prose). Phase 5 adds at least 2 new server blocks (admin.constrai.ca in 90-A, possibly tighter cookie/CSP rules in 90-E) and updates the existing `app.constrai.ca` block (for the vhost split in 90-B), so the value of tracking the source of truth in git crossed the threshold of justifying a folder.
