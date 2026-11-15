/**
 * Murmel-Mayhem – Bahn und Physik (ohne Netzwerk, auch für Tests und die Durchmisch-Prüfung).
 *
 * Bahn: 12 Zickzack-Reihen (Doppelrinnen mit zwei Spuren), an jeder Wende eine Mischstelle
 * (Trichter, Nagelfeld, Wippe, Fliehkurve, Sprungschanze oder Kurve), Abkürzungen über die hintere
 * Ebene, ein verstaubter Nebenweg mit Förderband nach oben. Weltkoordinaten: 1200 breit, y nach unten.
 *
 * Murmeln rollen auf festen Schienen mit Schwerkraft und Luftwiderstand. In einer Spur kann man nicht
 * durcheinander durch: schnellere Murmeln wechseln die Spur (Überholen) oder stoßen an.
 */

export const W = 1200;
export const R = 9;
export const D = 19;
export const TICK = 1 / 30;
const ROWS = 12;
const ROW_GAP = 185;
const ROW_DROP = 60;
const TOP = 130;

export type Pt = [number, number];
export type ItemKind = 'turbo' | 'feder' | 'magnet' | 'schild' | 'kleber' | 'schranke' | 'gegenfeder' | 'falltuer' | 'wind' | 'bremse' | 'farbweiche' | 'bruecke' | 'umleitung' | 'wurmloch' | 'kanone';
export type EventKind = 'beben' | 'oel' | 'riese' | 'tausch';
export type CardKind = ItemKind | EventKind;
export type Sort = 'hilfe' | 'falle' | 'weiche' | 'ereignis';

export const SORT: Record<CardKind, Sort> = {
  turbo: 'hilfe', feder: 'hilfe', magnet: 'hilfe', schild: 'hilfe',
  kleber: 'falle', schranke: 'falle', gegenfeder: 'falle', falltuer: 'falle', wind: 'falle', bremse: 'falle',
  farbweiche: 'weiche', bruecke: 'weiche', umleitung: 'weiche', wurmloch: 'weiche', kanone: 'weiche',
  beben: 'ereignis', oel: 'ereignis', riese: 'ereignis', tausch: 'ereignis',
};
/** Teile, die nur auf Weichenplätze (Abzweigungen) passen */
export const SWITCH_ONLY: CardKind[] = ['farbweiche', 'bruecke', 'umleitung'];
/** Teile, die ihr Erbauer im Rennen umlegen kann */
export const TOGGLE: CardKind[] = ['farbweiche', 'bruecke', 'umleitung', 'wurmloch', 'kanone'];
/** Startzustand umlegbarer Teile */
export const TOGGLE_START: Partial<Record<CardKind, boolean>> = { farbweiche: true, bruecke: true, umleitung: true, wurmloch: true, kanone: false };

export type TurnKind = 'trichter' | 'nagel' | 'wippe' | 'flieh' | 'schanze' | 'kurve';

type Exit = { t: 'seg'; to: number; at: number } | { t: 'mix'; m: number } | { t: 'finish' };

export interface Seg {
  id: number;
  kind: 'rail' | 'timed';
  role: 'row' | 'curve' | 'branch' | 'outer' | 'catch' | 'dust' | 'lift' | 'finish';
  layer: 0 | 1;
  row: number;
  pts: Pt[];
  cum: number[];
  len: number;
  dur: number;
  r0: number;
  r1: number;
  exit: Exit;
  wear: number;
}

export interface Mixer {
  id: number;
  kind: Exclude<TurnKind, 'kurve'>;
  turn: number;
  side: 1 | -1;
  x: number;
  y: number;
  out: { to: number; at: number };
  alt?: { to: number; at: number };
  curve?: number;
  r: number;
  r1: number;
}

export interface Branch { id: number; seg: number; s: number; to: number; base: number; dust: boolean }
export interface Socket { id: number; seg: number; s: number; x: number; y: number; kind: 'rail' | 'switch'; branch?: number; row: number }
export interface Panel { x: number; y: number; w: number; h: number; holes: [number, number, number][] }
export interface Mark { seg: number; kind: 'delle' | 'poliert' }

export interface Track {
  H: number;
  segs: Seg[];
  mixers: Mixer[];
  branches: Branch[];
  sockets: Socket[];
  panels: Panel[];
  turns: TurnKind[];
  total: number;
  start: Pt;
  finishSeg: number;
  marks: Mark[];
  conveyor: { x: number; y0: number; y1: number } | null;
}

/* ---------- Geometrie ---------- */

function rowGeom(i: number) {
  const y0 = TOP + ROW_GAP * i;
  const [xa, xb] = i === 0 ? [600, 1060] : i % 2 === 0 ? [140, 1060] : [1060, 140];
  return { xa, xb, y0, y1: y0 + ROW_DROP };
}

function mkSeg(id: number, kind: Seg['kind'], role: Seg['role'], layer: 0 | 1, row: number, pts: Pt[], dur = 0): Seg {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { id, kind, role, layer, row, pts, cum, len: cum[cum.length - 1], dur, r0: 0, r1: 0, exit: { t: 'finish' }, wear: 1 };
}

function cubic(a: Pt, b: Pt, c: Pt, d: Pt, n = 14): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
    ]);
  }
  return out;
}

/** Punkt und Gefälle (dy/ds) auf einem Abschnitt */
export function posOn(seg: Seg, s: number): { x: number; y: number; slope: number } {
  const { pts, cum } = seg;
  if (s <= 0) {
    const l = cum[1] || 1;
    return { x: pts[0][0], y: pts[0][1], slope: (pts[1][1] - pts[0][1]) / l };
  }
  for (let i = 1; i < pts.length; i++) {
    if (s <= cum[i] || i === pts.length - 1) {
      const l = cum[i] - cum[i - 1] || 1;
      const f = Math.min(1, (s - cum[i - 1]) / l);
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f, slope: (pts[i][1] - pts[i - 1][1]) / l };
    }
  }
  return { x: pts[0][0], y: pts[0][1], slope: 0 };
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/* ---------- Bahn erzeugen ---------- */

