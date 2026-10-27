@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installer Node.js LTS fra https://nodejs.org og prov igen.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
start "" "http://127.0.0.1:3000"
echo Starter appen. Behold dette vindue aabent.
call npm start
pause
