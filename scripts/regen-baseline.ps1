# scripts/regen-baseline.ps1 — regenerate db/schema_baseline_<date>.sql
#
# Replaces the manual 5-step process from Section 76 (DECISIONS.md) with one
# command. Encodes the gotchas we hit during the C5 baseline consolidation:
#
#   1. PG version match — use postgis/postgis:16-3.4, NOT 14. The 14 image
#      chokes on `\restrict` which pg_dump 17+ emits.
#   2. Roles must exist — create `mepuser` and `postgres` as SUPERUSER before
#      applying migrations, otherwise OWNER TO statements error.
#   3. Strip \restrict / \unrestrict — PG 17+ pg_dump emits these as session
#      security guards. PG 16 client doesn't recognize them.
#   4. Use --schema=public --no-owner --no-acl when dumping — skips
#      `tiger`/`tiger_data`/`topology` (PostGIS extension schemas the image
#      installs but prod doesn't have) and skips role/permission bloat.
#   5. Use Out-File -Encoding utf8, NEVER `>` redirect — the `>` operator
#      defaults to UTF-16 LE in PowerShell, which silently produces a 0-line
#      file at double the byte size. Same root cause as Section 66's
#      `.gitignore` UTF-16 corruption.
#
# Usage:
#   .\scripts\regen-baseline.ps1
#   .\scripts\regen-baseline.ps1 -OutputDate "2026-06-01"
#
# Outputs `db/schema_baseline_<OutputDate>.sql`. Defaults to today's date.
#
# Prerequisites:
#   - Docker Desktop running.
#   - cwd is the project root (so migrations/ + db/ resolve correctly).

[CmdletBinding()]
param(
    [string]$OutputDate = (Get-Date -Format "yyyy-MM-dd"),
    [string]$ContainerName = "mep-test-db",
    [int]$Port = 5433,
    [string]$Image = "postgis/postgis:16-3.4"
)

$ErrorActionPreference = "Stop"

$outputPath = "db/schema_baseline_$OutputDate.sql"
Write-Host "→ Target output: $outputPath"

Write-Host "`n=== Step 1: Reset Docker container ($ContainerName) ===" -ForegroundColor Cyan
docker rm -f $ContainerName 2>$null | Out-Null
docker run -d --name $ContainerName `
    -e POSTGRES_USER=meptest `
    -e POSTGRES_PASSWORD=meptest `
    -e POSTGRES_DB=meptestdb `
    -p ${Port}:5432 `
    $Image | Out-Null

Write-Host "→ Waiting 8s for Postgres to boot..."
Start-Sleep -Seconds 8

Write-Host "`n=== Step 2: Create roles referenced by the baseline dump ===" -ForegroundColor Cyan
docker exec $ContainerName psql -U meptest -d meptestdb -c `
    "CREATE ROLE mepuser SUPERUSER; CREATE ROLE postgres SUPERUSER;" | Out-Null

Write-Host "`n=== Step 3: Apply all migrations in order ===" -ForegroundColor Cyan
$migrations = Get-ChildItem migrations\*.sql | Sort-Object Name
foreach ($m in $migrations) {
    Write-Host "  Applying $($m.Name)..."
    $content = Get-Content $m.FullName -Raw
    # Strip pg_dump 17+ \restrict / \unrestrict (security guard, harmless to skip)
    $content = $content -replace '(?m)^\\(restrict|unrestrict).*$', ''
    $content | docker exec -i $ContainerName psql -U meptest -d meptestdb -v ON_ERROR_STOP=1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED on $($m.Name)" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=== Step 4: pg_dump --schema=public into $outputPath ===" -ForegroundColor Cyan
# Out-File -Encoding utf8 is mandatory — `>` produces UTF-16 LE 0-line files.
docker exec $ContainerName pg_dump -U meptest -d meptestdb `
    --no-owner --no-acl --schema=public `
    | Out-File -Encoding utf8 $outputPath

Write-Host "`n=== Step 5: Verify ===" -ForegroundColor Cyan
$lines = (Get-Content $outputPath | Measure-Object -Line).Lines
$tables = (Select-String -Path $outputPath -Pattern "^CREATE TABLE" | Measure-Object).Count
Write-Host "  $outputPath  → $lines lines, $tables tables"

if ($lines -lt 1000 -or $tables -lt 20) {
    Write-Host "WARNING: output looks suspiciously small. Check encoding (UTF-8 expected, not UTF-16)." -ForegroundColor Yellow
}

Write-Host "`n=== Step 6: Stop the test container ===" -ForegroundColor Cyan
docker rm -f $ContainerName 2>$null | Out-Null

Write-Host "`n✅ Done. Review $outputPath, then update CLAUDE.md (Step 4 reference) if needed." -ForegroundColor Green
