# MEP Platform — Master Project README
> Last updated: April 11, 2026 | Maintainer: Hedar Hallak
> Production: https://app.constrai.ca
> Server: root@143.110.218.84
> Backend path on server: /var/www/mep
> DB: mepdb / mepuser / MepSecure2026X
> Repo: hedarhallak/mep-platform

---

## How to Use This File
At the start of every new conversation, reference this file so Claude knows exactly where we are.
Fetch it directly: `https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md`
Also fetch: `https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md`

---

## Project Overview
MEP Platform (Constrai) is a Quebec construction workforce ERP for MEP companies.
- Company ID in use: 5
- Test accounts: seed.worker1@meptest.com → seed.worker50@meptest.com (PIN: 1234)
- Quebec CCQ labor rules enforced throughout (paid breaks, unpaid lunch, overtime, travel allowances)

### Test Roles (seed data):
| Users | Role |
|---|---|
| seed.worker1-5 | TRADE_ADMIN |
| seed.worker6-10 | FOREMAN |
| seed.worker11-20 | JOURNEYMAN |
| seed.worker21-22 | APPRENTICE_1 |
| seed.worker23-24 | APPRENTICE_2 |
| seed.worker25-26 | APPRENTICE_3 |
| seed.worker27-28 | APPRENTICE_4 |
| seed.worker29-30 | DRIVER |
| seed.worker31-50 | WORKER |

All have APPROVED assignments until 2026-06-30 on 5 projects (PROJ-11 to PROJ-23).

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

---

## Project Structure
```
mep-fixed/
├── index.js                  # Express entry point
├── db.js                     # PostgreSQL connection
├── routes/                   # All API routes (27 files)
├── middleware/               # Auth, permissions middleware
├── migrations/               # DB migrations (001-030+)
├── jobs/                     # Scheduled jobs (cron)
├── mep-frontend/             # React web app
└── mep-mobile/               # React Native mobile app
```

---

## Backend — API Routes Status
| Route File | Feature | Status |
|---|---|---|
| auth.js | Login / JWT + PIN | ✅ Complete |
| employees.js | Employee management | ✅ Complete |
| assignments.js | Assignment requests + approval + hub task delivery trigger | ✅ Complete |
| attendance.js | Attendance + CCQ hours + breaks + overtime | ✅ Complete |
| hub.js | My Hub — tasks inbox + send + workers by project | ✅ Complete |
| materials.js + material_requests.js | Materials + Purchase Orders + PDF + email | ✅ Complete |
| reports.js | My Report + Distance 41km+ | ✅ Complete |
| ccq_rates.js | CCQ travel rates DB (ACQ 2025-2028) | ✅ Complete |
| permissions.js | RBAC — 51 permissions / 134 mappings | ✅ Complete |
| projects.js | Projects CRUD | ✅ Complete |
| profile.js | User profile | ✅ Complete |

---

## Database
- Migrations: 030
- Tables: 55
- Key hub tables: task_messages, task_recipients
- task_recipients status flow: PENDING → SENT → READ → ACKNOWLEDGED
- PENDING → SENT trigger: fires in assignments.js on approve endpoint

---

## RBAC — Roles
| Role | Level | Notes |
|---|---|---|
| SUPER_ADMIN | 100 | Full access |
| IT_ADMIN | 90 | Tech management |
| COMPANY_ADMIN | 80 | Company-wide |
| TRADE_PROJECT_MANAGER | 60 | Project management |
| TRADE_ADMIN | 50 | Trade management |
| FOREMAN | 40 | Sends tasks to workers |
| JOURNEYMAN | 20 | Field worker |
| APPRENTICE_1-4 | 13-16 | Trainees |
| WORKER | 10 | Field worker |
| DRIVER | 10 | Driver |

---

## Mobile App (mep-mobile) — React Native + Expo (TypeScript)
> Location: mep-fixed/mep-mobile/
> EAS Project: @hedarhallak75/constrai
> Bundle ID: ca.constrai.app
> Apple Developer: ✅ Active (hedar.hallak@gmail.com)
> Google Play: ✅ Active (hedar.hallak@gmail.com)
> Expo Account: hedarhallak75

