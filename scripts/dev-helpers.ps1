# scripts/dev-helpers.ps1 -- PowerShell shortcuts for the per-PR boilerplate.
#
# Usage:
#   1. Once per shell: . .\scripts\dev-helpers.ps1   (dot-sourced)
#   2. Or add to $PROFILE so it auto-loads.
#
# Provides:
#   New-FeatureBranch <name>   Stashes, syncs main, creates a fresh branch,
#                              re-pops stash. Replaces the 6-step recipe we
#                              ran on every PR today.
#   Push-FeatureBranch         Adds all, commits with a message, pushes.
#                              Use sparingly -- a real commit deserves a
#                              real message; this shortcut is for trivial
#                              follow-ups.

function New-FeatureBranch {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$BranchName
    )
    $hasChanges = (git status --porcelain).Length -gt 0
    if ($hasChanges) {
        Write-Host "→ stashing working tree..." -ForegroundColor Cyan
        git stash | Out-Null
    }
    Write-Host "→ syncing main with origin..." -ForegroundColor Cyan
    git checkout main | Out-Null
    git fetch origin main | Out-Null
    git reset --hard origin/main | Out-Null
    Write-Host "→ creating branch '$BranchName'..." -ForegroundColor Cyan
    # Force-delete in case a previous attempt left the branch behind
    git branch -D $BranchName 2>$null | Out-Null
    git checkout -b $BranchName | Out-Null
    if ($hasChanges) {
        Write-Host "→ restoring stash..." -ForegroundColor Cyan
        git stash pop | Out-Null
    }
    Write-Host "`n=== STATUS ===" -ForegroundColor Green
    git status
}

function Push-FeatureBranch {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )
    git add -A
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Commit failed -- aborting push." -ForegroundColor Red
        return
    }
    $branch = git rev-parse --abbrev-ref HEAD
    git push -u origin $branch
}
