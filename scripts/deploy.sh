#!/usr/bin/env bash
# Constrai prod deploy script.
#
# Usage (from prod server, after `ssh root@143.110.218.84`):
#   bash /var/www/mep/scripts/deploy.sh
#
# Encodes the deploy sequence documented in DECISIONS.md Section 52.
# Idempotent: re-running is safe — true no-op when nothing has changed since
# the last successful deploy via this script.
#
# State tracking: writes the deployed commit SHA to `.last-deployed-sha`
# at the end of every successful run. Future runs compare current HEAD
# against this file (NOT against `git pull` result), so deploys still
# trigger correctly even when an external process (mep-webhook) has
# already pulled the commits before us. (See DECISIONS.md Section 54.)
#
# What it does:
#   1. Verifies we're on `main` and captures current state
#   2. Backs up backend `.env` (timestamped)
#   3. Resets known package-lock.json drift (from prior npm-install runs)
#   4. Pulls latest from origin/main
#   5. Reads .last-deployed-sha; compares to current HEAD
#   6. If unchanged → restart pm2 (for env) and exit
#   7. Otherwise: detects which areas changed (backend / frontend / landing)
#   8. Runs `npm install --production` on backend if backend touched
#   9. Runs `npm install` + `npm run build` + `rsync` on frontend if frontend touched
#  10. Rsyncs constrai-landing/ → /var/www/constrai-landing/ if landing touched
#       (Section 64: replaces the manual step from Section 60)
#  11. Restarts pm2 mep-backend with --update-env
#  12. Verifies https://app.constrai.ca/api/health/deep returns ok=true
#  13. Writes new SHA to `.last-deployed-sha` on success
#
# What it does NOT do:
#   - Run database migrations (intentional — migrations should be explicit;
#     run `node scripts/migrate.js` separately when needed)
#   - Roll back on failure (manual rollback: `git reset --hard <SHA>`
#     then re-run this script)

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────────────────────────────────────
REPO_DIR="/var/www/mep"
FRONTEND_DIR="${REPO_DIR}/mep-frontend"
PUBLIC_DIR="${REPO_DIR}/public"
LANDING_SRC_DIR="${REPO_DIR}/constrai-landing"
LANDING_PUBLIC_DIR="/var/www/constrai-landing"
PM2_APP="mep-backend"
HEALTH_URL="https://app.constrai.ca/api/health/deep"
DEPLOYED_SHA_FILE="${REPO_DIR}/.last-deployed-sha"

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
ts()  { date "+%H:%M:%S"; }
log() { printf "[%s] %s\n" "$(ts)" "$*"; }
err() { printf "[%s] ERROR: %s\n" "$(ts)" "$*" >&2; }

# ──────────────────────────────────────────────────────────────────────────────
# Pre-flight
# ──────────────────────────────────────────────────────────────────────────────
log "=== Constrai prod deploy ==="
log "Repo:     ${REPO_DIR}"
log "Frontend: ${FRONTEND_DIR}"
log "Public:   ${PUBLIC_DIR}"
log "Landing:  ${LANDING_SRC_DIR} → ${LANDING_PUBLIC_DIR}"
log "PM2 app:  ${PM2_APP}"
echo

cd "${REPO_DIR}"

# Must be on main
CURRENT_BRANCH=$(git branch --show-current)
if [ "${CURRENT_BRANCH}" != "main" ]; then
  err "Not on main (currently on '${CURRENT_BRANCH}'). Aborting."
  exit 1
fi
log "On branch main ✓"

# Read previously-deployed SHA (empty if first run)
LAST_DEPLOYED=""
if [ -f "${DEPLOYED_SHA_FILE}" ]; then
  LAST_DEPLOYED=$(cat "${DEPLOYED_SHA_FILE}" | head -c 40 | tr -d '[:space:]')
fi
if [ -n "${LAST_DEPLOYED}" ]; then
  log "Last deployed SHA: ${LAST_DEPLOYED}"
else
  log "No prior deploy SHA found — treating as first run (full deploy)."
fi

