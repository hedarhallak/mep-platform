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
