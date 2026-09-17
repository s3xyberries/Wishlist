# Pricekeep Windows launcher (PowerShell). Prefer double-clicking run.bat.
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "Pricekeep"

Write-Host ""
Write-Host " Pricekeep launcher"
Write-Host " =================="
Write-Host ""

function Wait-ForKey([string]$Message) {
  Write-Host ""
  Write-Host $Message
  Read-Host "Press Enter to close"
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

if (-not (Test-Path -LiteralPath "node_modules")) {
  Write-Host ""
  Write-Host "node_modules missing — running npm install..."
  try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install exited with code $LASTEXITCODE" }
  } catch {
    Wait-ForKey "npm install failed. If better-sqlite3 failed to build, install Visual Studio Build Tools (Desktop C++ workload) and try again.`n$_"
    exit 1
  }
}

if (-not (Test-Path -LiteralPath ".next")) {
  Write-Host ""
  Write-Host "No production build yet — running npm run build..."
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build exited with code $LASTEXITCODE" }
  } catch {
    Wait-ForKey "Build failed.`n$_"
    exit 1
  }
}

Write-Host ""
Write-Host "Starting Pricekeep at http://127.0.0.1:43127"
Write-Host "Keep this window open while you use the app. Close it to stop the server."
Write-Host ""

Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "timeout /t 4 /nobreak >nul & start http://127.0.0.1:43127/" -WindowStyle Hidden

try {
  npm start
  $code = $LASTEXITCODE
} catch {
  Wait-ForKey "Server failed to start.`n$_"
  exit 1
}

if ($code -ne 0) {
  Wait-ForKey "Server exited with error code $code."
  exit $code
}
