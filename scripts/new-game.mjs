#!/usr/bin/env node
/**
 * Neues Spiel aus der Vorlage anlegen:  npm run new-game mein-spiel
 * Für ein eigenes Repository (Ordner spiele/ statt games/):  npm run new-game mein-spiel -- --repo
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ownRepo = args.includes('--repo');
const id = (args.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase();
const folder = ownRepo ? 'spiele' : 'games';

if (!/^[a-z][a-z0-9-]{1,30}$/.test(id)) {
  console.log('Bitte einen Namen angeben: nur Kleinbuchstaben, Zahlen und Bindestriche.');
  console.log('Beispiel:  npm run new-game mein-spiel');
  process.exit(1);
}

const src = path.join(ROOT, 'games', '_vorlage');
const dest = path.join(ROOT, folder, id);
if (fs.existsSync(dest) || fs.existsSync(path.join(ROOT, 'games', id))) {
  console.log(`Ein Spiel „${id}“ gibt es schon.`);
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
if (ownRepo) manifest.repo = `DEIN-GITHUB-NAME/${id}`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
if (ownRepo) {
  fs.writeFileSync(path.join(dest, 'CHANGELOG.md'), `# Änderungen\n\n## 0.1.0\n\n- Erste Version\n`);
  fs.writeFileSync(path.join(dest, '.gitignore'), '.DS_Store\nbilder/roh/\n');
}

console.log(`\nNeues Spiel angelegt: ${folder}/${id}\n`);
console.log('So geht es weiter:');
console.log('  1. npm run dev          → Entwicklermodus starten');
console.log('  2. http://localhost:3000/dev im Browser öffnen');
console.log(`  3. ${folder}/${id}/server.ts (Spiellogik) und client.tsx (Ansichten) anpassen`);
if (ownRepo) {
  console.log(`  4. In ${folder}/${id}/manifest.json bei "repo" deinen GitHub-Namen eintragen`);
  console.log(`  5. Den Ordner ${folder}/${id} als eigenes Git-Repository auf GitHub hochladen`);
}
console.log('\nAnleitung: docs/SPIELE-ENTWICKELN.md\n');