# Capture pre-pull commit (for diagnostic only)
PRE_PULL_SHA=$(git rev-parse --short HEAD)
log "HEAD before pull: ${PRE_PULL_SHA}"

# ──────────────────────────────────────────────────────────────────────────────
# Step 1: backup .env
# ──────────────────────────────────────────────────────────────────────────────
TS_TAG=$(date +%Y%m%d-%H%M%S)
cp "${REPO_DIR}/.env" "${REPO_DIR}/.env.bak.${TS_TAG}"
log "Backed up .env → .env.bak.${TS_TAG}"

# ──────────────────────────────────────────────────────────────────────────────
# Step 2: reset lockfile drift (from prior npm install runs)
# ──────────────────────────────────────────────────────────────────────────────
git checkout -- package-lock.json mep-frontend/package-lock.json 2>/dev/null || true
log "Lockfile drift cleared"

# ──────────────────────────────────────────────────────────────────────────────
# Step 3: pull
# ──────────────────────────────────────────────────────────────────────────────
log "Pulling origin/main..."
git pull origin main

CURRENT_SHA=$(git rev-parse --short HEAD)
log "HEAD after pull:  ${CURRENT_SHA}"
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 4: decide if we need to deploy
#
# We compare against .last-deployed-sha (recorded by our previous successful
# run) — NOT against the pre-pull HEAD. This is the fix for the bug found in
# Section 54: the mep-webhook process auto-pulls on push, which would
# otherwise make the pre/post-pull comparison return "no changes" even when
# the public/ bundle is stale relative to git HEAD.
# ──────────────────────────────────────────────────────────────────────────────
if [ -n "${LAST_DEPLOYED}" ] && [ "${LAST_DEPLOYED}" = "${CURRENT_SHA}" ]; then
  log "Already deployed at ${CURRENT_SHA} — true no-op."
  log "Restarting pm2 anyway to pick up any .env changes..."
  pm2 restart "${PM2_APP}" --update-env
  log "=== Deploy complete (no-op for code; pm2 restarted) ==="
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────────
# Step 5: detect what changed since last deploy
# ──────────────────────────────────────────────────────────────────────────────
if [ -z "${LAST_DEPLOYED}" ]; then
  log "First run via this script — forcing full backend + frontend + landing deploy."
  BACKEND_CHANGED="(initial)"
  FRONTEND_CHANGED="(initial)"
  LANDING_CHANGED="(initial)"
else
  log "Diffing ${LAST_DEPLOYED}..${CURRENT_SHA}"
  CHANGED=$(git diff --name-only "${LAST_DEPLOYED}..${CURRENT_SHA}" 2>/dev/null || echo "(diff-failed)")

  if [ "${CHANGED}" = "(diff-failed)" ]; then
    log "WARN: diff failed (last-deployed SHA may be unreachable from HEAD)."
    log "Falling back to full deploy."
    BACKEND_CHANGED="(diff-failed)"
    FRONTEND_CHANGED="(diff-failed)"
    LANDING_CHANGED="(diff-failed)"
  else
    BACKEND_CHANGED=$(echo "${CHANGED}" | grep -E "^(routes/|services/|middleware/|lib/|jobs/|migrations/|index\.js|app\.js|db\.js|seed\.js|package\.json|package-lock\.json)" || true)
    FRONTEND_CHANGED=$(echo "${CHANGED}" | grep -E "^mep-frontend/(src/|public/|index\.html|package\.json|package-lock\.json|vite\.config|tailwind\.config)" || true)
    LANDING_CHANGED=$(echo "${CHANGED}" | grep -E "^constrai-landing/" || true)
  fi
fi

log "Changed areas:"
[ -n "${BACKEND_CHANGED}" ]  && log "  backend:  yes" || log "  backend:  no"
[ -n "${FRONTEND_CHANGED}" ] && log "  frontend: yes" || log "  frontend: no"
[ -n "${LANDING_CHANGED}" ]  && log "  landing:  yes" || log "  landing:  no"
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 6: backend install (if needed)
# ──────────────────────────────────────────────────────────────────────────────
if [ -n "${BACKEND_CHANGED}" ]; then
  log "Backend changed — running npm install --production..."
  # Husky postinstall fails harmlessly under --production; tolerate it.
  npm install --production --no-audit --no-fund || \
    log "WARN: npm install exited non-zero (usually husky postinstall — non-fatal)"
