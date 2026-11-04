/**
 * Abgrund – Pfadkarte eines Akts: Stufen von oben nach unten, 2–4 Stationen pro Stufe,
 * Wege nur zu benachbarten Spalten. Ganz unten der Boss.
 */

import { LEVEL_TYPES, LEVELS, type NodeType } from './data';

export interface MapNode { id: string; lv: number; col: number; type: NodeType; next: string[] }
export interface ActMap { nodes: MapNode[] }

const COLS = 4;

function pickWeighted<T extends string>(w: Partial<Record<T, number>>): T {
  const entries = Object.entries(w) as [T, number][];
  let r = Math.random() * entries.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries[0][0];
}

function sampleCols(k: number): number[] {
  const all = [0, 1, 2, 3];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, k).sort((a, b) => a - b);
}

export function generateMap(): ActMap {
  const levels: MapNode[][] = [];
  for (let lv = 1; lv < LEVELS; lv++) {
    const k = lv === 1 ? 3 : 2 + Math.floor(Math.random() * 3);
    levels.push(sampleCols(Math.min(COLS, k)).map((col) => ({ id: `n${lv}-${col}`, lv, col, type: pickWeighted(LEVEL_TYPES[lv - 1]), next: [] })));
  }
  levels.push([{ id: 'boss', lv: LEVELS, col: 1.5, type: 'boss', next: [] }]);

  // Wege: jede Station zur nächstgelegenen der folgenden Stufe, manchmal zu einer zweiten Nachbarin
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i], b = levels[i + 1];
    const dist = (x: MapNode, y: MapNode) => Math.abs(x.col - y.col);
    for (const n of a) {
      const sorted = [...b].sort((x, y) => dist(n, x) - dist(n, y) || Math.random() - 0.5);
      n.next.push(sorted[0].id);
      if (b.length > 1 && Math.random() < 0.45 && sorted[1] && dist(n, sorted[1]) <= 1.5) n.next.push(sorted[1].id);
    }
    // jede Station braucht einen Weg hinein
    for (const m of b) {
      if (a.some((n) => n.next.includes(m.id))) continue;
      const from = [...a].sort((x, y) => dist(x, m) - dist(y, m))[0];
      from.next.push(m.id);
    }
    // Überkreuzungen entfernen, solange jede Station erreichbar bleibt
    for (const n1 of a) for (const n2 of a) {
      if (n1.col >= n2.col) continue;
      for (const t1 of [...n1.next]) for (const t2 of [...n2.next]) {
        const c1 = b.find((x) => x.id === t1)!.col, c2 = b.find((x) => x.id === t2)!.col;
        if (c1 <= c2) continue;
        const incoming = (id: string) => a.filter((x) => x.next.includes(id)).length;
        if (n1.next.length > 1 && incoming(t1) > 1) n1.next = n1.next.filter((x) => x !== t1);
        else if (n2.next.length > 1 && incoming(t2) > 1) n2.next = n2.next.filter((x) => x !== t2);
      }
    }
  }

  const nodes = levels.flat();
  // mindestens ein Händler im Akt
  if (!nodes.some((n) => n.type === 'shop')) {
    const c = nodes.filter((n) => n.lv === 7 || n.lv === 4);
    c[Math.floor(Math.random() * c.length)].type = 'shop';
  }
  return { nodes };
}

export const nodeById = (m: ActMap, id: string) => m.nodes.find((n) => n.id === id);
