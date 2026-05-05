# CLAUDE.md — How Claude Should Work in the Constrai Codebase

> This file is the **single source of truth** for how Claude operates in this project.
> Auto-loaded by Claude Code from project root. In Cowork sessions, Hedar pastes a one-line command pointing here as the session bootstrap (see Section 0 below).
>
> **Maintainer:** Hedar Hallak. **Repo:** `hedarhallak/mep-platform`. **Production:** `https://app.constrai.ca`.

---

## 0. BOOTSTRAP — Read This First (Cold-Start Instructions)

> **THIS IS A CONTINUATION OF AN EXISTING PROJECT. NOT a new project.**
> The project is **Constrai (MEP Platform)** — a Quebec construction workforce ERP. If you are a fresh Claude session and Hedar pasted any command pointing you to this file, **execute these steps in order before doing anything else**:

### Step 1 — Read project context (LOCAL FOLDER FIRST, GitHub as fallback)

**ALWAYS prefer the local mounted repo folder over GitHub raw URLs.** Local has the latest uncommitted edits; GitHub may lag by hours or days.

If the workspace folder `mep-fixed` is mounted (Cowork mode, normally yes), read these from the LOCAL folder using the `Read` tool:

```
MASTER_README.md
DECISIONS.md
RECOVERY.md
```

