@echo off
setlocal
cd /d "%~dp0"
title Shike Launcher

echo.
echo ========================================
echo          Shike Food Journal
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 goto no_node

where npm >nul 2>&1
if errorlevel 1 goto no_npm

if not exist "package.json" goto no_project

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "SHIKE_VERSION=%%v"
set "NEED_INSTALL=0"
if not exist "node_modules" set "NEED_INSTALL=1"
if not exist "node_modules\.shike-version-%SHIKE_VERSION%" set "NEED_INSTALL=1"

if "%NEED_INSTALL%"=="1" (
  echo First launch or new version: installing required components...
  echo This may take a few minutes and requires an internet connection.
  call npm install --cache .npm-cache
  if errorlevel 1 goto install_failed
  echo installed>"node_modules\.shike-version-%SHIKE_VERSION%"
)

if /i "%SHIKE_CHECK_ONLY%"=="1" exit /b 0

echo Starting Shike...
echo Address: http://127.0.0.1:5173/
echo.

if /i "%SHIKE_NO_BROWSER%"=="1" (
  call npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
  exit /b %errorlevel%
)

start "Shike Server" cmd.exe /k "cd /d "%~dp0" && npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173/"
exit /b 0

:no_node
echo [Cannot start] Node.js was not found.
echo Install the Node.js LTS version from https://nodejs.org/ and try again.
goto failed

:no_npm
echo [Cannot start] npm was not found. Reinstall Node.js LTS and try again.
goto failed

:no_project
echo [Cannot start] Keep this file next to package.json.
echo Fully extract the ZIP before running it.
goto failed

:install_failed
echo [Install failed] Check the internet connection and run start-shike.bat again.

:failed
echo.
pause
exit /b 1

