# Pricekeep Update & Run (PowerShell). Prefer double-clicking update.bat.
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "Pricekeep Update & Run"

Write-Host ""
Write-Host " Pricekeep -- Update & Run"
Write-Host " ========================="
Write-Host " Project: $PWD"
Write-Host ""

function Wait-ForKey([string]$Message) {
  Write-Host ""
  Write-Host $Message
  Read-Host "Press Enter to close"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Wait-ForKey "Git was not found on PATH. Install Git for Windows from https://git-scm.com/download/win"
  exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Wait-ForKey "Node.js was not found on PATH. Install Node.js 20+ from https://nodejs.org"
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Wait-ForKey "npm was not found on PATH."
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "package.json"))) {
  Wait-ForKey "package.json not found in $PWD."
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot ".git"))) {
  Wait-ForKey "Not a Git checkout. Clone https://github.com/s3xyberries/Wishlist first."
  exit 1
}

Write-Host "Node $(node -v)"
Write-Host "$(git --version)"
Write-Host ""

$lock = Join-Path $PSScriptRoot "package-lock.json"
if (Test-Path -LiteralPath $lock) {
  Write-Host "Resetting package-lock.json to match the last commit..."
  git checkout -- package-lock.json
}

Write-Host ""
Write-Host "Pulling latest from Git..."
git pull
if ($LASTEXITCODE -ne 0) {
  Wait-ForKey "git pull failed. Commit/stash local edits, or: git checkout -- package-lock.json"
  exit 1
}

Write-Host ""
Write-Host "Cleaning build output (.next + caches)..."
npm run clean
if ($LASTEXITCODE -ne 0) {
  Write-Host "npm run clean failed -- removing .next manually..."
  $nextDir = Join-Path $PSScriptRoot ".next"
  if (Test-Path -LiteralPath $nextDir) {
    Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ""
Write-Host "Installing dependencies (npm install)..."
npm install
if ($LASTEXITCODE -ne 0) {
  Wait-ForKey "npm install failed. Try: npm run clean:all; npm install"
  exit 1
}

Write-Host ""
Write-Host "Update complete. Starting Pricekeep (forced rebuild)..."
Write-Host ""

$env:FORCE_REBUILD = "1"
& (Join-Path $PSScriptRoot "run.ps1")
exit $LASTEXITCODE
