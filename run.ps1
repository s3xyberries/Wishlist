# Pricekeep Windows launcher (PowerShell). Prefer double-clicking run.bat.
# Handles project paths with spaces (e.g. Desktop\Price Checker\Wishlist).
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "Pricekeep"

Write-Host ""
Write-Host " Pricekeep launcher"
Write-Host " =================="
Write-Host " Project: $PWD"
Write-Host ""

function Wait-ForKey([string]$Message) {
  Write-Host ""
  Write-Host $Message
  Read-Host "Press Enter to close"
}

function Test-ProductionBuild {
  return (Test-Path -LiteralPath (Join-Path $PSScriptRoot ".next\BUILD_ID"))
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Wait-ForKey "Node.js was not found on PATH. Install Node.js 20+ from https://nodejs.org then try again."
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Wait-ForKey "npm was not found on PATH. Reinstall Node.js from https://nodejs.org then try again."
  exit 1
}

Write-Host "Node $(node -v)"

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "package.json"))) {
  Wait-ForKey "package.json not found in $PWD. Run this script from inside the Wishlist repo folder."
  exit 1
}

$strayLock = Join-Path $env:USERPROFILE "package-lock.json"
if (Test-Path -LiteralPath $strayLock) {
  Write-Host ""
  Write-Host "NOTE: Found $strayLock outside this repo."
  Write-Host "Next.js may warn and ignore the lockfile in this folder."
  Write-Host "If builds misbehave, delete that stray file (not the one inside this project)."
  Write-Host ""
}

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "node_modules"))) {
  Write-Host ""
  Write-Host "node_modules missing — running npm install..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    Wait-ForKey "npm install failed. If better-sqlite3 failed to build, install Visual Studio Build Tools (Desktop C++ workload) and try again."
    exit 1
  }
}

if (-not (Test-ProductionBuild)) {
  Write-Host ""
  Write-Host "Production build missing or incomplete — running npm run build..."
  $nextDir = Join-Path $PSScriptRoot ".next"
  if (Test-Path -LiteralPath $nextDir) {
    Write-Host "Removing incomplete .next folder..."
    Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Wait-ForKey "Build FAILED. The app was not started. Scroll up for the TypeScript / Next.js error."
    exit 1
  }
}

if (-not (Test-ProductionBuild)) {
  Wait-ForKey "Build finished but .next\BUILD_ID is still missing. Delete the .next folder and try again."
  exit 1
}

Write-Host ""
Write-Host "Build OK. Starting Pricekeep at http://127.0.0.1:43127"
Write-Host "Keep this window open while you use the app. Close it to stop the server."
Write-Host ""

Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "timeout /t 4 /nobreak >nul & start http://127.0.0.1:43127/" -WindowStyle Hidden

npm start
$code = $LASTEXITCODE

if ($null -eq $code) { $code = 0 }

if ($code -ne 0) {
  Wait-ForKey "Server exited with error code $code. If you see 'Could not find a production build', delete the .next folder and run again."
  exit $code
}