(You're already reading CLAUDE.md.)

**Only if local read fails or no folder is mounted**, fall back to GitHub via WebFetch:
```
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/RECOVERY.md
```

Read all of them — don't skim. Each is critical for understanding state.

### Step 2 — Find where we left off

Inside `DECISIONS.md`, find the **highest-numbered Section labeled "Session Log"** (e.g. "Section 17. Session Log — April 26, 2026"). Read that section in full, including all sub-phases. It tells you:
- What was just completed (and what commits)
- What's pending
- What the user planned to do next
- Any architectural decisions made

Also scan for any Section ≥18 that might be a planned program or roadmap (e.g. Section 18 = Engineering Quality Program). These set the priority order for upcoming work.

### Step 3 — Acknowledge Bootstrap completion + ask

**Bootstrap verification (mandatory):** Begin your reply with this exact line so Hedar can confirm Bootstrap was completed:

```
(محادثة استكمال — قرأت Section X من DECISIONS.md)
```

Where X is the latest Session Log section number you found. Without this line, Hedar will assume Bootstrap was skipped.

Then provide:
1. A **3–5 line summary** confirming what you understood about the project's current state. **Keep it tight — bullets or short sentences, NOT paragraphs.** Detailed elaboration only if Hedar asks for it.
2. A clear question: "شو المطلوب اليوم؟" — unless Hedar already specified a task in the same message (in which case, confirm the task in one line and proceed).

**Language & dialect:**
- Hedar speaks **Levantine Arabic (Lebanese/Syrian dialect)**, not MSA.
- Use words like: `شو` (not `ماذا`), `هلق/هلأ` (not `الآن`), `كتير` (not `كثير`), `هيك` (not `هكذا`), `بدك` (not `تريد`), `لازم` (not `يجب`), `منيح` (not `جيد`).
- Use **masculine forms** addressing Hedar (`تفضل` not `تفضّلي`, `اعمل` not `اعملي`).

### Step 4 — Read additional files only when the task requires them

- DB / migration / query work → also read `SCHEMA.md` AND `db/schema_baseline_2026-05-04.sql` (the canonical live schema — replaces the older 04-26 / 04-28 baselines after the Section 76 consolidation, which captures the post-C3+C4 cleanup).
- Backend / route / endpoint work → also read `API.md`
- Setup / new env var / config debugging → also read `.env.example`
- Backup operations → also read `scripts/backup/SETUP.md`
- Engineering quality / tooling work → see `DECISIONS.md` Section 18

Do NOT preemptively read all reference files — that wastes context. Read on demand.

### Step 5 — Follow all rules in the rest of this file

The remainder of CLAUDE.md (Sections 1–12 below) defines the working rules, conventions, and code map. Apply them to every action you take in this session.

### Step 6 — End-of-Session Checkpoint (CRITICAL)

**Before responding with a final summary, before Hedar takes a break, or before suggesting the session is "done", you MUST verify:**

1. `DECISIONS.md` has been updated with a Session Log entry for today's work (find the latest section, append a sub-phase or extend it; do NOT replace).
2. Hedar has been given exact commit + push commands for all modified files.
3. Any new migrations / scripts / docs are in the commit set.

**Why this matters:** The next Claude session reads DECISIONS.md to know what happened. If today's work isn't there, the next session sees stale state and may treat the conversation as if today never happened. This is exactly what broke on April 26 evening — Phase 5/6 work didn't reach DECISIONS.md before a new session opened.

**Auto-trigger:** This is a hard requirement, not a suggestion. If you find yourself drafting a "session summary" without having updated DECISIONS.md, stop and update it first.

---

---

## 1. Project Snapshot

**Constrai (MEP Platform)** is a multi-tenant ERP for Quebec construction companies (mechanical/electrical/plumbing trades). It runs:

- **Backend:** Node.js + Express + PostgreSQL 14 (with PostGIS), hosted on a single DigitalOcean Droplet (`/var/www/mep`).
- **Web app:** React + Vite + Tailwind, served from `/var/www/mep/public/` at `https://app.constrai.ca`.
- **Mobile app:** React Native + Expo (TypeScript), bundle `ca.constrai.app`, distributed via TestFlight (Android pending).
- **Marketing site:** static landing at `https://www.constrai.ca`.
- **Auth:** JWT + PIN with refresh-token rotation (7-day refresh, 1-hour access, secure storage on mobile via `expo-secure-store`).
- **Email:** SendGrid (transactional). **Maps:** Mapbox.
- **Backups:** Automated daily pg_dump → DigitalOcean Spaces (`constrai-backups`, TOR1) at 07:00 UTC.

Multi-tenancy is enforced via `company_id` on all business tables. There are 13 roles, 58 permissions, and 56 tables.

---

## 2. Communication Rules (with Hedar)

1. **Hedar is male** — use Arabic masculine verb forms (`تخلص`, `افعل`, `اعمل`, `قل`, `شوف`).
2. **Speak Levantine Arabic (Lebanese/Syrian dialect)**, NOT MSA. Use:
   - `شو` not `ماذا`
   - `هلق` / `هلأ` not `الآن`
   - `كتير` not `كثير`
   - `هيك` not `هكذا`
   - `بدك` not `تريد`
   - `لازم` not `يجب`
   - `منيح` not `جيد`
   - `بسيط` not `سهل`
   - **Computing verbs:** for "run a command/program", use **`شغّل`** (or `نفّذ` for "execute"), NEVER `ركض` (which means "to run on foot, jog"). Examples: `شغّل npm install` not `اركض npm install`. `Knip تشغّل/تشغيل` not `Knip ركض`. `لما نفّذت الأمر` not `لما ركضت الأمر`. This was a recurring translation pitfall — the English verb "run" maps to two distinct Arabic verbs depending on context.
   - English code/commands stay in English. Mix naturally.
3. **Architectural choices: propose options. Execution choices: just execute.** For irreversible architectural decisions (DB schema, auth model, framework choice) propose 2–4 options via `AskUserQuestion`. For reversible execution choices (which test file first, which threshold value to try, which PR description to use) **do NOT ask** — pick the obvious default and proceed. Hedar has explicitly said multiple times: "بدل ماتعطيني خيارات اعطيني تسلسل للتنفيذ" — when he wants the full sequence executed, asking "shall we do A or B?" wastes turns. Default to executing; ask only when the choice is hard to undo.
4. **Be honest about uncertainty** — if a tool/library/decision is unclear, say so and offer to look it up rather than guessing.
5. **Keep instructions step-by-step and line-by-line** when guiding through manual operations (terminal commands, dashboard navigation). Don't bundle 5 actions in one paragraph.
6. **Keep responses tight.** No long preambles. No restating what Hedar just said. Get to the point. Use bullets/tables/code blocks where they add clarity.
7. **Separate SSH from server commands.** Whenever instructions involve SSH'ing into the production server and then running commands ON the server, the `ssh root@...` line MUST be in its own code block, and the on-server commands go in a separate code block below it. Hedar runs the SSH first to establish the connection, then pastes the rest. Never bundle them — it forces Hedar to manually delete the SSH line every time. Example:

   First, connect:
   ```
   ssh root@143.110.218.84
   ```

   Then on the server:
   ```bash
   cd /var/www/mep
   git pull origin main
   pm2 restart mep-backend
   ```

8. **Present multi-step procedures as flow diagrams, NOT bullet lists** (NEW — May 5, 2026, Section 85). When Hedar asks for steps for a task — activation flows, deployment sequences, migration plans, debugging procedures, anything with sequential or branching steps — render them as a **text-based flow diagram** using box-drawing characters (`┌─┐ │ ▼ → ↓`) and arrows showing direction. Numbered bullet lists are harder to follow visually. Example pattern:

   ```
   [Actor / Starting state]
        │
        │ ① action description
        ▼
   [Next state]
        │
        │ ② action description
        ▼
   [Final state] ✅
   ```

   Why: visual flow diagrams are faster to scan and easier to spot branches/forks. Hedar explicitly asked for this format on May 5. Mermaid widgets are NOT reliable in Cowork mode (failed to render colors during the Section 85 design session) — use plain ASCII box-drawing characters instead. They render reliably in any markdown context.

9. **Don't flood the user with information faster than they can read it** (NEW — May 5, 2026, Section 85). For irreversible architectural decisions, ask **one focused question at a time** and wait for the answer before moving to the next. Hedar explicitly said: "انت عكيتني كم هائل من المعلومات وانا لازم اقرأها قبل ماجاوبك, انا ماعندي سرعتك بالقراءة". The right pattern: propose ONE decision → user answers → propose NEXT decision. Don't dump 9 phases + 5 security layers + 3 sub-questions in one message. The Section 4.5 batching rule applies to *execution* work; this rule applies to *architectural discussion*. Different shape, both about reducing cognitive load.

---

## 3. Code & File Conventions

1. **No Arabic in code or comments** — Arabic only in chat and Markdown docs in the repo root.
2. **Always deliver complete files** with full paths — no snippets, no diffs in text. Use the Edit/Write tools to make actual changes.
3. **Don't modify unrelated components** — limit changes to the requested feature.
4. **UI Law (mobile):** Every sub-screen uses the icon-grid pattern via `src/screens/shared/SubMenuScreen.tsx`. Never two screens with identical layout — always one shared component with props.
5. **Centralized theme:** mobile uses `src/theme/colors.ts`, web uses `src/index.css` `@theme` directive. Never hardcode colors.
6. **i18n:** mobile uses `react-i18next` (default FR, EN secondary, key `mep_language` in AsyncStorage). Web i18n still TODO.
7. **No new files unless necessary** — prefer editing existing files. Document files (`.md`) only when explicitly requested.

---

## 4. The "Always Suggest Better Tools" Rule (NEW — April 2026)

When starting work in a new area (UI design, monitoring, automation, deployment, AI features, scheduling, etc.), Claude **must** first check whether a dedicated tool / MCP / SaaS / library already solves the problem cleanly, and surface that to Hedar **before** writing custom code.

**Why:** the original workflow (copy-paste files between chat and disk) wasted months until Cowork mode was discovered. Hedar wants every future area approached with the same critical eye.

**Examples of triggers:**
- "Let's design a new screen" → check Plasmic / v0.dev / Figma Make / Lovable.dev
- "Let's set up monitoring" → check UptimeRobot, Healthchecks.io, Better Stack, Grafana Cloud
- "Let's automate X" → check Zapier, n8n, GitHub Actions, scheduled tasks
- "Let's add AI to feature Y" → check existing MCPs in the registry, OpenAI/Anthropic SDKs

**How:** use `search_mcp_registry` first; if no MCP fits, do a web search comparing 2–3 top options; then present a short comparison to Hedar with a recommendation.

---

## 4.5. The "Optimize Repetitive Work" Rule (NEW — May 2026)

When Claude notices a task pattern repeating — same shape of operation done 3+ times in a row — **stop and propose a faster approach** before continuing manually.

**Why:** the April 30 testing marathon hit this directly. We wrote 40+ test files one phase at a time, with a full chat round-trip per phase (read route → write test → user commits → CI → next). Each phase took 5–6 messages. After Phase 30+ Hedar correctly asked: "is there a faster way?" — and there was. Doing the same shape of work manually for hours when a batch / generator / template / existing tool exists is wasted time.

**When to trigger:**
- Same file pattern written 3+ times in a row (e.g., test file with same skeleton)
- Same multi-step flow done repeatedly (e.g., add permission → grant → write test → commit)
- Same manual transformation applied across many files

**What to do:**
1. **Pause** the manual loop.
2. **Surface** the pattern out loud: "we just did X four times in the same shape — there's a faster way."
3. **Propose 2–3 options**, ordered cheapest-to-build first:
   - Batch (fewer chat round-trips, fewer commits)
   - Template / helper function
   - Generator script / tool
   - Existing OSS tool or MCP
4. **Let Hedar pick** before continuing.
5. **Always prefer the cheapest option that meaningfully speeds the loop** — don't over-engineer.

**Default batching rule (NEW — May 2, 2026, Phase 73 retro):** When 3+ same-shape phases are queued (e.g. "Phase 73a, 73b, 73c, 73d each writes one smoke test file"), default to **one feature PR per batch**, not one PR per phase. Phase 73 was executed as 4 separate PRs + 4 separate doc PRs = 8 round-trips. Could have been 1 feature PR (all 4 test files) + 1 docs PR = 2 round-trips. Section 4.5 was already there but we waited too long to apply it. Trigger: as soon as Phase Nb / Nc / Nd are pre-planned in the same Section, ask "should we ship these as one PR?" before starting — not after Phase Nd is half done.

**Examples:**
- Writing one test per chat round-trip → batch 4–5 in one round-trip.
- Adding 20 permissions one-by-one → write a helper that takes a list.
- Manually formatting 100 SQL strings → use Prettier / a script.
- Triaging 50 Dependabot PRs by hand → bulk-close via API.

This rule is the test/automation analogue of Section 4 ("Always Suggest Better Tools"). Section 4 fires at the start of a new area; Section 4.5 fires mid-flow when a pattern emerges.

---

## 4.6. Lessons Captured — Phase 73 Retrospective (NEW — May 2, 2026)

Concrete pitfalls hit during the Section 22 / Phase 73 marathon. Encoded here so future sessions skip them.

### Coverage thresholds: 2–3 pp safety margin, never 1 pp

- Set `coverageThreshold` in `jest.config.js` **2–3 pp below the measured value**, never 1 pp below.
- Build flake (Jest worker scheduling, cache hits, test ordering) shifts coverage by up to 1.5 pp between runs. A 1 pp gap flaps CI; 2–3 pp absorbs the variance.
- Phase 73d ratchet failed twice (52/45/53/52 then 47/42/50/48) before settling at 46/41/49/47. The 3 pp margin held.

### Run coverage with TEST_DATABASE_URL before pushing a ratchet

- `npx jest --coverage` locally without `TEST_DATABASE_URL` set reports ~18% lines because all 41 integration suites skip via `describeIfDb`. CI runs with the DB and reports the real ~50%. Confusing the two costs PR cycles.
- **Convention:** before any threshold ratchet PR, run `TEST_DATABASE_URL=<url> npx jest --coverage` (or `npm run test:cov`) locally and read the actual numbers.

### `jest.mock` factory variables MUST start with `mock`

- `jest.mock('module', () => ({...}))` is hoisted above all top-level statements. The factory body can only reference variables that begin with `mock` (case-insensitive) — anything else throws `ReferenceError: out-of-scope variables` at parse time.
- **Convention:** every test-level mock helper variable starts with `mock`. No exceptions, even when the var "feels like" it should be named after the thing it mocks (`sgSendImpl`, `originalFetch`, etc.).

### Coverage push past ~50%: smoke tests are exhausted, routes need DB fixtures

- Phase 73a–d covered every unit-testable file (services, jobs, middleware, lib helpers, email senders) and reached **49.62% lines** — the cheap wins are now done.
- The remaining gap to 65% is entirely inside `routes/*` happy-path branches. That's a **different category of work**: needs real DB fixtures, multi-table seed data, auth tokens, permission rows. Don't conflate it with smoke-test phases — different velocity, different risk shape.
- **Convention:** when planning a coverage push, name the category up front (smoke vs route+DB) so the target is realistic for the work shape.

### Cowork bash sandbox can lag on file syncs — fall back to PowerShell + CI

- During the May 2 session, the Linux mount in Cowork bash returned **stale `package.json`** (1565 bytes from Apr 29 instead of the current Windows version), causing `npx jest` to fail with "Invalid package config" until force-rewriting the file.
- The Read/Edit/Write tools see the up-to-date Windows view; only the bash sandbox is stale.
- **Convention:** when bash returns weird "stale file" errors, stop running tests/builds in bash for that session. Run them via Hedar's PowerShell (or commit and let CI do it). Don't waste turns trying to force-sync the mount.

### npm scripts to add to package.json (when memory issues are addressed)

Recommended convention for next session — not yet shipped:

```json
"test:cov": "TEST_DATABASE_URL=$TEST_DATABASE_URL jest --coverage --coverageReporters=text-summary",
"test:cov:check": "node -e \"if(!process.env.TEST_DATABASE_URL){console.error('TEST_DATABASE_URL must be set'); process.exit(1)}\" && npm run test:cov"
```

This forces the local-vs-CI parity check before any ratchet PR.

---

## 5. Required Reading at Session Start

Every Claude session must begin by reading these in order:

1. [`MASTER_README.md`](./MASTER_README.md) — project overview + current state + working rules
2. [`DECISIONS.md`](./DECISIONS.md) — full decision history + Session Logs (always read the latest Session Log section to know where we left off)
3. [`RECOVERY.md`](./RECOVERY.md) — operational knowledge, credentials inventory, recovery procedures
4. [`CLAUDE.md`](./CLAUDE.md) — this file (Claude-specific rules)

**Read on demand** (when the task touches that area):
- [`SCHEMA.md`](./SCHEMA.md) — DB schema reference (tables, relationships, key columns)
- [`API.md`](./API.md) — backend API endpoint reference
- [`.env.example`](./.env.example) — required environment variables
- [`scripts/backup/SETUP.md`](./scripts/backup/SETUP.md) — DB backup operations
- [`START_NEW_SESSION.md`](./START_NEW_SESSION.md) — templates for opening new sessions

---

## 6. Where Things Live (Code Map)

### Backend (`/`)
- `index.js` — Express entry point, route mounting
- `db.js` — Postgres pool (uses `DATABASE_URL` or `PG*` fallbacks)
- `routes/` — 27 route files, one per feature area (auth, hub, materials, etc.)
- `services/` — business logic shared across routes
- `middleware/` — auth, RBAC permission checks
- `lib/` — utilities (auth, email, geocoding, PDF)
- `jobs/` — scheduled jobs (daily dispatch, etc.)
- `migrations/` — SQL migration files (numbered: 001_*.sql, 002_*.sql, ...)
- `scripts/` — operational scripts (seed, geocode, backup)
- `seed.js` — initial seed (companies, employees, projects, suppliers)

### Web (`/mep-frontend/`)
- React + Vite + Tailwind v4
- Theme via `src/index.css` `@theme` directive (CSS vars `--color-primary-*`)
- Build: `npm run build` → output to `/var/www/mep/public/`

### Mobile (`/mep-mobile/`)
- React Native + Expo (SDK 54), TypeScript
- `src/theme/colors.ts` — single source of truth for all colors
- `src/i18n/` — i18next setup + EN/FR locale files
- `src/screens/` — all screens; `shared/SubMenuScreen.tsx` is the icon-grid pattern
- `src/screens/dashboard/DashboardScreen.tsx` — role-aware home
- Build: `eas build --platform ios --profile production`

### Marketing (`/constrai-landing/`)
- Static bilingual EN/FR landing page deployed to `/var/www/constrai-landing/`

---

## 7. Server Operations (Production)

- **SSH:** `ssh root@143.110.218.84` (Ubuntu 24.04)
- **Backend path:** `/var/www/mep`
- **Process manager:** `pm2` — service name `mep-backend` (`pm2 status`, `pm2 logs mep-backend --lines 50`)
- **Web server:** Nginx — config at `/etc/nginx/sites-enabled/default`
- **DB:** local Postgres, DB `mepdb`, user `mepuser`. Restore requires `sudo -u postgres psql` (peer auth) because PostGIS extension creation needs superuser.
- **SSL:** Let's Encrypt via certbot (auto-renew). Verify quarterly with `certbot renew --dry-run`.

---

## 8. Git Workflow

1. **At session start (server):** `cd /var/www/mep && git pull origin main` (use `git checkout scripts/backup/` first to clear filemode drift if needed).
2. **At session start (laptop):** `git pull origin main` before editing.
3. **At every meaningful checkpoint** (architectural decision, finished step in a multi-step task, before Hedar takes a break, after a non-trivial bug fix): update `DECISIONS.md`, then tell Hedar to commit + push from PowerShell. **Don't wait to be asked.**
4. **After server-side fixes:** commit from server and push immediately.
5. **Pre-commit hook** runs route audit; never bypass with `--no-verify` unless Hedar explicitly approves.

---

## 9. Error & Debug Protocol

- **Mobile errors:** ALWAYS ask for the terminal log, not a screenshot. Command:
  ```powershell
  npx expo start --clear 2>&1 | Tee-Object -F