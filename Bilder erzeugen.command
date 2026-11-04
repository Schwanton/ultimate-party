#!/bin/bash
# Erzeugt die Bilder für Abgrund mit der OpenAI-Bild-API (Doppelklick).
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt – starte zuerst einmal „UP starten“."
  read -r -p "Enter zum Schließen"; exit 1
fi
node scripts/bilder.mjs abgrund
echo ""
read -r -p "Enter zum Schließen"
