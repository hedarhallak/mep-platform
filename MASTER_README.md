# MEP Platform — Master Project README
> Last updated: April 10, 2026 | Maintainer: Hedar Hallak
> Production: https://app.constrai.ca
> Server: root@143.110.218.84
> Backend path on server: /var/www/mep
> DB: mepdb / mepuser / MepSecure2026X
> Repo: hedarhallak/mep-platform

---

## How to Use This File
At the start of every new conversation, reference this file so Claude knows exactly where we are.
Fetch it directly: `https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md`

---

## Project Overview
MEP Platform (Constrai) is a Quebec construction workforce ERP for MEP companies.
- Company ID in use: 5
- Test accounts: seed.worker1@meptest.com → seed.worker50@meptest.com (PIN: 1234, role: WORKER)
- Quebec CCQ labor rules enforced throughout (paid breaks, unpaid lunch, overtime, travel allowances)

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
| auth.js | Login / JWT + PIN | ✅ Complete |
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
- Key tables: employees, companies, projects, assignment_requests, attendance_records, material_requests, ccq_travel_rates, permissions, role_permissions, push_tokens, app_users

---

## RBAC — 6 Roles
| Role | Type | Notes |
|---|---|---|
| SUPER_ADMIN | system_role | Full access |
| IT_ADMIN | system_role | Tech management |
| COMPANY_ADMIN | company_role | Company-wide access |
| TRADE_PROJECT_MANAGER | company_role | Project management |
| TRADE_ADMIN | company_role | Also used as FOREMAN assignment_role |
| WORKER | company_role | Field workers — default for seed users |

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
> EAS Project: @hedarhallak75/constrai
> Bundle ID: ca.constrai.app
> Apple Team: Hedar Al-Hallak (DX6L994VNU)
> Apple Developer: ✅ Active (hedar.hallak@gmail.com) — paid April 10, 2026
> Google Play: ✅ Active (hedar.hallak@gmail.com) — paid April 10, 2026
> EAS CLI: eas-cli/18.5.0
> Expo Account: hedarhallak75

### Screens Status
| Screen | File | Status |
|---|---|---|
| Login | src/screens/LoginScreen.tsx | ✅ Complete |
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
└── AppNavigator (if logged in)
    ├── Tab: Attendance → AttendanceScreen
    ├── Tab: Materials → MaterialRequestScreen / MyRequestsScreen
    ├── Tab: Report → MyReportScreen
    ├── Tab: Hub → MyHubScreen
    └── Tab: Profile → ProfileScreen / ChangePinScreen
```

### Key Mobile Files
| File | Purpose |
|---|---|
| src/api/client.ts | Axios instance + JWT interceptor — baseURL: https://app.constrai.ca |
| src/store/useAuthStore.ts | Zustand auth state — AsyncStorage keys: mep_token / mep_user |
| src/hooks/usePushNotifications.ts | Push notification registration |
| src/constants/colors.js | Design tokens |
| app.json | Bundle ID + EAS project config |
| eas.json | Build profiles (development / preview / production) |

### Mobile Build Status (April 10, 2026)
| Platform | Build Type | Status |
|---|---|---|
| Android | Preview APK | ✅ Built — EAS build ID: 4172a1ec |
| iOS | Preview (ad hoc) | ✅ Built + installed on iPhone |
| Android | Production (Google Play) | 🟡 Next |
| iOS | Production (App Store) | 🟡 Next |

### Test Credentials (Mobile)
- Username: seed.worker1@meptest.com → seed.worker50@meptest.com
- PIN: 1234
- All 50 users have APPROVED assignments until 2026-05-06
- All 50 users have role: WORKER

---

## Next Steps — Priority Order
| Priority | Task | Notes |
|---|---|---|
| 🟡 1 | Test all screens thoroughly on iPhone | Attendance, Hub, Materials, Reports, Profile |
| 🟡 2 | Fix any bugs found during testing | |
| 🟡 3 | Build production iOS | eas build --platform ios --profile production |
| 🟡 4 | Build production Android | eas build --platform android --profile production |
| 🟡 5 | App Store submission | appstoreconnect.apple.com |
| 🟡 6 | Google Play submission | play.google.com/console |
| 🟢 7 | TestFlight for beta testers | Before full App Store release |

---

## Git Workflow
```bash
# Start of every session — fetch MASTER_README from GitHub
# Then:
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
6. Always read files from GitHub using raw URLs — never ask Hedar to copy-paste
   Example: `https://raw.githubusercontent.com/hedarhallak/mep-platform/main/path/to/file`
7. When needing to inspect a folder structure — use PowerShell Out-File pattern
   Example: `Get-ChildItem -Recurse -Name -Exclude node_modules | Out-File -FilePath C:\Users\Lenovo\Desktop\structure.txt`

