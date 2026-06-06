# ship.ps1 -- one-command PR helper for Constrai (DECISIONS section 139).
#
# Turns the 7-step PR ritual (branch, add, commit, push, pr create, pr merge)
# into ONE line. Stages ONLY the files you name (explicit paths -- Pitfall #29 --
# so EOL churn / unrelated edits never sneak in).
#
# ASCII-only on purpose: Windows PowerShell mis-reads non-ASCII bytes in a
# UTF-8-no-BOM script and throws "string is missing the terminator". Keep it ASCII.
#
# Usage (from the repo root, with your edits already on disk):
#   .\ship.ps1 -Message "feat(x): short summary" -Files routes/x.js,tests/x.test.js
#   .\ship.ps1 -Message "fix(auth): ..." -Files routes/auth.js -Branch fix/auth-thing
#
# After it runs, watch CI with:  gh pr checks
# The PR auto-merges (squash) once all checks pass.
#
# Requires: git + GitHub CLI (gh) authenticated. Run from PowerShell.

param(
  [Parameter(Mandatory = $true)][string]$Message,
  [Parameter(Mandatory = $true)][string[]]$Files,
  [string]$Branch,
  [string]$Base = "main"
)

$ErrorActionPreference = "Stop"

# Derive a branch name from the commit message if none was given.
if (-not $Branch) {
  $slug = $Message -replace '^[a-z]+\([^)]*\):\s*', ''   # drop "feat(x): "
  $slug = $slug -replace '[^a-zA-Z0-9]+', '-'
  $slug = $slug.ToLower().Trim('-')
  if ($slug.Length -gt 40) { $slug = $slug.Substring(0, 40).Trim('-') }
  $Branch = "feat/$slug"
}

Write-Host ">> Branch : $Branch  (base: $Base)" -ForegroundColor Cyan
Write-Host ">> Files  : $($Files -join ', ')" -ForegroundColor Cyan

# Fresh branch off the latest remote base -- carries your working-tree edits.
git fetch origin
git checkout -b $Branch "origin/$Base"

# Stage ONLY the named files, then show what will be committed.
git add -- $Files
Write-Host ""
Write-Host ">> Staged:" -ForegroundColor Cyan
git status --short

git commit -m $Message
git push -u origin $Branch

gh pr create --fill --base $Base
gh pr merge --auto --squash --delete-branch

Write-Host ""
Write-Host "OK - PR opened + auto-merge armed (squash)." -ForegroundColor Green
Write-Host "   Watch checks:  gh pr checks" -ForegroundColor Green
Write-Host "   After merge, clean local:  git checkout $Base; git pull; git branch -D $Branch" -ForegroundColor DarkGray
