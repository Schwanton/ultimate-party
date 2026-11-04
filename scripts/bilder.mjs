/**
 * Bilder erzeugen – erzeugt Spielbilder mit der OpenAI-Bild-API.
 *
 * Liest games/<spiel>/bilder/auftrag.json und erzeugt jedes Bild, das noch fehlt
 * (oder nur die Bilder aus "nur"). Ergebnisse: games/<spiel>/bilder/roh/<id>[-n].png
 * Protokoll: games/<spiel>/bilder/protokoll.txt (damit Claude mitlesen kann).
 *
 * Der API-Schlüssel wird beim ersten Start abgefragt und nur auf diesem Rechner gespeichert
 * (.up-data/openai-key.txt – nicht im Git).
 *
 *   node scripts/bilder.mjs [spiel]      (Standard: abgrund)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = process.argv[2] || 'abgrund';
const DIR = path.join(ROOT, 'games', game, 'bilder');
const OUT = path.join(DIR, 'roh');
const KEYFILE = path.join(ROOT, '.up-data', 'openai-key.txt');
const LOG = path.join(DIR, 'protokoll.txt');

function log(msg) {
  const line = `[${new Date().toLocaleString('de-DE')}] ${msg}`;
  console.log(msg);
  fs.appendFileSync(LOG, line + '\n');
}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else rl.output.write('*'); };
    }
    rl.question(question, (a) => { rl.close(); if (hidden) console.log(''); resolve(a.trim()); });
  });
}

async function getKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  if (fs.existsSync(KEYFILE)) return fs.readFileSync(KEYFILE, 'utf8').trim();
  console.log('');
  console.log('Ich brauche einmalig deinen OpenAI-API-Schlüssel (beginnt mit sk-).');
  console.log('Er wird nur auf diesem Mac gespeichert (.up-data/openai-key.txt).');
  const key = await ask('Schlüssel einfügen und Enter drücken: ', true);
  if (!key.startsWith('sk-')) throw new Error('Das sieht nicht nach einem OpenAI-Schlüssel aus (muss mit sk- beginnen).');
  fs.mkdirSync(path.dirname(KEYFILE), { recursive: true });
  fs.writeFileSync(KEYFILE, key, { mode: 0o600 });
  return key;
}

const ERKLAERUNG = {
  401: 'Der Schlüssel wird nicht akzeptiert. Lösche .up-data/openai-key.txt und starte neu, um ihn erneut einzugeben.',
  429: 'Zu viele Anfragen oder kein Guthaben mehr. Prüfe auf platform.openai.com unter Billing dein Guthaben.',
};

async function generate(key, models, item, quality) {
  let lastErr = '';
  for (const model of models) {
    const body = { model, prompt: item.prompt, size: item.groesse, quality, n: 1, output_format: 'png' };
    if (item.transparent) body.background = 'transparent';
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.data?.[0]?.b64_json) return { b64: json.data[0].b64_json, model };
    const msg = json.error?.message || `HTTP ${res.status}`;
    lastErr = `${model}: ${msg}`;
    if (res.status === 401 || res.status === 429) throw new Error(`${msg}\n→ ${ERKLAERUNG[res.status]}`);
    if (/verif/i.test(msg)) throw new Error(`${msg}\n→ OpenAI verlangt für Bild-Modelle eine Verifizierung deiner Organisation: platform.openai.com → Settings → Organization → General → „Verify Organization“.`);
    // Modell nicht verfügbar oder Parameter nicht unterstützt → nächstes Modell probieren
    log(`  (${model} nicht nutzbar: ${msg} – versuche das nächste Modell)`);
  }
  throw new Error(lastErr);
}

async function main() {
  const auftrag = JSON.parse(fs.readFileSync(path.join(DIR, 'auftrag.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const models = [].concat(auftrag.modell || 'gpt-image-1');
  const quality = auftrag.qualitaet || 'medium';
  const variants = Math.max(1, Math.min(4, Number(auftrag.varianten) || 1));
  const only = Array.isArray(auftrag.nur) && auftrag.nur.length ? new Set(auftrag.nur) : null;
  const todo = auftrag.bilder.filter((b) => (only ? only.has(b.id) : true));
  const key = await getKey();

  log(`=== Start: ${todo.length} Motive × ${variants} Variante(n), Qualität ${quality} ===`);
  let made = 0, skipped = 0, failed = 0;
  for (const item of todo) {
    for (let v = 1; v <= variants; v++) {
      const file = path.join(OUT, variants > 1 ? `${item.id}-${v}.png` : `${item.id}.png`);
      if (fs.existsSync(file)) { skipped++; continue; }
      process.stdout.write(`Erzeuge ${path.basename(file)} … `);
      try {
        const r = await generate(key, models, item, quality);
        fs.writeFileSync(file, Buffer.from(r.b64, 'base64'));
        made++;
        log(`OK ${path.basename(file)} (${r.model})`);
      } catch (e) {
        failed++;
        log(`FEHLER ${path.basename(file)}: ${e.message}`);
        if (/Schlüssel|Guthaben|Verifizierung/.test(e.message)) { log('Abbruch.'); return finish(made, skipped, failed); }
      }
    }
  }
  finish(made, skipped, failed);
}

function finish(made, skipped, failed) {
  log(`=== Fertig: ${made} neu, ${skipped} schon vorhanden, ${failed} Fehler ===`);
  console.log('');
  console.log('Fertig! Sag Claude im Chat Bescheid – Claude schaut sich die Bilder an.');
}

main().catch((e) => { log('FEHLER: ' + e.message); process.exitCode = 1; });
