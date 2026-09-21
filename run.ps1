# Pricekeep Windows launcher (PowerShell). Prefer double-clicking run.bat.
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

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Wait-ForKey "Node.js was not found on PATH. Install Node.js 20+ from https://nodejs.org"
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Wait-ForKey "npm was not found on PATH."
  exit 1
}

Write-Host "Node $(node -v)"

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "package.json"))) {
  Wait-ForKey "package.json not found in $PWD."
  exit 1
}

Write-Host ""
Write-Host "Ensuring dependencies (npm install)..."
npm install
if ($LASTEXITCODE -ne 0) {
  Wait-ForKey "npm install failed. Check the messages above."
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "node_modules\sql.js\package.json"))) {
  Wait-ForKey "sql.js is missing after npm install. Delete node_modules and retry."
  exit 1
}

$buildId = Join-Path $PSScriptRoot ".next\BUILD_ID"
if (-not (Test-Path -LiteralPath $buildId) -or $env:FORCE_REBUILD -eq "1") {
  Write-Host "Running npm run build..."
  $nextDir = Join-Path $PSScriptRoot ".next"
  if (Test-Path -LiteralPath $nextDir) {
    Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Wait-ForKey "Build FAILED."
    exit 1
  }
}

if (-not (Test-Path -LiteralPath $buildId)) {
  Wait-ForKey "Missing .next\BUILD_ID after build."
  exit 1
}

Write-Host ""
Write-Host "Starting Pricekeep at http://127.0.0.1:43127"
Write-Host "Keep this window open. SERVER DIED means the Node process exited."
Write-Host ""

Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "timeout /t 6 /nobreak >nul & start http://127.0.0.1:43127/" -WindowStyle Hidden

npm start
$code = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }

Wait-ForKey @"
SERVER DIED / STOPPED -- exit code $code
The app is no longer on http://127.0.0.1:43127 (browser NetworkError / unable to connect).
Try: npm run clean; npm install; .\run.bat
"@
exit $code