### Screens Status
| Screen | File | Status |
|---|---|---|
| Login | src/screens/LoginScreen.tsx | ✅ Complete |
| My Hub | src/screens/hub/MyHubScreen.tsx | ✅ Complete |
| Attendance | src/screens/attendance/AttendanceScreen.tsx | ✅ Complete |
| Material Request | src/screens/materials/MaterialRequestScreen.tsx | ✅ Complete |
| My Report | src/screens/reports/MyReportScreen.tsx | ✅ Complete |
| Profile | src/screens/profile/ProfileScreen.tsx | ✅ Complete |

### My Hub — Current Status (April 11, 2026)
| Feature | Status |
|---|---|
| Inbox tab — receive tasks | ✅ Working |
| Tap to expand + mark as read | ✅ Working |
| Acknowledge Task button (separate from expand) | ✅ Working |
| Send Task tab (FOREMAN+) | ✅ Working |
| Worker picker modal with search | ✅ Working |
| Filter workers by project | ✅ Working |
| Smart delivery PENDING→SENT on assignment approval | ✅ Working (API only, not direct DB insert) |
| Unread badge on Hub tab | ✅ Working |
| Sent messages list with progress | ✅ Working |
| File/image attachment when sending | ❌ Pending |
| Worker completion photo | ❌ Pending |

### Mobile Build Status
| Platform | Build Type | Status |
|---|---|---|
| Android | Preview APK | ✅ Built |
| iOS | Preview (ad hoc) | ✅ Installed on iPhone |
| Android | Production | 🟡 After testing |
| iOS | Production | 🟡 After testing |

---

## Daily Testing Workflow
- Use `npx expo start` (in mep-mobile folder on your machine) + Expo Go on iPhone
- EAS builds ONLY for production/TestFlight release
- Close Expo Go completely and re-scan QR if app doesn't update

---

## Next Steps — Priority Order
| Priority | Task |
|---|---|
| 🔴 1 | Fix due date display (shows ISO string instead of Apr 12, 2026) |
| 🔴 2 | Add file/image attachment to Send Task (mobile + web) |
| 🔴 3 | Add "Mark Complete + photo" for worker after task done (mobile + web) |
| 🟡 4 | Test all other screens (Attendance, Materials, Report, Profile) |
| 🟡 5 | Fix any bugs found |
| 🟡 6 | Build production iOS → App Store |
| 🟡 7 | Build production Android → Google Play |

---

## Working Rules (Always Enforce)

### Code Rules
1. Always deliver complete files with full paths — no snippets ever
2. No Arabic text or comments inside any code file
3. Do not modify unrelated components
4. Every file labeled with its full path, ready to copy-paste directly
5. Never ask Hedar to manually edit — Claude makes the full change

### Communication Rules
6. When giving instructions with multiple steps: write each step in BOTH Arabic and English, separately and clearly
7. Always specify WHERE to run a command: "on the server" or "on PowerShell on your machine" or "in VS Code terminal"
8. Never write "شغّل أولاً:" without specifying the location

### Testing Rules
9. Use `npx expo start` + Expo Go for daily testing — NOT EAS builds
10. EAS builds only when ready for production/TestFlight

### File Inspection Rules
11. Always read files from GitHub using raw URLs — never ask Hedar to copy-paste
12. When needing folder structure: use PowerShell `Out-File` pattern

### Efficiency Rules
13. Always prefer automated/scripted solutions over manual steps
14. Before starting any task — read MASTER_README from GitHub first
15. Never start from scratch if something already exists

### Conversation Rules
16. At the start of every new conversation — fetch MASTER_README.md from GitHub before doing anything
17. Never take unilateral decisions without Hedar's approval
18. Never delete any file without explicit confirmation
19. After every completed feature — update MASTER_README.md and DECISIONS.md and commit

---

## Environment Variables (.env)
- DATABASE_URL
- JWT_SECRET
- SENDGRID_API_KEY
- MAPBOX_TOKEN
- PORT
