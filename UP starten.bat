@echo off
rem UP! – Ultimate Party starten (Windows): Doppelklick auf diese Datei.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Fuer UP! wird Node.js benoetigt. Bitte installiere die LTS-Version von https://nodejs.org und starte UP! danach erneut.
  start https://nodejs.org/de/download
  pause
  exit /b 1
)
if not exist node_modules (
  echo Erster Start: Ich installiere die noetigen Bausteine ^(dauert einmalig ca. 1 Minute^) ...
  call npm install --no-audit --no-fund
)
call npm start
pause