const NOMINAL_MIX = 150;
/** Stellschrauben der Mischstellen */
export const MIX = { g: 3900, drag: 1, vmax: 480, spin0: 0.3, spin: 4, pin0: 0.3, pin: 2.3, flieh: 250, jump: 232, noise: 640, gap: 0.06, draft: 0.5, draftDist: 110, wippeWait: 1.5, push: 0.15 };

export function generateTrack(rnd: () => number = Math.random): Track {
  const segs: Seg[] = [];
  const mixers: Mixer[] = [];
  const add = (s: Seg) => (segs.push(s), s);
  // Wende-Arten: jede Wende ist eine Mischstelle, höchstens vereinzelt eine einfache Kurve
  let turns: TurnKind[] = [];
  for (let tries = 0; tries < 200; tries++) {
    turns = shuffle(['trichter', 'trichter', 'trichter', 'nagel', 'nagel', 'wippe', 'wippe', 'flieh', 'schanze', 'kurve', rnd() < 0.5 ? 'nagel' : 'schanze'] as TurnKind[], rnd);
    const fi = turns.indexOf('flieh');
    if (fi > 9 || fi < 1) continue;
    if (turns.some((k, i) => k === 'kurve' && (turns[i - 1] === 'kurve' || turns[i + 1] === 'kurve'))) continue;
    if (turns[0] === 'kurve') continue;
    break;
  }
  const rows: Seg[] = [];
  for (let i = 0; i < ROWS; i++) {
    const g = rowGeom(i);
    rows.push(add(mkSeg(segs.length, 'rail', 'row', 0, i, [[g.xa, g.y0], [g.xb, g.y1]])));
  }
  const atX = (row: number, x: number) => {
    const g = rowGeom(row);
    return Math.max(10, Math.min(rows[row].len - 10, Math.abs(x - g.xa)));
  };
  // Wenden
  for (let i = 0; i < ROWS - 1; i++) {
    const g = rowGeom(i), gn = rowGeom(i + 1);
    const dr: 1 | -1 = g.xb > 600 ? 1 : -1;
    const kind = turns[i];
    const next = { to: rows[i + 1].id, at: 0 };
    if (kind === 'kurve' || kind === 'flieh') {
      const c = add(mkSeg(segs.length, 'rail', 'curve', 0, i, cubic([g.xb, g.y1], [g.xb + 75 * dr, g.y1 + 5], [g.xb + 75 * dr, gn.y0 - 5], [g.xb, gn.y0])));
      c.exit = { t: 'seg', ...next };
      if (kind === 'kurve') {
        rows[i].exit = { t: 'seg', to: c.id, at: 0 };
        continue;
      }
      // Fliehkurve: zu schnelle Murmeln fliegen auf den Außenweg (Serpentine) und kommen in Reihe i+2 wieder rein
      const tx = g.xb - 150 * dr;
      const ty = rowGeom(i + 2).y0 + (Math.abs(tx - rowGeom(i + 2).xa) * ROW_DROP) / 920;
      const zig: Pt[] = [[g.xb + 30 * dr, g.y1 + 14]];
      const y0z = g.y1 + 40, y1z = ty - 40;
      const n = 7;
      for (let k = 0; k <= n; k++) zig.push([g.xb + (k % 2 ? 40 : 105) * dr, y0z + ((y1z - y0z) * k) / n]);
      zig.push([tx, ty]);
      const o = add(mkSeg(segs.length, 'timed', 'outer', 1, i, zig));
      o.exit = { t: 'seg', to: rows[i + 2].id, at: atX(i + 2, tx) };
      const m: Mixer = { id: mixers.length, kind: 'flieh', turn: i, side: dr, x: g.xb, y: g.y1, out: next, alt: { to: o.id, at: 0 }, curve: c.id, r: 0, r1: 0 };
      mixers.push(m);
      rows[i].exit = { t: 'mix', m: m.id };
      continue;
    }
    const m: Mixer = { id: mixers.length, kind, turn: i, side: dr, x: g.xb + 18 * dr, y: g.y1 + 6, out: next, r: 0, r1: 0 };
    if (kind === 'schanze') {
      const cs = add(mkSeg(segs.length, 'timed', 'catch', 0, i, [[g.xb + 20 * dr, g.y1 + 34], [g.xb + 34 * dr, gn.y0 - 40], [g.xb, gn.y0]], 1.25));
      cs.exit = { t: 'seg', ...next };
      m.alt = { to: cs.id, at: 0 };
    }
    mixers.push(m);
    rows[i].exit = { t: 'mix', m: m.id };
  }
  // Ziel
  const gl = rowGeom(ROWS - 1);
  const finY = gl.y1 + 125;
  const fc = add(mkSeg(segs.length, 'rail', 'curve', 0, ROWS - 1, cubic([gl.xb, gl.y1], [gl.xb - 70, gl.y1 + 10], [gl.xb - 70, finY - 5], [gl.xb, finY])));
  rows[ROWS - 1].exit = { t: 'seg', to: fc.id, at: 0 };
  const fin = add(mkSeg(segs.length, 'rail', 'finish', 0, ROWS - 1, [[140, finY], [1080, finY]]));
  fc.exit = { t: 'seg', to: fin.id, at: 0 };
  fin.exit = { t: 'finish' };

  // Fortschritt entlang der Hauptstrecke
  let r = 0;
  for (let i = 0; i < ROWS; i++) {
    rows[i].r0 = r;
    r += rows[i].len;
    rows[i].r1 = r;
    const ex = rows[i].exit;
    if (ex.t === 'seg') {
      const c = segs[ex.to];
      c.r0 = r;
      r += c.len;
      c.r1 = r;
    } else if (ex.t === 'mix') {
      const m = mixers[ex.m];
      m.r = r;
      if (m.kind === 'flieh') {
        const c = segs[m.curve!];
        c.r0 = r;
        c.r1 = r + c.len;
        m.r1 = c.r1;
        r = c.r1;
      } else {
        r += NOMINAL_MIX;
        m.r1 = r;
      }
    }
  }
  fin.r0 = r;
  fin.r1 = r + fin.len;
  const total = r;
  const routeAt = (row: number, s: number) => rows[row].r0 + s;
  // Zeitwege (hinten): Dauer aus dem Fortschritt
  for (const m of mixers) {
    if (m.kind === 'flieh') {
      const o = segs[m.alt!.to];
      const ex = o.exit as { to: number; at: number };
      o.r0 = m.r;
      o.r1 = routeAt(segs[ex.to].row, ex.at);
      o.dur = (o.r1 - o.r0) / 235 + 1.8;
    } else if (m.kind === 'schanze') {
      const cs = segs[m.alt!.to];
      cs.r0 = m.r;
      cs.r1 = m.r1;
    }
  }

  // Abkürzungen über die hintere Ebene (von Reihe i nach i+2) und der verstaubte Nebenweg
  const branches: Branch[] = [];
  const panels: Panel[] = [];
  const dustRow = rnd() < 0.5 ? 8 : 10;
  const liftTop = dustRow - 2;
  const used = new Set<number>([dustRow, dustRow - 1, liftTop]);
  const fi = turns.indexOf('flieh');
  used.add(fi).add(fi + 1);
  const starts = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd);
  const chosen: number[] = [];
  for (const i of starts) {
    if (chosen.length >= 3) break;
    if (chosen.some((c) => Math.abs(c - i) < 3) || used.has(i) || used.has(i + 2)) continue;
    chosen.push(i);
  }
  for (const i of chosen) {
    const ga = rowGeom(i), gb = rowGeom(i + 2);
    const fa = 0.42 + rnd() * 0.2, fb = 0.3 + rnd() * 0.2;
    const xa = ga.xa + (ga.xb - ga.xa) * fa, xb = gb.xa + (gb.xb - gb.xa) * fb;
    const sa = atX(i, xa), sb = atX(i + 2, xb);
    const ya = posOn(rows[i], sa).y, yb = posOn(rows[i + 2], sb).y;
    const bs = add(mkSeg(segs.length, 'timed', 'branch', 1, i, cubic([xa, ya + 6], [xa, ya + 110], [xb, yb - 110], [xb, yb], 12)));
    bs.exit = { t: 'seg', to: rows[i + 2].id, at: sb };
    bs.r0 = routeAt(i, sa);
    bs.r1 = routeAt(i + 2, sb);
    bs.dur = Math.max(2.2, ((bs.r1 - bs.r0) / 250 + 1.2) * 0.72);
    branches.push({ id: branches.length, seg: rows[i].id, s: sa, to: bs.id, base: 0.12, dust: false });
    const mid = posOn(bs, bs.len * 0.5);
    const pw = 250, ph = 190;
    const px = Math.max(20, Math.min(W - pw - 20, mid.x - pw / 2)), py = mid.y - ph / 2;
    const h1 = posOn(bs, bs.len * 0.38), h2 = posOn(bs, bs.len * 0.62);
    const holes: [number, number, number][] = [];
    for (const h of [h1, h2]) if (h.x > px + 40 && h.x < px + pw - 40 && h.y > py + 40 && h.y < py + ph - 40) holes.push([Math.round(h.x), Math.round(h.y), 34]);
    if (!holes.length) holes.push([Math.round(px + pw / 2), Math.round(py + ph / 2), 34]);
    panels.push({ x: Math.round(px), y: Math.round(py), w: pw, h: ph, holes: holes.slice(0, 2) });
  }
  // Außenweg der Fliehkurve: Platte davor
  {
    const m = mixers.find((x) => x.kind === 'flieh')!;
    const o = segs[m.alt!.to];
    const ys = o.pts.map((p) => p[1]);
    const y0 = Math.min(...ys) + 20, y1 = Math.max(...ys) - 30;
    const x0 = m.side > 0 ? 1062 : 6;
    panels.push({ x: x0, y: Math.round(y0), w: 132, h: Math.round(y1 - y0), holes: [[x0 + 66, Math.round((y0 + y1) / 2), 32]] });
  }
  // Verstaubter Nebenweg → Förderband → zurück nach oben
  const conveyorX = 1180;
  {
    const sd = rows[dustRow].len * 0.86;
    const p = posOn(rows[dustRow], sd);
    const foot = rowGeom(dustRow).y1 + 120;
    const top = rowGeom(liftTop).y1 - 28;
    const ds = add(mkSeg(segs.length, 'timed', 'dust', 1, dustRow, cubic([p.x, p.y + 6], [p.x + 60, p.y + 50], [conveyorX - 30, foot - 40], [conveyorX, foot], 10), 2.2));
    const lift = add(mkSeg(segs.length, 'timed', 'lift', 0, dustRow, [[conveyorX, foot], [conveyorX, top], [1066, rowGeom(liftTop).y1 - 4]], (foot - top) / 130));
    ds.exit = { t: 'seg', to: lift.id, at: 0 };
    lift.exit = rows[liftTop].exit;
    ds.r0 = routeAt(dustRow, sd);
    ds.r1 = ds.r0;
    lift.r0 = ds.r0;
    lift.r1 = rows[liftTop].r1;
    branches.push({ id: branches.length, seg: rows[dustRow].id, s: sd, to: ds.id, base: 0, dust: true });
  }

  // Bauplätze
  const sockets: Socket[] = [];
  for (let i = 0; i < ROWS; i++) {
    const fr = i === 0 ? [0.5] : [0.3, 0.68];
    for (const f of fr) {
      const s = rows[i].len * f;
      if (branches.some((b) => b.seg === rows[i].id && Math.abs(b.s - s) < 80)) continue;
      const p = posOn(rows[i], s);
      sockets.push({ id: sockets.length, seg: rows[i].id, s, x: Math.round(p.x), y: Math.round(p.y), kind: 'rail', row: i });
    }
  }
  for (const b of branches) {
    const s = Math.max(10, b.s - 4);
    const p = posOn(segs[b.seg], s);
    sockets.push({ id: sockets.length, seg: b.seg, s, x: Math.round(p.x), y: Math.round(p.y), kind: 'switch', branch: b.id, row: segs[b.seg].row });
  }

  return {
    H: finY + 90, segs, mixers, branches, sockets, panels, turns, total, start: [600, 60], finishSeg: fin.id, marks: [],
    conveyor: { x: conveyorX, y0: rowGeom(liftTop).y1 - 28, y1: rowGeom(dustRow).y1 + 120 },
  };
}