else
  log "Backend unchanged — skipping npm install"
fi
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 7: frontend install + build + deploy (if needed)
# ──────────────────────────────────────────────────────────────────────────────
if [ -n "${FRONTEND_CHANGED}" ]; then
  log "Frontend changed — installing deps..."
  cd "${FRONTEND_DIR}"
  npm install --no-audit --no-fund || \
    log "WARN: npm install exited non-zero (non-fatal)"

  log "Building frontend (vite)..."
  npm run build

  log "Syncing dist → public (nginx-served)..."
  rsync -av --delete "${FRONTEND_DIR}/dist/" "${PUBLIC_DIR}/" | tail -5

  log "Frontend deployed ✓"
  cd "${REPO_DIR}"
else
  log "Frontend unchanged — skipping build + rsync"
fi
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 7b: landing-page rsync (Section 64)
#
# /var/www/constrai-landing/ is NOT a git repo on prod (per Section 60). It's
# served by nginx for https://www.constrai.ca. Source files live in
# constrai-landing/ inside this repo. When those source files change, sync
# them to the nginx-served path. No build step — pure static.
#
# rsync without --delete: keeps any prod-only files (e.g., manually-uploaded
# assets that aren't in the repo). If we ever need to remove orphans, switch
# to --delete in a controlled section.
# ──────────────────────────────────────────────────────────────────────────────
if [ -n "${LANDING_CHANGED}" ]; then
  log "Landing page changed — syncing ${LANDING_SRC_DIR}/ → ${LANDING_PUBLIC_DIR}/..."
  if [ ! -d "${LANDING_PUBLIC_DIR}" ]; then
    err "Landing public dir ${LANDING_PUBLIC_DIR} does not exist — skipping landing sync."
    err "Create it manually if this is the first deploy of the landing page."
  else
    rsync -av "${LANDING_SRC_DIR}/" "${LANDING_PUBLIC_DIR}/" | tail -5
    log "Landing page deployed ✓"
  fi
else
  log "Landing page unchanged — skipping rsync"
fi
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 8: pm2 restart (always — picks up env + new code)
# ──────────────────────────────────────────────────────────────────────────────
log "Restarting pm2 ${PM2_APP}..."
pm2 restart "${PM2_APP}" --update-env
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 9: verify health
# ──────────────────────────────────────────────────────────────────────────────
log "Waiting 3s for backend warmup..."
sleep 3

log "Verifying ${HEALTH_URL}..."
HEALTH=$(curl -fsS "${HEALTH_URL}" || echo "FAILED")
if [[ "${HEALTH}" == *"\"ok\":true"* ]]; then
  log "Deep health probe: ok ✓"
  echo "${HEALTH}" | head -c 400
  echo
else
  err "Deep health probe FAILED. Response below."
  echo "${HEALTH}"
  err "Consider manual rollback: cd ${REPO_DIR} && git reset --hard ${PRE_PULL_SHA}"
  err "(.last-deployed-sha NOT updated — re-run after fix.)"
  exit 1
fi
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 10: record successful deploy
# ──────────────────────────────────────────────────────────────────────────────
echo "${CURRENT_SHA}" > "${DEPLOYED_SHA_FILE}"
log "Recorded deployed SHA: ${CURRENT_SHA} → ${DEPLOYED_SHA_FILE}"
echo

# ──────────────────────────────────────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────────────────────────────────────
log "=== Deploy complete ==="
if [ -n "${LAST_DEPLOYED}" ]; then
  log "  ${LAST_DEPLOYED} → ${CURRENT_SHA}"
else
  log "  (first deploy) → ${CURRENT_SHA}"
fi
log "  pm2 ${PM2_APP}: restarted"
log "  Health: ok"
