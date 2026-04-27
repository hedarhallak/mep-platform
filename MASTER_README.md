# MEP Platform — Master Project README
> Last updated: April 18, 2026 | Maintainer: Hedar Hallak
> Production: https://app.constrai.ca
> Website: https://www.constrai.ca (Coming Soon landing page)
> Server: root@143.110.218.84
> Backend path on server: /var/www/mep
> Landing page path on server: /var/www/constrai-landing
> DB: mepdb / mepuser / MepSecure2026X
> Repo: hedarhallak/mep-platform

---

## How to Start a New Conversation

**One block. Copy, paste, done.**

```
هاي محادثة استكمال لمشروع Constrai الموجود — مش مشروع جديد. الريبو مرفّق محلياً (مجلد mep-fixed). قبل أي رد:
1. اقرأ CLAUDE.md من المجلد المحلي (مش من GitHub).
2. اتبع تعليمات Section 0 (Bootstrap) فيها بالحرف، خصوصاً قراءة MASTER_README + DECISIONS + RECOVERY محلياً.
3. ابدأ ردك بـ "(محادثة استكمال — قرأت Section X)" حتى أتأكد إنك خلصت Bootstrap.
ما تشتغل أي task قبل ما تخلص الـ Bootstrap.
```

The receiving Claude reads CLAUDE.md Section 0 (Bootstrap), reads docs from the local mounted folder (more reliable than GitHub), finds the latest Session Log, echoes back its understanding, then asks what to work on.

See [`START_NEW_SESSION.md`](./START_NEW_SESSION.md) for the full explanation, why the command was strengthened (April 26, 2026), and how to optionally specify a task upfront.

## Document Reading System

| Tier | File | When |
|---|---|---|
| Always | `MASTER_README.md` | Every session — overview + state |
| Always | `DECISIONS.md` | Every session — decisions + Session Logs |
| Always | `RECOVERY.md` | Every session — operational knowledge |
| Always | `CLAUDE.md` | Every session — Claude-specific rules + code map |
| On demand | `SCHEMA.md` | DB / migration / query work |
| On demand | `API.md` | Backend / routes / endpoint work |
| On demand | `.env.example` | Setup / config / new env var |
| On demand | `scripts/backup/SETUP.md` | Backup operations |
| Reference | `START_NEW_SESSION.md` | Templates for opening a new session |

---

## Project Overview
MEP Platform (Constrai) is a Quebec construction workforce ERP for MEP companies.
- Company ID: 5
- Projects: PROJ-11(Alpha), PROJ-12(Beta), PROJ-21(Gamma), PROJ-22(Delta), PROJ-23(Epsilon)

### Test Accounts:
| Username | Role | PIN |
|---|---|---|
| admin | COMPANY_ADMIN | 1234 |
| seed.worker2@meptest.com | TRADE_ADMIN | 1234 |
| seed.worker6@meptest.com | FOREMAN | 1234 |
| seed.worker11@meptest.com | JOURNEYMAN | 1234 |
| seed.worker31@meptest.com | WORKER | 1234 |

### Seed Accounts Pattern (PIN: 1234):
| Range | Role |
|---|---|
| seed.worker1-5 | TRADE_ADMIN |
| seed.worker6-10 | FOREMAN |
| seed.worker11-20 | JOURNEYMAN |
| seed.worker21-28 | APPRENTICE_1-4 |
| seed.worker29-30 | DRIVER |
| seed.worker31-50 | WORKER |

### Test Suppliers (company_id=5):
| Name | Email | Trade |
|---|---|---|
| Plumbing Supply Co | orders@plumbingsupply.ca | PLUMBING |
| Electrical Parts Ltd | orders@electricalparts.ca | ELECTRICAL |
| General Materials Inc | orders@generalmaterials.ca | ALL |