/** Neuen Bauplatz auf einer Reihe ergänzen (Umbau) */
export function addSocket(track: Track, rnd: () => number = Math.random): Socket | null {
  const rows = track.segs.filter((s) => s.role === 'row');
  for (let k = 0; k < 30; k++) {
    const seg = rows[Math.floor(rnd() * rows.length)];
    const s = seg.len * (0.15 + rnd() * 0.75);
    if (track.sockets.some((o) => o.seg === seg.id && Math.abs(o.s - s) < 110)) continue;
    if (track.branches.some((b) => b.seg === seg.id && Math.abs(b.s - s) < 80)) continue;
    const p = posOn(seg, s);
    const so: Socket = { id: track.sockets.length, seg: seg.id, s, x: Math.round(p.x), y: Math.round(p.y), kind: 'rail', row: seg.row };
    track.sockets.push(so);
    return so;
  }
  return null;
}

/* ---------- Teile auf der Bahn ---------- */

export interface Item {
  id: number;
  kind: ItemKind;
  owner: number;
  socket: number;
  /** 0 = neu, 1 = zweites Rennen (halb so stark) */
  age: number;
  on: boolean;
  cool: number;
  cnt: number;
  exit?: { seg: number; s: number };
  closedUntil: number;
  openFrom: number;
  trig: number;
}

