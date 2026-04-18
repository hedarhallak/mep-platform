#!/bin/bash
# ============================================================================
# MEP Platform — Database Restore From Backup
# Location on server: /var/www/mep/scripts/backup/restore_db.sh
#
# Usage:
#   ./restore_db.sh <s3_path> [target_db_name]
#
# Examples:
#   # List available backups first:
#   s3cmd ls s3://constrai-backups/daily/
#   s3cmd ls s3://constrai-backups/weekly/
#   s3cmd ls s3://constrai-backups/monthly/
#
#   # Restore to a test DB (safe — does NOT touch production mepdb):
#   ./restore_db.sh s3://constrai-backups/daily/mepdb_2026-04-18_03-00.sql.gz
#
#   # Restore to a specific target DB:
#   ./restore_db.sh s3://constrai-backups/daily/mepdb_2026-04-18_03-00.sql.gz mepdb_test
# ============================================================================

set -euo pipefail

CONFIG_FILE="/etc/mep-backup.env"
# shellcheck source=/dev/null
source "$CONFIG_FILE"
: "${DB_USER:?DB_USER not set}"
: "${DB_PASSWORD:?DB_PASSWORD not set}"
: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"

if [ $# -lt 1 ]; then
    cat <<EOF
Usage: $0 <s3_path> [target_db_name]

Examples:
  $0 s3://${SPACES_BUCKET:-constrai-backups}/daily/mepdb_2026-04-18_03-00.sql.gz
  $0 s3://${SPACES_BUCKET:-constrai-backups}/daily/mepdb_2026-04-18_03-00.sql.gz mepdb_test

List available backups:
  s3cmd ls s3://${SPACES_BUCKET:-constrai-backups}/daily/
  s3cmd ls s3://${SPACES_BUCKET:-constrai-backups}/weekly/
  s3cmd ls s3://${SPACES_BUCKET:-constrai-backups}/monthly/
EOF
    exit 1
fi

S3_PATH=$1
TARGET_DB=${2:-mepdb_restored}

# Safety: block accidentally restoring directly over production
if [ "$TARGET_DB" = "mepdb" ]; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  DANGER — target is the PRODUCTION database 'mepdb'            ║"
    echo "║  Recommended procedure:                                        ║"
    echo "║    1. Restore into a different name (e.g. mepdb_restored)      ║"
    echo "║    2. Verify the restore is correct                            ║"
    echo "║    3. Swap databases via ALTER DATABASE RENAME                 ║"
    echo "║                                                                ║"
    echo "║  If you still want to restore directly over mepdb, type:       ║"
    echo "║    OVERWRITE PRODUCTION                                        ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    read -r -p "> " confirm
    if [ "$confirm" != "OVERWRITE PRODUCTION" ]; then
        echo "Aborted."
        exit 1
    fi
fi

TMP_DIR="$(mktemp -d -t mep-restore-XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

LOCAL_GZ="$TMP_DIR/$(basename "$S3_PATH")"
LOCAL_SQL="${LOCAL_GZ%.gz}"

echo "==> Downloading from $S3_PATH ..."
s3cmd get "$S3_PATH" "$LOCAL_GZ" --force --no-progress

echo "==> Decompressing ..."
gunzip "$LOCAL_GZ"

SQL_SIZE=$(du -h "$LOCAL_SQL" | cut -f1)
echo "    SQL file ready: $LOCAL_SQL ($SQL_SIZE)"

echo ""
echo "==> About to restore into database: '$TARGET_DB'"
echo "    If this database exists, it will be DROPPED and recreated."
read -r -p "Continue? (yes/no) " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

export PGPASSWORD="$DB_PASSWORD"

echo "==> Dropping + recreating '$TARGET_DB' ..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";"
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d postgres -c "CREATE DATABASE \"$TARGET_DB\";"

echo "==> Restoring (this may take a minute) ..."
psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -f "$LOCAL_SQL" > /dev/null

unset PGPASSWORD

echo ""
echo "==> Restore complete. Database: $TARGET_DB"
echo ""
echo "Quick verification commands:"
echo "  sudo -u postgres psql -d $TARGET_DB -c '\\dt' | head -20"
echo "  sudo -u postgres psql -d $TARGET_DB -c 'SELECT COUNT(*) AS users FROM users;'"
echo "  sudo -u postgres psql -d $TARGET_DB -c 'SELECT COUNT(*) AS employees FROM employees;'"
echo ""
if [ "$TARGET_DB" != "mepdb" ]; then
    echo "To promote the restored DB to production (after verification):"
    echo "  pm2 stop mep-backend"
    echo "  sudo -u postgres psql -d postgres -c 'ALTER DATABASE mepdb RENAME TO mepdb_old_$(date +%Y%m%d);'"
    echo "  sudo -u postgres psql -d postgres -c 'ALTER DATABASE $TARGET_DB RENAME TO mepdb;'"
    echo "  pm2 start mep-backend"
fi
