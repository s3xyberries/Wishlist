@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Pricekeep

echo.
echo  Pricekeep launcher
echo  ==================
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

if not exist "node_modules\" (
  echo.
  echo node_modules missing — running npm install...
  call npm install
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

if not exist ".next\" (
  echo.
  echo No production build yet — running npm run build...
  call npm run build
  if errorlevel 1 (
    echo.
    echo Build failed. See messages above.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Starting Pricekeep at http://127.0.0.1:43127
echo Keep this window open while you use the app. Close it to stop the server.
echo.

rem Open the browser shortly after the server begins listening.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:43127/"

call npm start
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo Server exited with error code %EXITCODE%.
  echo.
  pause
)

endlocal & exit /b %EXITCODE%