export interface RaceEvent { kind: EventKind; owner: number; at: number; done?: boolean; data?: number[] }

/** Ziel für Wurmloch und Kanone beim Aufstellen festlegen */
export function itemExit(track: Track, kind: ItemKind, socket: Socket, rnd: () => number = Math.random): { seg: number; s: number } | undefined {
  const rows = track.segs.filter((s) => s.role === 'row');
  if (kind === 'kanone') {
    if (socket.row >= ROWS - 1) return undefined;
    const g = rowGeom(socket.row + 1);
    const s = Math.max(20, Math.min(rows[socket.row + 1].len - 20, Math.abs(socket.x - g.xa)));
    return { seg: rows[socket.row + 1].id, s };
  }
  if (kind === 'wurmloch') {
    const back = socket.row > 0 && rnd() < 0.35;
    const row = back ? socket.row - 1 : Math.min(ROWS - 1, socket.row + 1 + (rnd() < 0.5 ? 1 : 0));
    return { seg: rows[row].id, s: rows[row].len * (0.2 + rnd() * 0.6) };
  }
  return undefined;
}

/* ---------- Rennen ---------- */

export const F = { far: 1, back: 2, hidden: 4, done: 8, stuck: 16, boost: 32, shield: 64, air: 128 };

interface Marble {
  i: number;
  owner: number;
  state: 'wait' | 'rail' | 'air' | 'hold' | 'timed' | 'done';
  seg: number;
  s: number;
  v: number;
  lane: 0 | 1;
  f: number;
  x: number;
  y: number;
  route: number;
  // Flug
  ax: number; ay: number; bx: number; by: number; at0: number; adur: number; ah: number; ato: number; aat: number; av: number; ar0: number; ar1: number;
  // Warten in Mischstelle / Grube
  holdUntil: number; holdStart: number; hm: number; hk: string; hseed: number; hnext: { to: number; at: number; v: number; air?: boolean };
  // Zeitweg
  t0: number;
  // Effekte
  stuckUntil: number; slowUntil: number; windUntil: number; boostUntil: number; magnetUntil: number; shield: boolean; hidden: boolean;
  place: number; finishedAt: number; slot: number;
  dusted: boolean;
  warped: Set<number>;
}

export type Fx = (string | number)[];

export class Race {
  t = 0;
  marbles: Marble[];
  fx: Fx[] = [];
  finished: number[] = [];
  queue: number[];
  nextRelease = 0;
  oil: { seg: number; until: number } | null = null;
  quakeUntil = 0;
  giant: { seg: number; s: number; done: boolean } | null = null;
  overtakes = 0;
  private lastOrder: number[] = [];
  private nextSample = 0;
  private mixLast = new Map<number, number>();
  segUse: number[];
  private bySeg = new Map<number, Item[]>();
  private branchAt = new Map<number, Branch[]>();
  private rnd: () => number;

  constructor(public track: Track, owners: number[], public items: Item[], public events: RaceEvent[], rnd: () => number = Math.random, public releaseGap = 0.05) {
    this.rnd = rnd;
    this.marbles = owners.map((owner, i) => ({
      i, owner, state: 'wait', seg: -1, s: 0, v: 0, lane: (i % 2) as 0 | 1, f: 1 + (rnd() * 2 - 1) * 0.03,
      x: track.start[0] + ((i % 8) - 3.5) * 16, y: track.start[1] - 18 + Math.floor(i / 8) * 14, route: -200 + i * 0.01,
      ax: 0, ay: 0, bx: 0, by: 0, at0: 0, adur: 0, ah: 0, ato: 0, aat: 0, av: 0, ar0: 0, ar1: 0,
      holdUntil: 0, holdStart: 0, hm: -1, hk: '', hseed: rnd(), hnext: { to: 0, at: 0, v: 0 }, t0: 0,
      stuckUntil: 0, slowUntil: 0, windUntil: 0, boostUntil: 0, magnetUntil: 0, shield: false, hidden: false,
      place: 0, finishedAt: 0, slot: 0, dusted: false, warped: new Set<number>(),
    }));
    this.queue = owners.map((_, i) => i);
    this.segUse = track.segs.map(() => 0);
    for (const it of items) {
      const so = track.sockets[it.socket];
      if (!so) continue;
      if (!this.bySeg.has(so.seg)) this.bySeg.set(so.seg, []);
      this.bySeg.get(so.seg)!.push(it);
    }
    for (const b of track.branches) {
      if (!this.branchAt.has(b.seg)) this.branchAt.set(b.seg, []);
      this.branchAt.get(b.seg)!.push(b);
    }
  }

  get done() {
    return this.finished.length === this.marbles.length;
  }

  private str(it: Item) {
    return it.age > 0 ? 0.5 : 1;
  }

  /** Fallen haben pro Rennen nur ein paar Ladungen (neu 4, im zweiten Rennen 2) */
  spent(it: Item): boolean {
    if (SORT[it.kind] !== 'falle') return false;
    const max = it.kind === 'schranke' ? (it.age ? 2 : 3) : it.age ? 2 : 4;
    return (it.kind === 'schranke' ? it.cnt : it.trig) >= max;
  }

  private itemAtSocket(socket: number) {
    return this.items.find((it) => it.socket === socket);
  }

