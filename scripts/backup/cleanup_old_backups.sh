#!/bin/bash
# ============================================================================
# MEP Platform — Retention Cleanup for DB Backups
# Location on server: /var/www/mep/scripts/backup/cleanup_old_backups.sh
# Policy: keep 7 daily, 4 weekly, 3 monthly
# ============================================================================

set -euo pipefail

CONFIG_FILE="/etc/mep-backup.env"
# shellcheck source=/dev/null
source "$CONFIG_FILE"
: "${SPACES_BUCKET:?SPACES_BUCKET not set}"

LOG_FILE="/var/log/mep-backup.log"
DAILY_KEEP=7
WEEKLY_KEEP=4
MONTHLY_KEEP=3

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [cleanup] $*" | tee -a "$LOG_FILE"
}

log "===== Starting retention cleanup ====="

# Usage: cleanup_prefix <folder> <keep_count>
cleanup_prefix() {
    local prefix=$1
    local keep=$2

    log "Scanning s3://${SPACES_BUCKET}/${prefix}/ (keep last $keep)"

    # s3cmd ls output: "2026-04-18 03:00    12345   s3://bucket/path/file.gz"
    # Sort by date+time (fields 1 and 2) DESCENDING; skip first $keep rows; delete the rest
    local deleted=0
    while IFS= read -r path; do
        [ -z "$path" ] && continue
        log "Deleting old backup: $path"
        s3cmd del "$path"
        deleted=$((deleted + 1))
    done < <(
        s3cmd ls "s3://${SPACES_BUCKET}/${prefix}/" \
            | awk '$1 ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ {print}' \
            | sort -k1,1 -k2,2 -r \
            | awk -v keep="$keep" 'NR > keep {print $4}'
    )
    log "Deleted $deleted file(s) from $prefix/"
}

cleanup_prefix "daily"   "$DAILY_KEEP"
cleanup_prefix "weekly"  "$WEEKLY_KEEP"
cleanup_prefix "monthly" "$MONTHLY_KEEP"

log "===== Cleanup complete ====="
