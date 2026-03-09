# MEP Site Workforce – Internal Architecture Agreement (v4)

## 1. Current Stable Baseline (LOCKED)
This section defines the **locked baseline**. No changes are allowed without a new version.

### Core Stack
- Frontend: Vanilla JS + HTML + CSS
- Backend: Node.js + Express
- Database: PostgreSQL
- Auth: JWT (Bearer token)
- Primary UI: public/app.html + public/app.js

### Assignments Module (V2)
- Single source of truth: public/assignments_v2.html
- Embedded into main app via iframe under Assignments tab
- No duplicated Assignments UI elsewhere
- All future changes to Assignments happen only in assignments_v2.html

### Requests UX (Unified – Option A)
- One unified Requests list
- Status Tabs:
  - Pending (default)
  - Approved
  - Rejected
  - All
- Scope:
  - My requests
  - All requests (Admin only)
- No duplication between Inbox / My Requests
- Pending = compact cards with actions
- Approved / Rejected = expanded cards, read-only

---

## 2. Backend Contracts (LOCKED)
### assignment_requests
- CREATE_ASSIGNMENT
- UPDATE_ASSIGNMENT
- CANCEL_ASSIGNMENT

### Inbox Policy
- Admin inbox returns all requests
- Ordered by:
  1. Pending first
  2. Most recent

### Assignments Table
- Final authoritative assignments only
- No business logic in frontend

---

## 3. Geo / Distance Architecture Agreement (NEW)

### Default Policy
- Travel distance origin: Employee home address
- Company may override per-company:
  - home
  - company_yard

### Implementation Phases
#### Geo G0 – Foundation (NEXT)
- Add employee home coordinates (lat/lng)
- Add company travel origin policy
- No map yet
- No routing yet

#### Geo G1 – Accurate Distance Engine
- Road distance (not straight-line)
- Cache distances in DB
- Used for travel allowance
- Node.js implementation

#### Geo G2 – Map UI
- Projects + employees on map
- Visual decision support
- Reads from same distance engine

---

## 4. Python Usage Policy (INTERNAL AGREEMENT)

### Python is NOT used for:
- Core backend
- CRUD
- Authentication
- UI logic
- Assignments workflows

### Python MAY be introduced ONLY for:
- Optimization problems
- Heavy mathematical analysis
- AI / recommendation engines
- Batch background jobs

### Architecture Rule
- Python = optional microservice
- Communicates via HTTP or queue
- Never directly controls UI
- Never replaces Node.js backend

---

## 5. Development Rules (RECONFIRMED)
- One change = one file
- Always keep a working backup
- No refactors without explicit approval
- No new tech without direct value
- Docs updated before moving to next phase

---

## 6. Current Status
- Assignments V2: Stable
- Requests UX: Stable
- App integration: Stable
- Geo foundation: Pending
- Python service: Not active (planned only)

---

## 7. Next Approved Step
Geo G0 – Database foundation (Node.js only)

---

This document is authoritative. Any deviation requires a new version.