  /** Erbauer legt ein Teil um */
  toggle(itemId: number, owner: number): boolean {
    const it = this.items.find((x) => x.id === itemId);
    if (!it || it.owner !== owner || !TOGGLE.includes(it.kind) || this.t < it.cool) return false;
    it.on = !it.on;
    it.cool = this.t + 2;
    this.fx.push(['toggle', it.id, it.on ? 1 : 0]);
    return true;
  }

  private attach(m: Marble, seg: number, s: number, v: number) {
    const sg = this.track.segs[seg];
    if (sg.kind === 'timed') {
      m.state = 'timed';
      m.seg = seg;
      m.t0 = this.t;
      m.s = 0;
      m.v = v;
      return;
    }
    m.state = 'rail';
    m.seg = seg;
    m.s = Math.max(0, Math.min(sg.len - 1, s));
    m.v = v;
    if (sg.role === 'row') this.segUse[seg]++;
    if (sg.role === 'finish') return this.finish(m);
    // freiere Spur nehmen
    let near = [Infinity, Infinity];
    for (const o of this.marbles) {
      if (o === m || o.state !== 'rail' || o.seg !== seg) continue;
      near[o.lane] = Math.min(near[o.lane], Math.abs(o.s - m.s));
    }
    m.lane = near[0] >= near[1] ? 0 : 1;
  }

  private fly(m: Marble, to: number, at: number, v: number, dur: number, h: number) {
    const sg = this.track.segs[to];
    const p = sg.kind === 'timed' ? { x: sg.pts[0][0], y: sg.pts[0][1] } : posOn(sg, at);
    m.state = 'air';
    m.ax = m.x; m.ay = m.y; m.bx = p.x; m.by = p.y;
    m.at0 = this.t; m.adur = dur; m.ah = h; m.ato = to; m.aat = at; m.av = v;
    m.ar0 = m.route;
    m.ar1 = sg.kind === 'timed' ? sg.r0 : sg.r0 + at;
  }

  private hold(m: Marble, mix: Mixer | null, kind: string, dur: number, next: Marble['hnext']) {
    m.state = 'hold';
    m.hm = mix ? mix.id : -1;
    m.hk = kind;
    m.holdStart = this.t;
    m.holdUntil = this.t + dur;
    m.hnext = next;
    m.hseed = this.rnd();
  }

  private finish(m: Marble) {
    m.state = 'done';
    m.place = this.finished.length + 1;
    m.finishedAt = this.t;
    m.slot = this.track.segs[this.track.finishSeg].len - 10 - (m.place - 1) * D;
    this.finished.push(m.i);
    this.fx.push(['finish', m.i, m.place]);
  }

  private exitSeg(m: Marble, ex: Exit, v: number) {
    if (ex.t === 'finish') return this.finish(m);
    if (ex.t === 'seg') {
      const sg = this.track.segs[ex.to];
      if (ex.at > 0 && sg.kind === 'rail') return this.fly(m, ex.to, ex.at, Math.max(90, v * 0.7), 0.35, 14);
      return this.attach(m, ex.to, ex.at, v);
    }
    const mix = this.track.mixers[ex.m];
    const magnet = this.t < m.magnetUntil;
    const nextRow = { to: mix.out.to, at: 0, v: 0 };
    switch (mix.kind) {
      case 'flieh': {
        const p = Math.max(0, Math.min(0.85, (v - MIX.flieh) / 26));
        if (!magnet && this.rnd() < p) {
          this.fx.push(['flieh', m.i]);
          return this.attach(m, mix.alt!.to, 0, v);
        }
        return this.attach(m, mix.curve!, 0, v);
      }
      case 'schanze':
        if (v >= MIX.jump || magnet) {
          this.fx.push(['jump', m.i]);
          return this.fly(m, mix.out.to, 0, v * 0.8, 0.5, 70);
        }
        return this.attach(m, mix.alt!.to, 0, v);
      case 'trichter': {
        const spin = MIX.spin0 + this.rnd() * MIX.spin;
        return this.hold(m, mix, 'trichter', spin, { ...nextRow, v: 70 + this.rnd() * 50, air: true });
      }
      case 'nagel':
        return this.hold(m, mix, 'nagel', MIX.pin0 + this.rnd() * MIX.pin, { ...nextRow, v: 60 + this.rnd() * 80, air: true });
      case 'wippe': {
        // Die Wippe kippt erst, wenn drei Murmeln drauf liegen (oder nach kurzer Zeit): dann rollen alle in zufälliger Reihenfolge weiter
        const waiting = this.marbles.filter((o) => o.state === 'hold' && o.hm === mix.id && o.hk === 'wippe-wait');
        if (waiting.length >= 2) {
          this.fx.push(['wippe', mix.id, 1]);
          for (const o of [...waiting, m]) this.hold(o, mix, 'wippe', 0.05 + this.rnd() * 0.9, { ...nextRow, v: 90, air: true });
          return;
        }
        return this.hold(m, mix, 'wippe-wait', MIX.wippeWait, { ...nextRow, v: 90, air: true });
      }
    }
  }

