#!/bin/bash
# UP! – Ultimate Party starten (macOS): Doppelklick auf diese Datei.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "Für UP! wird Node.js benötigt.\n\nIch öffne jetzt nodejs.org – lade dort die LTS-Version herunter, installiere sie und starte UP! danach erneut." buttons {"OK"} default button 1 with title "UP! – Ultimate Party"'
  open "https://nodejs.org/de/download"
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Erster Start: Ich installiere die nötigen Bausteine (dauert einmalig ca. 1 Minute) …"
  npm install --no-audit --no-fund || { echo "Installation fehlgeschlagen. Bist du mit dem Internet verbunden?"; read -r -p "Enter zum Schließen"; exit 1; }
fi
npm start
