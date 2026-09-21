@echo off
setlocal EnableExtensions
rem Always run from this script's folder (handles paths with spaces).
cd /d "%~dp0" || (
  echo Could not cd to the project folder: "%~dp0"
  pause
  exit /b 1
)
title Pricekeep

echo.
echo  Pricekeep launcher
echo  ==================
echo  Project: %CD%
echo  Tip: after we push updates, double-click update.bat ^(Update ^& Run^).
echo.

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

rem Soft hint when this checkout is behind its upstream (no network wait if fetch fails).
where git >nul 2>&1
if not errorlevel 1 (
  if exist ".git\" (
    git fetch --quiet --no-tags 2>nul
    for /f %%c in ('git rev-list --count HEAD..@{u} 2^>nul') do (
      if not "%%c"=="" if not "%%c"=="0" (
        echo.
        echo  Updates available ^(%%c commit^(s^) behind^).
        echo  Double-click update.bat to pull, clean, install, and restart.
        echo.
      )
    )
  )
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo Node %NODE_VER%

if not exist "package.json" (
  echo package.json not found in "%CD%".
  echo Make sure you double-clicked run.bat inside the Wishlist repo folder.
  echo.
  pause
  exit /b 1
)

if exist "%USERPROFILE%\package-lock.json" (
  echo.
  echo NOTE: Found "%USERPROFILE%\package-lock.json" outside this repo.
  echo If builds misbehave, delete that stray file ^(not the one inside this project^).
  echo.
)

echo.
echo Ensuring dependencies are installed ^(npm install^)...
call npm.cmd install
if errorlevel 1 (
  echo.
  echo npm install failed. Check the messages above.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\sql.js\package.json" (
  echo.
  echo sql.js is missing after npm install. Delete node_modules and run.bat again.
  echo.
  pause
  exit /b 1
)

rem Rebuild if missing BUILD_ID, or when FORCE_REBUILD=1 after git pull.
set "NEED_BUILD=0"
if not exist ".next\BUILD_ID" set "NEED_BUILD=1"
if "%FORCE_REBUILD%"=="1" set "NEED_BUILD=1"

if "%NEED_BUILD%"=="1" (
  echo.
  echo Production build missing -- running npm run build...
  if exist ".next\" (
    echo Removing incomplete .next folder...
    rmdir /s /q ".next" 2>nul
  )
  call npm.cmd run build
  if errorlevel 1 (
    echo.
    echo Build FAILED. The app was not started.
    echo.
    pause
    exit /b 1
  )
)

if not exist ".next\BUILD_ID" (
  echo.
  echo Build finished but .next\BUILD_ID is still missing.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting Pricekeep at http://127.0.0.1:43127
echo Keep this window open. If it prints SERVER DIED, the Node process crashed.
echo.

start "" cmd /c "timeout /t 6 /nobreak >nul & start http://127.0.0.1:43127/"

call npm.cmd start
set "EXITCODE=%ERRORLEVEL%"

echo.
echo ============================================================
echo  SERVER DIED / STOPPED -- exit code %EXITCODE%
echo ============================================================
echo  The app is no longer listening on http://127.0.0.1:43127
echo  ^(that is why the browser shows NetworkError / unable to connect^).
echo.
echo  Common causes:
echo   1. This window was closed or Ctrl+C was pressed
echo   2. Port 43127 already in use -- close other Pricekeep windows
echo   3. Stale build after git pull -- delete .next then run.bat again
echo   4. Disk/path issues under a folder with spaces
echo.
echo  Try: npm run clean ^&^& npm install ^&^& run.bat
echo  Or set FORCE_REBUILD=1 and run.bat again.
echo ============================================================
echo.
pause

endlocal & exit /b %EXITCODE%