  private trigger(m: Marble, it: Item) {
    const own = m.owner === it.owner;
    const k = this.str(it);
    const so = this.track.sockets[it.socket];
    const foreignTrap = (fn: () => void) => {
      if (own || this.spent(it)) return;
      if (m.shield) {
        m.shield = false;
        this.fx.push(['shield', m.i, it.id]);
        return;
      }
      it.trig++;
      fn();
      this.fx.push(['trap', it.id, m.i]);
    };
    switch (it.kind) {
      case 'turbo':
        if (own) { m.v += 190 * k; m.boostUntil = this.t + 1.2; this.fx.push(['help', it.id, m.i]); }
        break;
      case 'feder':
        if (own) {
          const sg = this.track.segs[m.seg];
          const to = Math.min(sg.len - 2, m.s + 230 * k);
          this.fx.push(['help', it.id, m.i]);
          this.fly(m, m.seg, to, m.v + 40, 0.45, 55);
        }
        break;
      case 'magnet':
        if (own) { m.magnetUntil = this.t + 4 * k; m.boostUntil = this.t + 4 * k; this.fx.push(['help', it.id, m.i]); }
        break;
      case 'schild':
        if (own && !m.shield) { m.shield = true; this.fx.push(['help', it.id, m.i]); }
        break;
      case 'kleber':
        foreignTrap(() => { m.stuckUntil = this.t + 2 * k; m.v = 0; });
        break;
      case 'gegenfeder':
        foreignTrap(() => { m.v = -170 * k; });
        break;
      case 'falltuer':
        foreignTrap(() => { m.hidden = true; this.hold(m, null, 'grube', 2.5 * k, { to: m.seg, at: m.s + 6, v: 50 }); });
        break;
      case 'wind':
        foreignTrap(() => { m.windUntil = this.t + 1.3 * k; });
        break;
      case 'bremse':
        foreignTrap(() => { m.slowUntil = this.t + 1.6 * k; });
        break;
      case 'schranke':
        if (!own && this.t >= it.openFrom && this.t >= it.closedUntil && !this.spent(it)) {
          if (m.shield) { m.shield = false; this.fx.push(['shield', m.i, it.id]); break; }
          // höchstens 3× pro Rennen, danach mindestens 4 s offen
          it.cnt++;
          it.closedUntil = this.t + 3 * k;
          it.openFrom = it.closedUntil + 4;
          it.trig++;
          this.fx.push(['trap', it.id, m.i]);
        }
        break;
      case 'kanone':
        if (it.on && it.exit) {
          this.fx.push(['kanone', it.id, m.i]);
          this.fly(m, it.exit.seg, it.exit.s, 140, 0.7, 120);
        }
        break;
      case 'wurmloch':
        if (it.on && it.exit && !m.warped.has(it.id)) {
          it.cnt++;
          if (it.cnt % 2 === 0) {
            m.warped.add(it.id);
            this.fx.push(['wurm', it.id, m.i]);
            this.fly(m, it.exit.seg, it.exit.s, 100, 0.3, 0);
          }
        }
        break;
    }
    void so;
  }

  /** Abzweigung: Hauptweg oder Abkürzung? */
  private decide(m: Marble, b: Branch): boolean {
    const so = this.track.sockets.find((s) => s.kind === 'switch' && s.branch === b.id);
    const it = so ? this.itemAtSocket(so.id) : undefined;
    if (it) {
      const own = m.owner === it.owner;
      if (it.kind === 'umleitung') return it.on;
      if (it.kind === 'farbweiche') return own ? it.on : !it.on;
      if (it.kind === 'bruecke' && own && it.on) return true;
    }
    return this.rnd() < b.base;
  }

  step(dt = TICK) {
    this.t += dt;
    const t = this.t;
    const segs = this.track.segs;
    // Start: Murmeln schnell hintereinander loslassen
    while (this.queue.length && t >= this.nextRelease) {
      const i = this.queue[0];
      const m = this.marbles[i];
      const row0 = segs[0];
      const lane = (i % 2) as 0 | 1;
      const blocked = this.marbles.some((o) => o.state === 'rail' && o.seg === 0 && o.lane === lane && o.s < D + 4);
      if (blocked) break;
      this.queue.shift();
      m.x = this.track.start[0];
      m.y = this.track.start[1] + 20;
      m.lane = lane;
      this.fly(m, row0.id, 4, 230, 0.12, 0);
      this.nextRelease = t + this.releaseGap;
    }
    // Ereignisse
    for (const ev of this.events) if (!ev.done && t >= ev.at) this.runEvent(ev);
    if (this.giant) this.stepGiant(dt);

    const quake = t < this.quakeUntil;
    for (const m of this.marbles) {
      if (m.state === 'air') {
        const p = Math.min(1, (t - m.at0) / m.adur);
        m.x = m.ax + (m.bx - m.ax) * p;
        m.y = m.ay + (m.by - m.ay) * p - m.ah * 4 * p * (1 - p);
        m.route = m.ar0 + (m.ar1 - m.ar0) * p;
        if (p >= 1) this.attach(m, m.ato, m.aat, m.av);
        continue;
      }
      if (m.state === 'hold') {
        this.stepHold(m);
        continue;
      }
      if (m.state === 'timed') {
        const sg = segs[m.seg];
        const p = Math.min(1, (t - m.t0) / Math.max(0.1, sg.dur));
        const q = posOn(sg, sg.len * p);
        m.x = q.x;
        m.y = q.y;
        m.route = sg.r0 + (sg.r1 - sg.r0) * p;
        if (p >= 1) this.exitSeg(m, sg.exit, sg.role === 'catch' ? 90 : sg.role === 'lift' ? 60 : 160);
        continue;
      }
      if (m.state === 'done') {
        const sg = segs[this.track.finishSeg];
        if (m.s < m.slot) {
          m.v = Math.max(60, Math.min(m.v, 220));
          m.s = Math.min(m.slot, m.s + m.v * dt);
        }
        const q = posOn(sg, m.s);
        m.x = q.x;
        m.y = q.y - 15;
        m.route = this.track.total + 10000 - m.place;
        continue;
      }
      if (m.state !== 'rail') continue;
      const sg = segs[m.seg];
      const q0 = posOn(sg, m.s);
      const draft = this.draftOf(m) ? MIX.draft : 1;
      let a = MIX.g * q0.slope * m.f - MIX.drag * sg.wear * draft * m.v + (this.rnd() - 0.5) * MIX.noise;
      if (this.oil && this.oil.seg === m.seg && t < this.oil.until) a += MIX.drag * 0.6 * m.v + 60;
      if (t < m.magnetUntil) a += MIX.drag * 90;
      if (t < m.windUntil) a -= MIX.drag * 420;
      if (quake) a += (this.rnd() - 0.5) * 900;
      m.v += a * dt;
      if (t < m.slowUntil) m.v = Math.min(m.v, 110);
      if (t < m.stuckUntil) m.v = 0;
      m.v = Math.max(-320, Math.min(MIX.vmax, m.v));
      const s0 = m.s;
      let s1 = m.s + m.v * dt;
      if (s1 < 0) { s1 = 0; m.v = Math.max(0, m.v); }
      // Schranken
      for (const it of this.bySeg.get(m.seg) ?? []) {
        if (it.kind !== 'schranke') continue;
        const so = this.track.sockets[it.socket];
        if (t < it.closedUntil && s0 <= so.s - R + 1 && s1 > so.s - R) {
          s1 = so.s - R;
          m.v = 0;
        }
      }
      m.s = s1;
      // Teile und Abzweigungen beim Überfahren
      for (const it of this.bySeg.get(m.seg) ?? []) {
        const so = this.track.sockets[it.socket];
        if (s0 < so.s && s1 >= so.s) {
          this.trigger(m, it);
          if (m.state !== 'rail' || m.seg !== sg.id) break;
        }
      }
      if (m.state === 'rail' && m.seg === sg.id) {
        for (const b of this.branchAt.get(m.seg) ?? []) {
          if (s0 < b.s && m.s >= b.s && !(b.dust && m.dusted) && this.decide(m, b)) {
            if (b.dust) m.dusted = true;
            this.fx.push(['branch', b.id, m.i]);
            this.attach(m, b.to, 0, m.v);
            break;
          }
        }
      }
      if (m.state !== 'rail' || m.seg !== sg.id) continue;
      if (m.s >= sg.len) {
        const over = m.s - sg.len;
        const ex = sg.exit;
        const p = posOn(sg, sg.len);
        m.x = p.x;
        m.y = p.y - 15;
        this.exitSeg(m, ex, m.v);
        if (m.state === 'rail') m.s += over;
        continue;
      }
    }
    this.collide();
    for (const m of this.marbles) {
      if (m.state !== 'rail') continue;
      const sg = segs[m.seg];
      const q = posOn(sg, m.s);
      m.x = q.x;
      m.y = q.y - (m.lane ? 21 : 15);
      m.route = sg.r0 + m.s;
    }
    // Überholungen zählen (alle 0,5 s: wie oft hat sich die Reihenfolge zweier Murmeln gedreht?)
    if (t >= this.nextSample) {
      this.nextSample = t + 0.5;
      const live = this.marbles.filter((m) => m.state !== 'wait').sort((a, b) => b.route - a.route).map((m) => m.i);
      if (this.lastOrder.length) {
        const pos = new Map(this.lastOrder.map((id, k) => [id, k]));
        for (let x = 0; x < live.length; x++) for (let y = x + 1; y < live.length; y++) {
          const px = pos.get(live[x]), py = pos.get(live[y]);
          if (px !== undefined && py !== undefined && px > py) this.overtakes++;
        }
      }
      this.lastOrder = live;
    }
  }

