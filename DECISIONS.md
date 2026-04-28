# Constrai — Architectural Decisions & Pending Work

> This file documents every agreed architectural decision + all planned work not yet implemented.
> At the start of every conversation: read MASTER_README.md then DECISIONS.md
> Raw URL: https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md

---

## How to Use This File

- ✅ **Implemented** — done and tested
- 🔄 **In Progress** — work started
- 🟡 **Planned — High Priority** — agreed, not yet implemented
- 🔵 **Planned — Medium Priority** — agreed, later
- 💡 **Future Idea** — documented, not in near plan
- ❌ **Never delete ideas** — when two similar ideas exist, keep both and merge when discussing

---

## Working Rules — Decision Documentation

> **Every architectural or design decision agreed during conversation → document in DECISIONS.md immediately. Never rely on memory.**
> Claude cannot see previous conversations — DECISIONS.md is the only shared memory.

---

## 1. Role & Permission System ✅

### Core Principle:
- **PERMISSIONS** — fixed in code, developer adds only when new feature is built
- **ROLES** — fully flexible, SUPER_ADMIN adds/edits from UI without code
- **Permission-to-role mapping** — from UI, no code needed
- **Role assignment to user** — UPDATE in DB from UI
- Adding a new role or editing its permissions = UI only, no developer needed

```
PERMISSIONS (fixed in code)
    ↓
ROLES (flexible — from UI)
    ↓
USERS (assigned role by COMPANY_ADMIN)
```

**Status:** ✅ Implemented and tested

---

### 13 Roles (April 2026):

| Role | Level | Note |
|---|---|---|
| SUPER_ADMIN | 100 | Constrai internal only |
| IT_ADMIN | 90 | Technical admin |
| COMPANY_ADMIN | 80 | Company owner/manager |
| TRADE_PROJECT_MANAGER | 60 | Project manager |
| TRADE_ADMIN | 50 | Trade supervisor |
| FOREMAN | 40 | Site foreman — also an assignment_role |
| JOURNEYMAN | 20 | Qualified tradesperson |
| APPRENTICE_4 | 15 | Apprentice level 4 |
| APPRENTICE_3 | 15 | Apprentice level 3 |
| APPRENTICE_2 | 15 | Apprentice level 2 |
| APPRENTICE_1 | 15 | Apprentice level 1 |
| WORKER | 10 | General worker |
| DRIVER | 10 | Company driver |

---

### Permission Matrix (April 2026):

> SA=SUPER_ADMIN, IT=IT_ADMIN, CA=COMPANY_ADMIN, TPM=TRADE_PROJECT_MANAGER, TA=TRADE_ADMIN, FM=FOREMAN, JM=JOURNEYMAN, A4=APPRENTICE_4, A3=APPRENTICE_3, A2=APPRENTICE_2, A1=APPRENTICE_1, WK=WORKER, DR=DRIVER

| Permission | SA | IT | CA | TPM | TA | FM | JM | A4 | A3 | A2 | A1 | WK | DR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| assignments.create | ✓ | |✓ | |✓ | | | | | | | | |
| assignments.delete | ✓ | |✓ | |✓ | | | | | | | | |
| assignments.edit | ✓ | |✓ | |✓ | | | | | | | | |
| assignments.smart_assign | ✓ | |✓ | |✓ | | | | | | | | |
| assignments.view | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| assignments.view_own_trade | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| attendance.approve | ✓ | |✓ | |✓ | | | | | | | | |
| attendance.checkin | ✓ | |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |
| attendance.overtime_approve | ✓ | |✓ | |✓ | | | | | | | | |
| attendance.view | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| attendance.view_own_trade | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| attendance.view_self | ✓ | |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |
| audit.view | ✓ |✓ |✓ | | | | | | | | | | |
| bi.access_full | ✓ | |✓ | | | | | | | | | | |
| bi.access_own_trade | ✓ | |✓ |✓ |✓ | | | | | | | | |
| bi.workforce_planner | ✓ | |✓ |✓ |✓ | | | | | | | | |
| dashboard.view | ✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |
| employees.create | ✓ |✓ |✓ | | | | | | | | | | |
| employees.delete | ✓ |✓ |✓ | | | | | | | | | | |
| employees.edit | ✓ |✓ |✓ | | | | | | | | | | |
| employees.invite | ✓ |✓ |✓ | | | | | | | | | | |
| employees.view | ✓ |✓ |✓ | | | | | | | | | | |
| employees.view_own_trade | ✓ |✓ |✓ |✓ |✓ | | | | | | | | |
| hub.access | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| hub.attendance_approval | ✓ | |✓ | |✓ | | | | | | | | |
| hub.materials_inbox | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| hub.materials_merge_send | ✓ | |✓ | |✓ |✓ | | | | | | | |
| hub.receive_tasks | ✓ | |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |
| hub.send_tasks | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| materials.catalog_view | ✓ | |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ | |
| materials.request_submit | ✓ | |✓ |✓ |✓ |✓ |✓ |✓ |✓ | | |✓ | |
| materials.request_view_all | ✓ | |✓ | | | | | | | | | | |
| materials.request_view_own | ✓ | |✓ |✓ |✓ |✓ |✓ |✓ |✓ | | |✓ | |
| materials.request_view_own_trade | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| materials.surplus_declare | ✓ | |✓ | |✓ |✓ | | | | | | | |
| materials.surplus_view | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| projects.create | ✓ | |✓ | | | | | | | | | | |
| projects.delete | ✓ | |✓ | | | | | | | | | | |
| projects.edit | ✓ | |✓ | | | | | | | | | | |
| projects.view | ✓ | |✓ | | | | | | | | | | |
| projects.view_own_trade | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| purchase_orders.print | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| purchase_orders.view | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| purchase_orders.view_own | ✓ | |✓ | |✓ |✓ |✓ |✓ | | | |✓ | |
| purchase_orders.view_own_trade | ✓ | |✓ |✓ |✓ | | | | | | | | |
| reports.view | ✓ | |✓ |✓ |✓ |✓ |✓ |✓ |✓ | | |✓ | |
| reports.view_self | ✓ | |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |
| settings.company | ✓ |✓ |✓ | | | | | | | | | | |
| settings.permissions | ✓ |✓ | | | | | | | | | | | |
| settings.system | ✓ |✓ | | | | | | | | | | | |
| settings.user_management | ✓ |✓ |✓ | | | | | | | | | | |
| standup.manage | ✓ | |✓ |✓ |✓ | | | | | | | | |
| suppliers.create | ✓ | |✓ | | | | | | | | | | |
| suppliers.delete | ✓ | |✓ | | | | | | | | | | |
| suppliers.edit | ✓ | |✓ | | | | | | | | | | |
| suppliers.view | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| tasks.send | ✓ | |✓ |✓ |✓ |✓ | | | | | | | |
| tasks.view | ✓ | |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |✓ |

---

## 2. Mobile App Architecture (April 2026) ✅

### UI Law — Icon Grid Navigation:
> **Every screen in the app uses icon grid navigation (same design as Dashboard). No tabs, no separate buttons, no lists. Every action or section = icon card.**
> This applies to: Materials, Tasks, My Hub, My Report, and all future sub-screens.

### Shared Component:
- `src/screens/shared/SubMenuScreen.tsx` — reusable icon grid, identical design to DashboardScreen
- **Rule: Never build two screens with the same design. Always use SubMenuScreen with different props.**

### Navigation Structure:
```
Bottom Bar: Home · Hub · Profile

Home → DashboardScreen (icon grid, role-aware)
  → Attendance
  → Materials → MaterialsMenuScreen (icon grid)
      → New Request
      → My Requests
  → Tasks (FOREMAN+) → TasksMenuScreen (icon grid)
      → New Task (full form: project, recipients, photo, priority, due date)
      → Sent Tasks (completion tracking with photos)
  → Report → ReportMenuScreen (icon grid)
      → This Week
      → Last Week
      → Custom Date
  → Assignments (Soon)
  → Standup (Soon)
  → Purchase Orders (Soon)

Hub → HubMenuScreen (icon grid)
  → Inbox (tasks + notifications archive)
  → Material Requests (FOREMAN+) → merge + edit + send PO
```

### My Hub Philosophy:
> My Hub = Inbox only. Like email. Receives tasks, material notifications.
> After processing → stays as archive.
> Sending tasks → from Dashboard → Tasks → New Task
> Processing materials → from Hub → Material Requests → Merge & Edit

### Materials Flow (Foreman):
```
Worker submits request → stored with foreman_employee_id
Foreman sees in Hub → Material Requests
Foreman selects requests → Merged Preview (auto SUM by item_name)
Foreman taps "Merge & Edit" → MergeEditScreen (edit qty, delete items, choose destination)
Foreman sends → POST /api/materials/send-order → PO created + email sent
requests status → SENT
```

---

## 3. Organizational Structure ✅

| Role | Reports To | Note |
|---|---|---|
| COMPANY_ADMIN | Owner | Top of company |
| TRADE_PROJECT_MANAGER | TRADE_ADMIN or higher | Cross-trade oversight |
| TRADE_ADMIN | FOREMAN level up | Trade supervisor |
| FOREMAN | Reports to TRADE_ADMIN | Field leader |

---

## 4. Technical Decisions Log

