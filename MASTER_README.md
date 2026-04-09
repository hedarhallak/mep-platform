# MEP Platform — Master Project README
> Last updated: April 2026 | Maintainer: Hedar Hallak
> Production: https://app.constrai.ca
> Server: root@143.110.218.84
> DB: mepdb / mepuser / MepSecure2026X
> Repo: hedarhallak/mep-platform

---

## How to Use This File
At the start of every new conversation, reference this file so Claude knows exactly where we are.
Command: `git pull && cat MASTER_README.md`

---

## Project Overview
MEP Platform (Constrai) is a Quebec construction workforce ERP for MEP companies.
- Company ID in use: 5
- Test accounts: worker89 (TRADE_ADMIN/FOREMAN, employee_id 18), worker15 (WORKER, employee_id 8)
- Quebec CCQ labor rules enforced throughout (paid breaks, unpaid lunch, overtime, travel allowances)

---

## Stack
| Layer | Technology |
|---|---|
| Backend | Node.js / Express / PostgreSQL |
| Frontend Web | React / Vite / Tailwind CSS |
| Mobile | React Native + Expo (TypeScript) |
| Auth | JWT |
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
├── seed.js                   # DB seed data
├── routes/                   # All API routes
├── middleware/               # Auth, permissions middleware
├── migrations/               # DB migrations (001-028+)
├── jobs/                     # Scheduled jobs (cron)
├── services/                 # geocoding, etc.
├── lib/                      # Shared utilities
├── data/                     # Static data (CCQ rates, etc.)
├── scripts/                  # Audit, migrate, check scripts
├── uploads/                  # File uploads
├── mep-frontend/             # React web app
└── mep-mobile/               # React Native mobile app
```

---

## Backend — API Routes Status
| Route File | Feature | Status |
|---|---|---|
| auth.js | Login / JWT | ✅ Complete |
| employees.js | Employee management | ✅ Complete |
| invite_employee.js | Invite + onboarding flow | ✅ Complete |
| onboarding.js | Two-step onboarding (credentials + profile) | ✅ Complete |
| attendance.js | Attendance + CCQ hours + breaks + overtime | ✅ Complete |
| assignments.js | Assignment requests + approval | ✅ Complete |
| auto_assign.js | Smart auto-assignment algorithm | ✅ Complete |
| project_foremen.js | Foreman per trade per project | ✅ Complete |
| materials.js | Materials catalog | ✅ Complete |
| material_requests.js | Material requests + PDF + email | ✅ Complete |
| reports.js | My Report + Distance 41km+ (T2200/TP-64.3) | ✅ Complete |
| ccq_rates.js | CCQ travel rates DB (ACQ 2025-2028) | ✅ Complete |
| hub.js | My Hub endpoint | ✅ Complete |
| permissions.js | RBAC 51 permissions / 134 mappings | ✅ Complete |
| user_management.js | User CRUD | ✅ Complete |
| projects.js | Projects CRUD | ✅ Complete |
| project_trades.js | Trade assignments per project | ✅ Complete |
| profile.js | User profile | ✅ Complete |
| push_tokens_route.js | Push notification tokens | ✅ Complete |
| super_admin.js | Super admin panel | ✅ Complete |
| admin_users.js | Admin user management | ✅ Complete |
| suppliers.js | Suppliers | ✅ Complete |
| bi.js | Business intelligence | ✅ Complete |
| daily_dispatch.js | Daily dispatch | ✅ Complete |
| standup.js | Standup reports | ✅ Complete |
| activate.js | Account activation | ✅ Complete |
| user_invites.js | Invite management | ✅ Complete |

---

## Database — Migrations
- Total migrations: 028 (post-April 2026 audit)
- Tables after audit: 55 (cleaned from 69)
- Key tables: employees, companies, projects, assignment_requests, attendance_records, material_requests, ccq_travel_rates, permissions, role_permissions, push_tokens

---

## RBAC — 6 Roles
| Role | Type | Notes |
|---|---|---|
| SUPER_ADMIN | system_role | Full access |
| IT_ADMIN | system_role | Tech management |
| COMPANY_ADMIN | company_role | Company-wide access |
| TRADE_PROJECT_MANAGER | company_role | Project management |
| TRADE_ADMIN | company_role | Also used as FOREMAN assignment_role |
| WORKER | company_role | Field workers |

---

## Scheduled Jobs
| Job | Schedule | Function |
|---|---|---|
| weeklyReportJob | Every Sunday | Weekly attendance summary email |
| ccqRatesReminderJob | Before April 30, 2028 | Alert SUPER_ADMIN before ACQ rates expire |

---

## Frontend Web (mep-frontend) — Features
| Feature | Status |
|---|---|
| Login + JWT auth | ✅ Complete |
| Employee management + invite flow | ✅ Complete |
| Attendance + CCQ hours | ✅ Complete |
| Assignments + auto-assign | ✅ Complete |
| Materials + Purchase Orders | ✅ Complete |
| Reports (My Report + Distance 41km+) | ✅ Complete |
| CCQ Rates DB viewer | ✅ Complete |
| RBAC (6 roles) | ✅ Complete |
| PDF generation (Puppeteer) | ✅ Complete |
| SendGrid email + PDF attachments | ✅ Complete |
| Push notifications (PWA) | ✅ Complete |
| Mapbox address autocomplete | ✅ Complete |

---

## Mobile App (mep-mobile) — React Native + Expo (TypeScript)
> Location: mep-fixed/mep-mobile/
> Tested via: Expo Go
> Next step: Build for App Store ($99/year Apple) + Google Play ($25 one-time)

### Screens Status
| Screen | File | Status |
|---|---|---|
| Login | src/screens/auth/LoginScreen.js + LoginScreen.tsx | ✅ Complete |
| My Hub | src/screens/hub/MyHubScreen.tsx | ✅ Complete |
| Attendance | src/screens/attendance/AttendanceScreen.tsx | ✅ Complete |
| Material Request | src/screens/materials/MaterialRequestScreen.tsx | ✅ Complete |
| My Requests | src/screens/materials/MyRequestsScreen.tsx | ✅ Complete |
| Profile | src/screens/profile/ProfileScreen.tsx | ✅ Complete |
| Change PIN | src/screens/profile/ChangePinScreen.tsx | ✅ Complete |
| My Report | src/screens/reports/MyReportScreen.tsx | ✅ Complete |

### Navigation Structure
```
RootNavigator
├── AuthNavigator (if not logged in)
│   └── LoginScreen
└── AppNavigator (if logged in)
    ├── Tab: My Hub → MyHubScreen
    ├── Tab: Attendance → AttendanceScreen
    ├── Tab: Materials → MaterialRequestScreen / MyRequestsScreen
    ├── Tab: Reports → MyReportScreen
    └── Tab: Profile → ProfileScreen / ChangePinScreen
