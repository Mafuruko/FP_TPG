@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "PORT=%ISLAND_PORT%"
if "%PORT%"=="" set "PORT=8080"
set "URL=http://localhost:%PORT%"

echo ============================================
echo   Island Colony - Automated Setup ^& Launch
echo ============================================

:: 1. Check Node.js (>= 20). Skip installation if already satisfied.
set "NODE_OK=0"
where node >nul 2>&1
if %errorlevel%==0 (
  for /f "tokens=1 delims=." %%V in ('node -v 2^>nul') do (
    set "VER=%%V"
    set "VER=!VER:v=!"
  )
  if defined VER (
    if !VER! GEQ 20 set "NODE_OK=1"
  )
)

if "!NODE_OK!"=="1" (
  for /f "delims=" %%V in ('node -v') do echo [OK] Node.js %%V detected. Skipping Node setup.
) else (
  echo [SETUP] Node.js 20+ not found. Attempting automatic installation via winget...
  where winget >nul 2>&1
  if %errorlevel%==0 (
    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    set "PATH=%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    where node >nul 2>&1
    if errorlevel 1 (
      echo [ERROR] Node.js was installed, but PATH requires a new terminal. Please re-run this script.
      pause
      exit /b 1
    )
  ) else (
    echo [ERROR] Node.js 20+ is required and winget is unavailable.
    echo         Download Node.js LTS from https://nodejs.org/ and re-run this file.
    pause
    exit /b 1
  )
)

:: 2. Check package.json dependencies; skip npm install when zero deps or node_modules exists.
set "NEED_INSTALL=0"
node -e "const p=require('./package.json'); const d=Object.keys({...p.dependencies,...p.devDependencies}); process.exit(d.length ? 0 : 1);" >nul 2>&1
if %errorlevel%==0 (
  if not exist "node_modules" set "NEED_INSTALL=1"
)

if "!NEED_INSTALL!"=="1" (
  echo [SETUP] Installing npm dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo [OK] Required dependencies are ready. Skipping npm install.
)

:: 3. If the server is already listening on PORT, just open the browser.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo [OK] Server already running at %URL%. Opening browser...
  start "" "%URL%"
  exit /b 0
)

:: 4. Start the local server in a dedicated window, wait until ready, then open browser.
echo [START] Starting Island Colony server on %URL%...
start "Island Colony Server" cmd /k "cd /d ""%~dp0"" && npm start"

set "READY=0"
for /l %%I in (1,1,25) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%PORT%/' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
  if !errorlevel!==0 (
    set "READY=1"
    goto :open_browser
  )
  timeout /t 1 /nobreak >nul
)

:open_browser
if "!READY!"=="1" (
  echo [OK] Server is online. Opening %URL%...
) else (
  echo [WARN] Server took longer than expected. Opening %URL% now...
)
start "" "%URL%"
exit /b 0
