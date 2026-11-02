#!/bin/bash
# UP! – Ultimate Party starten (macOS): Doppelklick auf diese Datei.
cd "$(dirname "$0")"

need_node() {
  osascript -e "display dialog \"$1\n\nIch öffne jetzt nodejs.org – lade dort die LTS-Version für macOS herunter, installiere sie und starte UP! danach erneut.\" buttons {\"OK\"} default button 1 with title \"UP! – Ultimate Party\""
  open "https://nodejs.org/de/download"
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  need_node "Für UP! wird Node.js benötigt."
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  need_node "Auf diesem Mac ist Node.js $(node -v) installiert. UP! braucht Version 20 oder neuer."
fi

# Neu installieren, wenn noch nie installiert oder mit einer anderen Node-Version
if [ ! -f node_modules/.up-node-version ] || [ "$(cat node_modules/.up-node-version)" != "$NODE_MAJOR" ]; then
  echo "Ich installiere die nötigen Bausteine (dauert einmalig ca. 1 Minute) …"
  rm -rf node_modules package-lock.json
  npm install --no-audit --no-fund || { echo "Installation fehlgeschlagen. Bist du mit dem Internet verbunden?"; read -r -p "Enter zum Schließen"; exit 1; }
  echo "$NODE_MAJOR" > node_modules/.up-node-version
fi
npm start
