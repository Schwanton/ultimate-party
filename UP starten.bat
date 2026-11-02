@echo off
rem UP! – Ultimate Party starten (Windows): Doppelklick auf diese Datei.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto neednode
node -e "process.exit(+process.versions.node.split('.')[0] < 20 ? 1 : 0)"
if errorlevel 1 goto neednode
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
set UP_LAUNCHER=1

:start
set INSTALLED=
if exist node_modules\.up-node-version set /p INSTALLED=<node_modules\.up-node-version
if not "%INSTALLED%"=="%NODE_MAJOR%" (
  echo Ich installiere die noetigen Bausteine ^(dauert einmalig ca. 1 Minute^) ...
  if exist node_modules rmdir /s /q node_modules
  if exist package-lock.json del package-lock.json
  call npm install --no-audit --no-fund
  echo %NODE_MAJOR%> node_modules\.up-node-version
)
if exist .up-data\restart del .up-data\restart
node node_modules\tsx\dist\cli.mjs server\index.ts
if exist .up-data\restart (
  echo Update installiert - UP! startet neu ...
  set UP_NO_OPEN=1
  goto start
)
pause
exit /b 0

:neednode
echo UP! braucht Node.js Version 20 oder neuer. Bitte die LTS-Version von https://nodejs.org installieren und UP! danach erneut starten.
start https://nodejs.org/de/download
pause
exit /b 1
