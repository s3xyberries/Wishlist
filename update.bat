@echo off
setlocal EnableExtensions
rem One-click Update & Run: pull latest, clean build, install, then start like run.bat.
rem Always run from this script's folder (handles paths with spaces).
cd /d "%~dp0" || (
  echo Could not cd to the project folder: "%~dp0"
  pause
  exit /b 1
)
title Pricekeep Update ^& Run

echo.
echo  Pricekeep -- Update ^& Run
echo  =========================
echo  Project: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo Git was not found on PATH.
  echo Install Git for Windows from https://git-scm.com/download/win then try again.
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install Node.js 20+ from https://nodejs.org then try again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found on PATH.
  echo Reinstall Node.js from https://nodejs.org ^(includes npm^) then try again.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo package.json not found in "%CD%".
  echo Make sure you double-clicked update.bat inside the Wishlist repo folder.
  echo.
  pause
  exit /b 1
)

if not exist ".git\" (
  echo This folder is not a Git checkout ^(.git missing^).
  echo Clone https://github.com/s3xyberries/Wishlist first, then use update.bat.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
for /f "tokens=*" %%v in ('git --version 2^>nul') do set "GIT_VER=%%v"
echo Node %NODE_VER%
echo %GIT_VER%
echo.

rem Discard local package-lock drift so git pull is not blocked.
if exist "package-lock.json" (
  echo Resetting package-lock.json to match the last commit...
  git checkout -- package-lock.json
  if errorlevel 1 (
    echo Warning: could not reset package-lock.json -- continuing anyway.
  )
)

echo.
echo Pulling latest from Git...
git pull
if errorlevel 1 (
  echo.
  echo git pull failed.
  echo If you have local edits, commit/stash them or reset, then run update.bat again.
  echo Common fix: git checkout -- package-lock.json
  echo.
  pause
  exit /b 1
)

echo.
echo Cleaning build output ^(.next + caches^)...
call npm.cmd run clean
if errorlevel 1 (
  echo.
  echo npm run clean failed -- removing .next manually...
  if exist ".next\" rmdir /s /q ".next" 2>nul
)

echo.
echo Installing dependencies ^(npm install^)...
call npm.cmd install
if errorlevel 1 (
  echo.
  echo npm install failed. Check the messages above.
  echo If deps look broken: npm run clean:all ^&^& npm install
  echo.
  pause
  exit /b 1
)

echo.
echo Update complete. Starting Pricekeep ^(forced rebuild^)...
echo.

rem Force a fresh production build after pull, then reuse run.bat start flow.
set "FORCE_REBUILD=1"
call "%~dp0run.bat"
set "EXITCODE=%ERRORLEVEL%"

endlocal & exit /b %EXITCODE%