### Test Assignment (Project Alpha — PROJ-11):
| Employee | Role | Period |
|---|---|---|
| David Tremblay 6 (emp 211) | FOREMAN | Apr 12 – May 12, 2026 |
| Lucas–Carlos Tremblay 11-16 (emp 216-221) | WORKER | Apr 12 – May 12, 2026 |

---

## Stack
| Layer | Technology |
|---|---|
| Backend | Node.js / Express / PostgreSQL |
| Frontend Web | React / Vite / Tailwind CSS |
| Mobile | React Native + Expo (TypeScript) |
| Auth | JWT + PIN + Refresh Token Rotation |
| Email | SendGrid |
| Maps | Mapbox |
| PDF | Puppeteer |
| Hosting | DigitalOcean VPS |
| GIS | PostGIS (installed April 2026) |

---

## Backend — API Routes
| Route | Feature | Status |
|---|---|---|
| auth.js | Login / JWT + PIN + full_name + refresh tokens + logout/logout-all | ✅ |
| hub.js | My Hub — tasks + complete + file upload | ✅ |
| assignments.js | Assignments | ✅ |
| attendance.js | Attendance + CCQ hours | ✅ |
| materials.js + material_requests.js | Materials + PO + PDF + POST /send-order | ✅ |
| reports.js | My Report + Distance 41km+ | ✅ |
| permissions.js | RBAC — 58 permissions / 13 roles / 284 mappings | ✅ |
| bi.js | Business Intelligence + Workforce Planner (PostGIS) | ✅ |
| projects.js | Projects CRUD | ✅ |

---

## Database
- Migrations: 031
- Tables: 56 (includes refresh_tokens)
- PostGIS extension: installed
- Hub tables: task_messages, task_recipients
- Status flow: PENDING → SENT → READ → ACKNOWLEDGED
- material_requests: status flow PENDING → SENT (after Foreman sends PO)

### Backups (deployed April 19, 2026 — fully tested end-to-end)
- Automated daily pg_dump → DigitalOcean Spaces (`constrai-backups`, region **TOR1**)
- Retention: 7 daily + 4 weekly + 3 monthly
- Scripts: `scripts/backup/{backup_db.sh, cleanup_old_backups.sh, restore_db.sh}`
- Setup + operations guide: `scripts/backup/SETUP.md`
- Cron: 07:00 UTC daily (backup) + 07:30 UTC daily (cleanup) = 03:00 Quebec EDT
- Config (secrets): `/etc/mep-backup.env` (mode 600, root-only)
- Restore uses `sudo -u postgres psql` (superuser required for PostGIS extension)
- Verified: full restore tested, row counts match production, ownership preserved

### Disaster Recovery
- Full DR playbook: `RECOVERY.md` at repo root
- Covers DB / server / domain / mobile / GitHub recovery
- Includes quarterly verification checklist + prioritized hardening TODO

---

## RBAC — 13 Roles (April 2026)
| Role | Level |
|---|---|
| SUPER_ADMIN | 100 |
| IT_ADMIN | 90 |
| COMPANY_ADMIN | 80 |
| TRADE_PROJECT_MANAGER | 60 |
| TRADE_ADMIN | 50 |
| FOREMAN | 40 |
| JOURNEYMAN | 20 |
| APPRENTICE_4/3/2/1 | 15 |
| WORKER | 10 |
| DRIVER | 10 |

Permission matrix: 284 mappings — see DECISIONS.md for full matrix.

---