| Decision | Value | Date |
|---|---|---|
| Mobile framework | React Native + Expo | March 2026 |
| Auth mobile | JWT + PIN | March 2026 |
| Token storage (web) | localStorage — mep_token / mep_refresh_token | April 2026 |
| Token storage (mobile) | expo-secure-store (encrypted) — mep_token / mep_refresh_token | April 16, 2026 |
| Role check | Permission-based from DB | April 2026 |
| Roles | Mutable from UI, no code needed | April 2026 |
| Permissions | Fixed in code | April 2026 |
| Backend path | /var/www/mep | April 2026 |
| EAS Account | hedarhallak75 on expo.dev | April 2026 |
| Bundle ID | ca.constrai.app | April 2026 |
| Mobile Navigation | Dashboard First — Home · Hub · Profile | April 2026 |
| UI Design Law | Icon Grid for all screens | April 2026 |
| PostGIS | Installed on mepdb for geo calculations | April 2026 |
| PO send endpoint | POST /api/materials/send-order (accepts edited items) | April 2026 |
| full_name in JWT | Added to login response for mobile display | April 2026 |
| Mobile i18n library | react-i18next v4 (compatibility v3 removed) | April 15, 2026 |
| Mobile default language | French (FR) — English secondary | April 15, 2026 |
| Language detector | Custom AsyncStorage detector, key: mep_language | April 15, 2026 |
| Date/time locale | Dynamic via i18n.language → fr-CA or en-CA | April 15, 2026 |
| @expo/vector-icons path | Resolved via tsconfig paths (nested install) | April 15, 2026 |
| Centralized color theme | src/theme/colors.ts — all 23 files use it, zero hardcoded colors | April 15, 2026 |
| Brand colors v1 (olive) | Primary #3d5a2e — rejected (too military/dull) | April 15, 2026 |
| Brand colors v2 (vibrant) | Primary #16a34a (green) + Accent #ea580c (dark orange) — rejected | April 16, 2026 |
| Brand colors v3 (dark blue) | Primary #1e3a5f — approved for both mobile + web | April 16, 2026 |
| Website domain | www.constrai.ca = company site, app.constrai.ca = login/app | April 16, 2026 |
| Landing page | Bilingual Coming Soon page, SSL via certbot | April 16, 2026 |
| Nginx setup | constrai.ca + www.constrai.ca both served from /var/www/constrai-landing | April 16, 2026 |
| Auth: Refresh tokens | Access token 1h + Refresh token 7d + rotation on refresh | April 16, 2026 |
| Auth: Server-side logout | POST /auth/logout revokes refresh token, POST /auth/logout-all revokes all | April 16, 2026 |
| Auth: Secure storage (mobile) | expo-secure-store replaces AsyncStorage for tokens | April 16, 2026 |
| Web centralized theme | index.css @theme + Tailwind v4 CSS variables (--color-primary-*) | April 16, 2026 |
| Web indigo→primary migration | All 19 source files: indigo-* classes replaced with primary-* theme classes | April 16, 2026 |
| DB backup storage | DigitalOcean Spaces, bucket `constrai-backups`, region **TOR1** (Toronto, same as Droplet) | April 19, 2026 |
| DB backup retention | 7 daily + 4 weekly + 3 monthly | April 18, 2026 |
| DB backup tooling | s3cmd + pg_dump, scripts in `scripts/backup/`, config in `/etc/mep-backup.env` (chmod 600) | April 18, 2026 |
| DB backup schedule | Cron 07:00 UTC daily (backup) + 07:30 UTC daily (retention cleanup) — server runs UTC, equals 03:00 Quebec EDT | April 19, 2026 |
| DB restore strategy | Use `sudo -u postgres psql` (peer auth) — required for `CREATE EXTENSION postgis` superuser permission. Pipe SQL via stdin to bypass /tmp permission issues. | April 19, 2026 |
| pg_dump options | `--clean --if-exists` (drops + recreates objects on restore). Ownership preserved (no `--no-owner`) so tables end up owned by `mepuser` after restore. | April 19, 2026 |
| Spaces Access Key | Limited Access scoped to single bucket only with Read/Write/Delete (principle of least privilege) | April 19, 2026 |
| Recovery documentation | `RECOVERY.md` at repo root — full DR + bus-factor mitigation playbook | April 18, 2026 |
| Documentation reading system | 4 always-read files (MASTER_README, DECISIONS, RECOVERY, CLAUDE) + 5 on-demand files (SCHEMA, API, .env.example, scripts/backup/SETUP, START_NEW_SESSION) | April 19, 2026 |
| CLAUDE.md | Single source of truth for Claude-specific rules, code conventions, file map. Replaces scattered "Working Rules" duplication. | April 19, 2026 |
| SCHEMA.md | Full DB schema reference (56 tables grouped by domain, key columns, common queries). Prevents repeated mistakes like assuming `users` instead of `app_users`. | April 19, 2026 |
| API.md | Full backend endpoint reference (~30 routes organized by domain, with required permissions). | April 19, 2026 |
| Always Suggest Better Tools rule | New rule (#22 in MASTER_README): before writing custom code in a new area, check for existing tools/MCPs/SaaS first. Triggered by Cowork discovery analogy. | April 19, 2026 |
| Session start templates | 6 templates in `START_NEW_SESSION.md` (generic, specific task, DB, API, bug, UI) — eliminates cold-start friction in new conversations. | April 19, 2026 |

---

## 5. Roadmap

### 5.1 Immediate Next Steps
```
1. ✅ Role System Redesign (284 permission mappings)
2. ✅ Mobile Dashboard First Navigation
3. ✅ Unified Icon Grid (SubMenuScreen)
4. ✅ Tasks Screen (New Task + Sent Tasks)
5. ✅ My Hub = Inbox only
6. ✅ Materials Hub (Foreman: merge + edit + send)
7. ✅ Report Menu (This Week / Last Week / Custom)
8. ✅ Apple TestFlight Build
9. ✅ Mobile Bilingual (EN/FR) — all screens + headers + localized dates
10. ✅ Company website www.constrai.ca (Coming Soon + SSL)
11. ✅ Centralized color theme (src/theme/colors.ts — 23 files migrated)
12. ✅ Brand color palette — dark blue (#1e3a5f) approved for mobile + web
12b. ✅ Security: Refresh token rotation + expo-secure-store
12c. ✅ Web frontend: centralized theme (indigo→primary migration, 346 replacements)
12d. ✅ Disaster Recovery foundation: DB backups to DigitalOcean Spaces + RECOVERY.md
13. 🟡 Web Frontend Bilingual (EN/FR) — not yet started
14. 🟡 Android Google Play Build
15. 🟡 PDF / Email templates in FR (follow Company language setting)
16. 🟡 Bus-factor hardening — see Section 14
```

### 5.2 Planned Features — High Priority
```
1. 🟡 Web Frontend Bilingual (EN/FR) — mirror of mobile i18n
2. 🟡 Purchase Orders screen on mobile
3. 🟡 Assignments screen on mobile
4. 🟡 Standup screen on mobile
5. 🟡 Unread badge fix on My Hub bottom tab
6. 🟡 Company Language setting UI (for official documents)
```

### 5.3 Planned Features — Medium Priority
```
1. 🔵 Custom Job Titles per Company — see Section 7
2. 🔵 Material Return / Surplus System — see Section 8
3. 🔵 Smart Assignment System
4. 🔵 Dynamic Permissions UI
5. 🔵 Assignment enhancements — Hot Work Permit + Site Safety Officer — see Section 16
```

### 5.4 Future Ideas
```
1. 💡 CCQ Labor Marketplace — see Section 9
```

---

## 6. Bilingual Support (EN/FR) 🔄

### Decision:
- **UI Language** → user chooses (EN or FR) per device
- **Official Documents** (PO, emails to suppliers) → follows Company Language setting
- **Task Messages** → follows sender's language

### Company Language Setting:
- COMPANY_ADMIN sets company official language in Settings
- All PDFs, PO emails, official correspondence → generated in company language
- Rationale: Quebec Law 101 requires French for official business documents

### Implementation Status:
| Layer | Status | Date |
|---|---|---|
| Mobile — library setup (react-i18next) | ✅ | Apr 14, 2026 |
| Mobile — all screens + headers | ✅ | Apr 15, 2026 |
| Mobile — localized dates (fr-CA / en-CA) | ✅ | Apr 15, 2026 |
| Mobile — Profile → Language switcher | ✅ | Apr 14, 2026 |
| Web Frontend — library setup | 🟡 | — |
| Web Frontend — all pages | 🟡 | — |
| PDF templates (PO, reports) in FR | 🟡 | — |
| Email templates (supplier orders) in FR | 🟡 | — |
| Company language setting UI | 🟡 | — |

### Mobile i18n Technical Notes:
- Library: `react-i18next` v4 (compatibility v3 mode removed)
- Language detector: Custom AsyncStorage detector, key `mep_language`
- Default language: French (FR), fallback: EN
- Files: `src/i18n/index.ts`, `src/i18n/locales/en.ts`, `src/i18n/locales/fr.ts`
- Sections: common, auth, dashboard, modules, attendance, materials, tasks, hub, report, profile, roles, errors
- Date/time locale: dynamic via `i18n.language === 'fr' ? 'fr-CA' : 'en-CA'`

### Note:
> Many Quebec companies communicate internally in English even under Law 101.
> Solution: UI language = user choice. Documents language = company setting.
> This handles all cases without forcing one language.

---

## 7. Custom Job Titles per Company 🔵

### Idea:
Each company defines its own job title names mapped to permission levels.

### Example:
```
Company A: "Chef d'équipe" = FOREMAN level (40)
Company B: "Site Supervisor" = FOREMAN level (40)
Company C: "Contremaître" = FOREMAN level (40)
```

### Implementation:
- New table: `company_roles` (company_id, display_name, base_role, level)
- UI in Settings → Custom Roles
- Existing 13 roles become "base templates"
- Display name overrides in all UI + PDFs

### Status: 🔵 Planned — design discussion needed before implementation

---

## 8. Material Return / Surplus System 🔵

### Idea (April 2026):
A smart system to reduce material waste and cost by routing surplus materials between projects before ordering from supplier.

### Flow:
```
1. Foreman declares surplus materials at project site
2. System creates a "Return Request" with status: WAITING (3-day holding period)
3. System sends notification to ALL Foremen across ALL active projects:
   "Surplus materials available: [list of items]"
4. Any Foreman can claim items they need within 3 days
5. Driver is dispatched to transfer materials between projects
6. After 3 days with no claim → materials go to supplier return or warehouse
7. When new PO is being created → system checks for available surplus first
   and alerts Foreman: "These items may be available from surplus: [list]"
```

### Benefits:
- Reduces supplier orders and costs
- Reduces waste ("throw it away" problem)
- Reduces warehouse storage pressure
- Creates internal supply chain visibility

### New Screens Needed:
- Dashboard → "Surplus" icon (FOREMAN+)
  - Declare Surplus
  - Available Surplus (from other projects)
- Hub → notification when surplus matches pending request

### DB Tables Needed:
- `material_surplus_requests` (project_id, items, status, expires_at)
- `material_surplus_claims` (surplus_id, claiming_project_id, claiming_foreman_id, items_claimed)

### Status: 🔵 Planned — detailed design session needed

---

## 9. CCQ Labor Marketplace 💡

### Idea (April 2026):
A platform extension where:
- Companies post job openings
- Workers post their availability and skills
- CCQ (union) acts as intermediary/validator

### Differentiation from existing job boards:
- CCQ-verified workers (union membership validation)
- Trade-specific matching (PLUMBING, ELECTRICAL, etc.)
- Integration with existing attendance/assignment history
- Skill level matching (JOURNEYMAN, APPRENTICE level, etc.)

### Note:
> This is a significant product extension — essentially a separate product built on top of MEP Platform.
> Not in near-term roadmap. Document and revisit when core platform is stable.

### Status: 💡 Future idea — keep documented, discuss when core is complete

---

## 10. Smart Assignment System 🔵

### Concept:
Automatic assignment suggestions based on:
- Worker proximity to project site (home_lat/home_lng vs site_lat/site_lng)
- Worker trade matching project needs
- Current workload and availability
- CCQ rules compliance

### Current State:
- PostGIS installed ✅
- home_lat/home_lng in employee_profiles ✅
- site_lat/site_lng in projects ✅
- Workforce Planner BI feature shows distance optimization ✅

### Next Steps:
- Build auto-suggestion endpoint
- UI to accept/reject suggestions
- Driver routing optimization for material transfers

### Status: 🔵 Planned — depends on Smart Assignment design session

---

## 11. Session Log — April 15, 2026

### Completed:
- Fixed `Property 't' doesn't exist` TypeScript error (root cause: SubMenuScreen props mismatch)
- Cleared all remaining TypeScript errors (0 errors on `tsc --noEmit`)
- Replaced all hardcoded English strings across screens:
  - `NewTaskScreen` (body + labels)
  - `MainStackNavigator` (11 screen titles)
  - `MaterialsNavigator` (all titles)
  - `AttendanceScreen` (all strings + localized date/time)
  - `MaterialRequestScreen` (all strings + interpolation)
  - `ForemanMaterialsTab` (My Hub → Material Requests: all strings + localized dates)
- Added missing translation keys in `en.ts` and `fr.ts`:
  - `attendance.*` — regular, todaysAssignment, markedLate, shiftConfirmed, shiftCompleted, confirmCheckout, confirmCheckoutMsg, loadError, checkinFailed, checkoutFailed, noRecord
  - `materials.*` — itemLabel, itemNote, selectUnit, submitSuccess, submitFailed, addItemHint, noAssignmentTitle, noAssignmentMsg, noPendingRequests, worker, itemsCount (plural), noRequestsSelected(Msg), noItems(Msg), mergeEditBtn
- Fixed missing `pickCompletionImage` in MyHubScreen
- Fixed Expo SDK 54 `NotificationBehavior` (added `shouldShowBanner`, `shouldShowList`)
- Fixed `@expo/vector-icons` path (nested install) via tsconfig paths
- Fixed Ionicons name typing via `React.ComponentProps<typeof Ionicons>['name']`
- Removed `compatibilityJSON: 'v3'` from i18n init (v4 default)
- Built + uploaded to TestFlight; installed on phone and verified

### Pending Discussion (for next session):
- Web Frontend i18n (mirror mobile setup)
- Material Return / Surplus System — detailed design (Section 8)
- Custom Job Titles per Company — design session (Section 7)
- CCQ Labor Marketplace — architecture discussion (Section 9)
- Company Language setting UI (backend + frontend)

---

## 12. Session Log — April 16, 2026

### Completed:
- Set up www.constrai.ca on production server (143.110.218.84)
  - Created bilingual Coming Soon landing page (EN/FR with auto-detect)
  - ConstrAI logo (inline SVG: ascending bars + AI nodes + "ConstrAI" text)
  - Login button → app.constrai.ca
  - DNS: added www A record on Namecheap
  - Nginx config for both constrai.ca and www.constrai.ca
  - SSL certificate via certbot (Let's Encrypt)
- Created centralized color theme (src/theme/colors.ts)
  - Replaced ALL hardcoded colors across 23 mobile screen files (241 occurrences)
  - Eliminated old blue (#1e3a5f) identity completely
- Brand color iteration:
  - v1: Olive green (#3d5a2e) — rejected ("too military, no life")
  - v2: Vibrant green (#16a34a) + Dark orange (#ea580c) — rejected
  - v3: Teal (#005f5f) — rejected (light on dark readability issues)
  - v4: Dark blue (#1e3a5f) — approved (temporary, may revisit later)
- Updated landing page with new color palette
- Security audit and fix:
  - Implemented refresh token rotation (access 1h, refresh 7d)
  - Migration 031: refresh_tokens table (token_hash, expires_at, revoked)
  - Backend: POST /auth/refresh (rotation), POST /auth/logout, POST /auth/logout-all
  - Web frontend: automatic 401 retry with refresh token queue
  - Mobile: expo-secure-store replaces AsyncStorage for encrypted token storage
- Web frontend centralized theme:
  - index.css @theme directive with CSS variables (--color-primary-*)
  - Replaced ALL indigo Tailwind classes (346 occurrences across 19 files) with primary-* theme classes
  - Web colors now match mobile: dark blue (#1e3a5f)

### Pending:
- Deploy updated landing page with approved dark blue palette
- Build new TestFlight with secure auth (refresh tokens + expo-secure-store)
- Web frontend bilingual (EN/FR)

---

## 13. Decisions About Ideas Management

> **Rule: Never delete any idea from this file.**
> When two similar ideas exist → keep both, note the similarity, merge during dedicated discussion.
> Example: Material surplus system (Section 8) and Smart Assignment proximity (Section 10) both use geographic data — they should be discussed together for a unified geo-intelligence layer.

---

## 14. Disaster Recovery & Bus-Factor Mitigation 🔄

### Context (April 18, 2026):
The mobile dev tooling crashed and had to be reinstalled — some uncommitted local work was lost.
This raised two real risks that need to be hardened:
1. **Data loss** — no automated DB backups existed; a corrupted DB or destroyed Droplet would lose everything.
2. **Bus factor = 1** — every account, password, and piece of operational knowledge lives only in Hedar's head + laptop. If Hedar is unavailable, the business stops.

### Strategy:
Defense in depth across three layers — data, infrastructure, and human knowledge.

### Layer 1 — Data (DB backups) ✅
- Daily pg_dump → DigitalOcean Spaces (`constrai-backups`, NYC3)
- Retention: 7 daily + 4 weekly + 3 monthly
- Restore tested via `restore_db.sh` (always restore to a different DB name first, then swap)
- Scripts: `scripts/backup/{backup_db.sh, cleanup_old_backups.sh, restore_db.sh}`
- Config: `/etc/mep-backup.env` (chmod 600, root)
- Setup guide: `scripts/backup/SETUP.md`
- Optional: healthchecks.io dead-man's-switch for failure alerts

### Layer 2 — Infrastructure 🟡
- 🟡 DigitalOcean weekly Droplet snapshots — enable in dashboard
- 🟡 SSL auto-renew verification (quarterly `certbot renew --dry-run`)
- 🟡 Commit Nginx config template + `.env.example` to repo

### Layer 3 — Human Knowledge & Access 🟡
- 🟡 Password manager (Bitwarden / 1Password) holding ALL credentials — see `RECOVERY.md` Section 2.1 for required inventory
- 🟡 Emergency access for one trusted contact (spouse / business partner / lawyer with sealed envelope)
- 🟡 Second GitHub collaborator with admin rights
- 🟡 Apple ID recovery contacts (2FA backup)
- 🟡 Eventually: Apple Developer Organization account (vs current Individual)
- 🟡 Eventually: second developer/contractor onboarded and given `RECOVERY.md`

### Operational Rule:
- **Quarterly** (1st of Jan/Apr/Jul/Oct): run the verification checklist in `RECOVERY.md` Section 8.
- **After every infra change**: update `RECOVERY.md`.

### Status: 🔄 In progress — backup automation deployed, hardening items pending (see `RECOVERY.md` Section 10)

---

## 15. Session Log — April 18, 2026

### Context:
Mobile dev environment crashed on Hedar's laptop and had to be reinstalled. Some uncommitted work was lost. Triggered a discussion about disaster recovery and bus-factor risk.

### Completed:
- Created automated DB backup pipeline:
  - `scripts/backup/backup_db.sh` — pg_dump + sanity checks + gzip + upload to Spaces
  - `scripts/backup/cleanup_old_backups.sh` — applies 7/4/3 retention
  - `scripts/backup/restore_db.sh` — interactive restore with safety guards (blocks accidental overwrite of `mepdb`)
  - `scripts/backup/SETUP.md` — full server setup guide (DigitalOcean Spaces config, s3cmd, cron)
- Created `RECOVERY.md` at repo root — comprehensive DR playbook covering:
  - Credential inventory (password manager requirements)
  - DB recovery procedure (RPO 24h / RTO 30min)
  - Server recovery (snapshot restore + full rebuild from scratch)
  - Domain / SSL recovery
  - Mobile app recovery (Apple/Expo single points of failure)
  - GitHub recovery
  - Quarterly verification checklist
  - Prioritized hardening TODO list
- Updated `DECISIONS.md`:
  - Added Section 14 (DR & Bus-Factor)
  - Added technical decisions for backup tooling
  - Added Section 15 (this session log)

### Final state (end of session, April 19):
- ✅ DigitalOcean Spaces bucket `constrai-backups` created in **TOR1 region** (not NYC3 as originally documented). Private (File Listing: Restricted), CDN disabled.
- ✅ Spaces Access Key `mep-backup-key` created with **Limited Access** scoped to `constrai-backups` only, permissions `Read/Write/Delete`. Keys currently in `do-spaces-keys.txt` on user's desktop (TODO: move to password manager + delete file).
- ✅ Server fully configured: s3cmd installed + configured for TOR1 endpoint, `/etc/mep-backup.env` created (mode 600 root-only) with real DB credentials, scripts pulled and made executable, log file initialized.
- ✅ First manual backup ran successfully: 700K raw → 56K compressed, uploaded to Spaces, also auto-copied to weekly folder (was Sunday).
- ✅ Cron jobs scheduled at 07:00 UTC (= 03:00 Quebec EDT) for backup + 07:30 UTC for retention cleanup.
- ✅ End-to-end restore test passed: row counts match production (app_users: 51, companies: 1, employee_profiles: 50, assignment_requests: 58), table ownership preserved as `mepuser`.

### Issues discovered + fixed during testing:
1. **PostGIS extension restore failure** — original `restore_db.sh` used `mepuser` for restore, but `CREATE EXTENSION postgis` requires superuser. Fixed: restore script now uses `sudo -u postgres psql` (peer auth, no password). Also removed `--no-owner` from `pg_dump` so ownership is preserved through the restore.
2. **`Permission denied` reading SQL file from root's tmp dir** — postgres OS user couldn't access `/tmp/mep-restore-XXX/*.sql`. Fixed: restore script now pipes SQL via `cat | psql` instead of `psql -f`.
3. **`git pull` fails with "would be overwritten"** — `chmod +x` on the server registers as a file-mode change in git. Workaround documented: `git checkout scripts/backup/ && git pull && chmod +x scripts/backup/*.sh`.
4. **`s3cmd --configure` test fails with `403 AccessDenied`** — expected behavior with Limited Access keys (no `s3:ListAllMyBuckets` permission). Documented in SETUP.md as expected; verify via `s3cmd ls s3://constrai-backups/` against the specific bucket instead.
5. **DigitalOcean UI changes** — Spaces Access Keys are no longer at `/account/api/spaces` (which redirects to API tokens page). Correct path: Spaces Object Storage → Access Keys tab.

### Pending (next steps for Hedar):
- 🔴 **Critical hardening — do this next session:**
  1. Move `do-spaces-keys.txt` contents from desktop into a password manager (Bitwarden/1Password). Delete the desktop file after.
  2. Set up password manager emergency access for one trusted contact.
  3. Enable DigitalOcean Droplet weekly snapshots ($2/month).
  4. Add Apple ID 2FA recovery contacts.
  5. Add a second GitHub collaborator with admin rights.
- 🟡 Optional: set up healthchecks.io dead-man's-switch (SETUP.md Part 4).
- 🟡 Server has a pending kernel update — schedule a reboot for off-hours.

### Pending Discussion (future sessions):
- Second technical contact — who, what level of involvement, NDA?
- Apple Developer Organization account transition — requires business entity decisions
- Web Frontend i18n (mirror mobile setup) — still on the roadmap from last session

---

## 15.5. Assignment Feature Enhancements 🔵 (noted April 19, 2026 — details pending)

Hedar flagged two real-world construction requirements that must be integrated into the Assignment workflow before going live with actual customers. Captured here as placeholders — detailed design/implementation will happen in a dedicated session.

### A. Hot Work Permit (رخصة العمل الساخن)

Certain trade operations require a formal permit before work can be performed on-site. Examples mentioned:
- **Copper brazing (لحام نحاس)** — common in plumbing/HVAC
- Other hot work: welding, torch cutting, grinding with sparks

**Why it matters (business rule, to be refined with Hedar):**
- Regulatory / insurance requirement in Quebec construction
- The foreman/worker must hold a valid permit for the specific type of hot work
- Assignment creation must check permit validity for the planned work
- Likely fields on the assignment: `hot_work_required` (bool), `hot_work_type` (enum), `permit_number`, `permit_expiry`, `permit_document_url`

**Open design questions (to discuss):**
- Is the permit attached to the **employee** (their credential) or the **assignment** (the permit issued for that specific job)?
- Does Quebec have a central verifiable registry, or is it paper-based?
- Block assignment creation if permit missing/expired, or warn only?

### B. Site Safety Officer (مسؤول السلامة بالموقع)

For projects above a certain size/risk level, a designated safety officer must be on-site.

**Why it matters (business rule, to be refined with Hedar):**
- CSST / CNESST (Quebec workplace safety) requirements
- Specific trades or project sizes trigger the requirement
- The safety officer is an assignment role in itself

**Open design questions (to discuss):**
- Is the safety officer a separate `assignment_role` alongside WORKER/FOREMAN/JOURNEYMAN, or a separate entity on the project?
- One safety officer per project, per shift, or per trade?
- Required for all projects or only those matching certain criteria (size, trades, hot work)?
- Can the foreman double as safety officer with appropriate certification, or must they be separate people?

### Implementation scope (when prioritized):

- DB migration: new columns on `assignment_requests` / `assignments` for permit fields, possibly new table for permit credentials per employee
- New table: `site_safety_assignments` (project_id, employee_id, date_range, certification_ref)
- Backend validation: assignment creation endpoint checks permit validity + safety officer presence
- Mobile UI: assignment form adds permit/safety fields conditionally based on trade + project
- Audit: log any assignment created that bypasses the safety check (exception flow)

### Status: 🔵 Planned — Hedar will walk through the full business rules in a dedicated session before implementation.

---

## 16. Session Log — April 19, 2026 (later same day)

### Context:
After successful end-to-end backup deployment, Hedar opened a new conversation to continue with Layer 3 hardening. Discovered that the new Claude session asked clarifying questions despite a "simple" prompt — exposed the cold-start friction problem.

### Discussion that led to this work:
Hedar made two strategic points:
1. **Cold-start friction is real** — every new session starts from zero, even with the bootstrap message. Need explicit, copy-paste templates that contain everything a fresh Claude needs.
2. **Always look for better tools** — the original workflow (manual file copy-paste between chat and disk) wasted months until Cowork was discovered. Apply the same scrutiny to every new area: ask "is there a tool that does this better?" BEFORE writing custom code.

### Completed:
- Created 4 new documentation files at repo root:
  - **`CLAUDE.md`** — single source of truth for Claude rules + code conventions + file map. Eliminates duplication that was scattered across MASTER_README and other docs.
  - **`SCHEMA.md`** — full DB schema reference: 56 tables grouped by 10 domains, key columns, relationships, PostGIS notes, common query patterns. Built from systematic exploration of all 31 migration files.
  - **`API.md`** — full backend API reference: ~30 routes organized by domain, HTTP methods, required permissions, common workflows. Built from systematic exploration of all 27 route files.
  - **`.env.example`** — improved (was minimal). Now lists every env var with purpose, format, required/optional, and default.
- Updated **`START_NEW_SESSION.md`** with 6 templates (generic, specific task, DB, API, bug, UI) — each a complete copy-paste block.
- Added **MASTER_README.md Rule #22** — Always Suggest Better Tools rule.
- Updated MASTER_README.md "How to Start a New Conversation" section to reference all new files + show full reading-tier table.

### How the docs were built:
Used an Explore agent (`Agent` tool with `subagent_type: Explore`) to systematically inventory the codebase:
- Read every migration in `migrations/` and extracted table definitions
- Read every route file in `routes/` and extracted endpoints + permissions
- Searched for all `process.env.*` references to inventory env vars
The agent returned structured data; I then organized it into the three reference docs. This pattern (Explore → structure → docs) is faster than manual file-by-file reading.

### Pending (next session):
- Resume Layer 3 hardening (Password Manager + Emergency Access) — see Section 14
- Move `do-spaces-keys.txt` from desktop into Password Manager + delete the file
- The "tooling exploration" for UI design (Plasmic vs v0.dev vs Figma Make vs Lovable) — Hedar wants a dedicated session on this

### Late-session insight (April 19, 2026):
Hedar pushed back on the 6-template START_NEW_SESSION.md design — said it was over-engineered. He's right. The cognitive load was on him to pick a template. The smart design is ONE simple command that puts intelligence on Claude's side.

**Redesigned:**
- Added `## 0. BOOTSTRAP` section at the top of CLAUDE.md with explicit cold-start instructions for fresh sessions
- Simplified `START_NEW_SESSION.md` to ONE command (4 lines total in the doc, the command itself is one line)
- Updated MASTER_README.md "How to Start a New Conversation" to show the one-line command
- The user now saves a single line of text and pastes it any time. Optional second line specifies the task.

**Lesson for future Claude (encoded in CLAUDE.md Rule #4 / Section 4):** When designing a workflow for Hedar, ask "is the cognitive load on me or on him?" and minimize his load. Multiple options + selection = friction. One command + intelligent dispatch = friction-free.

---

## 17. Session Log — April 26, 2026

### Context
Long, productive session. Started with strategic discussion about the foundational gap (no tenant-onboarding lifecycle), then a strategic reset into building the Product Concept properly, then a series of concrete fixes. Six distinct phases completed.

### Phase 1 — Strategic Discussion (no code)

Hedar opened with: "as SUPER_ADMIN, how do I sign a contract with a new company and provision them in the system as an isolated tenant?" This led to:

**Investigation of `routes/super_admin.js`:**
- `POST /api/super/companies` exists and works: creates company + single admin user + optional welcome email.
- Multiple gaps identified, all deferred to launch-hardening:
  1. Creates `app_users.role = 'ADMIN'` not `'COMPANY_ADMIN'` (mitigated by `middleware/roles.js` ROLE_ALIASES)
  2. New companies start `status='ACTIVE'`, never `'TRIAL'`
  3. `companies.plan` is just text {BASIC/PRO/ENTERPRISE} — no `plans` table, no limits, no features map
  4. No subscription/contract concept
  5. PIN sent in email plaintext, no activation link
  6. Admin user created without `employee_id`

**Strategic reset:** agreed to build a `PRODUCT.md` document at repo root (separate from MASTER_README state and DECISIONS.md log) to define WHAT Constrai is conceptually before any architectural change. Drafting deferred to next session in favor of shipping a concrete fix first.

**Competitive positioning:**
- ProgressionLive (Quebec, acquired by Valsoft 2024): task-based + dispatch-driven (reactive field service). Different domain. Strong moat = accounting integrations (Acomba, Sage 50, QuickBooks, Avantage). Cannot be beaten head-on.
- Procore: generic PM platform, expensive, not CCQ-native.
- **Constrai's positioning:** project-based + assignment-driven workforce ERP for Quebec MEP subs. Moats = CCQ travel allowances, ACQ sectors, CSST/safety, hot-work permits, Law 101.

**The Constrai Vision — 4 pillars (articulated by Hedar):**
1. **Productivity uplift** — the outcome metric.
2. **Simplicity** — minimum process.
3. **Waste reduction** — material + time + effort.
4. **Quantity takeoff + project performance monitoring** — destination/advanced layer.

All 4 in scope, multi-month rollout. Current codebase ≈ 30-40% of the way there.

### Phase 2 — Demo Project Address Fix (executed)

**Goal:** Move 3 demo projects to real, distinct Quebec addresses so the workforce-distribution map demo doesn't show every project at the same point.

- Migration 034 — FAILED (silent error inside DO safety check; uncovered SCHEMA.md typo `material_requests` vs actual `materials_requests`, and 3 RESTRICT FKs on `materials_tickets`/`project_geofences`/`materials_requests`).
- Migration 035 — SUCCESS (Path A: address-only update, no DELETE, no NULL on coords).
- `scripts/force_geocode_demo.js` — one-off Node script that force-overwrites coords for 3 specific projects via Nominatim (OpenStreetMap). PROJ-11 needed proper accents on first try.

**Final demo state:** 3 active projects across Greater Montréal / Saint-Eustache / Laval (~30 km spread). PROJ-22/23 left as placeholders (deletion deferred — see Phase 6).

### Phase 3 — Workforce Planner Map Fix (executed)

**Problem:** Map showed projects but ZERO employees.

**Root cause:** 5 backend files reference `employee_profiles.home_location` as PostGIS Point. The column was NEVER created. All 4 non-defensive routes silently 500-error. Plus, all 50 demo employees had NULL `home_lat`/`home_lng`.

**Fix strategy:** Align DB with code (add the missing column) instead of editing 4 route files.

**Migration 036:** added `home_location geometry(Point, 4326)` + GIST spatial index, populated `home_lat`/`home_lng` for 50 employees with random coords in a Greater Montréal box (45.3-45.8 lat, -74.0 to -73.4 lng), mirrored into PostGIS column.

**Result:** Workforce planner map shows 50 employees scattered across Greater Montréal with 3 project sites in their midst.

### Phase 4 — Workforce Planner Page Fix (executed)

**Problem:** `/bi/workforce-planner` returned blank page (no header, no error).

**Root cause:** `mep-frontend/src/pages/bi/WorkforcePlannerPage.jsx` line 186 referenced an undefined function `tradeColor(s.trade_code).dot`. The file imports `trade` from `@/constants/trades` (correct, exports `trade(code)` returning `{dot, bg, light}`), but the page code calls non-existent `tradeColor`. When suggestions API returned data and React tried to render, ReferenceError killed the entire component.

**Fix:** One-character change `tradeColor` → `trade` at line 186. Frontend rebuilt + deployed (`cp -r dist/* /var/www/mep/public/`).

**Verification (live):** 58 active assignments, 35 employees flagged as "Can Optimize", 517.2 km/day potential savings.

### Phase 5 — Comprehensive Audit + Security Batch (executed)

After the BI/map work, Hedar requested a full audit before opening Tenant Lifecycle work. Ran via 4 parallel Explore agents. Produced `AUDIT_2026-04-26.md` at repo root with 32 findings categorized by severity.

**Headline discovery — schema diverged from migrations:**
The production DB has been modified manually via psql over time. Migrations no longer reflect live schema. Two examples confirmed via live `\d`:
- `materials_requests` (plural), `materials_tickets`, `materials_request_items`, `materials_ticket_items` — exist on prod, defined in NO migration. Manually created.
- `project_foremen.foreman_employee_id` and `project_foremen.is_active` — exist on prod, defined in NO migration.

**Reframe:** The DB is the source of truth, NOT the migrations. Downgraded several "broken feature" findings to "tech debt — undocumented schema". The fix is a schema baseline (C1).

**Fixes applied + deployed (single commit `71bb673`):**

| # | Severity | Description | File |
|---|---|---|---|
| C4-C6 + M7 | Critical / Medium | Rate limits added: `/api/auth/refresh` (60/15min), `/api/auth/change-pin` (10/15min), `/api/onboarding/*` and `/activate` (30/15min), `/api/super/*` (200/hour) | `index.js` |
| (added) | Critical | `app.set('trust proxy', 1)` so rate limiters use real client IP from X-Forwarded-For (Nginx in front) — fixes ERR_ERL_UNEXPECTED_X_FORWARDED_FOR | `index.js` |
| H6 | High | Upload validated by **magic bytes** (PDF/JPEG/PNG/WebP signatures) instead of trusting client-supplied MIME header. Filename extension forced to match detected type. | `routes/hub.js` |
| H7-H9 | High | All user-controlled values in email templates HTML-escaped via new `escapeHtml()` helper (alias `e()`). Kills stored-XSS-via-email vector. | `lib/email.js` |
| H10 | High | Hard cap of 200 recipients per Hub message. Prevents batch-DoS via massive `recipient_ids` array. | `routes/hub.js` |
| M9 | Medium | Added `FOR UPDATE` to `user_invites` lookup in `/api/onboarding/complete`. Closes race condition where two concurrent requests could consume same invite token. | `routes/onboarding.js` |
| L1-L4 | Low | Deleted dead files: `middleware/adminKey.js`, `middleware/profile_required.js`, `scripts/diag_assignments_v2.js`, `scripts/seed_codes_company_employee.js` (v1, superseded). `lib/geocoding.js` was already absent (false positive). | various |
| C7 | — | "Parameter index bug" — verified **false positive**. `params.length-1`/`params.length` arithmetic correctly evaluated at template-literal construction time. | (none) |

**Schema baseline (C1):** Hedar ran `pg_dump -s mepdb` on prod, committed as `db/schema_baseline_2026-04-26.sql` (5837 lines, commit `da031c7`). NEW DISCOVERY: a second `erp` schema exists alongside `public` — see Phase 6.

**Verification:** PM2 restart → empty error log → all routes serving 200s.

### Phase 6 — Sprint 2: Schema Cleanup (executed)

**Discovery investigation:**
- The schema baseline revealed `erp` schema with 4 tables, 2 views, 2 functions, indexes, triggers — all with **0 references in code** and **0 rows on prod**. An abandoned earlier prototype (single-tenant model, no company_id, simpler shape).
- The "materials" duplication (audit H1-H5) resolved into: `materials_*` (plural) tables + `materials_tickets` were a v1 daily-ticket workflow served by `routes/materials.js`. NO frontend or mobile client calls those endpoints. Active flow is `routes/material_requests.js` (singular, merge-and-send-PO).

**Three migrations + one route deletion (commit `cb83bd7`):**

| Migration | Action |
|---|---|
| `037_drop_dead_erp_schema.sql` | `DROP SCHEMA erp CASCADE`. Removed 8 objects. |
| `038_drop_dead_materials_v1_tables.sql` | Dropped 4 tables: `materials_requests`, `materials_request_items`, `materials_tickets`, `materials_ticket_items`. |
| `039_sync_triggers_and_drop_dead_columns.sql` | Installed 4 sync triggers (full_name, contact_email, role_code, home_location PostGIS), backfilled (all UPDATE 0 — already in sync), dropped dead columns from `employees`: `home_lat`, `home_lng`, `phone`. |
| `index.js` | Removed mount of `routes/materials.js`. |
| `routes/materials.js` | Deleted from disk. |

**Sync triggers installed (resolves M1, M2, M3, M6):**
- `trg_sync_employee_full_name` — `employees.first_name/last_name` → `employee_profiles.full_name`
- `trg_sync_employee_contact_email` — `employees.contact_email` → `employee_profiles.contact_email`
- `trg_sync_app_user_role_to_profile` — `app_users.role` → `employee_profiles.role_code`
- `trg_sync_home_location` — `employee_profiles.home_lat/home_lng` → `home_location` (BEFORE trigger)

**Verification on prod:** erp schema gone, materials_* (plural) tables gone, 4 triggers installed (8 rows in `information_schema.triggers`), 0 dead columns on `employees`, PM2 restart with empty error log.

### Audit Status After Today

| Severity | Total | Resolved | Mitigated | Deferred (low priority) | False positive |
|---|---|---|---|---|---|
| Critical | 7 | 6 | 1 (C3 via rate limit) | 0 | 0 |
| High | 11 | 10 | 0 | 1 | 0 |
| Medium | 9 | 6 | 0 | 3 (M4 docs, M8 CSP nonce, plus M9 done) | 0 |
| Low | 5 | 4 | 0 | 1 (L5 Mapbox proxy) | 0 |
| **TOTAL** | **32** | **26** | **1** | **5** | **0** |

Deferred items are all low-impact: docs, optional CSP hardening, pre-commit hook refinement, Mapbox proxy. None block paying-customer onboarding.

### Documentation Debt Discovered (must fix in follow-up)
- `SCHEMA.md`: said `material_requests`; actual is `materials_requests` (plural, dropped Phase 6 — schema doc needs full refresh now)
- `SCHEMA.md`: missing `materials_tickets` (now dropped) and `project_geofences` (still exists)
- `SCHEMA.md`: missing the new `home_location` column on `employee_profiles` + the 4 sync triggers
- `API.md`: claims `POST /api/projects` and `PATCH /api/projects/:id` "auto-geocode via Mapbox" — false. Geocoding is separate via `scripts/geocode_projects.js` (uses Nominatim).
- The pre-commit hook (`scripts/check-routes.js`) flags rate-limit middleware mounts as "double mounts" — false positive, needs refinement.

### Phase 7 — Bootstrap Reliability Fix (executed late session)

**Problem:** Hedar opened a new conversation with the existing bootstrap command and the fresh Claude treated it as a new project. Root cause:
- The command pulled docs from `raw.githubusercontent.com` instead of the local mounted folder. GitHub lagged behind local edits (today's Phase 5/6 weren't even pushed when the test happened).
- The command didn't explicitly tell Claude this was a continuation of an existing project — it could be misread as "the user wants me to start a project from this CLAUDE.md template."
- No verification mechanism — Hedar couldn't tell whether Bootstrap actually ran.

**Three updates (commit `<TBD>` after this session ends):**

1. **`CLAUDE.md` Section 0 strengthened:**
   - Explicit framing: "THIS IS A CONTINUATION OF AN EXISTING PROJECT. NOT a new project."
   - Step 1 reads from LOCAL mounted folder first, GitHub URLs only as fallback.
   - Step 3 mandates the response begins with `(محادثة استكمال — قرأت Section X من DECISIONS.md)` so Hedar can verify Bootstrap was completed.
   - New Step 6 — End-of-Session Checkpoint: hard requirement to update DECISIONS.md before any session "completes". Prevents the exact stale-state scenario that caused this bug.

2. **`START_NEW_SESSION.md` rewritten:**
   - New canonical command (multi-line block) with explicit continuation framing + local-first instruction + echo-back verification.
   - "What if Claude doesn't echo X" recovery instruction.
   - Notes on Cowork-mode prerequisite + GitHub fallback.

3. **`MASTER_README.md` "How to Start a New Conversation" updated** to show the new command.

**Lesson encoded for future Claude:** the End-of-Session Checkpoint rule (Step 6 of Bootstrap) is now mandatory. Today the Phase 5/6 documentation didn't reach DECISIONS.md before a fresh session opened, which directly caused this confusion. Future sessions must update docs before declaring "done".

### Pending (next session priority order — see Section 18)

**FIRST priority — Engineering Quality Program (Section 18):**
Build the foundational tooling + tests BEFORE the Tenant Lifecycle work.

**SECOND priority — Tenant Lifecycle:**
The original gap that started today's session.

**Other deferred items:**
- Refresh `SCHEMA.md` to match `db/schema_baseline_2026-04-26.sql`
- Refresh `API.md` to remove false geocoding claim
- M4: Document email/username/contact_email semantics
- M8 (optional): CSP nonce — needs frontend rebuild + test
- L5 (optional): Proxy Mapbox API to hide public token
- Pre-commit hook refinement (distinguish middleware mounts from route mounts)

---

## 18. Engineering Quality Program 🟡

### Why this exists
Today's audit was the **fourth** time we did a manual check and uncovered serious issues. Pattern: each audit finds new things because there is **zero automation** verifying the codebase between audits. Manual checks are inherently incomplete and don't catch drift introduced between sessions.

The architectural decision: **invest 3-4 weeks of focused work to build proper engineering discipline before opening Tenant Lifecycle.** Hedar explicitly chose quality-first because: no paying customers yet, no time pressure, and any external reviewer (B2B buyer, pen tester, investor) will judge professionalism by the engineering practices visible in the repo (CI, tests, schema management) more than by the code itself.

### Goal
A SaaS-grade foundation where:
- Every PR runs through automated checks (security + code quality + dead code + tests + dependency scan)
- Schema changes are version-controlled (no more manual psql edits drifting from migrations)
- Core business flows have regression tests (~50-80 tests covering auth, tenant isolation, RBAC, key workflows, security regressions)
- A new contributor can read the docs and understand both the *concept* (`PRODUCT.md`) and the *current implementation* (`SCHEMA.md`, `API.md`, `CLAUDE.md`)
- A pen-test report eventually validates the security posture for B2B sales

### The Plan — 4 weeks of focused work

#### Week 1: Foundation tools (CI + scanners)
| Day | Work | Tool |
|---|---|---|
| 1 | GitHub Actions CI pipeline + Dependabot enabled | GitHub built-in |
| 2 | ESLint + Prettier + Knip + Husky pre-commit hooks | OSS, free |
| 3 | Semgrep CI integration with security rule sets | semgrep.dev |
| 4-5 | Atlas — schema-as-code, snapshot prod baseline, wire into CI | atlasgo.io |

**Outcome:** Every PR is automatically checked for: dependency CVEs, dead code, security smells (SQLi, missing auth, secrets), formatting, schema drift.

#### Week 2-3: Test suite (the missing layer)

~50-80 tests across 5 categories:
- **Auth flows (15)** — login, refresh, change-pin, logout, invite, activate
- **Tenant isolation (20)** — Company A cannot see Company B data through any endpoint
- **RBAC (15)** — each role can/cannot do specific actions per the permission matrix
- **Core workflows (15)** — assignment lifecycle, attendance, materials, hub
- **Security regressions (10)** — SQL injection attempts, XSS payloads in emails, rate-limit hits, file-upload bypass attempts

**Tools:** Jest + Supertest. Coverage tracked via `c8`/`istanbul`.

**Outcome:** Confidence that any future change (including the Tenant Lifecycle work) didn't break anything fundamental. Refactoring becomes safe.

#### Week 4: Polish + Documentation
- Coverage targets enforced (e.g. ≥70% on `routes/`)
- GitHub branch protection rules — `main` requires passing CI
- README updated with project setup, dev workflow, deployment runbook
- Auto-generated docs from schema (Atlas) + JSDoc on routes
- Pre-launch security checklist drafted

### Tools — full inventory

| Layer | Tool | Cost | Why |
|---|---|---|---|
| Schema management | **Atlas** (atlasgo.io) | Free | Diffs live DB vs declared schema, generates migrations, blocks drift |
| Dead code | **Knip** (knip.dev) | Free OSS | Catches unused files / exports / deps in JS/TS — would have caught `routes/materials.js` v1 dead workflow automatically |
| Security patterns | **Semgrep** (semgrep.dev) | Free OSS | Pattern-based scanning for SQLi, XSS, missing auth, secrets, etc. |
| Dependencies | **Dependabot** + **npm audit** | Free | CVE detection + auto-PRs for updates |
| Code quality | **ESLint** + **Prettier** | Free OSS | Consistent style, catches common bugs |
| Pre-commit | **Husky** + **lint-staged** | Free OSS | Runs lints/format on commit, blocks bad commits before push |
| Test framework | **Jest** + **Supertest** | Free OSS | Unit + API integration tests |
| Coverage | **c8** / **istanbul** | Free OSS | Track + enforce coverage targets |
| CI/CD | **GitHub Actions** | Free for our scale (2000 min/month) | Run all of the above on every PR |

**Total ongoing tooling cost: $0** for free tiers (sufficient for our scale).

### Pen Test (paid, optional)

**What it is:** External security firm (3-5 specialists) attempts to break in over 1-2 weeks. Tests SQL injection, auth bypass, cross-tenant leak, file upload exploits, business logic flaws, API abuse, session hijacking. Produces a detailed report with severity-rated findings.

**Why it matters for Constrai:**
- 🔴 **B2B sales accelerator** — first question Quebec construction companies will ask: "how do you protect our employee data?". A pen-test report (with sensitive details redacted) directly removes this objection.
- 🔴 **Bill 64 / Law 25 compliance** — Quebec's privacy law (in force since 2024) requires "reasonable security measures" for PII. Pen-test report is partial evidence.
- 🟡 **Insurance** — some cyber-insurance policies discount premium for pen-tested products.
- 🟡 **Liability protection** — if a breach happens, documented due diligence reduces legal exposure.
- 🟢 **Catches what we missed** — internal audits catch the obvious. Pen tests catch business logic flaws and edge cases.

**When to do it:** AFTER the Engineering Quality Program is complete + Tenant Lifecycle is built + code is stable. Otherwise the pen tester finds easy stuff that should have been caught internally.

**Cost:** ~$2000-$5000 CAD for a web-application pen test from a reputable Quebec/Canadian firm. Get 3 quotes; require OWASP-aligned testers (CRT or OSCP certifications).

**Hedar's note (April 26, 2026):** Hedar has a computer engineer in his network who could potentially perform the pen test in-house, eliminating the cash cost. To be discussed when timing approaches. Either way: the work happens before first paying customer.

### Decision Criteria — when to start the program

**Start NOW (recommended):** No customer pressure, no time constraint, freshest opportunity to invest properly. Today's discussion confirmed Hedar's preference.

**Alternative (defer):** Do Tenant Lifecycle first if there's external pressure (e.g. specific customer waiting). Risk: the new code enters without test coverage and we're back to manual audits.

**Hedar's stated preference (April 26, 2026):** Quality-first. Build it right. Don't want a future reviewer to come back saying "you have serious vulnerabilities."

### Status: 🟡 PLANNED — pending Hedar's go-ahead to start Week 1

Once started, work happens in dedicated Claude sessions per week. Each session completes one major piece of the plan and ships to repo with passing CI.

### Sequencing in the broader roadmap

```
✅ Today:           Audit + Sprint 1 (security) + Sprint 2 (schema cleanup)
🟡 Next 3-4 weeks:  Engineering Quality Program (Section 18)
🟡 Then ~2 weeks:   Tenant Lifecycle (Sections 1, 7, plans/subscriptions/billing)
🟡 Then ~2 weeks:   Pen test + remediation (if any findings)
🟡 Then:            First paying customer onboarding
```

Total: ~3 months from today to first paying customer with a defensible product.

---

## 17. Session Log — April 26, 2026

### Context
Session opened to walk through Constrai menus one-by-one and discuss notes. The very first menu raised a foundational gap (no tenant onboarding lifecycle), which triggered a strategic reset before any code changes. Then a small concrete fix (demo project addresses) was executed.

### Phase 1 — Strategic Discussion (no code changes)

**The gap that triggered the reset:**
Hedar asked: as SUPER_ADMIN, how do I sign a contract with a new company and provision them in the system as an isolated tenant?

**Investigation findings (`routes/super_admin.js` + middleware):**
- `POST /api/super/companies` exists and works: creates a company + a single admin user + sends optional welcome email.
- Multiple gaps identified (all deferred to launch hardening — see "Pending" below):
  1. Creates `app_users.role = 'ADMIN'` (legacy), not `'COMPANY_ADMIN'`. Mitigated at runtime by `middleware/roles.js` ROLE_ALIASES (ADMIN → COMPANY_ADMIN). Tech debt, not a hard bug.
  2. New companies start as `status='ACTIVE'`, never `'TRIAL'` (even though TRIAL is a valid status).
  3. `companies.plan` is just a text field {BASIC/PRO/ENTERPRISE}. No `plans` table, no limits (max_users/projects/employees), no features map.
  4. No subscription/contract concept — no `subscriptions` table, no start/end dates, no billing.
  5. COMPANY_ADMIN onboarding flow is weak — PIN sent in email plaintext, no activation link.
  6. Admin user is created without an `employee_id` — likely breaks code that assumes user = employee.

**Strategic reset:**
Hedar pushed back on continuing depth-first into super_admin code without a product concept first. Agreed to build a `PRODUCT.md` document at repo root — separate from `MASTER_README.md` (state) and `DECISIONS.md` (decision log) — to define what Constrai IS conceptually before any architectural change. Drafting deferred to next session in favor of shipping a small concrete fix.

**Competitive positioning (vs ProgressionLive, vs Procore):**
- **ProgressionLive** (Quebec, acquired by Valsoft 2024): task-based + dispatch-driven (reactive field service). Different domain. Strong moat = accounting integrations (Acomba, Sage 50, QuickBooks, Avantage). Cannot be beaten head-on.
- **Procore:** generic PM platform, expensive, not CCQ-native.
- **Constrai's positioning:** project-based + assignment-driven workforce ERP for Quebec MEP subs. Moats = CCQ travel allowances, ACQ sectors, CSST/safety, hot-work permits, Law 101.

**The Constrai Vision — 4 pillars (articulated by Hedar):**
1. **Productivity uplift** — the outcome metric.
2. **Simplicity** — organizing work with the minimum process.
3. **Waste reduction** — material + time + effort.
4. **Quantity takeoff + project performance monitoring** — the destination/advanced layer.

All 4 in scope, but multi-month rollout (NOT one month). Current codebase ≈ 30-40% of the way there (raw data layer: attendance + assignments + materials). Missing: BOQ, planned-vs-actual tracking, waste quantification, productivity KPIs, performance dashboard. These become Constrai's differentiation, not features to copy from competitors.

### Phase 2 — Demo Project Address Fix (executed)

**Goal:** Move 3 demo projects to real, distinct Quebec addresses so the workforce-distribution map demo doesn't show every project at the same point (the "demo embarrassment" reported by Hedar).

**Scope reduction:**
- Originally proposed: replace 5 projects + reset 50 employees + create new SA/FM/JM hierarchy + delete 2 projects.
- Hedar reduced scope to: only update 3 project addresses + delete 2 unused projects + keep employees/foremen/users untouched. Reason: minimize disruption now, real cleanup at launch.

**Migration 034 — FAILED:**
`migrations/034_update_demo_project_addresses.sql` failed with silent error inside its DO safety-check block. Two root causes uncovered:
- **`SCHEMA.md` documentation bug:** the table is `materials_requests` (plural), not `material_requests`. The safety check referenced the wrong name and aborted the transaction.
- **Two undocumented FK relationships:** `materials_tickets` and `project_geofences` both reference `projects(id)` with `ON DELETE RESTRICT`. The DELETE step would have failed even if the DO block had passed.

**Migration 035 — SUCCESS (Path A: address-only):**
`migrations/035_update_demo_project_addresses_v2.sql` applied 3 simple UPDATEs in a transaction. No DELETE, no NULL on coords. Coords are overwritten by a separate force-geocoder.

**Force-geocoder — SUCCESS:**
`scripts/force_geocode_demo.js` — one-off Node script that targets the 3 specific projects and unconditionally overwrites their `site_lat`/`site_lng` using Nominatim (OpenStreetMap, free, no token). The existing `scripts/geocode_projects.js` couldn't be used as-is because it skips rows that already have non-NULL coords (the demo projects had placeholder coords from the original seed).

PROJ-11 needed an address fix on first run: Nominatim couldn't resolve `"3175 Chem. de la Cote-Sainte-Catherine"` (abbreviated + no accents). Retried with the full spelling and accents → matched perfectly.

**Final demo state (company_id=5):**

| Project | Address | Coords | Source |
|---|---|---|---|
| PROJ-11 Alpha   | 3175 Chemin de la Côte-Sainte-Catherine, Montréal | 45.503440, -73.624468 | nominatim-force |
| PROJ-12 Beta    | 520 Bd Arthur-Sauvé, Saint-Eustache (Hôpital) | 45.571180, -73.914081 | nominatim-force |
| PROJ-21 Gamma   | 9449 Rue de Tilly, Laval (Aréna St-François) | 45.675721, -73.579957 | nominatim-force |
| PROJ-22 Delta   | (unchanged — placeholder)                                | 45.559, -73.62        | (none) |
| PROJ-23 Epsilon | (unchanged — placeholder)                                | 45.559, -73.62        | (none) |

3 active demo projects spread across ~30 km in Greater Montréal / Laval / Saint-Eustache. Map demo no longer collapses to one point.

### Phase 3 — Workforce Planner Map Fix (executed)

**Problem reported by Hedar:** The workforce planner map showed projects but ZERO employees — geographic distribution feature was unusable.

**Root cause (much bigger than expected):**
- 5 backend files reference `employee_profiles.home_location` as a PostGIS Point: `routes/assignments.js` (3 separate queries), `routes/auto_assign.js`, `routes/onboarding.js`, `routes/profile.js` (defensive — checks `information_schema` first, only consumer that survives), and `seed.js`.
- **The `home_location` column was never actually created in production.** All 4 non-defensive routes silently 500-error on every request.
- Additionally, all 50 demo employees had NULL `home_lat` / `home_lng` and placeholder addresses ("Test Address 1" through "Test Address 50"). Even with the route fixed, no data would render.

**Fix strategy chosen:** Align DB with code (add the missing column) instead of editing 4 route files (Path A pattern, consistent with the demo project address fix).

**Migration 036 — SUCCESS:**
`migrations/036_add_employee_home_location_with_demo_coords.sql`:
1. `ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS home_location geometry(Point, 4326)` + GIST spatial index.
2. Populated `home_lat` / `home_lng` for the 50 demo employees with random coords in a Greater Montréal bounding box: lat 45.3-45.8, lng -74.0 to -73.4 (~50 km × 50 km, centered near the Montréal/Laval border).
3. Mirrored lat/lng into the new PostGIS column via `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.

**Verification:** 50/50 profiles with both lat/lng and PostGIS location. Range realistic (45.3241-45.7976 lat, -73.9941 to -73.4076 lng).

**Result:** Workforce planner map now shows 50 employees scattered across Greater Montréal with the 3 project sites in their midst — exactly the geographic distribution Hedar wanted to demo.

**Architectural insight (significant):**
The `home_location` column being missing from production while 4 routes depend on it is a sign that **DB schema is out of sync with code expectations**. There may be other columns the code expects that don't exist. Worth a systematic audit at some point — grep the routes for column names, cross-check against `information_schema.columns`. Filed under follow-up.

### Phase 4 — Workforce Planner Page Fix (executed)

**Problem:** After fixing the map, Hedar tried `/bi/workforce-planner` and got a completely blank page (no header, no error message).

**Root cause:** `mep-frontend/src/pages/bi/WorkforcePlannerPage.jsx` line 186 referenced an undefined function `tradeColor(s.trade_code).dot`. The file imports `trade` from `@/constants/trades` (which exists and exports `trade(code)` — returning an object with `.dot`/`.bg`/`.light`), but the page code calls the non-existent `tradeColor`. When the suggestions API returned data and React tried to render the suggestion cards, the missing function reference threw a ReferenceError, killing the entire component → blank page.

**Fix:** One-character change — `tradeColor` → `trade` at line 186. Frontend rebuilt (`npm run build`) and deployed (`cp -r dist/* /var/www/mep/public/`).

**Verification (live on production):**
- Workforce Planner shows 58 active assignments
- 35 employees flagged as "Can Optimize"
- Total potential daily savings: 517.2 km
- Real example: Mohammed Tremblay 1 (PLUMBING) is 27.6 km from PROJ-12 but only 3 km from PROJ-21 → suggested move saves 24.6 km/day
- Trade colors correctly rendered (PLUMBING blue, GENERAL gray, CARPENTRY orange)

The full BI optimization loop is now functional end-to-end.

### Phase 5 — Comprehensive Audit + Security Batch (executed)

After the BI/map work, Hedar requested a full audit before opening the Tenant Lifecycle work. The audit ran via 4 parallel Explore agents (schema-vs-code drift, duplicate fields, dead code, security) and produced `AUDIT_2026-04-26.md` at the repo root with 32 findings categorized by severity.

**Headline discovery — schema diverged from migrations:**
The audit surfaced that the production DB has been modified manually via psql over time, and the migration files no longer reflect the live schema. Two examples that the live `\d` checks confirmed:
- `materials_requests` (plural), `materials_tickets`, `materials_request_items`, `materials_ticket_items` — exist on prod, defined in NO migration. Manually created.
- `project_foremen.foreman_employee_id` and `project_foremen.is_active` — exist on prod, defined in NO migration. Manually added.

**Reframe:** The DB is the source of truth, NOT the migrations. This downgraded several "broken feature" findings to "tech debt — undocumented schema". The fix is a schema baseline (C1) — see Phase 5 work below.

**Fixes applied + deployed (single commit `71bb673`):**

| # | Severity | Description | File |
|---|---|---|---|
| C4-C6 + M7 | 🔴/🟡 | Rate limits added: `/api/auth/refresh` (60/15min), `/api/auth/change-pin` (10/15min), `/api/onboarding/*` and `/activate` (30/15min), `/api/super/*` (200/hour) | `index.js` |
| (added) | 🔴 | `app.set('trust proxy', 1)` so rate limiters use the real client IP from the X-Forwarded-For header (Nginx is in front) — fixes ERR_ERL_UNEXPECTED_X_FORWARDED_FOR validation error | `index.js` |
| H6 | 🟠 | Upload validated by **magic bytes** (PDF/JPEG/PNG/WebP signatures) instead of trusting the client-supplied MIME header. Filename extension is forced to match the detected type. | `routes/hub.js` |
| H7-H9 | 🟠 | All user-controlled values in email templates are HTML-escaped via a new `escapeHtml()` helper (alias `e()`) — kills the stored-XSS-via-email vector across welcome, assignment, and PO emails | `lib/email.js` |
| H10 | 🟠 | Hard cap of 200 recipients per Hub message — prevents batch-DoS via massive `recipient_ids` array | `routes/hub.js` |
| M9 | 🟡 | Added `FOR UPDATE` to the `user_invites` lookup in `/api/onboarding/complete` — closes the race condition where two concurrent requests could both consume the same invite token | `routes/onboarding.js` |
| L1-L4 | 🟢 | Deleted dead files: `middleware/adminKey.js`, `middleware/profile_required.js`, `scripts/diag_assignments_v2.js`, `scripts/seed_codes_company_employee.js` (v1, superseded by v2). `lib/geocoding.js` was already absent — the audit's claim was a stale reference. | various |
| C7 | — | "Parameter index bug" in `routes/onboarding.js` — verified to be a **false positive** from the audit agent. The `params.length-1` / `params.length` arithmetic is correctly evaluated at template-literal construction time, after both pushes. No fix needed. | (none) |

**Verification:** PM2 restart on prod, log flush, and 3 sec wait → error log was **completely empty**. No X-Forwarded-For validation warnings, no other errors. All routes live.

**Remaining for a future "Sprint 2" session (deferred — none of these are critical):**
- C3 Cross-tenant `/activate` — partly addressed by the new rate limit. A deeper hardening (require fresh session OR no session for the activator) is design-dependent. Acceptable risk for now given strong tokens + single-use + expiry + rate limit.
- C1 Schema baseline — Hedar to run `pg_dump -s` on prod and commit `db/schema_baseline_2026-04-26.sql`. From that point forward, all schema changes go through `migrations/` only.
- H1-H5 Materials table consolidation (`materials_requests` plural vs `material_requests` singular) — design decision needed before migration.
- H11, M5 Drop dead `employees.home_lat/lng` and `employees.phone` — needs a migration after confirming no external SQL writes them.
- M1, M2, M6 Add sync triggers (or drop duplicates) for `contact_email`, `role_code`, `full_name`.
- M3 Auto-sync trigger for `home_location` ↔ `home_lat`/`home_lng`.
- M4 Document the email/username/contact_email semantics; consider consolidation.
- M8 CSP nonce (drop `'unsafe-inline'`) — needs frontend rebuild + test, may break inline service-worker registration.
- L5 (optional) Proxy Mapbox API to hide the public token.

### Phase 6 — Sprint 2: Schema Cleanup (executed)

After Phase 5 verified clean, Hedar elected to do "Sprint 2" (schema cleanup) before opening the Tenant Lifecycle work. Goals: drop dead schema objects, consolidate duplicate fields, document the canonical model.

**Discovery investigation:**
- `db/schema_baseline_2026-04-26.sql` (5837 lines) revealed a second schema `erp` containing 4 tables, 2 views, 2 functions, indexes, triggers — all with **0 references in code** and **0 rows on prod**. An abandoned earlier prototype (single-tenant model, no company_id, simpler shape).
- The "materials" duplication finding from the audit (H1-H5) resolved into: the `materials_*` (plural) tables + `materials_tickets` were a v1 daily-ticket workflow served by `routes/materials.js`. NO frontend or mobile client calls any of those endpoints. The active workflow is `routes/material_requests.js` (singular `material_requests`, merge-and-send-PO).

**Three migrations + one route deletion (commit `cb83bd7`):**

| Migration | Action |
|---|---|
| `037_drop_dead_erp_schema.sql` | `DROP SCHEMA erp CASCADE`. Removed 8 objects. Pre-check: all tables empty, abort if any data exists. |
| `038_drop_dead_materials_v1_tables.sql` | Dropped 4 tables: `materials_requests`, `materials_request_items`, `materials_tickets`, `materials_ticket_items`. Same safety pre-check. |
| `039_sync_triggers_and_drop_dead_columns.sql` | Installed 4 sync triggers (full_name, contact_email, role_code, home_location PostGIS), backfilled (all UPDATE 0 — already in sync), dropped dead columns from `employees`: `home_lat`, `home_lng`, `phone`. |
| `index.js` | Removed mount of `routes/materials.js`. |
| `routes/materials.js` | Deleted from disk (the v1 workflow file is gone). |

**Sync triggers installed (cleanly resolves M1, M2, M3, M6):**
- `trg_sync_employee_full_name` — `employees.first_name/last_name` → `employee_profiles.full_name`
- `trg_sync_employee_contact_email` — `employees.contact_email` → `employee_profiles.contact_email`
- `trg_sync_app_user_role_to_profile` — `app_users.role` → `employee_profiles.role_code`
- `trg_sync_home_location` — `employee_profiles.home_lat/home_lng` → `home_location` (PostGIS Point, BEFORE trigger)

**Verification on prod:**
- erp schema: 0 rows in `information_schema.schemata`
- materials_* (plural) tables: 0 rows in `information_schema.tables`
- 4 sync triggers installed (8 rows in `information_schema.triggers` — INSERT + UPDATE per trigger)
- 0 dead columns left on `employees`
- PM2 restart, error log empty

**Pre-commit hook caught the cleanup:**
The `scripts/check-routes.js` pre-commit hook blocked the first commit because `routes/materials.js` was deleted from `index.js` mounts but still on disk. Once the file was deleted, the hook passed. (Two false-positive warnings remain about `/api/onboarding` and `/api/super` "double mounts" — these are middleware + route mounts, not route conflicts. The hook needs a small refinement to distinguish — filed as low-priority follow-up.)

### Audit Status After Sprints 1+2

| Severity | Total | Resolved | Mitigated | Deferred (low priority) | False positive |
|---|---|---|---|---|---|
| Critical | 7 | 6 | 1 (C3 via rate limit) | 0 | 0 |
| High | 11 | 10 | 0 | 1 (H7-9 covered, H1-5 fully resolved by drop) | 0 |
| Medium | 9 | 6 | 0 | 3 (M4 docs, M8 CSP nonce, plus M9 done) | 0 |
| Low | 5 | 4 | 0 | 1 (L5 Mapbox proxy) | 0 |
| **TOTAL** | **32** | **26** | **1** | **5** | **0** |

The deferred items are all low-impact: documentation, optional CSP hardening, and a pre-commit hook refinement. None block paying-customer onboarding.

### Lessons & Documentation Debt
- **psql display can mislead:** the verification SELECT showed all coords as `45.559 / -73.62`, suggesting all 5 projects were at one point. In reality the column was being truncated in the aligned output — only PROJ-11/22/23 had the placeholder; PROJ-12 and PROJ-21 already had real coords. Always cast to text or use `\x` expanded mode when verifying numeric precision.
- **`SCHEMA.md` is wrong:** says `material_requests`; actual is `materials_requests`. Plus two tables completely missing: `materials_tickets`, `project_geofences`. **Must fix.**
- **`API.md` is wrong:** claims `POST /api/projects` and `PATCH /api/projects/:id` "auto-geocode via Mapbox" — false. The route stores `site_address` text only; geocoding is a separate manual step via `scripts/geocode_projects.js` (which uses Nominatim, NOT Mapbox). **Must fix.**

### Pending (next session)
- **Next priority (Hedar's call):** Tenant Lifecycle — adding new companies as SUPER_ADMIN. See "Deferred to launch hardening" below for the full scope; will discuss reduced first-pass scope in next session.
- Resume `PRODUCT.md` work — write Section 1 capturing the 4-pillar vision + competitive positioning + scope (what's IN, what's OUT).
- Fix `SCHEMA.md` (add `home_location` column to `employee_profiles` doc, fix `material_requests` → `materials_requests`, add `materials_tickets` and `project_geofences` tables).
- Fix `API.md` (remove the false "auto-geocodes via Mapbox" claim on POST/PATCH /api/projects).
- Systematic schema-vs-code audit: grep all route files for column references, cross-check against `information_schema.columns`. The `home_location` discovery suggests other columns may also be missing.
- Optional cleanup: extend `scripts/geocode_projects.js` to support a `--force` or `--project-codes` flag, then delete the one-off `scripts/force_geocode_demo.js`.

### Deferred to launch hardening (do NOT touch in normal sessions)
- Delete PROJ-22 and PROJ-23 (after handling `materials_tickets` / `project_geofences` / `materials_requests` rows).
- Migrate `app_users.role = 'ADMIN'` → `'COMPANY_ADMIN'` and remove the legacy alias.
- Build the Tenant Lifecycle:
  - `plans` table (code, name, price_cad, max_users, max_projects, features JSONB)
  - `subscriptions` table (company_id, plan_id, status, start_date, end_date, trial_ends_at, billing_email, stripe_customer_id)
  - Extended `companies.status` enum: TRIAL / ACTIVE / PAST_DUE / SUSPENDED / CANCELLED
  - Proper COMPANY_ADMIN onboarding (activation link, no plaintext PIN in email, link admin to an `employees` row)
  - Stripe Customer Portal integration (do not build invoicing custom)
  - Limits enforcement middleware (block create when at max)
- SUPER_ADMIN web UI: Companies list + New Company wizard + per-company detail (usage vs limits, subscription actions).

---

## 19. Session Log — April 27, 2026

### Context
First session of the Engineering Quality Program (Section 18). Plan: 4 weeks of focused tooling/tests work before opening Tenant Lifecycle. Today = Week 1 Day 1.

### Phase 1 — Week 1 Day 1: GitHub Actions CI + Dependabot (executed)

**Decisions confirmed with Hedar via AskUserQuestion before coding:**

| Question | Choice | Rationale |
|---|---|---|
| CI scope on Day 1 | **Minimal** | `npm ci` + project audit + `npm audit` informational. ESLint/Knip/Semgrep layered in Day 2-3, not bundled now. |
| Coverage | **All 3** (backend + frontend + mobile) | Three parallel jobs from the start. Mobile job avoids Expo native build (just install + tsc). |
| Dependabot frequency | **Weekly + grouped** | Mondays 08:00 America/Toronto. Minor/patch grouped per ecosystem. Major updates stay individual PRs. Expo + react-native major bumps explicitly ignored (SDK upgrades happen manually). |

**Files added (new — first ever `.github/` content in this repo):**

| Path | Purpose |
|---|---|
| `.github/workflows/ci.yml` | 3 jobs (backend / frontend / mobile), Node 20, triggered on push to main + PR to main, concurrency cancel-in-progress, `PUPPETEER_SKIP_DOWNLOAD=true` to keep CI fast. |
| `.github/dependabot.yml` | 4 ecosystems: npm × root + npm × mep-frontend + npm × mep-mobile + github-actions. Weekly on Monday 08:00 Toronto, grouped minor/patch, scoped commit prefixes (`chore(deps)`, `chore(deps-frontend)`, etc.). |

**CI job details:**

- **Backend (blocking steps):** `npm ci`, `npm run audit:routes` (uses existing `scripts/check-routes.js` — verifies every `routes/*.js` file is mounted in `index.js`).
- **Backend (informational):** `npm audit --audit-level=high` (continue-on-error so existing transitive vulns don't block; we'll tighten in Week 4).
- **Frontend (blocking):** `npm ci`, `npm run build` (Vite production build).
- **Frontend (informational):** `npm run lint` (ESLint already configured in mep-frontend), `npm audit`.
- **Mobile (blocking):** `npm ci` only (catches lockfile drift).
- **Mobile (informational):** `npx tsc --noEmit` (type check), `npm audit`.

**Why `audit:db` is NOT in CI:** `scripts/check-db.js` requires a live Postgres connection. Standing up Postgres + PostGIS + applying 39 migrations on every PR is overkill for Day 1. Will be reconsidered when we wire up Atlas (Week 1 Day 4-5).

**Validation done locally:**
- Both YAML files parse cleanly with `yaml.safe_load` (Python).
- Structure verified: 3 jobs, 5-6 steps each, correct triggers, correct working-directory per job.
- Trade-off accepted: actionlint not available in the Cowork sandbox (proxy blocks raw.githubusercontent.com), so we rely on YAML structural validation + GitHub's own validator on first push.

**Known environment quirk (does NOT affect CI on GitHub):** The Linux-side mount of the repo in this Cowork session shows a stale snapshot of `index.js` (truncated to 173 lines, dated Apr 6) while the actual file on Hedar's laptop and on GitHub has 203 lines (post Phase 6 cleanup of April 26). When CI runs on GitHub Actions, it checks out the live repo, so the route audit will see the full file and pass. Filed as informational only.

### Phase 2 — First CI Run + Frontend ERESOLVE Fix (executed)

**First push:** commit `9c75f9f` triggered the brand-new `ci.yml` workflow. Result:
- ✅ Backend (Node 20) — passed (`npm ci`, `npm run audit:routes` both green; 26/26 routes registered).
- ❌ **Frontend (Node 20)** — failed at `Install dependencies` (`npm ci`) in 9 seconds.
- ✅ Mobile (Node 20) — passed.

**Root cause:** `mep-frontend/package.json` declares `vite@^7.3.1` and `vite-plugin-pwa@^0.21.1`. Plugin v0.21.x peer-deps require `vite@"^3 || ^4 || ^5 || ^6"` — does NOT include vite 7. The committed `package-lock.json` was originally generated under legacy peer-deps behavior (older npm or `--legacy-peer-deps`), which is why local `npm install` worked. Modern `npm ci` is strict by default and refuses the conflict.

**Fix chosen (Option A — `.npmrc` legacy-peer-deps):**
- Added `mep-frontend/.npmrc` with `legacy-peer-deps=true` + a comment block explaining the why and the upgrade path.
- Zero risk: matches the resolution the lockfile was already built against.
- Works identically locally and in CI.

**Alternatives considered + rejected for now:**
- **Option B — upgrade `vite-plugin-pwa` to v1.x** (the proper long-term fix). Rejected today because v1 has breaking changes that need testing; the goal was to unblock Day 1 CI without dragging in a separate dependency-upgrade exercise.
- **Option C — `--legacy-peer-deps` flag on the CI step only.** Rejected because it hides the issue from any developer doing a fresh `npm ci` locally.

### Phase 3 — Dependabot First-Scan Backlog Cleanup (executed)

**Symptom:** First push of `dependabot.yml` triggered a one-time backlog scan that opened **17 PRs** simultaneously, flooding the Actions tab with failing CI runs (most failed because they branched from `9c75f9f` before the `.npmrc` fix landed; many were major version bumps that needed manual review anyway).

**Root cause of the noise:**
- Original `dependabot.yml` only ignored `expo` + `react-native` major bumps. The `expo-*` family (`expo-sharing`, `expo-constants`, `expo-document-picker`, etc.) are separate npm packages and weren't covered, so Dependabot proposed massive jumps like `expo-sharing 14 → 55`.
- The "Major updates separate" choice is fine in theory but produces too much noise in practice for an actively-developed app where every major bump needs manual coordination.

**Policy change (committed in this phase):** ignore ALL semver-major bumps across every ecosystem for normal version-update PRs. Updated `dependabot.yml` adds:

```yaml
ignore:
  - dependency-name: '*'
    update-types:
      - version-update:semver-major
```

…to all 4 ecosystem entries (backend, frontend, mobile, github-actions). Security-advisory PRs still come through automatically because Dependabot bypasses ignore rules for security findings.

**Cleanup steps:**
1. Updated `.github/dependabot.yml` with the broader ignore policy.
2. Bulk-closed all 17 first-scan PRs with `gh pr list --author "app/dependabot" --json number --jq '.[].number' | ForEach-Object { gh pr close $_ --comment "..." }`. Reason posted on each PR points back to this Section.
3. Next Dependabot run (May 4, 08:00 Toronto) will produce a clean inbox: only minor/patch grouped PRs + any security-driven majors.

**Tradeoff acknowledged:** we'll miss some major upgrades unless we proactively check. That's acceptable — major upgrades are decisions, not chores. Better to schedule them quarterly than to dismiss noisy auto-PRs weekly.

### Phase 4 — Week 1 Day 2 Phase 1: ESLint + Prettier (executed)

Day 2 was scoped down (with Hedar's confirmation) to **ESLint + Prettier only**. Knip + Husky deferred to Day 2.5 / Day 3 — keeps the session shorter and reduces the surface area of failures.

**ESLint scope:** backend root only (`/`). `mep-frontend/` already has its own ESLint setup (vite + react-hooks + react-refresh plugins) — left untouched. `mep-mobile/` deferred (TypeScript adds complexity; we'll add `@typescript-eslint` later).

**Files added:**

| Path | Purpose |
|---|---|
| `eslint.config.js` | ESLint 9 flat config, CommonJS, Node globals, `eslint:recommended` preset. Underscore-prefix unused-var convention enforced (`^_`). Ignores: `node_modules/`, `mep-frontend/`, `mep-mobile/`, `public/`, `dist/`, `build/`, `uploads/`, `coverage/`. |
| `.prettierrc.json` | Format: 2-space, single quotes, semicolons, trailing-comma `es5`, printWidth 100, LF line endings. |
| `.prettierignore` | Skips `node_modules/`, `package-lock.json`, build outputs, `mep-frontend/` + `mep-mobile/` (they manage own formatting), DB schema dumps, minified files. |

**Files modified:**

| Path | Change |
|---|---|
| `package.json` | Added 4 npm scripts (`lint`, `lint:fix`, `format`, `format:check`). Reformatted to standard 2-space JSON indentation (the previous PowerShell-emitted format had inconsistent spacing). Added 4 devDependencies via `npm install --save-dev`: `eslint@^9.39.4`, `@eslint/js@^9.39.4`, `globals@^15.15.0`, `prettier@^3.8.3`. |
| `package-lock.json` | Regenerated by `npm install` — added 63 transitive packages for the toolchain. |
| `.github/workflows/ci.yml` | Added 2 new steps to the backend job: `Lint` (`npm run lint`) and `Format check` (`npm run format:check`). Both `continue-on-error: true` for now. |

**Why both lint + format:check are informational on Day 1:**
- ESLint reports 42 warnings on existing code (all `no-unused-vars` — dead imports/locals). 0 errors.
- Prettier flags 87 files as needing reformatting (most of the codebase + all docs).
- Making either blocking on the first push would fail CI for cosmetic/style reasons unrelated to the build's correctness.
- Plan: clean up the warnings + reformat over the next 1–2 sessions, then flip both to blocking.

**Verified locally before push:**
- `npm install --save-dev eslint@^9 @eslint/js@^9 globals@^15 prettier@^3` → `added 63 packages, audited 577 packages in 4s`. 6 transitive vulnerabilities (2 moderate, 4 high) inside lint/format toolchain — informational.
- `npm run lint` → 42 warnings, 0 errors, exits clean.
- `npm run format:check` → 87 files flagged, exits non-zero (expected for a `--check` run with unformatted files), tool itself runs cleanly.

### Pending — Week 1 Day 2 Phase 2 (next session)
- **Cleanup pass:** Run `npm run lint:fix` (auto-removes unused imports/vars where safe) + `npm run format` (reformats all 87 files in one commit). Then flip both CI steps from `continue-on-error: true` to blocking.
- Knip integration for dead-code detection (was originally Day 2; deferred).
- Husky + lint-staged for portable local pre-commit hooks (was originally Day 2; deferred — current `.git/hooks/` works locally for Hedar but isn't checked into the repo).

### Pending — Week 1 Day 3-5
- Day 3: Semgrep CI integration with security rule sets.
- Day 4-5: Atlas (atlasgo.io) — schema-as-code, snapshot the prod baseline, wire into CI.

### Carried tech debt
- **From Phase 2:** upgrade `vite-plugin-pwa` from `0.21.x` → `1.x` (native vite 7 support), then remove `mep-frontend/.npmrc`. Verify PWA service worker still registers + offline mode still works after upgrade.
- **From Phase 3:** quarterly major-upgrade review — manually scan `npm outdated` per ecosystem, decide which majors to take, run them coordinated.

### Phase 5 — Dependency Merges + Production Deploy + CLAUDE.md Rule 7 (executed late session)

**3 Dependabot PRs merged via GitHub web UI:**
- PR #3 — backend-minor-and-patch (multer + puppeteer)
- PR #18 — frontend-minor-and-patch (12 updates)
- PR #19 — mobile-minor-and-patch (19 updates)

All 3 had passing CI under the new policy. Pull Requests tab now shows **0 Open**.

**Production deploy:**
- `git pull origin main` initially failed with `ssh: connect to host github.com port 22: Connection timed out` — likely transient (the `mep-webhook` process may have already auto-pulled earlier). Retry succeeded with `Already up to date`.
- `npm install` reported `added 63, removed 3, changed 15` — reconciled `node_modules` with the new lockfile.
- `pm2 restart mep-backend` → online, 18.9 MB, no errors. Logs show clean startup: `Server running on http://localhost:3000`.
- Sanity check: `curl -I https://app.constrai.ca` → `HTTP/1.1 200 OK`. App live.

**Filed for follow-up:** the SSH-on-port-22 timeout. If it recurs, fix permanently by configuring SSH-over-port-443 (`Host github.com / Hostname ssh.github.com / Port 443` in `~/.ssh/config` on the server). Today it self-resolved on retry, so no config change applied.

**`CLAUDE.md` Rule 7 added:** Hedar's UX feedback — when giving instructions that involve SSH'ing into the server and then running commands ON the server, the `ssh root@...` line must be in its own code block, with on-server commands in a separate block below. Bundling them forces Hedar to manually delete the SSH line each time.

### Pending — Week 1 Day 3-5
- Day 3: Semgrep CI integration with security rule sets.
- Day 4-5: Atlas (atlasgo.io) — schema-as-code, snapshot the prod baseline, wire into CI.

### Decisions explicitly deferred (NOT for Day 1)
- **Branch protection rules** on `main` requiring CI to pass: deferred to Week 4. Rationale: with no test suite yet, blocking merges on a "minimal" CI is symbolic. Better to add real tests first, then turn protection on.
- **CodeQL / GitHub Advanced Security:** deferred. Semgrep covers the same security-pattern surface for free.
- **Required CI on every push (not just PR):** kept. PR-only would let direct pushes to main skip CI.
