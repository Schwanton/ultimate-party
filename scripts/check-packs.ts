/**
 * Prüft alle Content-Packs (oder eine einzelne Datei) auf Fehler.
 *   npm run check-packs
 *   npm run check-packs -- pfad/zum/pack.json schlagfertig
 */

import fs from 'node:fs';
import path from 'node:path';
process.env.UP_DEV = '1';
const { allGames, loadGames, validatePack } = await import('../server/registry');
await loadGames();

const [file, gameId] = process.argv.slice(2);
let errors = 0;

if (file) {
  const game = allGames().find((g) => g.manifest.id === gameId);
  if (!game) {
    console.log(`Spiel "${gameId}" nicht gefunden. Verfügbar: ${allGames().map((g) => g.manifest.id).join(', ')}`);
    process.exit(1);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { pack, error } = validatePack(raw, game.manifest, { lang: raw.lang === 'en' ? 'en' : 'de', id: path.basename(file, '.json') });
    if (error) {
      errors++;
      console.log(`✘ ${file}: ${error}`);
    } else console.log(`✔ ${file}: ${pack!.items.length} Einträge`);
  } catch (e) {
    errors++;
    console.log(`✘ ${file}: ${(e as Error).message}`);
  }
} else {
  for (const g of allGames()) {
    for (const { info } of g.packs) {
      if (info.error) {
        errors++;
        console.log(`✘ ${info.key}: ${info.error}`);
      } else console.log(`✔ ${info.key}: ${info.count} Einträge`);
    }
  }
}
process.exit(errors ? 1 : 0);
