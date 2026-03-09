# cleanup_duplicates.ps1
# Run from the mep-site-backend folder:
#   powershell -ExecutionPolicy Bypass -File .\tools\cleanup_duplicates.ps1
# This script removes duplicate/old UI files that can cause the app to load the wrong version.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $root  # back to mep-site-backend

$targets = @(
  "public\assignments_v2.REPLACEMENT.step2.html",
  "public\assignments_v2backup.html",
  "public\assignments.html",
  "public\assignments.js",
  "public\003_rebuild_assignments_table.sql",
  "public\assignments-v2"   # directory
)

Write-Host "MEP Cleanup: removing duplicate/old UI files..." -ForegroundColor Cyan

foreach ($t in $targets) {
  $p = Join-Path $root $t
  if (Test-Path $p) {
    if ((Get-Item $p).PSIsContainer) {
      Remove-Item $p -Recurse -Force
      Write-Host "Removed folder: $t" -ForegroundColor Yellow
    } else {
      Remove-Item $p -Force
      Write-Host "Removed file: $t" -ForegroundColor Yellow
    }
  } else {
    Write-Host "Not found (skip): $t" -ForegroundColor DarkGray
  }
}

Write-Host "Cleanup DONE. Now restart server and hard reload (Ctrl+Shift+R)." -ForegroundColor Green
