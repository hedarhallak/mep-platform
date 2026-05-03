#!/usr/bin/env bash
# Constrai prod deploy script.
#
# Usage (from prod server, after `ssh root@143.110.218.84`):
#   bash /var/www/mep/scripts/deploy.sh
#
# Encodes the 10-step deploy sequence documented in DECISIONS.md Section 52.
# Idempotent: running twice in a row is safe — second run is a no-op when
# main hasn't moved.
#
# What it does:
#   1. Verifies we're on `main` and captures the starting commit
#   2. Backs up backend `.env` (timestamped)
#   3. Resets known package-lock.json drift (from prior npm-install runs on prod)
#   4. Pulls latest from origin/main
#   5. Detects which areas changed (backend / frontend) — skips work where it can
#   6. Runs `npm install --production` on backend if backend touched
#   7. Runs `npm install` + `npm run build` + `rsync` on frontend if frontend touched
#   8. Restarts pm2 mep-backend with --update-env (always — picks up .env changes)
#   9. Verifies https://app.constrai.ca/api/health/deep returns ok=true
#  10. Prints a summary
#
# What it does NOT do:
#   - Run database migrations (intentional — migrations should be explicit;
#     run `node scripts/migrate.js` separately when needed)
#   - Roll back on failure (manual rollback: `git reset --hard <BEFORE_SHA>`
#     then re-run this script)
#   - Touch the marketing landing page (separate path: /var/www/constrai-landing)

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────────────────────────────────────
REPO_DIR="/var/www/mep"
FRONTEND_DIR="${REPO_DIR}/mep-frontend"
PUBLIC_DIR="${REPO_DIR}/public"
PM2_APP="mep-backend"
HEALTH_URL="https://app.constrai.ca/api/health/deep"

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
log "PM2 app:  ${PM2_APP}"
echo

cd "${REPO_DIR}"

# 1. Must be on main
CURRENT_BRANCH=$(git branch --show-current)
if [ "${CURRENT_BRANCH}" != "main" ]; then
  err "Not on main (currently on '${CURRENT_BRANCH}'). Aborting."
  exit 1
fi
log "On branch main ✓"

# 2. Capture starting commit
BEFORE_SHA=$(git rev-parse --short HEAD)
log "Starting at commit ${BEFORE_SHA}"

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

AFTER_SHA=$(git rev-parse --short HEAD)
if [ "${BEFORE_SHA}" = "${AFTER_SHA}" ]; then
  log "Already at latest (${AFTER_SHA}) — nothing new to deploy."
  log "Restarting pm2 anyway to pick up any .env changes..."
  pm2 restart "${PM2_APP}" --update-env
  log "=== Deploy complete (no-op for code; pm2 restarted) ==="
  exit 0
fi

COMMITS_PULLED=$(git rev-list --count "${BEFORE_SHA}..${AFTER_SHA}")
log "Pulled ${COMMITS_PULLED} commit(s): ${BEFORE_SHA} → ${AFTER_SHA}"
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 4: detect what changed
# ──────────────────────────────────────────────────────────────────────────────
CHANGED=$(git diff --name-only "${BEFORE_SHA}..${AFTER_SHA}")
BACKEND_CHANGED=$(echo "${CHANGED}" | grep -E "^(routes/|services/|middleware/|lib/|jobs/|migrations/|index\.js|app\.js|db\.js|seed\.js|package\.json|package-lock\.json)" || true)
FRONTEND_CHANGED=$(echo "${CHANGED}" | grep -E "^mep-frontend/(src/|public/|index\.html|package\.json|package-lock\.json|vite\.config|tailwind\.config)" || true)

log "Changed areas:"
[ -n "${BACKEND_CHANGED}" ]  && log "  backend:  yes" || log "  backend:  no"
[ -n "${FRONTEND_CHANGED}" ] && log "  frontend: yes" || log "  frontend: no"
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 5: backend install (if needed)
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
# Step 6: frontend install + build + deploy (if needed)
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
# Step 7: pm2 restart (always — picks up env + new code)
# ──────────────────────────────────────────────────────────────────────────────
log "Restarting pm2 ${PM2_APP}..."
pm2 restart "${PM2_APP}" --update-env
echo

# ──────────────────────────────────────────────────────────────────────────────
# Step 8: verify health
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
  err "Consider manual rollback: cd ${REPO_DIR} && git reset --hard ${BEFORE_SHA}"
  exit 1
fi
echo

# ──────────────────────────────────────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────────────────────────────────────
log "=== Deploy complete ==="
log "  ${BEFORE_SHA} → ${AFTER_SHA} (${COMMITS_PULLED} commit(s))"
log "  pm2 ${PM2_APP}: restarted"
log "  Health: ok"
