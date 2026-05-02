# Constrai / MEP Platform — Quebec Loi 25 Compliance Audit

> **Phase 72 — May 2, 2026.** First-pass audit of where Constrai stands against Quebec's *Loi modernisant des dispositions législatives en matière de protection des renseignements personnels* (commonly "Loi 25", formerly Bill 64).
>
> This is **not legal advice.** It's an engineering audit of the technical surface — what PII we collect, where it flows, where the gaps are, and a prioritised action list. Hedar should run the policy / governance items past a Quebec privacy lawyer before publishing any external policy or signing data-processing agreements.
>
> **Audit owner:** Hedar Hallak. **Scope:** prod system as of May 2, 2026 (commit `f6e1ceb`).

---

## 0. Executive Summary

Constrai operates as a multi-tenant SaaS where **each company is the data controller** and Constrai is the **data processor**. Workers' personal information (names, contact details, home addresses, geolocation, attendance records, hours worked) is stored on the customer company's behalf.

**Current state at a glance:**

| Loi 25 requirement | Status | Severity if not addressed |
|---|---|---|
| Designate a privacy officer (DPO equivalent) | 🟡 Informal — Hedar is the de-facto contact | Medium — required if customer companies treat us as a processor |
| Privacy policy on the public website | ❌ Missing on www.constrai.ca | **High** — required before commercial launch with multiple customers |
| Data inventory + classification | 🟡 Implicit (in schema) — not explicit | Medium |
| Subject access right (worker can request their data) | 🟡 Workers can SEE their data via the app — but no formal export endpoint | Medium |
| Right to correction | 🟢 Workers can edit their profile (phone, address) | Low |
| Right to deletion | ❌ No "delete my account" flow yet | **High** |
| Right to portability | ❌ No data export endpoint | Medium |
| Cross-border transfer assessments (Sentry, SendGrid, Mapbox in US) | ❌ Not formally documented | **High** — Loi 25 requires impact assessment for transfers outside Quebec |
| Breach notification process | ❌ No documented procedure | **High** |
| Default privacy settings | 🟢 Multi-tenant `company_id` isolation, JWT auth, RBAC permissions, PII not logged | Low (technically sound) |
| Retention policy | ❌ No documented retention windows; backups indefinitely | **High** |
| Consent for non-essential processing | 🟡 Implicit (employee onboarding) — not explicit | Medium |

**Top 3 things to fix before next customer:**

1. **Cross-border transfer impact assessment** — document the risk profile of Sentry (US), SendGrid (US), and Mapbox (US) in writing. Loi 25 requires this for personal info leaving Quebec.
2. **Privacy policy on www.constrai.ca** — public-facing, in French + English, with clear data flows.
3. **Right to deletion + data export** — backend endpoint + UI flow so a worker can request their data archive or full removal.

---

## 1. Loi 25 — what it requires (summary)

Loi 25 came into full effect on September 22, 2024. Key obligations for a SaaS like Constrai:

| Article (approx.) | Obligation |
|---|---|
| **Section 3.1** | Designate a person responsible for the protection of personal information ("DPO equivalent"). Default: the most senior officer. |
| **Section 3.2 / 3.3** | Privacy by default; published privacy policy explaining what's collected, why, who sees it, and how long it's kept. |
| **Section 3.5–3.7** | Privacy impact assessment (PIA) before any project that involves personal info — including third-party tools, cross-border transfers. |
| **Section 7 / 8.1** | Get consent (manifest, free, enlightened, specific, granular) for collection / use beyond what's strictly necessary. Employment contracts can provide consent for HR-essential data. |
| **Section 14 / 27** | Subject rights: access, correction, deletion, withdrawal of consent, portability (machine-readable export). |
| **Section 17** | Cross-border transfer: PIA + contractual safeguards. The destination jurisdiction's privacy regime is assessed for "equivalence". |
| **Section 18.2 / 63.5** | Breach notification: notify the *Commission d'accès à l'information* (CAI) AND each affected individual without undue delay if there's a "risk of serious injury". Keep an internal incident register. |
| **Section 63.5** | Penalties: up to **CAD 25 million** or 4% of global turnover for systemic non-compliance, whichever is higher. |

The CAI publishes guidance at https://www.cai.gouv.qc.ca/.

---

## 2. Data Inventory — what we collect

### 2.1 Identity & contact (high sensitivity)

| Field | Where stored | Source | Purpose |
|---|---|---|---|
| `app_users.username` | `mepdb` (Postgres, TOR1) | Onboarding | Login |
| `app_users.pin_hash` | `mepdb` (bcrypt 12 rounds) | Onboarding | Authentication |
| `employees.first_name`, `last_name` | `mepdb` | Employer (HR) | Identification |
| `employee_profiles.phone` | `mepdb` | Worker | Contact |
| `employee_profiles.contact_email` | `mepdb` | Worker | Email reports, notifications |
| `employee_profiles.home_address` | `mepdb` | Worker | CCQ travel allowance calculation |
| `employee_profiles.home_lat`, `home_lng`, `home_location` (PostGIS) | `mepdb` | Worker (geocoded) | Distance to project site |
| `employee_sensitive_values.*` | `mepdb` | HR | Encrypted custom HR fields |