## Company Website — www.constrai.ca
- Location on server: /var/www/constrai-landing/
- Source in repo: constrai-landing/
- Bilingual (EN/FR) with auto-detect + toggle
- SSL via Let's Encrypt (certbot)
- Nginx config: /etc/nginx/sites-enabled/default (handles both constrai.ca and www.constrai.ca)
- Status: 🔄 Live — color palette under review (dark blue #1e3a5f)

---

## Frontend Web (app.constrai.ca)
- Build: `cd /var/www/mep/mep-frontend && npm run build`
- Nginx serves: /var/www/mep/public/
- Centralized Theme: `src/index.css` @theme directive — all colors via CSS variables (--color-primary, etc.)
- All 19 page/component files use `bg-primary`, `text-primary` etc. — zero hardcoded indigo classes
- Color palette matches mobile: Dark Blue primary (#1e3a5f)

### Web Pages Status
| Page | Status |
|---|---|
| Dashboard | ✅ |
| Assignments | ✅ |
| Attendance | ✅ |
| Materials + Purchase Orders | ✅ |
| Reports | ✅ |
| My Hub | ✅ |
| Permissions Matrix (13 roles) | ✅ |
| User Management | ✅ |
| Business Intelligence / Workforce Planner | ✅ |

---

## Mobile App — React Native + Expo
> Location: mep-fixed/mep-mobile/
> Bundle ID: ca.constrai.app
> Expo Account: hedarhallak75
> Apple Team ID: DX6L994VNU (Hedar Al-Hallak — Individual)
> TestFlight App ID: 6762187466
> TestFlight URL: https://appstoreconnect.apple.com/apps/6762187466/testflight/ios
> i18n: react-i18next — default FR, EN secondary (user picks from Profile)
> Theme: Centralized via src/theme/colors.ts — dark blue (#1e3a5f) primary
> Auth: JWT refresh token rotation + expo-secure-store (encrypted storage)
> Last Build: April 16, 2026 — includes centralized color theme + full i18n + secure auth

### Navigation Structure (Unified Icon Grid — April 2026)
```
Bottom Bar: Home · Hub · Profile

Home → DashboardScreen (icon grid, role-aware)
  → Attendance (direct screen)
  → Materials → MaterialsMenuScreen
      → New Request → MaterialRequestScreen
      → My Requests → MyRequestsScreen
  → Tasks (FOREMAN+) → TasksMenuScreen
      → New Task → NewTaskScreen
      → Sent Tasks → SentTasksScreen
  → Report → ReportMenuScreen
      → This Week → MyReportScreen (period=this_week)
      → Last Week → MyReportScreen (period=last_week)
      → Custom Date → MyReportScreen (period=custom)
  → Assignments (Soon)
  → Standup (Soon)
  → Purchase Orders (Soon)

Hub → HubMenuScreen (icon grid)
  → Inbox → MyHubScreen
  → Material Requests (FOREMAN+) → ForemanMaterialsTab
      → Merge & Edit → MergeEditScreen

Profile → ProfileNavigator
  → ProfileScreen
  → ChangePinScreen
```

### Mobile Screens Status
| Screen | Built | i18n (EN/FR) |
|---|:---:|:---:|
| Login | ✅ | ✅ |
| Dashboard (icon grid, role-aware) | ✅ | ✅ |
| Attendance (with localized date/time) | ✅ | ✅ |
| MaterialsMenuScreen | ✅ | ✅ |
| MaterialRequestScreen (Worker) | ✅ | ✅ |
| MyRequestsScreen | ✅ | ✅ |
| TasksMenuScreen | ✅ | ✅ |
| NewTaskScreen (full: project, recipients, photo, priority) | ✅ | ✅ |
| SentTasksScreen (completion tracking) | ✅ | ✅ |
| ReportMenuScreen | ✅ | ✅ |
| MyReportScreen (period param) | ✅ | ✅ |
| HubMenuScreen (icon grid) | ✅ | ✅ |
| MyHubScreen (Inbox only) | ✅ | ✅ |
| ForemanMaterialsTab + MergeEditScreen | ✅ | ✅ |
| Profile + Change PIN | ✅ | ✅ |
| Navigation Headers (all stacks) | ✅ | ✅ |

### Centralized Theme
- `src/theme/colors.ts` — single source of truth for all colors across the app
- All 23 screen files import from Colors — zero hardcoded color values
- Palette: Dark Blue primary (#1e3a5f) + Blue accent (#3b82f6)
- Includes: primaryDark, primaryLight, primaryBright, primaryPale, accent, accentDark, accentLight, accentPale
- Convenience export: `headerColors` for navigation headers

### Shared Components
- `src/screens/shared/SubMenuScreen.tsx` — unified icon grid (same design as Dashboard) used by all sub-menus

### i18n Structure
- `src/i18n/index.ts` — i18next init with AsyncStorage language detector (key: `mep_language`)
- `src/i18n/locales/en.ts` + `src/i18n/locales/fr.ts` — all UI strings
- Sections: common, auth, dashboard, modules, attendance, materials, tasks, hub, report, profile, roles, errors
- Date/time locale switches dynamically via `i18n.language` (`fr-CA` or `en-CA`)
- User switches language from Profile → Language

### Testing
```powershell
# Daily dev testing
cd C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed\mep-mobile
npx expo start --clear

# Production build
eas build --platform ios --profile production
eas submit --platform ios
```

---

## Working Rules (Always Enforce)

### Code Rules
1. Always deliver complete files with full paths — no snippets ever
2. No Arabic text or comments inside any code file
3. Do not modify unrelated components
4. Every file labeled with full path, ready to copy-paste
5. Never ask Hedar to manually edit — Claude makes the full change
6. **UI Law: Every sub-screen uses icon grid (SubMenuScreen) — no tabs, no separate buttons**
7. **No duplicate screens: identical UI must use shared component with props**
8. **Never delete ideas from DECISIONS.md — only add and evolve**

### Location Rules
9. Always specify WHERE to run a command:
   - **On the server:** `ssh root@143.110.218.84` then run
   - **On PowerShell:** explicitly say "on PowerShell"

### Error Checking Rules
10. For mobile errors — ALWAYS ask for terminal log, NOT a screenshot:
    ```powershell
    npx expo start --clear 2>&1 | Tee-Object -FilePath C:\Users\Lenovo\Desktop\expo_log.txt
    ```
11. For server errors — `pm2 logs mep-backend --err --lines 30 --nostream`
12. For frontend errors — check browser console Network tab

### File Inspection Rules
13. To read a file: `Get-Content "path" | Out-File -FilePath C:\Users\Lenovo\Desktop\filename.txt`
14. To read folder structure: `Get-ChildItem "path" -Recurse -Name | Out-File -FilePath C:\Users\Lenovo\Desktop\structure.txt`

### Git Rules
15. After any server-side fix: commit from server and push to GitHub immediately
16. Before any session: `git pull origin main` on server
17. After every feature: update MASTER_README.md and DECISIONS.md and commit

### Conversation Rules
18. At start of every conversation — fetch MASTER_README.md and DECISIONS.md from GitHub
19. Never take unilateral decisions without Hedar's approval
20. Every architectural decision → document in DECISIONS.md immediately
21. **Auto-checkpoint rule (Claude must follow):** Update DECISIONS.md and tell Hedar to `git commit + push` at every meaningful checkpoint without being asked. Checkpoints include:
    - After any architectural decision is made
    - After completing a major step in a multi-step task
    - Before Hedar takes a break or ends the session
    - After resolving a non-trivial bug or incident
    - At least once per active hour of work
    This protects against losing progress between sessions or after a crash.
22. **Always Suggest Better Tools rule (Claude must follow):** Before writing custom code in a NEW area (UI design, monitoring, automation, deployment, AI features, scheduling, etc.), Claude must first check whether a dedicated tool / MCP / SaaS / library already solves it cleanly, and surface that to Hedar BEFORE writing code. Use `search_mcp_registry` first; then web search for 2–3 top options; then present a comparison and recommendation. Rationale: the original workflow (copy-paste files manually) wasted months until Cowork was discovered. Apply the same critical eye to every new area. See CLAUDE.md Section 4 for examples.
