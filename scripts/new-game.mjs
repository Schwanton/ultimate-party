#!/usr/bin/env node
/**
 * Neues Spiel aus der Vorlage anlegen:  npm run new-game mein-spiel
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = (process.argv[2] ?? '').trim().toLowerCase();

if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) {
  console.log('Bitte einen Namen angeben: nur Kleinbuchstaben, Zahlen und Bindestriche.');
  console.log('Beispiel:  npm run new-game mein-spiel');
  process.exit(1);
}

const src = path.join(ROOT, 'games', '_vorlage');
const dest = path.join(ROOT, 'games', id);
if (fs.existsSync(dest)) {
  console.log(`Den Ordner games/${id} gibt es schon.`);
  process.exit(1);
}

fs.cpSync(src, dest, { recursive: true });
const manifestPath = path.join(dest, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const title = id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
manifest.id = id;
manifest.name = { de: title, en: title };
manifest.hidden = false;
manifest.author = process.env.USER || process.env.USERNAME || 'Unbekannt';
manifest.version = '0.1.0';
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`\nNeues Spiel angelegt: games/${id}\n`);
console.log('So geht es weiter:');
console.log('  1. npm run dev          → Entwicklermodus starten');
console.log('  2. http://localhost:3000/dev im Browser öffnen');
console.log(`  3. games/${id}/server.ts (Spiellogik) und client.tsx (Ansichten) anpassen`);
console.log('\nAnleitung: docs/SPIELE-ENTWICKELN.md\n');