  private collide() {
    const groups = new Map<number, Marble[]>();
    for (const m of this.marbles) {
      if (m.state !== 'rail') continue;
      if (!groups.has(m.seg)) groups.set(m.seg, []);
      groups.get(m.seg)!.push(m);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => b.s - a.s);
      for (let k = 1; k < list.length; k++) {
        const m = list[k];
        // nächste Murmel davor in derselben Spur
        let ahead: Marble | null = null;
        for (let j = k - 1; j >= 0; j--) if (list[j].lane === m.lane) { ahead = list[j]; break; }
        if (!ahead || ahead.s - m.s >= D) {
          // ab und zu zurück in die vordere Spur
          if (m.lane === 1 && this.rnd() < 0.01 && this.laneFree(list, m, 0)) m.lane = 0;
          continue;
        }
        if (m.v > ahead.v - 5 && this.laneFree(list, m, (1 - m.lane) as 0 | 1)) {
          m.lane = (1 - m.lane) as 0 | 1;
          continue;
        }
        const va = Math.max(0, ahead.v), vm = m.v;
        if (vm > va || ahead.v < 0) {
          // Anstoßen: der Hintere bremst ab, der Vordere bekommt nur einen kleinen Schubs (nie rückwärts weitergeben)
          ahead.v = va + Math.max(0, vm - va) * MIX.push;
          m.v = Math.min(Math.max(0, vm), va);
        }
        m.s = ahead.s - D;
      }
    }
  }

  /** Windschatten: eine Murmel knapp davor (gleicher Abschnitt) */
  private draftOf(m: Marble): boolean {
    for (const o of this.marbles) {
      if (o !== m && o.state === 'rail' && o.seg === m.seg && o.s > m.s && o.s - m.s < MIX.draftDist) return true;
    }
    return false;
  }

  private laneFree(list: Marble[], m: Marble, lane: 0 | 1) {
    return !list.some((o) => o !== m && o.lane === lane && Math.abs(o.s - m.s) < D + 1);
  }

  private stepHold(m: Marble) {
    const t = this.t;
    const mix = m.hm >= 0 ? this.track.mixers[m.hm] : null;
    const p = Math.min(1, (t - m.holdStart) / Math.max(0.05, m.holdUntil - m.holdStart));
    if (mix) {
      m.route = mix.r + (mix.r1 - mix.r) * p * 0.9;
      const dr = mix.side;
      if (m.hk === 'trichter') {
        const cx = mix.x + 4 * dr, top = mix.y + 2;
        const ang = m.hseed * 6.28 + (t - m.holdStart) * (5 + p * 6);
        const rx = 50 * (1 - p * 0.75);
        m.x = cx + Math.cos(ang) * rx;
        m.y = top + 18 + p * 46 + Math.sin(ang) * 6 * (1 - p);
      } else if (m.hk === 'nagel') {
        const x0 = dr > 0 ? 1000 : 58;
        const g = this.track.segs[mix.out.to];
        const yb = g.pts[0][1] - 18;
        m.x = Math.max(x0 + 6, Math.min(x0 + 124, mix.x + Math.sin(p * 9 + m.hseed * 20) * 34 * (0.4 + p)));
        m.y = mix.y + 6 + (yb - mix.y - 6) * p;
      } else if (m.hk === 'wippe' || m.hk === 'wippe-wait') {
        m.x = mix.x + (m.hk === 'wippe-wait' ? -20 : 70) * dr;
        m.y = mix.y + (m.hk === 'wippe-wait' ? 22 : 46);
      }
    } else {
      m.route = this.track.segs[m.seg].r0 + m.s;
    }
    if (t < m.holdUntil) return;
    // Trichter lässt nur nacheinander raus
    if (mix && m.hk === 'trichter') {
      const last = this.mixLast.get(mix.id) ?? -9;
      if (t < last + MIX.gap) {
        // wer als Nächstes rausfällt, ist Zufall
        m.holdUntil = t + this.rnd() * 0.4;
        return;
      }
      this.mixLast.set(mix.id, t);
    }
    m.hidden = false;
    const n = m.hnext;
    if (n.air) this.fly(m, n.to, n.at, n.v, 0.3, 6);
    else this.attach(m, n.to, n.at, n.v);
  }

  private runEvent(ev: RaceEvent) {
    ev.done = true;
    const rows = this.track.segs.filter((s) => s.role === 'row');
    this.fx.push(['event', ev.kind, ev.owner]);
    if (ev.kind === 'beben') {
      this.quakeUntil = this.t + 2;
      for (const m of this.marbles) if (m.state === 'rail' && this.rnd() < 0.5) m.lane = (1 - m.lane) as 0 | 1;
    } else if (ev.kind === 'oel') {
      // Abschnitt, auf dem gerade die meisten Murmeln sind oder bald sein werden
      const count = rows.map((r) => this.marbles.filter((m) => m.state === 'rail' && (m.seg === r.id || m.seg === r.id - 1)).length);
      const best = count.indexOf(Math.max(...count));
      this.oil = { seg: rows[Math.max(0, best)].id, until: this.t + 8 };
      ev.data = [this.oil.seg];
    } else if (ev.kind === 'riese') {
      this.giant = { seg: rows[0].id, s: 0, done: false };
    } else if (ev.kind === 'tausch') {
      const owners = [...new Set(this.marbles.map((m) => m.owner))];
      if (owners.length >= 2) {
        const a = owners.splice(Math.floor(this.rnd() * owners.length), 1)[0];
        const b = owners[Math.floor(this.rnd() * owners.length)];
        for (const m of this.marbles) m.owner = m.owner === a ? b : m.owner === b ? a : m.owner;
        ev.data = [a, b];
      }
    }
  }

  /** Riesenmurmel: rollt die Hauptstrecke hinunter, wen sie einholt, der bleibt kurz liegen */
  private stepGiant(dt: number) {
    const g = this.giant!;
    if (g.done) return;
    const segs = this.track.segs;
    g.s += 430 * dt;
    let sg = segs[g.seg];
    while (g.s >= sg.len) {
      g.s -= sg.len;
      const ex = sg.exit;
      if (ex.t === 'finish') { g.done = true; return; }
      if (ex.t === 'seg') g.seg = ex.to;
      else {
        const mix = this.track.mixers[ex.m];
        g.seg = mix.kind === 'flieh' ? mix.curve! : mix.out.to;
      }
      sg = segs[g.seg];
      if (sg.role === 'finish') { g.done = true; return; }
    }
    for (const m of this.marbles) {
      if (m.state === 'rail' && m.seg === g.seg && Math.abs(m.s - g.s) < 22 && m.stuckUntil < this.t) {
        m.stuckUntil = this.t + 1.1;
        m.v = 0;
        this.fx.push(['platt', m.i]);
      }
    }
  }

  giantPos(): [number, number] | null {
    const g = this.giant;
    if (!g || g.done) return null;
    const p = posOn(this.track.segs[g.seg], g.s);
    return [Math.round(p.x), Math.round(p.y - 26)];
  }

  /** Stream-Daten: [x, y, Flags] je Murmel */
  frame(): number[][] {
    return this.marbles.map((m) => {
      let f = 0;
      if (m.state === 'rail' && m.lane) f |= F.far;
      const sg = m.seg >= 0 ? this.track.segs[m.seg] : null;
      if (m.state === 'timed' && sg && sg.layer === 1) f |= F.back;
      if (m.hidden || m.state === 'wait') f |= F.hidden;
      if (m.state === 'done') f |= F.done;
      if (this.t < m.stuckUntil) f |= F.stuck;
      if (this.t < m.boostUntil) f |= F.boost;
      if (m.shield) f |= F.shield;
      if (m.state === 'air') f |= F.air;
      return [Math.round(m.x), Math.round(m.y), f];
    });
  }

  /** Rangfolge aller Murmeln (beste zuerst) */
  order(): number[] {
    return this.marbles.slice().sort((a, b) => b.route - a.route).map((m) => m.i);
  }

  progress(m: number): number {
    const r = this.marbles[m].route;
    return Math.max(0, Math.min(1, r / this.track.total));
  }
}

