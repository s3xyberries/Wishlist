@echo off
setlocal EnableExtensions
rem Always run from this script's folder (handles paths with spaces, e.g. "Price Checker").
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
  echo Next.js may warn and ignore the lockfile in this folder.
  echo If builds misbehave, delete that stray file ^(not the one inside this project^).
  echo.
)

if not exist "node_modules\" (
  echo.
  echo node_modules missing — running npm install...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo npm install failed.
    echo If better-sqlite3 failed to build, install Visual Studio Build Tools
    echo ^(Desktop C++ workload^) and double-click run.bat again.
    echo.
    pause
    exit /b 1
  )
)

rem A bare ".next" folder is not enough — production start needs BUILD_ID.
set "NEED_BUILD=0"
if not exist ".next\BUILD_ID" set "NEED_BUILD=1"

if "%NEED_BUILD%"=="1" (
  echo.
  echo Production build missing or incomplete — running npm run build...
  if exist ".next\" (
    echo Removing incomplete .next folder...
    rmdir /s /q ".next" 2>nul
  )
  call npm.cmd run build
  if errorlevel 1 (
    echo.
    echo Build FAILED. The app was not started.
    echo Scroll up for the TypeScript / Next.js error.
    echo.
    pause
    exit /b 1
  )
)

if not exist ".next\BUILD_ID" (
  echo.
  echo Build finished but .next\BUILD_ID is still missing.
  echo The app was not started. Try deleting the .next folder and run.bat again.
  echo.
  pause
  exit /b 1
)

echo.
echo Build OK. Starting Pricekeep at http://127.0.0.1:43127
echo Keep this window open while you use the app. Close it to stop the server.
echo.

rem Open the browser shortly after the server begins listening.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:43127/"

call npm.cmd start
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo Server exited with error code %EXITCODE%.
  echo If you see "Could not find a production build", delete the .next folder
  echo and double-click run.bat again so it rebuilds.
  echo.
  pause
)

endlocal & exit /b %EXITCODE%
