# MEP Platform — Master Project README
> Last updated: April 13, 2026 | Maintainer: Hedar Hallak
> Production: https://app.constrai.ca
> Server: root@143.110.218.84
> Backend path on server: /var/www/mep
> DB: mepdb / mepuser / MepSecure2026X
> Repo: hedarhallak/mep-platform

---

## How to Start a New Conversation
Paste these two URLs at the start:
```
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md
```

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
| Auth | JWT + PIN |
| Email | SendGrid |
| Maps | Mapbox |
| PDF | Puppeteer |
| Hosting | DigitalOcean VPS |
| GIS | PostGIS (installed April 2026) |

---

## Backend — API Routes
| Route | Feature | Status |
|---|---|---|
| auth.js | Login / JWT + PIN | ✅ |
| hub.js | My Hub — tasks + complete + file upload | ✅ |
| assignments.js | Assignments | ✅ |
| attendance.js | Attendance + CCQ hours | ✅ |
| materials.js + material_requests.js | Materials + PO + PDF | ✅ |
| reports.js | My Report + Distance 41km+ | ✅ |
| permissions.js | RBAC — 58 permissions / 13 roles / 284 mappings | ✅ |
| bi.js | Business Intelligence + Workforce Planner | ✅ |
| projects.js | Projects CRUD | ✅ |

---

## Database
- Migrations: 030
- Tables: 55
- PostGIS extension: installed
- Hub tables: task_messages, task_recipients
- Status flow: PENDING → SENT → READ → ACKNOWLEDGED

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

## Frontend Web
- Build: `cd /var/www/mep/mep-frontend && npm run build`
- After build: `cp -r dist/* /var/www/mep/public/`
- Nginx serves: /var/www/mep/public/

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

### Navigation Structure (Dashboard First — April 2026)
```
Bottom Bar: Home · My Hub · Profile
Home → DashboardScreen (module grid, role-aware)
       → Attendance
       → Materials (Stack: Worker view / Foreman Workspace)
       → Report
       → Assignments (Coming Soon)
       → Standup (Coming Soon)
```

### Mobile Screens Status
| Screen | Status |
|---|---|
| Login | ✅ |
| Dashboard (Home) | ✅ Role-aware module grid |
| My Hub — Inbox only | ✅ Send Task moved to Dashboard |
| Attendance | ✅ |
| Material Request (Worker) | ✅ |
| Foreman Workspace | ✅ Built, pending test |
| My Report | 🔄 Not tested yet |
| Profile + Change PIN | 🔄 Not tested yet |

### Daily Testing
```powershell
cd C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed\mep-mobile
npx expo start --clear
```
Scan QR with iPhone Camera → opens in Expo Go

---

## Working Rules (Always Enforce)

### Code Rules
1. Always deliver complete files with full paths — no snippets ever
2. No Arabic text or comments inside any code file
3. Do not modify unrelated components
4. Every file labeled with full path, ready to copy-paste
5. Never ask Hedar to manually edit — Claude makes the full change

### Location Rules
6. Always specify WHERE to run a command:
   - **On the server:** `ssh root@143.110.218.84` then run
   - **On PowerShell:** explicitly say "on PowerShell"
   - Never write a command without specifying location

### Error Checking Rules
7. For mobile errors — ALWAYS ask for terminal log, NOT a screenshot:
   ```powershell
   npx expo start --clear 2>&1 | Tee-Object -FilePath C:\Users\Lenovo\Desktop\expo_log.txt
   ```
   Then upload expo_log.txt — faster and more complete than screenshots
8. For server errors — use `pm2 logs mep-backend --err --lines 30 --nostream`
9. For frontend errors — check browser console Network tab

### File Inspection Rules
10. To read a file: `Get-Content "path\to\file" | Out-File -FilePath C:\Users\Lenovo\Desktop\filename.txt`
11. To read folder structure: `Get-ChildItem "path" -Recurse -Name | Out-File -FilePath C:\Users\Lenovo\Desktop\structure.txt`

### Git Rules
12. After any server-side fix: commit from server and push to GitHub immediately
13. Before any session: `git pull origin main` on server
14. After every feature: update MASTER_README.md and commit

### Conversation Rules
15. At start of every conversation — fetch MASTER_README.md and DECISIONS.md from GitHub
16. Never take unilateral decisions without Hedar's approval
17. Every architectural decision made in conversation → document in DECISIONS.md immediately