/* ---------- Durchmisch-Prüfung ---------- */

export function spearman(start: number[], finish: number[]): number {
  const n = finish.length;
  if (n < 3) return 0;
  const sPos = new Map(start.map((id, k) => [id, k]));
  // Startränge nur unter den angekommenen Murmeln
  const ranked = finish.slice().sort((a, b) => sPos.get(a)! - sPos.get(b)!);
  const sr = new Map(ranked.map((id, k) => [id, k]));
  let d2 = 0;
  finish.forEach((id, k) => (d2 += (sr.get(id)! - k) ** 2));
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export interface CheckResult { rho: number; overtakes: number; time: number; ok: boolean }

/** Bahn ohne Teile mehrmals durchfahren lassen: Ähnelt das Ziel dem Start? Wie oft wird überholt? */
export function checkTrack(track: Track, runs = 12, marbles = 32, rnd: () => number = Math.random): CheckResult {
  let rho = 0, ov = 0, time = 0;
  for (let k = 0; k < runs; k++) {
    const owners = Array.from({ length: marbles }, (_, i) => i % 8);
    const race = new Race(track, owners, [], [], rnd);
    while (!race.done && race.t < 140) race.step();
    rho += spearman(owners.map((_, i) => i), race.finished);
    ov += race.overtakes;
    time += race.t;
  }
  rho /= runs;
  ov /= runs;
  time /= runs;
  return { rho, overtakes: ov, time, ok: rho < 0.3 && ov >= 40 };
}

/** Bahn erzeugen, die gut durchmischt (bis zu `tries` Versuche, sonst die beste) */
export function generateGoodTrack(tries = 8, runs = 10, rnd: () => number = Math.random): { track: Track; check: CheckResult } {
  let best: { track: Track; check: CheckResult } | null = null;
  for (let k = 0; k < tries; k++) {
    const track = generateTrack(rnd);
    const check = checkTrack(track, runs, 32, rnd);
    if (!best || check.rho < best.check.rho) best = { track, check };
    if (check.ok) return { track, check };
  }
  return best!;
}
