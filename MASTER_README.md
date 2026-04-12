# MEP Platform — Master Project README
> Last updated: April 12, 2026 | Maintainer: Hedar Hallak
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
- All assignments extended to 2026-06-30

### Test Roles:
| Users | Role | PIN |
|---|---|---|
| seed.worker1-5 | TRADE_ADMIN | 1234 |
| seed.worker6-10 | FOREMAN | 1234 |
| seed.worker11-20 | JOURNEYMAN | 1234 |
| seed.worker21-28 | APPRENTICE_1-4 | 1234 |
| seed.worker29-30 | DRIVER | 1234 |
| seed.worker31-50 | WORKER | 1234 |

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

## Backend — API Routes
| Route | Feature | Status |
|---|---|---|
| auth.js | Login / JWT + PIN | ✅ |
| hub.js | My Hub — tasks + complete endpoint + file upload | ✅ |
| assignments.js | Assignments + PENDING hub task delivery trigger | ✅ |
| attendance.js | Attendance + CCQ hours | ✅ |
| materials.js + material_requests.js | Materials + PO + PDF | ✅ |
| reports.js | My Report + Distance 41km+ | ✅ |
| permissions.js | RBAC 51 permissions | ✅ |

---

## Database
- Migrations: 030
- Tables: 55
- Hub tables: task_messages, task_recipients
- task_recipients columns: status, read_at, acknowledged_at, completed_at, completion_note, completion_image_url, expected_project_id
- Status flow: PENDING → SENT → READ → ACKNOWLEDGED
- File uploads: /var/www/mep/uploads/hub/

---

## Frontend Web
- Built with: `cd /var/www/mep/mep-frontend && npm run build --legacy-peer-deps`
- Nginx serves: /var/www/mep/mep-frontend/dist
- API proxied via nginx to localhost:3000
- Uploads served at: /uploads/

## Nginx Config (important)
```nginx
root /var/www/mep/mep-frontend/dist;
location /api/ { proxy_pass http://localhost:3000; }
location /uploads/ { alias /var/www/mep/uploads/; }
location / { try_files $uri $uri/ /index.html; }
```

---

## Mobile App — React Native + Expo
> Location: mep-fixed/mep-mobile/
> Bundle ID: ca.constrai.app
> Apple Developer: ✅ Active
> Google Play: ✅ Active
> Expo Account: hedarhallak75

### Screens Status
| Screen | Status |
|---|---|
| Login | ✅ |
| My Hub (full) | ✅ |
| Attendance | ✅ |
| Material Request | ✅ |
| My Report | ✅ |
| Profile | ✅ |

### My Hub — Full Feature Status
| Feature | Status |
|---|---|
| Inbox + expand/read | ✅ |
| Acknowledge / Mark Complete | ✅ |
| Completion note + photo | ✅ |
| Send Task + file attachment | ✅ |
| Worker picker modal + search | ✅ |
| Filter workers by project | ✅ |
| Smart delivery PENDING→SENT | ✅ (API only, not direct DB) |
| Unread badge on tab | ✅ |
| Sent list with completion details | ✅ |
| Full screen image zoom | ✅ |

### Daily Testing
```powershell
cd C:\Users\Lenovo\Desktop\mep-site-backend-fixed\mep-fixed\mep-mobile
npx expo start
```
Scan QR with iPhone Camera app → opens in Expo Go

### Production Build (when ready)
```powershell
eas build --platform ios --profile production
eas build --platform android --profile production
```

---

## Next Steps
| Priority | Task |
|---|---|
| 🔴 1 | Test Attendance screen on mobile |
| 🔴 2 | Test Materials screen on mobile |
| 🔴 3 | Test My Report on mobile |
| 🔴 4 | Test Profile + Change PIN on mobile |
| 🔴 5 | Fix any bugs found |
| 🟡 6 | Production iOS build → App Store |
| 🟡 7 | Production Android build → Google Play |

---

## Working Rules (Always Enforce)

### Code Rules
1. Always deliver complete files with full paths — no snippets ever
2. No Arabic text or comments inside any code file
3. Do not modify unrelated components
4. Every file labeled with full path, ready to copy-paste
5. Never ask Hedar to manually edit — Claude makes the full change

### Communication Rules
6. When giving multi-step instructions: write each step in BOTH Arabic and English separately
7. Always specify WHERE to run a command: "on the server" or "on PowerShell on your machine"
8. Never write "شغّل:" without specifying the location

### Testing Rules
9. Use `npx expo start` + Expo Go for daily testing — NOT EAS builds
10. EAS builds only for production/TestFlight

### File Rules
11. Always read files from GitHub using raw URLs
12. For folder structure: use PowerShell Out-File pattern
13. Never commit broken files — always verify syntax before commit

### Conversation Rules
14. At start of every conversation — fetch MASTER_README.md and DECISIONS.md from GitHub
15. Never take unilateral decisions without Hedar's approval
16. After every completed feature — update MASTER_README.md and commit