### 2.2 Activity / behavioural data

| Field | Where stored | Purpose |
|---|---|---|
| `attendance_records` (check-in / out times, GPS, hours) | `mepdb` | Payroll, dispatch, reporting |
| `assignment_requests` | `mepdb` | Project staffing |
| `audit_logs` (who did what, when) | `mepdb` (append-only) | Security + dispute resolution |
| `sensitive_access_log` | `mepdb` | Records when sensitive HR fields are read |
| `refresh_tokens` | `mepdb` | Session management |
| `push_tokens` (Expo) | `mepdb` | Mobile push notifications |

### 2.3 Indirect / system data

| Type | Where | Notes |
|---|---|---|
| Server access logs (Nginx) | DO Droplet `/var/log/nginx/` | IP + URL — short retention |
| Application logs (PM2) | DO Droplet `/var/log/pm2/`, `/root/.pm2/logs/` | May contain user IDs — verify no PII in error stacks |
| Sentry events | **Sentry SaaS, US** | Error stack traces. Configured `sendDefaultPii: false` (Phase 64) — explicit win. |
| Backup files | DO Spaces `constrai-backups`, **TOR1** | Full Postgres dump including PII. 7d / 4w / 3m retention. |

---

## 3. Data Flow Map — where data leaves the database

| Destination | Region | Personal info that flows there | Loi 25 status |
|---|---|---|---|
| **DigitalOcean Droplet** (backend) | TOR1 (Toronto) | All PII (it's the primary store) | ✅ Canadian region |
| **DigitalOcean Spaces** (backups) | TOR1 (Toronto) | Full DB dump | ✅ Canadian region |
| **SendGrid** (transactional email) | **US** | Recipient email + names + invite tokens + assignment summaries | ⚠️ **Cross-border — needs PIA** |
| **Sentry** (error tracking) | **US** | Stack traces + request paths + user IDs (NOT PII fields, see below) | ⚠️ **Cross-border — needs PIA, but minimal PII due to `sendDefaultPii: false`** |
| **Mapbox** (geocoding + maps) | **US** | Worker home address strings (sent to /geocoding API) | ⚠️ **Cross-border — needs PIA. Strongest case for an alternative.** |
| **Expo Push Notification Service** | **US** | Device push token + notification body | ⚠️ **Cross-border — needs PIA. Notification bodies may contain worker name + project info.** |
| **UptimeRobot** (monitoring) | **US** | Only the `/api/health` ping URL — no PII | 🟢 No personal info crosses border. |

**Net cross-border PII surface:** SendGrid + Mapbox + Expo Push are the three real vectors. Sentry is borderline (we already configured it conservatively). Each one needs:
1. A documented PIA explaining why we use it, what data flows, and what controls are in place.
2. A signed Data Processing Addendum (DPA) — most US SaaS providers offer a "GDPR DPA" template that covers Canadian privacy expectations too.
3. Worker disclosure in the privacy policy that data crosses to the US.

---

## 4. Subject Rights — implementation status

| Right | Status | Where implemented (or to-do) |
|---|---|---|
| **Access** ("show me my data") | 🟡 Partial — workers see their attendance, profile, assignments via the app | TO-DO: machine-readable export endpoint (e.g. `GET /api/profile/export-my-data` returning JSON archive) |
| **Correction** | 🟢 Workers edit their phone, address, contact email, home location via Profile screen | — |
| **Deletion** ("forget me") | ❌ No flow | TO-DO: `DELETE /api/profile/me` that anonymises (replaces name with `EX-EMPLOYEE-{id}`, NULLs phone/email/address, retains attendance records for legal payroll retention but breaks the link to identity) |
| **Withdrawal of consent** | ❌ No flow | Tied to the above — withdrawing consent triggers anonymisation + deactivation |
| **Portability** | ❌ No formal export | Same endpoint as Access, machine-readable JSON / CSV |
| **Right to know about automated decisions** | 🟢 No automated decisions are made about workers (`auto_assign` is a recommender that requires foreman approval). Worth documenting explicitly. |

---

## 5. Breach Notification Readiness

| Check | Status |
|---|---|
| Documented breach response procedure | ❌ Missing — needs to be written. Should include: detection (Sentry / UptimeRobot / health alarm), triage, severity classification, CAI notification within 72h if severe, customer-company notification, affected-worker notification. |
| Internal incident register | ❌ Missing — could live in `RECOVERY.md` Section 9 or a dedicated `INCIDENTS.md`. |
| Detection capability | 🟢 Sentry (Phase 64) catches uncaught exceptions; UptimeRobot catches outages; `/api/health/deep` (Phase 66) surfaces drift. |
| Encryption at rest | 🟡 Postgres data dir on DO Droplet is encrypted at the volume level by DigitalOcean, but the application itself doesn't encrypt rows. Backups in DO Spaces ARE encrypted by Spaces' default SSE. |
| Encryption in transit | 🟢 Let's Encrypt / Nginx forces HTTPS; DB connections from app to localhost use loopback (not encrypted but not exposed). |

**Key gap:** if a serious breach happened today, we don't have a written procedure to follow. That alone is a Loi 25 violation.

---

## 6. Action Items (priority-ordered)

### Must fix before next customer launch (~2 weeks of work)

1. **Privacy policy on `www.constrai.ca`** — French + English, covers data collection, third-party processors (with countries), retention, subject rights, contact for DPO. Get a Quebec privacy lawyer to review the final wording.
2. **Cross-border transfer impact assessments (PIAs)** — one short doc per provider (Sentry, SendGrid, Mapbox, Expo Push) covering: what data flows, why, controls in place, alternatives considered. Living docs under a new `compliance/pia/` folder.
3. **Right to deletion endpoint + UI** — `DELETE /api/profile/me` with confirmation flow. Anonymise rather than hard-delete to preserve payroll records (legally required to retain for 6+ years in Quebec).
4. **Right to access / portability endpoint** — `GET /api/profile/export-my-data` returning a JSON archive. UI button on Profile screen.
5. **Breach response procedure document** — `INCIDENTS.md` template with severity classification, who to call, CAI notification template, customer-company notification template, internal log format.
6. **Retention policy** — written, per data category. Suggested defaults: attendance records 7 years (CCQ + tax law), audit logs 7 years, refresh tokens until logout, push tokens until device unregisters, anonymised profiles indefinitely. Add a `data_retention_at` column on `app_users` for the deletion-target timestamp.
7. **Privacy officer designation** — formal one-line statement in `RECOVERY.md` Section 0 naming Hedar as the responsible person, plus a `privacy@constrai.ca` mailbox.

### Should fix in the next quarter

8. **Consent record on onboarding** — explicit checkbox + audit log entry when a worker accepts the privacy policy at first login.
9. **Sensitive-field encryption at the app layer** — `employee_sensitive_values` table looks set up for this; verify it's actually used, audit which fields land there.
10. **Logging audit** — confirm Nginx + PM2 logs do not contain PII in request bodies (POST /api/auth/login etc.). Spot-check live logs.
11. **DPA on file with each third-party processor** — DigitalOcean, Sentry, SendGrid, Mapbox, Expo. Most have a self-service DPA download.
12. **Mapbox alternative evaluation** — geocoding worker home addresses sends them to Mapbox in the US. A Canadian-hosted alternative (e.g., MapTiler EU, or even self-hosted Nominatim) would let us avoid this transfer entirely. Cost / accuracy trade-off worth a phase of its own.

### Nice to have (lower priority)

13. **Pseudonymisation for analytics** — if BI / analytics features grow, route them through a pseudonymisation step so analytics doesn't see worker names.
14. **Quarterly compliance review** — already in `RECOVERY.md` Section 8 (verification checklist). Add a row for "review COMPLIANCE.md TODOs" so they don't drift.

---

## 7. Engineering decisions that already help

Worth recording the things we've done right (consciously or not):

- **Multi-tenant `company_id` isolation** — every business table has a `company_id` column and every route filters by `req.user.company_id`. A worker at Company A literally cannot query Company B's data even if the JWT were leaked.
- **Bcrypt 12-rounds for PINs** — within current best practice. Section 18 raised it from 10 → 12 in Phase 12.
- **JWT short access (1h) + refresh rotation (7d)** — limits the blast radius of a leaked access token.
- **Append-only audit log** — `audit_logs` is INSERT-only by design; sensitive reads are also logged (`sensitive_access_log`). Helps both for breach forensics and for satisfying subject "who saw my data" requests.
- **Sentry configured with `sendDefaultPii: false`** (Phase 64) — explicit choice to keep IP / cookies / request bodies out of Sentry events.
- **All compute + primary data in Toronto (TOR1)** — DigitalOcean Droplet + DO Spaces are both in Canada. The cross-border surface is limited to the three SaaS vendors above, not the core data.
- **Daily encrypted backups** with documented restore procedure (Phase 65 drilled May 2, 2026). Recovery from data loss is operationalised.

---

## 8. Sign-off

This document is a snapshot of the May 2, 2026 state. Re-audit:
- Quarterly (Section 8 of `RECOVERY.md` already lists it).
- Whenever a new third-party SaaS is added.
- Before each net-new customer company onboards.

Last updated: 2026-05-02 by Hedar Hallak (engineering audit; legal review pending).
