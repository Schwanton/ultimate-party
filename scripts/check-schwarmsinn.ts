/**
 * Prüft den Level-Generator von Schwarmsinn: Jedes Level (1–20 + Endlos) mit vielen Zufallswerten erzeugen.
 *   npx tsx scripts/check-schwarmsinn.ts [anzahl] [--show]
 */
import { generate, LEVEL_COUNT } from '../games/schwarmsinn/gen';

const count = Number(process.argv[2]) || 20;
const show = process.argv.includes('--show');
let fails = 0;
for (let n = 1; n <= LEVEL_COUNT + 3; n++) {
  const t0 = performance.now();
  let maxMs = 0;
  for (let i = 0; i < count; i++) {
    const s0 = performance.now();
    try {
      const L = generate(n, 1000 + i * 17 + n);
      if (show && i === 0) {
        console.log(`\nLevel ${n} (${L.w}×${L.h}, ${L.figures} Figuren, ${L.rooms.length} Räume, ${L.doors.length} Türen)`);
        const g = L.grid.map((r) => r.split(''));
        L.doors.forEach((d) => (g[d.y][d.x] = d.kind === 'hold' ? 'H' : d.color == null ? 'S' : String(d.color)));
        L.plates.forEach((p) => (g[p.y][p.x] = p.color == null ? 'p' : 'c'));
        L.starts.forEach(([x, y], f) => (g[y][x] = 'ABCD'[f]));
        L.exits.forEach(([x, y], f) => (g[y][x] = 'abcd'[f]));
        L.items.forEach((it) => (g[it.y][it.x] = '*'));
        L.teleports.forEach((t) => { g[t.a[1]][t.a[0]] = 'T'; g[t.b[1]][t.b[0]] = 'T'; });
        console.log(g.map((r) => r.join('')).join('\n'));
      }
    } catch (e) {
      fails++;
      console.log(`✘ Level ${n} seed ${1000 + i * 17 + n}: ${(e as Error).message}`);
    }
    maxMs = Math.max(maxMs, performance.now() - s0);
  }
  console.log(`Level ${String(n).padStart(2)}: ${count} erzeugt, Ø ${((performance.now() - t0) / count).toFixed(0)} ms, max ${maxMs.toFixed(0)} ms`);
}
if (fails) {
  console.log(`\n${fails} Fehler`);
  process.exit(1);
}
console.log('\nAlle Level lösbar erzeugt');