### Efficiency Rules
8. Always prefer automated/scripted solutions over manual steps
9. Batch multiple file operations into one command whenever possible
10. Before starting any task — read MASTER_README from GitHub first
11. Never start from scratch if something already exists

### Conversation Rules
12. At the start of every new conversation — fetch MASTER_README.md from GitHub before doing anything
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

---

## الأفكار المستقبلية — Future Vision

> هذا القسم يوثّق الأفكار الاستراتيجية المتفق عليها — لا تُنفَّذ الآن بل تُبنى عليها لاحقاً.
> لاسترجاعها في أي محادثة: "أعطيني الأفكار المستقبلية"

---

### 1. نظام التعيينات الذكي — Smart Workforce Exchange

**المشكلة:** شركات MEP تعاني من سوء توزيع العمالة — عمال فاضيين عند فورمان وناقصين عند فورمان ثاني.

**الحل داخل الشركة الواحدة (المرحلة الأولى — الأولوية الحالية):**
- الفورمان يرفع طلب عمال إضافيين مع درجة أولوية + تاريخ + سبب
- الفورمان الثاني يعرض تخفيف عمال من فريقه
- TRADE_ADMIN يشوف dashboard كامل ويوافق على إعادة التوزيع
- التعيين يصير تلقائياً بعد الموافقة

**التوسع لاحقاً (المرحلة الثانية):**
- نفس النظام بين شركات MEP مختلفة في Quebec
- Constrai يصير وسيط بين الشركات
- B2B marketplace للعمالة المؤقتة في Quebec

---

### 2. Constrai كـ Provincial Platform — رؤية Quebec

**الهدف:** Constrai مش مجرد ERP — هو infrastructure لقطاع البناء في Quebec بأكمله.

**المراحل:**
```
المرحلة 1 — داخل الشركة الواحدة        ← نحنا هنا الآن
المرحلة 2 — بين شركات MEP في Quebec    ← بعد إتقان المرحلة 1
المرحلة 3 — منصة رسمية مدعومة من CCQ  ← الهدف الكبير
```

**لماذا CCQ ستدعمه:**
- يضمن تطبيق قواعد CCQ تلقائياً
- يحمي حقوق العمال
- يحل مشكلة البطالة الموسمية
- يعطي إحصائيات دقيقة للقطاع بأكمله

---

### 3. أكواد البناء — Quebec Building Code AI

**الفكرة:** منصة ذكاء اصطناعي للكود السباكة في Quebec — يجيب على أسئلة المقاولين عن الكود مباشرة بدل البحث اليدوي.

**التقنية المقترحة:** RAG (Retrieval Augmented Generation) على وثائق كود البناء القبيكي.

---

### 4. حساب الكميات الذكي — AI Quantity Takeoff

**الفكرة:** نظام يقرأ مخططات البناء (PDF/DWG) ويحسب الكميات تلقائياً.

**التقنية المقترحة:** Computer Vision + LLM على مخططات MEP.

---

### 5. ربط الموردين — Supplier Integration

**الفكرة:** ربط طلبات المواد مباشرة مع كتالوج الموردين — المقاول يطلب مواد والنظام يقارن الأسعار ويرسل الطلب تلقائياً.

**يبني على:** نظام المواد الموجود حالياً في Constrai.

---

### 6. إعادة تصميم الأدوار — Role Redesign (أولوية قريبة)

**الأدوار المطلوب إضافتها:**
| Role | الوظيفة |
|---|---|
| FOREMAN | يرسل tasks للعمال — يدير مشروعه |
| JOURNEYMAN | عامل متمرس |
| APPRENTICE_1 | متدرب مستوى 1 |
| APPRENTICE_2 | متدرب مستوى 2 |
| APPRENTICE_3 | متدرب مستوى 3 |
| APPRENTICE_4 | متدرب مستوى 4 |

**الميزة الذكية — Dynamic Permissions:**
عند الـ login، النظام يفحص assignment اليوم ويعطي الصلاحيات تلقائياً:
- مُعيَّن اليوم كـ JOURNEYMAN → صلاحيات JOURNEYMAN
- كان/لازال FOREMAN على مشروع → صلاحيات FOREMAN كاملة على ذلك المشروع (حتى لو متوقف مؤقتاً)

**مصفوفة التعيينات (من يعيّن من):**
| من | يعيّن |
|---|---|
| COMPANY_ADMIN | الجميع |
| TRADE_PROJECT_MANAGER | TRADE_ADMIN وما دونه |
| TRADE_ADMIN | FOREMAN وما دونه (الأساسي) |
| FOREMAN | يقترح تعيين → TRADE_ADMIN يوافق |
