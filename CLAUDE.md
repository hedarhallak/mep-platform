# CLAUDE.md — How Claude Should Work in the Constrai Codebase

> This file is the **single source of truth** for how Claude operates in this project.
> Auto-loaded by Claude Code from project root. In Cowork sessions, Hedar pastes a one-line command pointing here as the session bootstrap (see Section 0 below).
>
> **Maintainer:** Hedar Hallak. **Repo:** `hedarhallak/mep-platform`. **Production:** `https://app.constrai.ca`.

---

## 0. BOOTSTRAP — Read This First (Cold-Start Instructions)

If you are a fresh Claude session and Hedar pasted only a short command pointing you to this file, **execute these steps in order before doing anything else**:

### Step 1 — Fetch and read these files in order

```
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/MASTER_README.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/DECISIONS.md
https://raw.githubusercontent.com/hedarhallak/mep-platform/main/RECOVERY.md
```

(You're already reading CLAUDE.md.)

Use `WebFetch` to retrieve each file. Read all of them — don't skim.

### Step 2 — Find where we left off

Inside `DECISIONS.md`, find the **highest-numbered Section labeled "Session Log"** (e.g. "Section 16. Session Log — April 19, 2026"). Read that section in full. It tells you:
- What was just completed
- What's pending
- What the user planned to do next

### Step 3 — Acknowledge & ask

Reply to Hedar with:
1. A **3–5 line summary** confirming what you understood about the project's current state. **Keep it tight — bullets or short sentences, NOT paragraphs.** Detailed elaboration only if Hedar asks for it.
2. A clear question: "شو المطلوب اليوم؟" — unless Hedar already specified a task in the same message (in which case, confirm the task in one line and proceed).

**Language & dialect:**
- Hedar speaks **Levantine Arabic (Lebanese/Syrian dialect)**, not MSA.
- Use words like: `شو` (not `ماذا`), `هلق/هلأ` (not `الآن`), `كتير` (not `كثير`), `هيك` (not `هكذا`), `بدك` (not `تريد`), `لازم` (not `يجب`), `منيح` (not `جيد`).
- Use **masculine forms** addressing Hedar (`تفضل` not `تفضّلي`, `اعمل` not `اعملي`).

### Step 4 — Read additional files only when the task requires them

- DB / migration / query work → also read `SCHEMA.md`
- Backend / route / endpoint work → also read `API.md`
- Setup / new env var / config debugging → also read `.env.example`
- Backup operations → also read `scripts/backup/SETUP.md`

Do NOT preemptively read all reference files — that wastes context. Read on demand.

### Step 5 — Follow all rules in the rest of this file

The remainder of CLAUDE.md (Sections 1–12 below) defines the working rules, conventions, and code map. Apply them to every action you take in this session.

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
   - English code/commands stay in English. Mix naturally.
3. **Never decide unilaterally** — for any architectural choice, propose options and let Hedar pick. Use `AskUserQuestion` to present 2–4 clear options.
4. **Be honest about uncertainty** — if a tool/library/decision is unclear, say so and offer to look it up rather than guessing.
5. **Keep instructions step-by-step and line-by-line** when guiding through manual operations (terminal commands, dashboard navigation). Don't bundle 5 actions in one paragraph.
6. **Keep responses tight.** No long preambles. No restating what Hedar just said. Get to the point. Use bullets/tables/code blocks where they add clarity.

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
  npx expo start --clear 2>&1 | Tee-Object -FilePath C:\Users\Lenovo\Desktop\expo_log.txt
  ```
- **Backend errors:** `pm2 logs mep-backend --err --lines 30 --nostream`
- **Frontend errors:** browser DevTools → Console + Network tabs.
- **DB errors:** `sudo -u postgres psql -d mepdb -c "..."` for arbitrary queries; `\dt` for table list, `\d table_name` for schema.

---

## 10. Output Conventions When Sharing Files in Cowork

- Use `computer://` links to share files Hedar should view.
- Format: `[descriptive name](computer:///sessions/.../path/to/file)`.
- Never expose internal session paths conversationally — refer to "the workspace folder" or specific filenames.
- Always commit + push docs after editing them so they're not stuck only on Hedar's laptop.

---

## 11. Pending Tasks & Roadmap

**Active hardening (April 2026 — see `DECISIONS.md` Section 14):**
- ✅ Layer 1: Daily DB backups to DigitalOcean Spaces (TOR1, tested end-to-end)
- 🔄 Layer 2: Infrastructure (Droplet snapshots, SSL renewal verification, Nginx + .env templates)
- 🔄 Layer 3: Human knowledge & access (Password Manager, emergency contacts, second GitHub admin, Apple ID recovery)

**Roadmap (DECISIONS.md Section 5):**
- Web Frontend i18n (EN/FR)
- Android Google Play build
- PDF/Email FR templates
- Material Surplus System (DECISIONS.md Section 8)
- Custom Job Titles per Company (DECISIONS.md Section 7)

---

## 12. When in Doubt

- **Defer to Hedar.** When a decision could go multiple reasonable ways, ask via `AskUserQuestion` instead of picking.
- **Trust the docs.** `MASTER_README.md` + `DECISIONS.md` are the system of record. If something contradicts your assumption, the docs win.
- **Update the docs.** If you discover something that should have been in the docs but wasn't, update them in the same response and tell Hedar to commit.
- **Never delete an idea** from `DECISIONS.md` — only add and evolve. Section 13 documents this rule.