```

### Key Mobile Files
| File | Purpose |
|---|---|
| src/api/client.ts | Axios instance + JWT interceptor |
| src/store/useAuthStore.ts | Zustand auth state |
| src/hooks/usePushNotifications.ts | Push notification registration |
| src/constants/colors.js | Design tokens |
| src/utils/storage.js | SecureStore JWT storage |

---

## Next Steps — Priority Order
| Priority | Task | Notes |
|---|---|---|
| 🟡 1 | Apple Developer Account | $99/year — needed for App Store |
| 🟡 2 | Google Play Developer Account | $25 one-time |
| 🟡 3 | expo prebuild | Generate ios/ and android/ folders |
| 🟡 4 | EAS Build setup | Expo Application Services for cloud builds |
| 🟢 5 | TestFlight (iOS beta) | Internal testing before App Store |
| 🟢 6 | App Store submission | Production release |
| 🟢 7 | Google Play submission | Production release |

---

## Git Workflow
```bash
# Start of every session
git pull origin main

# After making changes
git add .
git commit -m "feat: description"
git push origin main
```

---

## Working Rules (Always Enforce)

### Code Rules
1. Always deliver complete files with full paths — no snippets ever
2. No Arabic text or comments inside any code file
3. Do not modify unrelated components
4. Every file labeled with its full path, ready to copy-paste directly
5. Never ask Hedar to manually edit — Claude makes the full change

### File Inspection Rules
6. When needing to read a file's contents — immediately output a PowerShell command that saves it to a .txt file on the Desktop, so Hedar can upload it here. Never ask Hedar to copy-paste terminal output manually.
   Example: `Get-Content path\to\file.js | Out-File -FilePath C:\Users\Lenovo\Desktop\filename.txt`
7. When needing to inspect a folder structure — use the same pattern with Out-File.
   Example: `Get-ChildItem -Recurse -Name -Exclude node_modules | Out-File -FilePath C:\Users\Lenovo\Desktop\structure.txt`

### Efficiency Rules
8. Always prefer automated/scripted solutions over manual steps to minimize Hedar's manual work
9. Batch multiple file operations into one command whenever possible
10. Before starting any task — check if it already exists in the project (read MASTER_README first)
11. Never start from scratch if something already exists

### Conversation Rules
12. At the start of every new conversation — read MASTER_README.md from GitHub before doing anything
13. Never take unilateral decisions without Hedar's approval
14. Never delete any file without explicit confirmation
15. After every completed feature — update MASTER_README.md Next Steps and commit

---

## Environment Variables (.env)
See .env.example for required keys:
- DATABASE_URL
- JWT_SECRET
- SENDGRID_API_KEY
- MAPBOX_TOKEN
- PORT

