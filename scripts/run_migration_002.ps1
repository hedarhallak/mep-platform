# scripts/run_migration_002.ps1
# Usage: powershell -ExecutionPolicy Bypass -File scripts/run_migration_002.ps1

node scripts/run_sql_file.js db/migrations/002_assignment_requests.sql
