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
| Token storage | AsyncStorage — mep_token / mep_user | April 2026 |
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
10. 🟡 Web Frontend Bilingual (EN/FR) — not yet started
11. 🟡 Android Google Play Build
12. 🟡 PDF / Email templates in FR (follow Company language setting)
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

## 12. Decisions About Ideas Management

> **Rule: Never delete any idea from this file.**
> When two similar ideas exist → keep both, note the similarity, merge during dedicated discussion.
> Example: Material surplus system (Section 8) and Smart Assignment proximity (Section 10) both use geographic data — they should be discussed together for a unified geo-intelligence layer.
