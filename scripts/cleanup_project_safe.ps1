# scripts/cleanup_project_safe.ps1
# Safe project cleanup (NO deletes). Moves legacy/backup/REPLACEMENT files into _archive folders.
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\cleanup_project_safe.ps1
#
# Rules:
# - Never deletes files, only moves.
# - Skips if source doesn't exist.
# - Skips if destination already exists (to avoid overwriting).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$p) {
  if (!(Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

function Move-Safe([string]$src, [string]$dst) {
  if (!(Test-Path -LiteralPath $src)) { return }
  if (Test-Path -LiteralPath $dst) {
    Write-Host "SKIP (dest exists): $dst" -ForegroundColor Yellow
    return
  }
  $dstDir = Split-Path -Parent $dst
  Ensure-Dir $dstDir
  Move-Item -LiteralPath $src -Destination $dst
  Write-Host "MOVED: $src -> $dst" -ForegroundColor Green
}

$root = (Get-Location).Path

# --- Archive roots ---
$arcRoot = Join-Path $root "_archive"
$arcBackups = Join-Path $arcRoot "backups"
$arcPublic  = Join-Path $arcRoot "public"
$arcScripts = Join-Path $arcRoot "scripts"
$arcRoutes  = Join-Path $arcRoot "routes"
$arcDocs    = Join-Path $arcRoot "docs"
Ensure-Dir $arcBackups
Ensure-Dir $arcPublic
Ensure-Dir $arcScripts
Ensure-Dir $arcRoutes
Ensure-Dir $arcDocs

# --- 1) Move backup folders (backup_*, backup_stable, backup_fix_*) ---
Get-ChildItem -LiteralPath $root -Directory |
  Where-Object { $_.Name -like "backup_*" } |
  ForEach-Object {
    Move-Safe $_.FullName (Join-Path $arcBackups $_.Name)
  }

# --- 2) Root stray backups ---
Move-Safe (Join-Path $root "index.backup.js") (Join-Path $arcRoot "index.backup.js")
Move-Safe (Join-Path $root "indexbackup.js")  (Join-Path $arcRoot "indexbackup.js")

# --- 3) db/migrations: keep only active, archive failed/obsolete attempts ---
$migDir = Join-Path $root "db\migrations"
$migArc = Join-Path $migDir "_archive"
Ensure-Dir $migArc

$migArchiveList = @(
  "005_signup_company_employee_codes.sql",
  "005b_signup_company_employee_codes_NO_FK.sql",
  "005e_fix_app_users_role_check_add_worker.sql",
  "005e2_fix_app_users_role_check_normalize.sql"
)

foreach ($f in $migArchiveList) {
  Move-Safe (Join-Path $migDir $f) (Join-Path $migArc $f)
}

# --- 4) public: move REPLACEMENT/backups/stray sql into archive ---
$pub = Join-Path $root "public"
$pubArc = Join-Path $pub "_archive"
Ensure-Dir $pubArc

Move-Safe (Join-Path $pub "003_rebuild_assignments_table.sql") (Join-Path $pubArc "003_rebuild_assignments_table.sql")
Move-Safe (Join-Path $pub "assignments_v2.REPLACEMENT.step2.html") (Join-Path $pubArc "assignments_v2.REPLACEMENT.step2.html")
Move-Safe (Join-Path $pub "assignments_v2backup.html") (Join-Path $pubArc "assignments_v2backup.html")

Move-Safe (Join-Path $pub "assignments-v2") (Join-Path $pubArc "assignments-v2")

# --- 5) routes: move explicit backups ---
$routes = Join-Path $root "routes"
Move-Safe (Join-Path $routes "assignment_requests.backup.js") (Join-Path $arcRoutes "assignment_requests.backup.js")

# --- 6) scripts: archive failed seed v1, keep v2 ---
$scripts = Join-Path $root "scripts"
Move-Safe (Join-Path $scripts "seed_codes_company_employee.js") (Join-Path $arcScripts "seed_codes_company_employee.js")

# --- 7) docs: optional patch notes ---
Move-Safe (Join-Path $root "docs\PATCH_index_add_assignment_requests.md") (Join-Path $arcDocs "PATCH_index_add_assignment_requests.md")

Write-Host ""
Write-Host "DONE. Nothing deleted. Review moved files under: $arcRoot" -ForegroundColor Cyan
Write-Host "Next: restart server and open http://localhost:3000/app.html to confirm everything still works." -ForegroundColor Cyan
