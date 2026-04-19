#!/bin/bash
# ============================================================================
# MEP Platform — Daily Database Backup
# Location on server: /var/www/mep/scripts/backup/backup_db.sh
# Runs via cron daily; uploads to DigitalOcean Spaces
# ============================================================================

set -euo pipefail

# ---- Load config (holds secrets: DB password, Spaces endpoint) --------------
CONFIG_FILE="/etc/mep-backup.env"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: config file $CONFIG_FILE not found" >&2
    exit 1
fi
# shellcheck source=/dev/null
source "$CONFIG_FILE"

# ---- Required config variables ---------------------------------------------
: "${DB_NAME:?DB_NAME not set in $CONFIG_FILE}"
: "${DB_USER:?DB_USER not set in $CONFIG_FILE}"
: "${DB_PASSWORD:?DB_PASSWORD not set in $CONFIG_FILE}"
: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${SPACES_BUCKET:?SPACES_BUCKET not set in $CONFIG_FILE}"

# ---- Constants -------------------------------------------------------------
LOG_FILE="/var/log/mep-backup.log"
TMP_DIR="$(mktemp -d -t mep-backup-XXXXXX)"
LOCK_FILE="/var/run/mep-backup.lock"
DATE=$(date +%Y-%m-%d_%H-%M)
DAY_OF_WEEK=$(date +%u)    # 1=Mon ... 7=Sun
DAY_OF_MONTH=$(date +%d)

# ---- Logging ---------------------------------------------------------------
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ---- Cleanup on exit -------------------------------------------------------
cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# ---- Prevent concurrent runs -----------------------------------------------
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    log "ERROR: another backup is already running — abort"
    exit 1
fi

log "===== Starting backup for database '$DB_NAME' ====="

# ---- Step 1: pg_dump -------------------------------------------------------
DUMP_FILE="$TMP_DIR/mepdb_${DATE}.sql"
log "Running pg_dump..."
export PGPASSWORD="$DB_PASSWORD"
# Note: ownership info is INCLUDED (no --no-owner) so restore as postgres
# superuser correctly reassigns objects back to mepuser. Required because
# PostGIS extension creation needs superuser at restore time.
pg_dump \
    -U "$DB_USER" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -d "$DB_NAME" \
    --clean \
    --if-exists \
    --format=plain \
    > "$DUMP_FILE"
unset PGPASSWORD

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "pg_dump done — size: $DUMP_SIZE"

# ---- Step 2: sanity check --------------------------------------------------
if [ ! -s "$DUMP_FILE" ]; then
    log "ERROR: dump file is empty — abort"
    exit 2
fi

if ! head -c 4096 "$DUMP_FILE" | grep -q "PostgreSQL database dump"; then
    log "ERROR: dump file header does not look like a valid pg_dump — abort"
    exit 3
fi

# Basic row-count sanity: expect at least one CREATE TABLE statement
CREATE_COUNT=$(grep -c "^CREATE TABLE" "$DUMP_FILE" || true)
if [ "$CREATE_COUNT" -lt 10 ]; then
    log "ERROR: dump contains only $CREATE_COUNT CREATE TABLE statements — suspicious, abort"
    exit 4
fi
log "Sanity check passed ($CREATE_COUNT CREATE TABLE statements found)"

# ---- Step 3: compress ------------------------------------------------------
log "Compressing..."
gzip -9 "$DUMP_FILE"
DUMP_FILE="${DUMP_FILE}.gz"
COMPRESSED_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "Compressed — final size: $COMPRESSED_SIZE"

# ---- Step 4: upload to Spaces ---------------------------------------------
FILENAME="$(basename "$DUMP_FILE")"
DAILY_PATH="s3://${SPACES_BUCKET}/daily/${FILENAME}"

log "Uploading to $DAILY_PATH ..."
s3cmd put "$DUMP_FILE" "$DAILY_PATH" --no-progress

# Verify upload by listing
if ! s3cmd ls "$DAILY_PATH" | grep -q "$FILENAME"; then
    log "ERROR: upload verification failed — file not found in Spaces"
    exit 5
fi
log "Upload verified"

# ---- Step 5: copy to weekly (Sundays) --------------------------------------
if [ "$DAY_OF_WEEK" = "7" ]; then
    WEEK_LABEL=$(date +%Y-W%V)
    WEEKLY_PATH="s3://${SPACES_BUCKET}/weekly/mepdb_${WEEK_LABEL}.sql.gz"
    log "Sunday — also copying to $WEEKLY_PATH"
    s3cmd cp "$DAILY_PATH" "$WEEKLY_PATH"
fi

# ---- Step 6: copy to monthly (1st of month) --------------------------------
if [ "$DAY_OF_MONTH" = "01" ]; then
    MONTH_LABEL=$(date +%Y-%m)
    MONTHLY_PATH="s3://${SPACES_BUCKET}/monthly/mepdb_${MONTH_LABEL}.sql.gz"
    log "1st of month — also copying to $MONTHLY_PATH"
    s3cmd cp "$DAILY_PATH" "$MONTHLY_PATH"
fi

log "===== Backup complete ====="

# ---- Optional healthcheck ping --------------------------------------------
if [ -n "${HEALTHCHECK_URL:-}" ]; then
    curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" > /dev/null && log "Healthcheck pinged" || log "Healthcheck ping failed (non-fatal)"
fi
