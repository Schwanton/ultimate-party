/**
 * Murmel-Mayhem – Bahn aus Bausteinen und echte 2D-Physik (ohne Netzwerk, auch für Tests).
 *
 * Die Welt ist 2400 breit und hat zwei Hälften. Links geht es in Reihen hinunter, ein Förderband trägt
 * die Murmeln (der Reihe nach) ganz nach oben, rechts folgen lange Abfahrt, Gabelung mit Looping,
 * Glasspirale und die letzten Reihen bis ins Ziel. Bausteine mitten in Reihen: Treppe, Sprungschanze,
 * Nägel-Stufe. Bausteine an Reihenenden: offen, Trichter, Nagelfeld, Wippe. Die beiden Hälften sind strikt getrennt.
 * Jede Partie würfelt, welche Reihe welchen Baustein bekommt. Weltkoordinaten: y nach unten.
 */

export const W = 2400;
export const R = 9;
export const TICK = 1 / 30;
export const SUB = 4;
const G = 1150;
const SLOPE = 0.055;
/** Platz zwischen Reihenende und nächster Reihe (für jeden Endbaustein gleich, damit ein Umbau nichts verschiebt) */
const END_SPACE = 170;

export type Pt = [number, number];
export type ItemKind = 'turbo' | 'feder' | 'magnet' | 'schild' | 'kleber' | 'schranke' | 'gegenfeder' | 'falltuer' | 'wind' | 'bremse' | 'farbweiche' | 'umleitung' | 'wurmloch' | 'kanone';
export type EventKind = 'beben' | 'oel' | 'riese' | 'tausch';
export type CardKind = ItemKind | EventKind;
export type Sort = 'hilfe' | 'falle' | 'weiche' | 'ereignis';

export const SORT: Record<CardKind, Sort> = {
  turbo: 'hilfe', feder: 'hilfe', magnet: 'hilfe', schild: 'hilfe',
  kleber: 'falle', schranke: 'falle', gegenfeder: 'falle', falltuer: 'falle', wind: 'falle', bremse: 'falle',
  farbweiche: 'weiche', umleitung: 'weiche', wurmloch: 'weiche', kanone: 'weiche',
  beben: 'ereignis', oel: 'ereignis', riese: 'ereignis', tausch: 'ereignis',
};
/** Klappen brauchen eine Schiene darunter (Bauplatz mit hole = true) */
export const HOLE: CardKind[] = ['farbweiche', 'umleitung'];
/** Teile, die ihr Erbauer im Rennen umlegen kann */
export const TOGGLE: CardKind[] = ['farbweiche', 'umleitung', 'wurmloch', 'kanone'];
export const TOGGLE_START: Partial<Record<CardKind, boolean>> = { farbweiche: true, umleitung: false, wurmloch: false, kanone: false };
/** Ladungen einer Falle pro Rennen */
const CHARGES: Partial<Record<ItemKind, number>> = { kleber: 5, schranke: 3, gegenfeder: 4, falltuer: 4, wind: 3, bremse: 6 };

/** Endbausteine (änderbar beim Umbau) und feste Enden */
export type EndKind = 'offen' | 'trichter' | 'nagel' | 'wippe' | 'lotterie' | 'rad' | 'band' | 'gabel' | 'fall' | 'spirale' | 'ziel';
export const SWAP_ENDS: EndKind[] = ['offen', 'trichter', 'nagel', 'wippe', 'lotterie'];
export type MidKind = 'treppe' | 'schanze' | 'stufe' | 'trampolin' | 'drehkreuz';
const MIDS: MidKind[] = ['treppe', 'schanze', 'stufe', 'trampolin', 'drehkreuz'];
const MID: Record<MidKind, { len: number; drop: number }> = { treppe: { len: 336, drop: 176 }, schanze: { len: 145, drop: 102 }, stufe: { len: 0, drop: 50 }, trampolin: { len: 150, drop: 30 }, drehkreuz: { len: 0, drop: 0 } };

/** Bahnformen: jede Partie eine, zufällig auch gespiegelt */
export const DESIGNS = ['klassisch', 'turm', 'xbahn', 'sanduhr', 'tuerme', 'treppenhaus', 'querbahn'] as const;
export type DesignName = (typeof DESIGNS)[number];

export interface Row {
  i: number;
  key: string;
  dir: 1 | -1;
  /** Ebene (nur bei der X-Bahn: 1 hinten, 2 vorn; sonst 0) */
  layer: number;
  /** Höhenprofil entlang der Schiene (für Bauplätze, Teile, Sensoren) */
  pts: Pt[];
  /** Bausteine in der Reihe: Art und Index im Profil, an dem sie beginnen */
  mids: { kind: MidKind; k: number }[];
  /** Bereiche ohne Bauplatz */
  busy: [number, number][];
  end: EndKind;
  /** Darf das Ende beim Umbau getauscht werden? */
  endable: boolean;
  /** Welche Endbausteine passen (bei engem Abstand keine Trommel) */
  endOk: EndKind[];
  /** Wendewand hinter dem Reihenende (x) und Abstand bis zur nächsten Reihe */
  turn: number | null;
  space: number;
  wear: number;
}
export interface Seg { ax: number; ay: number; bx: number; by: number; th: number; e: number; kind: 'rail' | 'wall' | 'glass' | 'frame' | 'tramp'; row: number; layer: number }
export interface Pin { x: number; y: number; r: number; layer: number }
export interface WippeDef { px: number; py: number; half: number; rest: number; layer?: number }
export interface WheelDef { cx: number; cy: number; r: number; hub: number; n: number; w: number; pick: Pt; rel: number; out: number; row: number }
/** Drehkreuz: vier Arme drehen sich über der Schiene */
export interface TurnDef { cx: number; cy: number; r: number; w: number; layer?: number }
/** Lotterie-Trommel: drehende Trommel mit Rippen, oben Einwurf, vorn ein Ausgang */
export interface DrumDef { cx: number; cy: number; r: number; w: number; inA: number; outA: number; gap: number; layer?: number }
export interface Socket { id: number; row: number; x: number; y: number; hole: boolean }
export interface Mark { row: number; kind: 'delle' | 'poliert' }
/** Wand (Trennwand über die ganze Höhe oder Wendewand am Reihenende) */
export interface WallDef { x: number; y0: number; y1: number; kind: 'wall' | 'glass'; layer: number }
/** Förderband: Fuß am Ende einer Reihe, oben eine Glasröhre zum Anfang der nächsten Strecke */
export interface Lift { x: number; y0: number; y1: number; d: 1 | -1; sp: number; v: number; over: Pt[]; layer: number }

export interface Track {
  W: number;
  H: number;
  design: DesignName;
  mirrored: boolean;
  /** Startpunkt der Murmeln (Mitte des Start-Trichters) */
  startX: number;
  rows: Row[];
  walls: WallDef[];
  lifts: Lift[];
  /** Gabelung mit Kippweiche und Looping (nicht jede Bahnform hat eine) */
  fork: { ex: number; ey: number; d: 1 | -1 } | null;
  rocker: { px: number; py: number; half: number } | null;
  loop: { cx: number; cy: number; r: number; dir: 1 | -1 } | null;
  /** Glasspirale (leer, wenn es keine gibt); d = Fahrtrichtung der Reihe davor */
  spiral: Pt[];
  spiralDir: 1 | -1;
  segs: Seg[];
  pins: Pin[];
  wippes: WippeDef[];
  wheels: WheelDef[];
  turns: TurnDef[];
  drums: DrumDef[];
  sockets: Socket[];
  finish: { x0: number; x1: number; y: number };
  labels: { t: string; x: number; y: number }[];
  marks: Mark[];
  /** Strecke für Fortschritt und Kamerafahrt */
  route: Pt[];
}

export function railY(row: Row, x: number): number {
  const p = row.pts;
  const d = row.dir;
  if (d * (x - p[0][0]) <= 0) return p[0][1];
  for (let k = 1; k < p.length; k++) {
    if (d * (x - p[k][0]) <= 0) {
      const dx = p[k][0] - p[k - 1][0];
      if (dx === 0) return p[k][1];
      return p[k - 1][1] + ((x - p[k - 1][0]) / dx) * (p[k][1] - p[k - 1][1]);
    }
  }
  return p[p.length - 1][1];
}
const xa = (r: Row) => r.pts[0][0];
const xb = (r: Row) => r.pts[r.pts.length - 1][0];
const endY = (r: Row) => r.pts[r.pts.length - 1][1];

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/* ---------- Bahn erzeugen ---------- */

const isFrame = (x: number) => x <= 22 || x >= W - 22;

/**
 * Baut eine Strecke Reihe für Reihe. Jede Reihe läuft von der letzten Wendewand bis kurz vor die nächste;
 * dort fallen die Murmeln auf die nächste Reihe, die in die Gegenrichtung läuft.
 */
class Builder {
  rows: Row[] = [];
  walls: WallDef[] = [];
  lifts: Lift[] = [];
  fork: Track['fork'] = null;
  rocker: Track['rocker'] = null;
  loop: Track['loop'] = null;
  spiral: Pt[] = [];
  spiralDir: 1 | -1 = -1;
  finish: Track['finish'] = { x0: 0, x1: 0, y: 0 };
  slope = SLOPE;
  endSpace = END_SPACE;
  /** Bausteine pro Reihe: 1 normal, 2 bei der Querbahn */
  midsPerRow = 1;
  private pool: MidKind[];
  private next = 0;
  constructor(private rnd: () => number, public x: number, public y: number, public d: 1 | -1, public layer = 0) {
    this.pool = shuffle(MIDS, rnd);
  }

  /** Reihe anlegen, lange Reihen bekommen (meist) Bausteine in der Mitte */
  private make(x1: number, end: EndKind): Row {
    const d = this.d, rnd = this.rnd, slope = this.slope;
    const r: Row = { i: this.rows.length, key: `r${this.rows.length}`, dir: d, layer: this.layer, pts: [[this.x, this.y]], mids: [], busy: [], end, endable: false, endOk: [], turn: null, space: this.endSpace, wear: 1 };
    const x0 = this.x, len = Math.abs(x1 - x0);
    let cx = x0, cy = this.y;
    if (len >= 600 && rnd() < 0.75) {
      const n = this.midsPerRow > 1 && len >= 1500 ? 2 : 1;
      const fr = n === 2 ? [0.22 + rnd() * 0.1, 0.58 + rnd() * 0.1] : [0.38 + rnd() * 0.2];
      for (const f of fr) {
        const kind = this.pool[this.next++ % this.pool.length];
        const m = MID[kind];
        const mx = Math.round(x0 + d * len * f);
        if ((mx - cx) * d < 60 || (x1 - (mx + d * m.len)) * d < 220) continue;
        const ym = cy + Math.abs(mx - cx) * slope;
        r.pts.push([mx, ym]);
        r.mids.push({ kind, k: r.pts.length - 1 });
        const ex = mx + d * m.len, ey = ym + m.drop + m.len * slope * 0.3;
        r.pts.push([ex, ey]);
        const a = mx - d * (kind === 'drehkreuz' ? 80 : 40), b = ex + d * (kind === 'stufe' ? 170 : kind === 'drehkreuz' ? 80 : 60);
        r.busy.push([Math.min(a, b), Math.max(a, b)]);
        cx = ex; cy = ey;
      }
    }
    r.pts.push([x1, cy + Math.abs(x1 - cx) * slope]);
    this.rows.push(r);
    return r;
  }

  /** Reihe bis zur Wendewand bei turnX, danach geht es in Gegenrichtung weiter */
  row(turnX: number): Row {
    const d = this.d;
    const r = this.make(turnX - d * 130, 'offen');
    r.endable = true;
    r.endOk = this.endSpace >= 170 ? SWAP_ENDS : ['offen', 'trichter', 'nagel', 'wippe'];
    r.turn = turnX;
    this.x = turnX - d * 14;
    this.y = endY(r) + this.endSpace;
    this.d = -d as 1 | -1;
    return r;
  }

  /** Letzte Reihe einer Strecke: endet am Förderband, das zum Anfang der nächsten Strecke fährt */
  lift(turnX: number, to: { x: number; y: number; d: 1 | -1; layer?: number }) {
    const d = this.d;
    const r = this.make(turnX - d * 82, 'band');
    const e = r.pts[r.pts.length - 1];
    r.pts.push([turnX - d * 58, e[1] + 12]);
    const foot = e[1] + 12;
    const cx = turnX - d * 80;
    const y1 = to.y - 34;
    const p0: Pt = [cx, y1 - 6], c1: Pt = [cx, y1 - 80], c2: Pt = [to.x - to.d * 20, y1 - 80], p3: Pt = [to.x + to.d * 8, to.y - 22];
    const over: Pt[] = [];
    for (let n = 0; n <= 14; n++) {
      const t = n / 14, u = 1 - t;
      over.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]]);
    }
    this.lifts.push({ x: cx, y0: foot, y1, d, sp: 32, v: 260, over, layer: to.layer ?? this.layer });
    this.x = to.x; this.y = to.y; this.d = to.d; this.layer = to.layer ?? this.layer;
  }

  /** Reihe zur Gabelung: Glastrichter, Kippweiche, kurzer Weg A und Weg B mit Looping; danach Sammelreihe */
  forkRow(turnX: number) {
    const d = this.d;
    const r = this.make(turnX - d * 128, 'gabel');
    const [ex, ey] = r.pts[r.pts.length - 1];
    this.fork = { ex, ey, d };
    this.rocker = { px: ex + d * 40, py: ey + 95, half: 55 };
    const nd = -d as 1 | -1;
    const a: Row = { i: this.rows.length, key: 'A', dir: nd, layer: this.layer, pts: [[ex - d * 5, ey + 165], [ex - d * 550, ey + 215]], mids: [], busy: [], end: 'fall', endable: false, endOk: [], turn: null, space: 0, wear: 1 };
    this.rows.push(a);
    const lx = ex - d * 230;
    const b: Row = { i: this.rows.length, key: 'B', dir: nd, layer: this.layer, pts: [[ex + d * 122, ey + 195], [lx, ey + 285], [ex - d * 490, ey + 305]], mids: [], busy: [[Math.min(lx - 70, lx + 70), Math.max(lx - 70, lx + 70)]], end: 'fall', endable: false, endOk: [], turn: null, space: 0, wear: 1 };
    this.rows.push(b);
    this.loop = { cx: lx, cy: ey + 241, r: 44, dir: nd };
    this.x = ex - d * 420;
    this.y = ey + 365;
    this.d = nd;
  }

  /** Reihe in die Glasspirale; sie schraubt sich hinunter und gibt die Murmeln in Gegenrichtung ab */
  spiralRow(endX: number) {
    const d = this.d;
    const r = this.make(endX, 'spirale');
    const [ex, ey] = r.pts[r.pts.length - 1];
    const mx = ex + d * 30, my = ey + 12;
    this.spiral = [];
    for (let k = 0; k <= 160; k++) {
      const u = k / 160;
      this.spiral.push([Math.round(mx - d * 60 * u + 105 * Math.sin(u * 4 * Math.PI) * -d), Math.round(my + 448 * u)]);
    }
    this.spiralDir = d;
    this.x = mx - d * 50;
    this.y = my + 478;
    this.d = -d as 1 | -1;
  }

  /** Letzte Reihe: endet über dem Zielkasten */
  finishRow(endX: number) {
    const d = this.d;
    const r = this.make(endX, 'ziel');
    const [ex, ey] = r.pts[r.pts.length - 1];
    const a = ex + d * 50, b = ex - d * 370;
    this.finish = { x0: Math.min(a, b), x1: Math.max(a, b), y: ey + 100 };
  }
}

/** Bahnform als Folge von Reihen */
function layout(design: DesignName, rnd: () => number): Builder {
  const jitter = (x: number, n = 60) => Math.round(x + (rnd() - 0.5) * 2 * n);
  let b: Builder;
  switch (design) {
    case 'turm': {
      // eine lange Strecke nur nach unten: oben breit, in der Mitte schmal, unten wieder breit
      b = new Builder(rnd, 30, 150, 1);
      b.row(2378); b.row(22);
      const l = jitter(700, 80), r = jitter(1700, 80);
      b.row(r); b.row(l); b.row(r); b.row(l);
      b.forkRow(2378);
      b.spiralRow(jitter(1150, 80));
      b.finishRow(jitter(2000, 80));
      break;
    }
    case 'xbahn': {
      // oben links nach unten rechts, Förderband nach oben rechts, dann nach unten links – die Wege kreuzen sich
      b = new Builder(rnd, 30, 150, 1, 1);
      for (const t of [1000, 300, 1300, 600, 1600, 900]) b.row(t);
      b.lift(1900, { x: 2370, y: 150, d: -1, layer: 2 });
      for (const t of [1400, 2100, 1100, 1800, 800, 1500]) b.row(t);
      b.finishRow(500);
      break;
    }
    case 'sanduhr': {
      // die Reihen werden zur Mitte hin immer kürzer, dann wieder breiter
      b = new Builder(rnd, 30, 150, 1);
      for (const t of [2378, 22, 1900, 500, 1500, 900]) b.row(t);
      b.forkRow(2378);
      b.row(22);
      b.finishRow(jitter(1400, 100));
      break;
    }
    case 'tuerme': {
      // drei Türme nebeneinander, Förderbänder verbinden sie
      b = new Builder(rnd, 30, 150, 1);
      b.row(800); b.row(22); b.row(800); b.row(22);
      b.lift(800, { x: 815, y: 163, d: 1 });
      b.row(1600); b.row(800); b.row(1600); b.row(800);
      b.lift(1600, { x: 1615, y: 163, d: 1 });
      b.row(2378); b.row(1600); b.row(2378);
      b.finishRow(1900);
      break;
    }
    case 'treppenhaus': {
      // vier schmale Türme mit vielen kurzen Reihen
      b = new Builder(rnd, 30, 150, 1);
      b.endSpace = 140;
      const walls = [600, 1200, 1800];
      let left = 22;
      for (let t = 0; t < 3; t++) {
        const right = walls[t];
        b.row(right); b.row(left); b.row(right); b.row(left);
        b.lift(right, { x: right + 15, y: 163, d: 1 });
        left = right;
      }
      b.row(2378); b.row(1800); b.row(2378);
      b.finishRow(2000);
      break;
    }
    case 'querbahn': {
      // wenige, sehr lange Reihen über die ganze Breite, steiler und mit zwei Bausteinen pro Reihe
      b = new Builder(rnd, 30, 150, 1);
      b.slope = 0.075;
      b.midsPerRow = 2;
      b.row(2378); b.row(22);
      b.forkRow(2378);
      b.spiralRow(jitter(1270, 60));
      b.row(2378); b.row(22);
      b.finishRow(jitter(1500, 120));
      break;
    }
    default: {
      // klassisch: links hinunter, Förderband, rechts mit Gabelung, Looping und Glasspirale
      b = new Builder(rnd, 30, 150, 1);
      b.row(1190); b.row(22); b.row(1190); b.row(22);
      b.lift(1190, { x: 1205, y: 163, d: 1 });
      b.forkRow(2378);
      b.spiralRow(1270);
      b.row(2378);
      b.finishRow(1280);
    }
  }
  return b;
}

/** Trennwände über die ganze Höhe (zwischen Hälften und Türmen) */
const FULL_WALLS: Partial<Record<DesignName, number[]>> = { klassisch: [1190], tuerme: [800, 1600], treppenhaus: [600, 1200, 1800] };

function mirrorTrack(t: Track) {
  const mx = (x: number) => W - x;
  t.mirrored = true;
  t.startX = mx(t.startX);
  for (const r of t.rows) {
    r.pts = r.pts.map(([x, y]) => [mx(x), y]);
    r.dir = -r.dir as 1 | -1;
    r.busy = r.busy.map(([a, b]) => [mx(b), mx(a)]);
    if (r.turn !== null) r.turn = mx(r.turn);
  }
  t.walls = t.walls.map((w) => ({ ...w, x: mx(w.x) }));
  t.lifts = t.lifts.map((l) => ({ ...l, x: mx(l.x), d: -l.d as 1 | -1, over: l.over.map(([x, y]) => [mx(x), y]) }));
  if (t.fork) t.fork = { ...t.fork, ex: mx(t.fork.ex), d: -t.fork.d as 1 | -1 };
  if (t.rocker) t.rocker = { ...t.rocker, px: mx(t.rocker.px) };
  if (t.loop) t.loop = { ...t.loop, cx: mx(t.loop.cx), dir: -t.loop.dir as 1 | -1 };
  t.spiral = t.spiral.map(([x, y]) => [mx(x), y]);
  t.spiralDir = -t.spiralDir as 1 | -1;
  t.finish = { x0: mx(t.finish.x1), x1: mx(t.finish.x0), y: t.finish.y };
}

export function generateTrack(rnd: () => number = Math.random, design?: DesignName, mirrored?: boolean): Track {
  const name = design ?? DESIGNS[Math.floor(rnd() * DESIGNS.length)];
  const b = layout(name, rnd);
  const rows = b.rows;
  // Enden verteilen: je eine Trommel, ein Trichter, ein Nagelfeld, eine Wippe, der Rest gemischt
  const endable = shuffle(rows.filter((r) => r.endable), rnd);
  const must: EndKind[] = ['lotterie', 'trichter', 'nagel', 'wippe'];
  for (const r of endable) {
    const want = must.find((e) => r.endOk.includes(e));
    if (want) { r.end = want; must.splice(must.indexOf(want), 1); }
    else r.end = rnd() < 0.45 ? 'offen' : r.endOk[Math.floor(rnd() * r.endOk.length)];
  }
  const bottom = Math.max(b.finish.y, ...rows.map((r) => r.pts[r.pts.length - 1][1]), ...b.lifts.map((l) => l.y0));
  const H = Math.round(bottom + 160);
  for (const x of FULL_WALLS[name] ?? []) b.walls.push({ x, y0: -300, y1: H, kind: 'wall', layer: 0 });
  const track: Track = {
    W, H, design: name, mirrored: false, startX: 140, rows, walls: b.walls, lifts: b.lifts, fork: b.fork, rocker: b.rocker, loop: b.loop,
    spiral: b.spiral, spiralDir: b.spiralDir, segs: [], pins: [], wippes: [], wheels: [], turns: [], drums: [],
    sockets: [], finish: b.finish, labels: [], marks: [], route: [],
  };
  if (mirrored ?? rnd() < 0.5) mirrorTrack(track);
  buildStatics(track);
  // Bauplätze entlang der Reihen
  for (const r of rows) {
    const a = xa(r) + r.dir * (r.i === 0 ? 300 : 120);
    const bb = xb(r) - r.dir * 150;
    const len = (bb - a) * r.dir;
    if (len < 0) continue;
    const n = Math.max(1, Math.round(len / 230));
    for (let k = 0; k <= n; k++) tryAddSocket(track, r, Math.round(a + (r.dir * (len * k)) / n));
  }
  return track;
}

function freeAt(track: Track, r: Row, x: number): boolean {
  if (r.busy.some(([a, b]) => x > a - 30 && x < b + 30)) return false;
  if (track.sockets.some((s) => s.row === r.i && Math.abs(s.x - x) < 170)) return false;
  return true;
}

function tryAddSocket(track: Track, r: Row, x: number): Socket | null {
  if (!freeAt(track, r, x)) return null;
  const y = Math.round(railY(r, x));
  const so: Socket = { id: track.sockets.length, row: r.i, x, y, hole: holeBelow(track, r, x, y) };
  track.sockets.push(so);
  return so;
}

/** Liegt unter dieser Stelle (nicht zu tief) eine andere Schiene derselben Ebene? Nur dann darf dort eine Klappe hin. */
function holeBelow(track: Track, r: Row, x: number, y: number): boolean {
  // Querbahn: eine Klappe würde eine ganze lange Reihe überspringen – dort gibt es keine
  if (track.design === 'querbahn') return false;
  let best = Infinity;
  for (const o of track.rows) {
    if (o === r || (o.layer && r.layer && o.layer !== r.layer)) continue;
    const lo = Math.min(xa(o), xb(o)), hi = Math.max(xa(o), xb(o));
    if (x < lo + 30 || x > hi - 30) continue;
    const oy = railY(o, x);
    if (oy > y + 40 && oy - y < best) best = oy - y;
  }
  return best < 330;
}

/** Feste Kanten, Stifte, Wippen, Drehkreuze und Trommeln aus den Reihen bauen (auch nach einem Umbau) */
export function buildStatics(track: Track) {
  const segs: Seg[] = [];
  const pins: Pin[] = [];
  const labels: Track['labels'] = [];
  const wippes: WippeDef[] = [];
  const turns: TurnDef[] = [];
  const drums: DrumDef[] = [];
  const route: Pt[] = [[track.startX, 40]];
  let L = 0;
  const seg = (ax: number, ay: number, bx: number, by: number, th = 4, e = 0.25, kind: Seg['kind'] = 'rail', row = -1) => segs.push({ ax, ay, bx, by, th, e, kind, row, layer: L });
  const label = (t: string, x: number, y: number) => labels.push({ t, x: Math.round(x), y: Math.round(y) });
  const fullX = track.walls.filter((w) => w.y0 < -100).map((w) => w.x);
  let liftNo = 0;

  for (const r of track.rows) {
    const p = r.pts;
    const d = r.dir;
    L = r.layer;
    // Reihen ohne Schiene darunter (vor dem Förderband und vor dem Ziel) bekommen Rücklaufsperren
    const noFloor = r.end === 'band' || r.end === 'ziel';
    const midAt = new Map(r.mids.map((m) => [m.k, m.kind]));
    for (let k = 1; k < p.length; k++) {
      const kind = midAt.get(k - 1);
      if (!kind) { seg(p[k - 1][0], p[k - 1][1], p[k][0], p[k][1], 4, 0.25, 'rail', r.i); continue; }
      const [mx, my] = p[k - 1];
      const [nx, ny] = p[k];
      if (kind === 'treppe') {
        for (let s = 0; s < 6; s++) {
          const sx = mx + d * s * 56, sy = my + 6 + s * 28;
          seg(sx, sy, sx + d * 56, sy + 2, 4, 0.25, 'rail', r.i);
        }
        label('treppe', mx + d * 168, my - 26);
      } else if (kind === 'schanze') {
        // Senke und Absprungkante, darunter die Fangrinne; Landung hinter der Lücke
        seg(mx, my, mx + d * 65, my + 24, 4, 0.25, 'rail', r.i);
        seg(mx + d * 65, my + 24, mx + d * 86, my + 17, 4, 0.25, 'rail', r.i);
        seg(mx + d * 40, my + 74, mx + d * 142, my + 90, 4, 0.25, 'rail', r.i);
        if (noFloor) seg(mx + d * 40, my + 74, mx + d * 40, my + 58, 3, 0.2, 'wall');
        label('schanze', mx + d * 90, my - 30);
      } else if (kind === 'trampolin') {
        // Schiene endet, darunter ein federndes Tuch (vorn tiefer), dahinter geht es höher weiter
        seg(mx + d * 2, my + 6, mx + d * 2, my + 64, 3, 0.2, 'wall');
        seg(mx + d * 8, my + 64, mx + d * 144, my + 74, 4, 0.9, 'tramp', r.i);
        seg(nx, my + 76, nx, ny, 3, 0.2, 'wall');
        label('trampolin', mx + d * 75, my - 30);
      } else if (kind === 'drehkreuz') {
        turns.push({ cx: mx, cy: my - 40, r: 31, w: -2.4 * d, layer: L });
        label('drehkreuz', mx, my - 84);
      } else {
        // Nägel-Stufe: oben endet die Schiene, unten geht es versetzt weiter, dazwischen Nägel
        const x2 = mx - d * 26;
        seg(x2, ny - 26 * SLOPE, nx, ny, 4, 0.25, 'rail', r.i);
        if (noFloor) seg(x2, ny - 26 * SLOPE, x2, my + 12, 3, 0.2, 'wall');
        for (let x = mx + d * 4, s = 0; d > 0 ? x < mx + 140 : x > mx - 140; x += d * 32, s++) pins.push({ x, y: my + Math.abs(x - mx) * SLOPE + 16 + (s % 2 ? 4 : 0), r: 3.6, layer: L });
        label('stufe', mx + d * 70, my - 30);
      }
    }
    // Endbaustein
    const [ex, ey] = p[p.length - 1];
    const glassTop = ey - 60;
    if (r.end === 'trichter') {
      const cx = ex + d * 24;
      seg(cx - 70, ey + 8, cx - 15, ey + 66, 3, 0.2, 'glass');
      seg(cx + 70, ey + 8, cx + 15, ey + 66, 3, 0.2, 'glass');
      label('trichter', cx, ey - 30);
    } else if (r.end === 'nagel') {
      // Schiene endet früher, die Murmeln fallen mitten ins Nagelfeld; Glaswand dahinter fängt zu schnelle ab
      const last = segs[segs.length - 1];
      last.bx = ex - d * 110;
      last.by = railY(r, last.bx);
      const lo = Math.min(ex - d * 112, ex + d * 52), hi = Math.max(ex - d * 112, ex + d * 52);
      for (let k = 0; k < 4; k++) for (let x = lo + (k % 2 ? 15 : 0); x <= hi; x += 30) pins.push({ x, y: ey + 12 + k * 24, r: 3.6, layer: L });
      seg(ex + d * 86, glassTop, ex + d * 86, ey + Math.min(100, r.space - 30), 3, 0.2, 'glass');
      label('nagel', (lo + hi) / 2, ey - 40);
    } else if (r.end === 'wippe') {
      // schräge Glashaube hinter der Wippe: lenkt zu schnelle Murmeln nach unten zurück auf die Wippe
      wippes.push({ px: ex, py: ey + 64, half: 60, rest: d > 0 ? -0.25 : 0.25, layer: L });
      seg(ex + d * 112, glassTop, ex + d * 112, ey - 10, 3, 0.2, 'glass');
      seg(ex + d * 112, ey - 10, ex + d * 74, ey + 40, 3, 0.2, 'glass');
      label('wippe', ex, ey - 30);
    } else if (r.end === 'lotterie') {
      // Lotterie-Trommel unter dem Reihenende: oben Einwurf, die Trommel dreht sich, vorn geht es raus
      const cx = ex + d * 20, cy = ey + 86;
      seg(ex - d * 2, ey, ex + d * 16, ey + 30, 4, 0.2, 'rail', r.i);
      seg(ex + d * 76, glassTop, ex + d * 76, ey - 20, 3, 0.2, 'glass');
      seg(ex + d * 76, ey - 20, ex + d * 46, ey + 30, 3, 0.2, 'glass');
      drums.push({ cx, cy, r: 48, w: -2.6 * d, inA: -Math.PI / 2, outA: d > 0 ? 0.44 : Math.PI - 0.44, gap: 0.32, layer: L });
      label('lotterie', cx, ey - 30);
    }
    // Wendewand hinter dem Reihenende (wenn dort kein Rahmen und keine Trennwand steht)
    if (r.turn !== null && !isFrame(r.turn) && !fullX.some((x) => Math.abs(x - r.turn!) < 4)) {
      seg(r.turn, p[0][1] - 170, r.turn, ey + r.space + 30, 4, 0.25, 'glass');
    }
    // Strecke (Weg B liegt parallel unter A und zählt wie A)
    if (r.key === 'B') continue;
    route.push(p[0]);
    for (const m of r.mids) route.push(p[m.k], p[m.k + 1]);
    route.push(p[p.length - 1]);
    if (r.end === 'lotterie') route.push([ex + d * 20, ey + 86]);
    if (r.end === 'band') {
      const l = track.lifts[liftNo++];
      if (l) {
        L = 0;
        seg(l.x + l.d * 24, l.y0 - 100, l.x + l.d * 24, l.y0 + 18, 4, 0.2, 'wall');
        route.push([l.x, l.y0 + 10], ...l.over);
        label('band', l.x - l.d * 70, l.y0 + 50);
      }
    }
    if (r.end === 'gabel' && track.rocker) route.push([track.rocker.px, track.rocker.py - 30], [track.rocker.px, track.rocker.py]);
    if (r.end === 'spirale' && track.spiral.length) route.push(track.spiral[0], track.spiral[track.spiral.length - 1]);
  }
  L = 0;
  const fin = track.finish;
  for (const w of track.walls) seg(w.x, w.y0, w.x, w.y1, 5, 0.3, w.kind);
  seg(22, -300, 22, track.H, 6, 0.3, 'frame');
  seg(W - 22, -300, W - 22, track.H, 6, 0.3, 'frame');
  // Start-Trichter
  const sx = track.startX, sm = sx < W / 2 ? 1 : -1;
  seg(sx - sm * 100, -40, sx - sm * 100, 60, 3, 0.2, 'glass');
  seg(sx - sm * 100, 60, sx - sm * 36, 112, 3, 0.2, 'glass');
  seg(sx + sm * 100, -40, sx + sm * 100, 50, 3, 0.2, 'glass');
  seg(sx + sm * 100, 50, sx + sm * 6, 112, 3, 0.2, 'glass');
  label('start', sx + sm * 160, 40);
  // Gabelung: breiter Glastrichter über der Kippweiche (die Murmeln landen mal links, mal rechts der Achse)
  if (track.fork) {
    const { ex, ey, d } = track.fork;
    const fo = 2, fw = 15;
    seg(ex, ey, ex + d * (26 + fo - fw), ey + 63, 3, 0.2, 'glass');
    seg(ex + d * 85, ey - 65, ex + d * (52 + fo + fw), ey + 63, 3, 0.2, 'glass');
    label('gabel', ex - d * 60, ey + 65);
  }
  if (track.loop) label('looping', track.loop.cx, track.loop.cy - 71);
  if (track.spiral.length) label('spirale', track.spiral[0][0] - track.spiralDir * 180, track.spiral[0][1] + 38);
  // Ziel: hohe Wand auf der Seite, auf die die Murmeln zurollen
  const lastRow = track.rows[track.rows.length - 1];
  const tallLeft = lastRow.dir < 0;
  seg(fin.x0, fin.y, fin.x1, fin.y, 5, 0.2, 'rail');
  seg(fin.x0, fin.y - (tallLeft ? 130 : 26), fin.x0, fin.y, 5, 0.3, 'wall');
  seg(fin.x1, fin.y - (tallLeft ? 26 : 130), fin.x1, fin.y, 5, 0.3, 'wall');
  label('ziel', (fin.x0 + fin.x1) / 2, fin.y + 34);
  route.push([(fin.x0 + fin.x1) / 2, fin.y]);
  const routeClean = route.filter((pt, k) => k === 0 || pt[0] !== route[k - 1][0] || pt[1] !== route[k - 1][1]);
  track.segs = segs;
  track.pins = pins;
  track.labels = labels;
  track.wippes = wippes;
  track.wheels = [];
  track.turns = turns;
  track.drums = drums;
  track.route = routeClean.map(([x, y]) => [Math.round(x), Math.round(y)]);
}

/** Neuen Bauplatz ergänzen (Umbau) */
export function addSocket(track: Track, rnd: () => number = Math.random): Socket | null {
  for (let k = 0; k < 60; k++) {
    const r = track.rows[Math.floor(rnd() * track.rows.length)];
    const lo = Math.min(xa(r), xb(r)) + 140, hi = Math.max(xa(r), xb(r)) - 140;
    if (hi <= lo) continue;
    const x = Math.round(lo + rnd() * (hi - lo));
    if (r.i === 0 && Math.abs(x - track.startX) < 250) continue;
    const so = tryAddSocket(track, r, x);
    if (so) return so;
  }
  return null;
}

/** Endbaustein einer Reihe tauschen (Umbau) */
export function swapEnd(track: Track, rnd: () => number = Math.random): { row: number; from: EndKind; to: EndKind } | null {
  const cands = track.rows.filter((r) => r.endable);
  if (!cands.length) return null;
  const r = cands[Math.floor(rnd() * cands.length)];
  const opts = r.endOk.filter((e) => e !== r.end);
  const to = opts[Math.floor(rnd() * opts.length)];
  const from = r.end;
  r.end = to;
  buildStatics(track);
  return { row: r.i, from, to };
}

/** Lesbare Nummer einer Reihe in Fahrtrichtung (für Texte) */
export function rowNumber(track: Track, row: number): number {
  const order = track.rows.filter((r) => r.key !== 'B');
  const r = track.rows[row];
  const k = order.findIndex((o) => o.key === (r.key === 'B' ? 'A' : r.key));
  return k + 1;
}

/* ---------- Teile ---------- */

export interface Item {
  id: number;
  kind: ItemKind;
  owner: number;
  socket: number;
  /** In welcher Runde gebaut (für die Kamerafahrt) */
  born: number;
  on: boolean;
  cool: number;
  used: number;
  trig: number;
  hit: Set<number>;
  closedUntil: number;
  readyAt: number;
  gustUntil: number;
  kickAt: number;
  /** Rohrpost: Weg der Glasröhre */
  tube?: Pt[];
  tubeCum?: number[];
}

export interface RaceEvent { kind: EventKind; owner: number; at: number; done?: boolean; data?: number[] }

export function newItem(id: number, kind: ItemKind, owner: number, socket: number, born = 0, on?: boolean): Item {
  return { id, kind, owner, socket, born, on: on ?? TOGGLE_START[kind] ?? true, cool: 0, used: 0, trig: 0, hit: new Set(), closedUntil: 0, readyAt: 0, gustUntil: 0, kickAt: -9 };
}

/** Rohrpost: Ziel 1–2 Reihen weiter vorn oder 1 Reihe zurück (in Fahrtrichtung gezählt) */
export function makeTube(track: Track, so: Socket, rnd: () => number = Math.random): Pt[] {
  const order = track.rows.filter((r) => r.key !== 'B');
  const here = track.rows[so.row];
  const k = order.findIndex((o) => o.key === (here.key === 'B' ? 'A' : here.key));
  const back = k > 0 && rnd() < 0.35;
  const to = back ? k - 1 : Math.min(order.length - 1, k + 1 + (rnd() < 0.5 ? 1 : 0));
  const r = order[to];
  const lo = Math.min(xa(r), xb(r)) + 120, hi = Math.max(xa(r), xb(r)) - 120;
  let tx = lo + rnd() * Math.max(10, hi - lo);
  for (let n = 0; n < 8 && r.busy.some(([a, b]) => tx > a - 40 && tx < b + 40); n++) tx = lo + rnd() * Math.max(10, hi - lo);
  const ty = railY(r, tx) - 30;
  const a: Pt = [so.x, so.y - 14];
  const c1: Pt = [so.x, so.y - 90], c2: Pt = [tx, ty - 130];
  const out: Pt[] = [];
  for (let n = 0; n <= 28; n++) {
    const t = n / 28, u = 1 - t;
    out.push([
      Math.round(u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * tx),
      Math.round(u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ty),
    ]);
  }
  return out;
}

/** Führt eine Rohrpost nach vorn (true) oder zurück (false)? */
export function tubeForward(track: Track, it: Item): boolean {
  if (!it.tube) return true;
  const end = it.tube[it.tube.length - 1];
  const so = track.sockets[it.socket];
  return routeS(track.route, end[0], end[1]) > routeS(track.route, so.x, so.y);
}

/** Position entlang der Strecke (ohne Gedächtnis; für Rohrpost-Richtung) */
function routeS(route: Pt[], x: number, y: number): number {
  let best = 0, bd = Infinity, acc = 0;
  for (let k = 1; k < route.length; k++) {
    const [ax, ay] = route[k - 1], [bx, by] = route[k];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, l = Math.sqrt(l2);
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const d = Math.hypot(ax + dx * u - x, ay + dy * u - y);
    if (d < bd) { bd = d; best = acc + l * u; }
    acc += l;
  }
  return best;
}

/* ---------- Rennen ---------- */

/** Länge entlang eines Pfads */
function cumOf(pts: Pt[]): number[] {
  const out = [0];
  for (let k = 1; k < pts.length; k++) out.push(out[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return out;
}

/** Ort und Richtung auf einem Pfad an Stelle s */
function pathAt(pts: Pt[], cum: number[], s: number): [number, number, number, number] {
  let k = 1;
  while (k < cum.length - 1 && cum[k] < s) k++;
  const l = cum[k] - cum[k - 1] || 1;
  const f = Math.max(0, Math.min(1, (s - cum[k - 1]) / l));
  const dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1];
  return [pts[k - 1][0] + dx * f, pts[k - 1][1] + dy * f, dx / l, dy / l];
}

export const F = { done: 1, tube: 2, basket: 4, shield: 8, boost: 16, behind: 32, glass: 64, back: 128 };

type Kin = '' | 'wheelWait' | 'wheel' | 'convWait' | 'conv' | 'over' | 'loop' | 'swing' | 'spiral';

interface Marble {
  i: number;
  owner: number;
  on: boolean;
  x: number; y: number; vx: number; vy: number;
  a: number; w: number;
  contact: boolean;
  still: number;
  place: number;
  finishedAt: number;
  shield: boolean;
  boostUntil: number;
  tube: number; ts: number;
  basketUntil: number; basketX: number; basketRow: number;
  /** zuletzt berührte Reihe */
  row: number;
  /** Abschnitt der Strecke (Fortschritt) */
  ri: number; pu: number;
  kin: Kin;
  slot: number; wheel: number; convN: number; lastS: number;
  v0: number; phi: number; ok: boolean | null; swingT: number; swingAmp: number;
  tv: number;
  loopDone: boolean; forked: boolean;
  crossUntil: number;
  /** Ebene der Murmel (X-Bahn), 0 = alle */
  layer: number;
  /** Förderband, auf dem sie wartet oder fährt */
  lift: number;
}

interface Giant { x: number; y: number; vx: number; vy: number; a: number; done: boolean; still?: number; t: number }

export type Fx = (string | number)[];

function closest(ax: number, ay: number, bx: number, by: number, px: number, py: number): [number, number] {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let u = ((px - ax) * dx + (py - ay) * dy) / l2;
  u = Math.max(0, Math.min(1, u));
  return [ax + dx * u, ay + dy * u];
}

export class Race {
  t = 0;
  marbles: Marble[];
  fx: Fx[] = [];
  finished: number[] = [];
  overtakes = 0;
  quakeUntil = 0;
  oil: { row: number; until: number } | null = null;
  giant: Giant | null = null;
  wippe: { a: number; w: number }[];
  wheel: { ang: number; slots: number[]; queue: number[] }[];
  /** Zustand je Förderband */
  convs: { t: number; slots: Map<number, number>; arrived: number; n: number; len: number }[];
  rocker = { a: 0, w: 0, side: 1 };
  /** Drehwinkel der Drehkreuze und Trommeln */
  turnAng: number[];
  drumAng: number[];
  private overCum: number[][];
  private hitsThisStep = 0;
  private boingAt = new Map<number, number>();
  loopsTried = 0;
  loopsMade = 0;
  /** Aufenthaltszeit je Reihe (für die Abnutzung) */
  rowTime: number[];
  routeLen: number;
  private routeCum: number[];
  private spiralCum: number[];
  private spiralLen: number;
  private queue: Marble[];
  private nextRelease = 0;
  private lastOrder: number[] | null = null;
  private nextSample = 0;
  private bands = new Map<number, Seg[]>();
  private pinBands = new Map<number, Pin[]>();
  private rnd: () => number;

  constructor(public track: Track, owners: number[], public items: Item[], public events: RaceEvent[], rnd: () => number = Math.random) {
    this.rnd = rnd;
    this.marbles = owners.map((owner, i) => ({
      i, owner, on: false, x: track.startX, y: -60, vx: 0, vy: 0, a: rnd() * 6.28, w: 0, contact: false, still: 0, place: 0, finishedAt: 0,
      shield: false, boostUntil: 0, tube: -1, ts: 0, basketUntil: 0, basketX: 0, basketRow: 0,
      row: 0, ri: 1, pu: 0, kin: '', slot: -1, wheel: -1, convN: 0, lastS: 0, v0: 0, phi: 0, ok: null, swingT: 0, swingAmp: 0, tv: 0, loopDone: false, forked: false, crossUntil: 0, layer: track.rows[0]?.layer ?? 0, lift: -1,
    }));
    this.queue = this.marbles.slice();
    this.wippe = track.wippes.map((w) => ({ a: w.rest, w: 0 }));
    this.turnAng = track.turns.map(() => 0);
    this.drumAng = track.drums.map(() => 0);
    this.overCum = track.lifts.map((l) => cumOf(l.over));
    this.wheel = track.wheels.map(() => ({ ang: 0, slots: new Array(8).fill(-1), queue: [] }));
    this.rowTime = track.rows.map(() => 0);
    this.convs = track.lifts.map((l) => ({ t: 0, slots: new Map<number, number>(), arrived: 0, n: Math.floor((l.y0 - l.y1) / l.sp), len: l.y0 - l.y1 }));
    this.routeCum = [0];
    for (let k = 1; k < track.route.length; k++) this.routeCum.push(this.routeCum[k - 1] + Math.hypot(track.route[k][0] - track.route[k - 1][0], track.route[k][1] - track.route[k - 1][1]));
    this.routeLen = this.routeCum[this.routeCum.length - 1];
    this.spiralCum = cumOf(track.spiral);
    this.spiralLen = this.spiralCum[this.spiralCum.length - 1];
    for (const s of track.segs) {
      const y0 = Math.floor((Math.min(s.ay, s.by) - 30) / 100), y1 = Math.floor((Math.max(s.ay, s.by) + 30) / 100);
      for (let b = y0; b <= y1; b++) {
        if (!this.bands.has(b)) this.bands.set(b, []);
        this.bands.get(b)!.push(s);
      }
    }
    for (const p of track.pins) {
      const b = Math.floor(p.y / 100);
      for (const bb of [b - 1, b, b + 1]) {
        if (!this.pinBands.has(bb)) this.pinBands.set(bb, []);
        this.pinBands.get(bb)!.push(p);
      }
    }
    for (const it of items) if (it.tube) it.tubeCum = cumOf(it.tube);
  }

  get done() {
    return this.finished.length === this.marbles.length;
  }

  /** Fallen haben pro Rennen nur ein paar Ladungen */
  spent(it: Item): boolean {
    return this.left(it) === 0;
  }

  left(it: Item): number {
    const max = CHARGES[it.kind];
    if (max === undefined) return -1;
    return Math.max(0, max - it.used);
  }

  toggle(itemId: number, owner: number): boolean {
    const it = this.items.find((x) => x.id === itemId);
    if (!it || it.owner !== owner || !TOGGLE.includes(it.kind) || this.t < it.cool) return false;
    it.on = !it.on;
    it.cool = this.t + 2;
    this.fx.push(['toggle', it.id, it.on ? 1 : 0]);
    return true;
  }

  /** Fortschritt entlang der Strecke (sucht nur in der Nähe des letzten Abschnitts) */
  private routeProgress(m: Marble): number {
    const route = this.track.route;
    let best = m.ri, bd = Infinity, bu = m.pu;
    for (let k = Math.max(1, m.ri - 2); k < Math.min(route.length, m.ri + 5); k++) {
      const [ax, ay] = route[k - 1], [bx, by] = route[k];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((m.x - ax) * dx + (m.y - ay) * dy) / l2));
      const d = Math.hypot(ax + dx * u - m.x, ay + dy * u - m.y);
      if (d < bd) { bd = d; best = k; bu = u; }
    }
    m.ri = best;
    m.pu = bu;
    return this.routeCum[best - 1] + (this.routeCum[best] - this.routeCum[best - 1]) * bu;
  }

  progress(i: number): number {
    const m = this.marbles[i];
    if (m.place) return 1e7 - m.place;
    if (!m.on) return -1000 - i;
    return this.routeProgress(m);
  }

  /** Fortschritt 0..1 für die Rennverlauf-Leiste */
  share(i: number): number {
    const m = this.marbles[i];
    if (m.place) return 1;
    if (!m.on) return 0;
    return Math.max(0, Math.min(0.99, this.progress(i) / this.routeLen));
  }

  order(): number[] {
    const p = this.marbles.map((m) => this.progress(m.i));
    return this.marbles.map((m) => m.i).sort((a, b) => p[b] - p[a]);
  }

  /* ---------- Physik ---------- */

  private hit(m: { x: number; y: number; vx: number; vy: number; w: number; contact: boolean }, qx: number, qy: number, th: number, e: number, rr = R): boolean {
    let nx = m.x - qx, ny = m.y - qy;
    const d = Math.hypot(nx, ny);
    const min = rr + th;
    if (d >= min || d === 0) return false;
    nx /= d;
    ny /= d;
    m.x += nx * (min - d);
    m.y += ny * (min - d);
    const vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      const b = vn < -60 ? e : 0;
      m.vx -= (1 + b) * vn * nx;
      m.vy -= (1 + b) * vn * ny;
    }
    m.w = (m.vx * -ny + m.vy * nx) / rr;
    m.contact = true;
    return true;
  }

  /** Klappe in der Schiene: ist sie für diese Murmel offen? */
  private holeOpen(m: Marble, row: number): boolean {
    for (const it of this.items) {
      if (it.kind !== 'farbweiche' && it.kind !== 'umleitung') continue;
      const so = this.track.sockets[it.socket];
      if (!so.hole || so.row !== row || Math.abs(m.x - so.x) > 22) continue;
      const own = m.owner === it.owner;
      const open = it.kind === 'umleitung' ? it.on : own ? it.on : !it.on;
      if (open) return true;
    }
    return false;
  }

  step() {
    this.hitsThisStep = 0;
    const h = TICK / SUB;
    for (let k = 0; k < SUB; k++) this.sub(h);
    if (this.t >= this.nextSample) {
      this.nextSample = this.t + 0.5;
      const order = this.marbles.filter((m) => m.on && m.y > 125).map((m) => m.i);
      const p = new Map(order.map((i) => [i, this.progress(i)]));
      order.sort((a, b) => p.get(b)! - p.get(a)!);
      if (this.lastOrder) {
        const pos = new Map(this.lastOrder.map((id, k) => [id, k]));
        for (let x = 0; x < order.length; x++) for (let y = x + 1; y < order.length; y++) {
          const px = pos.get(order[x]), py = pos.get(order[y]);
          if (px !== undefined && py !== undefined && px > py) this.overtakes++;
        }
      }
      this.lastOrder = order;
    }
  }

  private free(m: Marble) {
    return m.tube < 0 && !m.basketUntil && !m.kin;
  }

  private sub(dt: number) {
    this.t += dt;
    const t = this.t;
    while (this.queue.length && t >= this.nextRelease) {
      const m = this.queue.shift()!;
      m.on = true;
      m.x = this.track.startX + (this.rnd() - 0.5) * 120;
      m.y = 10 + (this.rnd() - 0.5) * 30;
      m.vx = 30 + this.rnd() * 40;
      m.vy = 0;
      this.nextRelease = t + 0.06;
    }
    for (const ev of this.events) if (!ev.done && t >= ev.at) this.runEvent(ev);
    this.track.wheels.forEach((wd, k) => (this.wheel[k].ang += wd.w * dt));
    this.track.turns.forEach((td, k) => (this.turnAng[k] += td.w * dt));
    this.track.drums.forEach((dd, k) => (this.drumAng[k] += dd.w * dt));
    for (const c of this.convs) c.t += dt;
    const quake = t < this.quakeUntil;
    const live = this.marbles.filter((m) => m.on && !m.place);
    for (const m of live) {
      if (m.tube >= 0) { this.stepTube(m, dt); continue; }
      if (m.kin) { this.stepKin(m, dt); continue; }
      if (m.basketUntil) {
        if (t >= m.basketUntil) {
          const r = this.track.rows[m.basketRow];
          m.basketUntil = 0;
          m.x = m.basketX + r.dir * 26;
          m.y = railY(r, m.x) - R - 5;
          m.vx = r.dir * 90;
          m.vy = 0;
          this.fx.push(['lift', m.i]);
        }
        continue;
      }
      m.contact = false;
      m.vy += G * dt;
      if (quake) { m.vx += (this.rnd() - 0.5) * 3000 * dt; m.vy += (this.rnd() - 0.6) * 2000 * dt; }
      this.fields(m, dt);
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
    for (const m of live) {
      if (!this.free(m)) continue;
      const band = this.bands.get(Math.floor(m.y / 100)) ?? [];
      let row = -1;
      for (const s of band) {
        if (m.x < Math.min(s.ax, s.bx) - 20 || m.x > Math.max(s.ax, s.bx) + 20 || m.y < Math.min(s.ay, s.by) - 20 || m.y > Math.max(s.ay, s.by) + 20) continue;
        if (s.layer && m.layer && s.layer !== m.layer) continue;
        if (s.kind === 'rail' && s.row >= 0 && this.holeOpen(m, s.row)) {
          if (m.vy < 240) m.vy = 240;
          continue;
        }
        const [qx, qy] = closest(s.ax, s.ay, s.bx, s.by, m.x, m.y);
        const vBefore = Math.hypot(m.vx, m.vy);
        if (!this.hit(m, qx, qy, s.th, s.e)) continue;
        if (s.kind === 'rail' && s.row >= 0) { row = s.row; if (s.layer) m.layer = s.layer; }
        if (s.kind === 'tramp') this.bounce(m, qx, qy, s);
        else if (vBefore > 420 && this.hitsThisStep < 3 && Math.abs(m.vy) < vBefore * 0.5) { this.hitsThisStep++; this.fx.push(['hit', Math.round(m.x), Math.round(m.y), Math.min(9, Math.round(vBefore / 100))]); }
      }
      if (row >= 0) m.row = row;
      for (const p of this.pinBands.get(Math.floor(m.y / 100)) ?? []) {
        if (Math.abs(m.x - p.x) > 20 || Math.abs(m.y - p.y) > 20 || (p.layer && m.layer && p.layer !== m.layer)) continue;
        this.hit(m, p.x, p.y, p.r, 0.5);
      }
      for (const wd of this.track.wheels) if (Math.abs(m.x - wd.cx) < 80 && Math.abs(m.y - wd.cy) < 80) this.hit(m, wd.cx, wd.cy, wd.hub, 0.2);
      this.wippeHit(m);
      this.rockerHit(m);
      this.turnHit(m);
      this.drumHit(m, dt);
      this.partHit(m);
      if (m.contact) {
        let k = 0.08;
        if (row >= 0) {
          const r = this.track.rows[row];
          k *= r.wear;
          if (this.oil && this.oil.row === row && t < this.oil.until) { k = 0; m.vx += r.dir * 220 * dt; }
        }
        m.vx *= Math.exp(-k * dt);
      }
      this.enterBlocks(m);
    }
    this.tubeContacts(live);
    this.stepWippes(dt);
    this.stepRocker(dt);
    this.pickups();
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      if (!this.free(a)) continue;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        if (!this.free(b) || (a.layer && b.layer && a.layer !== b.layer)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx > 2 * R || dx < -2 * R || dy > 2 * R || dy < -2 * R) continue;
        const d = Math.hypot(dx, dy);
        if (d >= 2 * R || d === 0) continue;
        const nx = dx / d, ny = dy / d, o = (2 * R - d) / 2;
        a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const J = (-(1 + 0.55) * vn) / 2;
          a.vx -= J * nx; a.vy -= J * ny; b.vx += J * nx; b.vy += J * ny;
          if (vn < -200 && this.hitsThisStep < 3) { this.hitsThisStep++; this.fx.push(['hit', Math.round(a.x), Math.round(a.y), Math.min(9, Math.round(-vn / 100))]); }
        }
      }
    }
    if (this.giant) this.stepGiant(dt, live);
    const fin = this.track.finish;
    for (const m of live) {
      if (!this.free(m)) continue;
      m.a += m.w * dt;
      this.rowTime[m.row] += dt;
      const sp = Math.hypot(m.vx, m.vy);
      m.still = sp < 8 ? m.still + dt : 0;
      if (m.still > 1.8) {
        const closedGate = this.items.some((it) => it.kind === 'schranke' && t < it.closedUntil && Math.abs(m.x - this.track.sockets[it.socket].x) < 60);
        if (!closedGate) {
          const r = this.track.rows[m.row];
          m.vx += r.dir * (120 + this.rnd() * 80);
          m.vy -= 160;
        }
        m.still = 0;
      }
      if (m.x < fin.x1 && m.x > fin.x0 && m.y > fin.y - 60 && m.y < fin.y + 5) {
        m.place = this.finished.length + 1;
        m.finishedAt = t;
        this.finished.push(m.i);
        this.fx.push(['finish', m.i, m.place]);
      }
      if (m.y > this.track.H + 200 || m.x < 0 || m.x > W) {
        // aus der Welt gefallen: zurück an den Anfang der zuletzt berührten Reihe
        const r = this.track.rows[m.row];
        m.x = r.pts[0][0] + r.dir * 30; m.y = r.pts[0][1] - 40; m.vx = r.dir * 60; m.vy = 0;
        m.ri = Math.max(1, m.ri - 3);
      }
    }
    // Ziel: angekommene Murmeln liegen weiter im Kasten
    const done = this.marbles.filter((m) => m.place);
    for (const m of done) {
      m.vy += G * dt;
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.vx *= Math.exp(-1.5 * dt);
      if (m.y > fin.y - R - 5) { m.y = fin.y - R - 5; m.vy = Math.min(0, m.vy) * -0.2; m.w = m.vx / R; }
      if (m.x < fin.x0 + R + 5) { m.x = fin.x0 + R + 5; m.vx = Math.abs(m.vx) * 0.3; }
      if (m.x > fin.x1 - R - 5) { m.x = fin.x1 - R - 5; m.vx = -Math.abs(m.vx) * 0.3; }
      m.a += m.w * dt;
    }
    for (let i = 0; i < done.length; i++) for (let j = i + 1; j < done.length; j++) {
      const a = done[i], b = done[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= 2 * R || d === 0) continue;
      const nx = dx / d, ny = dy / d, o = (2 * R - d) / 2;
      a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
    }
  }

  /** Trampolin: federt mindestens so stark zurück, dass die Murmel über die Kante kommt */
  private bounce(m: Marble, qx: number, qy: number, s: Seg) {
    let nx = m.x - qx, ny = m.y - qy;
    const d = Math.hypot(nx, ny) || 1;
    nx /= d; ny /= d;
    const vn = m.vx * nx + m.vy * ny;
    const want = 470 + this.rnd() * 130;
    if (vn < want) { m.vx += (want - vn) * nx; m.vy += (want - vn) * ny; }
    const key = Math.round(s.ax * 7 + s.ay);
    if ((this.boingAt.get(key) ?? -1) < this.t - 0.12) { this.boingAt.set(key, this.t); this.fx.push(['boing', Math.round(qx), Math.round(qy)]); }
  }

  /** Drehkreuz: vier Arme, die sich fest drehen (Murmeln können sie nicht aufhalten) */
  private turnHit(m: Marble) {
    this.track.turns.forEach((td, k) => {
      if (td.layer && m.layer && td.layer !== m.layer) return;
      if (Math.abs(m.x - td.cx) > td.r + 16 || Math.abs(m.y - td.cy) > td.r + 16) return;
      for (let a = 0; a < 4; a++) {
        const ang = this.turnAng[k] + (a * Math.PI) / 2;
        const bx = td.cx + Math.cos(ang) * td.r, by = td.cy + Math.sin(ang) * td.r;
        const [qx, qy] = closest(td.cx, td.cy, bx, by, m.x, m.y);
        this.movingHit(m, qx, qy, td.cx, td.cy, td.w, 3, 0.3);
      }
    });
  }

  /** Stoß gegen eine sich drehende Fläche (Drehkreuz, Trommel-Rippen) */
  private movingHit(m: Marble, qx: number, qy: number, cx: number, cy: number, w: number, th: number, e: number) {
    let nx = m.x - qx, ny = m.y - qy;
    const d = Math.hypot(nx, ny);
    if (d >= R + th || d === 0) return false;
    nx /= d; ny /= d;
    m.x += nx * (R + th - d); m.y += ny * (R + th - d);
    const svx = -w * (qy - cy), svy = w * (qx - cx);
    const vn = (m.vx - svx) * nx + (m.vy - svy) * ny;
    if (vn < 0) { m.vx -= (1 + e) * vn * nx; m.vy -= (1 + e) * vn * ny; }
    m.w = (m.vx * -ny + m.vy * nx) / R;
    m.contact = true;
    return true;
  }

  /** Lotterie-Trommel: Wand mit Öffnungen, drei Rippen, Reibung nimmt die Murmeln mit */
  private drumHit(m: Marble, dt: number) {
    this.track.drums.forEach((dd, k) => {
      if (dd.layer && m.layer && dd.layer !== m.layer) return;
      const dx = m.x - dd.cx, dy = m.y - dd.cy;
      const dist = Math.hypot(dx, dy);
      if (dist > dd.r + 20 || dist === 0) return;
      const ang = Math.atan2(dy, dx);
      const near = (a: number) => Math.abs(((ang - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < (a === dd.inA ? 0.5 : dd.gap);
      const open = near(dd.inA) || near(dd.outA);
      const th = 3;
      if (!open) {
        const nx = dx / dist, ny = dy / dist;
        if (dist < dd.r && dist > dd.r - th - R) {
          // innen an der Wand: nach innen schieben, Reibung in Drehrichtung
          m.x = dd.cx + nx * (dd.r - th - R); m.y = dd.cy + ny * (dd.r - th - R);
          const vn = m.vx * nx + m.vy * ny;
          if (vn > 0) { m.vx -= 1.4 * vn * nx; m.vy -= 1.4 * vn * ny; }
          const tx = -ny, ty = nx, wall = dd.w * dd.r;
          const vt = m.vx * tx + m.vy * ty;
          const f = 1 - Math.exp(-6 * dt);
          m.vx += (wall - vt) * f * tx; m.vy += (wall - vt) * f * ty;
          m.contact = true;
        } else if (dist >= dd.r && dist < dd.r + th + R) {
          m.x = dd.cx + nx * (dd.r + th + R); m.y = dd.cy + ny * (dd.r + th + R);
          const vn = m.vx * nx + m.vy * ny;
          if (vn < 0) { m.vx -= 1.3 * vn * nx; m.vy -= 1.3 * vn * ny; }
          m.contact = true;
        }
      }
      if (dist < dd.r) {
        for (let a = 0; a < 3; a++) {
          const ra = this.drumAng[k] + (a * 2 * Math.PI) / 3;
          const c = Math.cos(ra), s = Math.sin(ra);
          const [qx, qy] = closest(dd.cx + c * (dd.r - 18), dd.cy + s * (dd.r - 18), dd.cx + c * dd.r, dd.cy + s * dd.r, m.x, m.y);
          this.movingHit(m, qx, qy, dd.cx, dd.cy, dd.w, 3, 0.2);
        }
      }
    });
  }

  /** Freie Murmel betritt einen Baustein mit eigener Bewegung */
  private enterBlocks(m: Marble) {
    const tr = this.track;
    for (let k = 0; k < tr.wheels.length; k++) {
      const wd = tr.wheels[k];
      if (Math.hypot(m.x - wd.pick[0], m.y - wd.pick[1]) < 22) {
        m.kin = 'wheelWait'; m.wheel = k; m.vx = 0; m.vy = 0;
        this.wheel[k].queue.push(m.i);
        return;
      }
    }
    for (let k = 0; k < tr.lifts.length; k++) {
      const c = tr.lifts[k];
      if (Math.abs(m.x - (c.x + c.d * 8)) < 18 && m.y > c.y0 - 37 && m.y < c.y0 + 3) {
        m.kin = 'convWait'; m.lift = k; m.vx = 0; m.vy = 0; m.convN = this.convs[k].arrived++;
        return;
      }
    }
    const lp = tr.loop;
    if (lp && !m.loopDone && m.vx * lp.dir > 0 && Math.abs(m.x - lp.cx) < 6 && Math.abs(m.y - (lp.cy + lp.r - 13)) < 12) {
      m.loopDone = true; this.loopsTried++;
      m.kin = 'loop'; m.v0 = Math.abs(m.vx); m.phi = Math.PI / 2; m.ok = null;
      return;
    }
    if (tr.spiral.length) {
      const sp = tr.spiral[0];
      const cx = sp[0] - tr.spiralDir * 3.5;
      if (Math.abs(m.x - cx) < 18.5 && m.y > sp[1] - 47 && m.y < sp[1] + 8) {
        m.kin = 'spiral'; m.ts = 0; m.tv = Math.max(120, Math.hypot(m.vx, m.vy));
      }
    }
  }

  private stepKin(m: Marble, dt: number) {
    const tr = this.track;
    if (m.kin === 'wheelWait') {
      const wd = tr.wheels[m.wheel];
      const k = this.wheel[m.wheel].queue.indexOf(m.i);
      const s = wd.out > 0 ? 1 : -1;
      m.x = wd.pick[0] + s * k * 15; m.y = wd.pick[1] - k * 6;
      return;
    }
    if (m.kin === 'wheel') {
      const wd = tr.wheels[m.wheel];
      const a = this.wheel[m.wheel].ang + m.slot * (2 * Math.PI / wd.n);
      m.x = wd.cx + Math.cos(a) * wd.r; m.y = wd.cy + Math.sin(a) * wd.r;
      m.a += wd.w * dt * 2;
      const rel = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (Math.abs(rel - wd.rel) < 0.15) {
        this.wheel[m.wheel].slots[m.slot] = -1;
        m.kin = ''; m.vx = wd.out; m.vy = 40;
      }
      return;
    }
    if (m.kin === 'over') {
      const ov = tr.lifts[m.lift].over, cum = this.overCum[m.lift];
      m.ts += 300 * dt;
      const len = cum[cum.length - 1];
      if (m.ts >= len) {
        const [ex, ey, tx, ty] = pathAt(ov, cum, len);
        m.kin = ''; m.x = ex; m.y = ey; m.vx = tx * 300; m.vy = ty * 300;
        m.crossUntil = this.t + 0.8;
        m.layer = tr.lifts[m.lift].layer;
        return;
      }
      const [x, y] = pathAt(ov, cum, m.ts);
      m.x = x; m.y = y; m.a += (300 / R) * dt;
      return;
    }
    if (m.kin === 'convWait') {
      const c = tr.lifts[m.lift];
      let k = 0;
      for (const o of this.marbles) if (o.kin === 'convWait' && o.lift === m.lift && o.convN < m.convN) k++;
      m.x = c.x + c.d * (8 - k * 17); m.y = c.y0 - 13 - k * 1.4;
      return;
    }
    if (m.kin === 'conv') {
      const c = tr.lifts[m.lift], st = this.convs[m.lift];
      const s = (st.t * c.v + m.slot * c.sp) % st.len;
      if (s < m.lastS) {
        st.slots.delete(m.slot);
        // oben angekommen: durch die Glasröhre über die Trennwand
        m.kin = 'over'; m.ts = 0;
        return;
      }
      m.lastS = s;
      m.x = c.x; m.y = c.y0 - s - 8;
      return;
    }
    if (m.kin === 'spiral') {
      // Glasspirale: rollt wie auf einer Schiene – Schwerkraft entlang der Röhre, Reibung bremst
      const sp = tr.spiral;
      const [, , , ty] = pathAt(sp, this.spiralCum, m.ts);
      m.tv += (G * ty - 1.3 * m.tv - 40) * dt;
      m.tv = Math.max(60, m.tv);
      m.ts += m.tv * dt;
      if (m.ts >= this.spiralLen) {
        const [ex, ey, tx, ty2] = pathAt(sp, this.spiralCum, this.spiralLen);
        m.kin = ''; m.x = ex; m.y = ey + 2; m.vx = tx * m.tv; m.vy = ty2 * m.tv;
        return;
      }
      const [x, y] = pathAt(sp, this.spiralCum, m.ts);
      m.x = x; m.y = y;
      m.a += (m.tv / R) * dt;
      return;
    }
    const lp = tr.loop;
    if (!lp) return;
    const rr = lp.r - 13;
    // Drehsinn: Murmeln, die nach links rollen, laufen mit wachsendem Winkel herum
    const sg = -lp.dir;
    if (m.kin === 'loop') {
      const h = rr * (1 - Math.sin(m.phi));
      const v2 = m.v0 * m.v0 - 2 * G * h;
      if (m.ok === null) {
        // ein bisschen Glück gehört dazu: kleine Unebenheiten im Looping
        const ve = m.v0 * (0.86 + this.rnd() * 0.22);
        m.ok = ve * ve >= 5 * G * rr;
      }
      if (!m.ok && (v2 < 2500 || Math.abs(m.phi - Math.PI / 2) > Math.PI * 0.85)) {
        m.kin = 'swing'; m.swingT = 0; m.swingAmp = m.phi - Math.PI / 2;
        return;
      }
      const v = Math.sqrt(Math.max(2500, v2));
      m.phi += sg * (v / rr) * dt;
      m.x = lp.cx + Math.cos(m.phi) * rr; m.y = lp.cy + Math.sin(m.phi) * rr;
      m.a -= sg * (v / R) * dt;
      if (Math.abs(m.phi - Math.PI / 2) >= Math.PI * 2) {
        this.loopsMade++;
        this.fx.push(['loop', m.i, 1]);
        m.kin = ''; m.x = lp.cx + lp.dir * 4; m.y = lp.cy + rr; m.vx = lp.dir * m.v0 * 0.92; m.vy = 0;
      }
      return;
    }
    if (m.kin === 'swing') {
      m.swingT += dt;
      const amp = m.swingAmp * Math.exp(-2.2 * m.swingT);
      const phi = Math.PI / 2 + amp * Math.cos(m.swingT * 7);
      m.x = lp.cx + Math.cos(phi) * rr; m.y = lp.cy + Math.sin(phi) * rr;
      m.a += Math.sin(m.swingT * 7) * 0.3;
      if (m.swingT > 1.6) {
        this.fx.push(['loop', m.i, 0]);
        m.kin = ''; m.x = lp.cx + lp.dir * 6; m.y = lp.cy + rr; m.vx = lp.dir * 80; m.vy = 0;
      }
    }
  }

  /** Fächer und Körbe nehmen wartende Murmeln mit: Mühlrad mit etwas Glück, Förderband streng der Reihe nach */
  private pickups() {
    const tr = this.track;
    tr.wheels.forEach((wd, w) => {
      const st = this.wheel[w];
      if (!st.queue.length) return;
      const step = 2 * Math.PI / wd.n;
      const pickA = Math.atan2(wd.pick[1] - wd.cy, wd.pick[0] - wd.cx);
      for (let k = 0; k < wd.n; k++) {
        if (st.slots[k] !== -1 || !st.queue.length) continue;
        const a = st.ang + k * step;
        const d = (((a - pickA) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
        if (Math.abs(d) < 0.05) {
          const qi = Math.floor(this.rnd() * Math.min(3, st.queue.length));
          const id = st.queue.splice(qi, 1)[0];
          const m = this.marbles[id];
          m.kin = 'wheel'; m.slot = k; st.slots[k] = id;
        }
      }
    });
    tr.lifts.forEach((c, li) => {
      const st = this.convs[li];
      let waiting: Marble[] | null = null;
      for (let k = 0; k < st.n; k++) {
        if (st.slots.has(k)) continue;
        const s = (st.t * c.v + k * c.sp) % st.len;
        if (s >= 6) continue;
        if (!waiting) waiting = this.marbles.filter((m) => m.kin === 'convWait' && m.lift === li).sort((p, q) => p.convN - q.convN);
        const m = waiting.shift();
        if (!m) break;
        m.kin = 'conv'; m.slot = k; m.lastS = s; st.slots.set(k, m.i);
      }
    });
  }

  private rockerEnds(): [number, number, number, number] {
    const rk = this.track.rocker!;
    const c = Math.cos(this.rocker.a), s = Math.sin(this.rocker.a);
    return [rk.px - c * rk.half, rk.py - s * rk.half, rk.px + c * rk.half, rk.py + s * rk.half];
  }

  private rockerHit(m: Marble) {
    const rk = this.track.rocker;
    if (!rk) return;
    if (Math.abs(m.x - rk.px) > rk.half + 20 || Math.abs(m.y - rk.py) > 60) return;
    const [ax, ay, bx, by] = this.rockerEnds();
    const [qx, qy] = closest(ax, ay, bx, by, m.x, m.y);
    const rx = qx - rk.px, ry = qy - rk.py;
    let nx = m.x - qx, ny = m.y - qy;
    const d = Math.hypot(nx, ny);
    if (d >= R + 4 || d === 0) return;
    nx /= d; ny /= d;
    const st = this.rocker;
    const svx = -st.w * ry, svy = st.w * rx;
    const vn = (m.vx - svx) * nx + (m.vy - svy) * ny;
    m.x += nx * (R + 4 - d); m.y += ny * (R + 4 - d);
    if (vn < 0) {
      // echte Wippe: das Gewicht der Murmel kippt sie
      const cr = rx * ny - ry * nx, I = 600;
      const J = -(1.15 * vn) / (1 + (cr * cr) / I);
      m.vx += J * nx; m.vy += J * ny;
      st.w -= (J * cr) / I;
    }
    m.w = (m.vx * -ny + m.vy * nx) / R;
    m.contact = true;
  }

  /** Kippweiche als echte Wippe: das Gewicht der Murmel kippt sie, eine Feder holt sie zur Mitte zurück */
  private stepRocker(dt: number) {
    const st = this.rocker;
    const rk = this.track.rocker;
    if (!rk) return;
    // keine Feder: sie bleibt, wie sie ist, und schwingt mit ihrem Schwung weiter (nur Lagerreibung)
    // prallt am Anschlag zurück und schaukelt mit ihrem Schwung weiter
    const eb = 0.8, fr = 0.2;
    st.w *= Math.exp(-fr * dt);
    st.a += st.w * dt;
    if (st.a > 0.42) { if (st.w > 0.6) this.fx.push(['clack', rk.px + 50, rk.py]); st.a = 0.42; st.w = -Math.max(0, st.w) * eb; }
    if (st.a < -0.42) { if (st.w < -0.6) this.fx.push(['clack', rk.px - 50, rk.py]); st.a = -0.42; st.w = -Math.min(0, st.w) * eb; }
  }

  private wippeHit(m: Marble) {
    this.track.wippes.forEach((wd, k) => {
      const st = this.wippe[k];
      if (wd.layer && m.layer && wd.layer !== m.layer) return;
      if (Math.abs(m.x - wd.px) > wd.half + 20 || Math.abs(m.y - wd.py) > wd.half) return;
      const c = Math.cos(st.a), s = Math.sin(st.a);
      const ax = wd.px - c * wd.half, ay = wd.py - s * wd.half, bx = wd.px + c * wd.half, by = wd.py + s * wd.half;
      const [qx, qy] = closest(ax, ay, bx, by, m.x, m.y);
      const rx = qx - wd.px, ry = qy - wd.py;
      const svx = -st.w * ry, svy = st.w * rx;
      let nx = m.x - qx, ny = m.y - qy;
      const d = Math.hypot(nx, ny);
      if (d >= R + 4 || d === 0) return;
      nx /= d; ny /= d;
      const vn = (m.vx - svx) * nx + (m.vy - svy) * ny;
      m.x += nx * (R + 4 - d); m.y += ny * (R + 4 - d);
      if (vn < 0) {
        const cr = rx * ny - ry * nx;
        const I = 1500;
        const J = -(1.2 * vn) / (1 + (cr * cr) / I);
        m.vx += J * nx; m.vy += J * ny;
        st.w -= (J * cr) / I;
      }
      m.w = (m.vx * -ny + m.vy * nx) / R;
      m.contact = true;
    });
  }

  private stepWippes(dt: number) {
    this.track.wippes.forEach((wd, k) => {
      const st = this.wippe[k];
      // echte Wippe: keine Rückstellfeder, sie behält Lage und Schwung
      st.w *= Math.exp(-0.8 * dt);
      st.a += st.w * dt;
      if (st.a > 0.42) { if (st.w > 0.6) this.fx.push(['clack', wd.px + wd.half, wd.py]); st.a = 0.42; st.w = Math.min(0, st.w) * -0.25; }
      if (st.a < -0.42) { if (st.w < -0.6) this.fx.push(['clack', wd.px - wd.half, wd.py]); st.a = -0.42; st.w = Math.max(0, st.w) * -0.25; }
    });
  }

  /** Kräfte und Auslöser der Teile (Farbsensor: eigene oder fremde Farbe) */
  private fields(m: Marble, dt: number) {
    const t = this.t;
    for (const it of this.items) {
      const so = this.track.sockets[it.socket];
      if (Math.abs(m.y - so.y) > 120 || Math.abs(m.x - so.x) > 240) continue;
      const r = this.track.rows[so.row];
      if (r.layer && m.layer && r.layer !== m.layer) continue;
      const dir = r.dir;
      const own = m.owner === it.owner;
      const onRail = () => Math.abs(m.y - (railY(r, m.x) - R - 4)) < 16;
      const before = (span: number) => (dir > 0 ? m.x > so.x - span && m.x < so.x + 6 : m.x < so.x + span && m.x > so.x - 6);
      const inZone = (len: number) => (dir > 0 ? m.x > so.x - len && m.x < so.x : m.x < so.x + len && m.x > so.x);
      switch (it.kind) {
        case 'turbo':
          if (own && !it.hit.has(m.i) && before(14) && onRail()) {
            it.hit.add(m.i); it.kickAt = t;
            m.vx = dir * Math.max(Math.abs(m.vx) + 260, 520);
            m.boostUntil = t + 1;
            this.fx.push(['help', it.id, m.i]);
          }
          break;
        case 'feder':
          if (own && !it.hit.has(m.i) && before(12) && onRail()) {
            it.hit.add(m.i); it.kickAt = t;
            m.vx = dir * 330; m.vy = -560;
            this.fx.push(['help', it.id, m.i]);
          }
          break;
        case 'magnet':
          if (own && inZone(170) && Math.abs(m.y - railY(r, m.x)) < 50) { m.vx += dir * 700 * dt; m.boostUntil = t + 0.2; }
          break;
        case 'schild':
          if (own && !m.shield && !it.hit.has(m.i) && before(10) && onRail()) {
            it.hit.add(m.i); m.shield = true; it.kickAt = t;
            this.fx.push(['help', it.id, m.i]);
          }
          break;
        case 'kleber':
          if (!own && inZone(150) && onRail() && (it.hit.has(m.i) || (!this.spent(it) && this.trap(m, it)))) {
            if (it.hit.has(m.i) && !this.wasShielded(it, m)) {
              const f = Math.exp(-2.4 * dt);
              m.vx *= f; m.vy *= f;
            }
          }
          break;
        case 'bremse':
          if (!own && inZone(140) && onRail() && (it.hit.has(m.i) || (!this.spent(it) && this.trap(m, it)))) {
            if (!this.wasShielded(it, m) && Math.abs(m.vx) > 110) m.vx = Math.sign(m.vx) * 110;
          }
          break;
        case 'wind': {
          const z = inZone(190) && Math.abs(m.y - railY(r, m.x)) < 60;
          if (!own && z && t >= it.readyAt && !this.spent(it)) {
            it.gustUntil = t + 0.9; it.readyAt = t + 2.9; it.used++;
            this.fx.push(['gust', it.id]);
          }
          if (!own && z && t < it.gustUntil) {
            if (!it.hit.has(m.i)) { it.hit.add(m.i); if (m.shield) { m.shield = false; this.shielded.add(`${it.id}:${m.i}`); this.fx.push(['shield', m.i, it.id]); } else it.trig++; }
            if (!this.wasShielded(it, m)) m.vx -= dir * 650 * dt;
          }
          break;
        }
        case 'schranke': {
          const ahead = dir > 0 ? m.x > so.x - 70 && m.x < so.x - 10 : m.x < so.x + 70 && m.x > so.x + 10;
          if (!own && ahead && onRail() && t >= it.readyAt && !this.spent(it)) {
            it.closedUntil = t + 2.5; it.readyAt = t + 6.5; it.used++; it.trig++; it.kickAt = t;
            this.fx.push(['trap', it.id, m.i]);
          }
          break;
        }
        case 'falltuer':
          if (!own && !it.hit.has(m.i) && Math.abs(m.x - so.x) < 8 && onRail() && !this.spent(it) && this.trap(m, it)) {
            m.basketUntil = t + 2.5; m.basketX = so.x; m.basketRow = so.row;
            m.x = so.x; m.y = so.y + 30; m.vx = 0; m.vy = 0;
          }
          break;
        case 'wurmloch':
          if (it.on && it.tube && !it.hit.has(m.i) && Math.abs(m.x - so.x) < 8 && onRail()) {
            it.hit.add(m.i);
            m.tube = it.id; m.ts = 0; m.tv = Math.max(100, Math.abs(m.vx));
            this.fx.push(['tube', it.id, m.i]);
          }
          break;
        case 'kanone':
          if (it.on && !it.hit.has(m.i) && Math.abs(m.x - so.x) < 8 && onRail()) {
            it.hit.add(m.i); it.kickAt = t;
            m.vx = dir * 380; m.vy = -600;
            this.fx.push(['kanone', it.id, m.i]);
          }
          break;
      }
    }
  }

  private shielded = new Set<string>();
  private wasShielded(it: Item, m: Marble) {
    return this.shielded.has(`${it.id}:${m.i}`);
  }

  /** Falle löst aus: Schild schützt einmal; zählt für den Fallen-Bonus */
  private trap(m: Marble, it: Item): boolean {
    it.hit.add(m.i);
    if (m.shield) {
      m.shield = false;
      this.shielded.add(`${it.id}:${m.i}`);
      this.fx.push(['shield', m.i, it.id]);
      return false;
    }
    it.used++;
    it.trig++;
    it.kickAt = this.t;
    this.fx.push(['trap', it.id, m.i]);
    return true;
  }

  /** Teile mit fester Form: Prallpilz und geschlossener Schlagbaum */
  private partHit(m: Marble) {
    const t = this.t;
    for (const it of this.items) {
      const so = this.track.sockets[it.socket];
      if (Math.abs(m.x - so.x) > 26 || Math.abs(m.y - so.y) > 44) continue;
      const r = this.track.rows[so.row];
      if (r.layer && m.layer && r.layer !== m.layer) continue;
      if (it.kind === 'gegenfeder' && m.owner !== it.owner && !it.hit.has(m.i) && !this.spent(it)) {
        const probe = { x: m.x, y: m.y, vx: m.vx, vy: m.vy, w: m.w, contact: false };
        if (this.hit(probe, so.x, so.y - 10, 10, 0) && this.trap(m, it)) {
          m.x = probe.x; m.y = probe.y;
          m.vx = -r.dir * Math.max(260, Math.abs(m.vx) * 1.1);
          m.vy = -160;
        }
      } else if (it.kind === 'schranke' && t < it.closedUntil) {
        const [qx, qy] = closest(so.x, so.y - 34, so.x, so.y - 2, m.x, m.y);
        this.hit(m, qx, qy, 4, 0.1);
      }
    }
  }

  /** Rohrpost: Druckluft schiebt, Schwerkraft wirkt entlang der Röhre, Reibung bremst */
  private stepTube(m: Marble, dt: number) {
    const it = this.items.find((x) => x.id === m.tube)!;
    const pts = it.tube!, cum = it.tubeCum!;
    const len = cum[cum.length - 1];
    const [, , , ty] = pathAt(pts, cum, m.ts);
    m.tv += (G * ty + 650 - 1.1 * m.tv) * dt;
    m.tv = Math.max(80, m.tv);
    m.ts += m.tv * dt;
    if (m.ts >= len) {
      const [ex, ey, tx, ty2] = pathAt(pts, cum, len);
      m.tube = -1;
      m.layer = 0;
      m.x = ex; m.y = ey;
      m.vx = tx * Math.min(m.tv, 420); m.vy = Math.max(40, ty2 * Math.min(m.tv, 420));
      m.crossUntil = this.t + 1.5;
      // Fortschritt neu suchen (die Röhre springt über mehrere Abschnitte)
      let bd = Infinity;
      for (let k = 1; k < this.track.route.length; k++) {
        const [ax, ay] = this.track.route[k - 1], [bx, by] = this.track.route[k];
        const [qx, qy] = closest(ax, ay, bx, by, m.x, m.y);
        const d = Math.hypot(qx - m.x, qy - m.y);
        if (d < bd) { bd = d; m.ri = k; }
      }
      return;
    }
    const [x, y] = pathAt(pts, cum, m.ts);
    m.x = x; m.y = y;
    m.a += (m.tv / R) * dt;
  }

  /** Murmeln in derselben Röhre stoßen sich an (kein Überholen in der Röhre) */
  private tubeContacts(live: Marble[]) {
    const groups = new Map<number, Marble[]>();
    for (const m of live) {
      const key = m.kin === 'spiral' ? -2 : m.tube >= 0 ? m.tube : null;
      if (key === null) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      list.sort((a, b) => b.ts - a.ts);
      let pts = this.track.spiral, cum = this.spiralCum;
      if (key >= 0) {
        const it = this.items.find((x) => x.id === key)!;
        pts = it.tube!; cum = it.tubeCum!;
      }
      for (let k = 1; k < list.length; k++) {
        const ahead = list[k - 1], back = list[k];
        if (ahead.ts - back.ts >= 2 * R) continue;
        back.ts = ahead.ts - 2 * R;
        if (back.tv > ahead.tv) {
          const vc = (back.tv + ahead.tv) / 2, dv = (back.tv - ahead.tv) / 2;
          back.tv = vc - 0.5 * dv;
          ahead.tv = vc + 0.5 * dv;
        }
        const [x, y] = pathAt(pts, cum, Math.max(0, back.ts));
        back.x = x; back.y = y;
      }
    }
  }

  private runEvent(ev: RaceEvent) {
    ev.done = true;
    this.fx.push(['event', ev.kind, ev.owner]);
    if (ev.kind === 'beben') {
      this.quakeUntil = this.t + 2;
    } else if (ev.kind === 'oel') {
      const count = this.track.rows.map((r) => this.marbles.filter((m) => m.on && !m.place && this.free(m) && m.row === r.i).length);
      const best = count.indexOf(Math.max(...count));
      this.oil = { row: Math.max(0, best), until: this.t + 8 };
      ev.data = [this.oil.row];
    } else if (ev.kind === 'riese') {
      this.giant = { x: this.track.startX + (this.track.startX < W / 2 ? 20 : -20), y: -40, vx: this.track.startX < W / 2 ? 60 : -60, vy: 0, a: 0, done: false, t: 0 };
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

  /** Riesenmurmel: schwere Kugel, rollt über die linke Hälfte und schiebt alles vor sich her; am Förderband oder Mühlrad zerfällt sie */
  private stepGiant(dt: number, live: Marble[]) {
    const g = this.giant!;
    if (g.done) return;
    const GR = 26;
    g.t += dt;
    g.vy += G * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    const b = Math.floor(g.y / 100);
    const band = [...(this.bands.get(b) ?? []), ...(this.bands.get(b + 1) ?? [])];
    const gm = { x: g.x, y: g.y, vx: g.vx, vy: g.vy, w: 0, contact: false };
    for (const s of band) {
      if (s.kind === 'glass') continue;
      const [qx, qy] = closest(s.ax, s.ay, s.bx, s.by, gm.x, gm.y);
      this.hit(gm, qx, qy, s.th, 0.15, GR);
    }
    g.x = gm.x; g.y = gm.y; g.vx = gm.vx; g.vy = gm.vy;
    if (Math.hypot(g.vx, g.vy) < 20) {
      g.still = (g.still ?? 0) + dt;
      if (g.still > 0.6) { g.vx += (g.x > 600 ? 1 : -1) * 260; g.vy -= 120; g.still = 0; }
    } else g.still = 0;
    if (gm.contact) g.vx *= Math.exp(-0.05 * dt);
    g.a += (gm.contact ? gm.w : g.vx / GR) * dt;
    for (const m of live) {
      if (!this.free(m)) continue;
      const dx = m.x - g.x, dy = m.y - g.y, d = Math.hypot(dx, dy);
      if (d >= GR + R || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      m.x = g.x + nx * (GR + R); m.y = g.y + ny * (GR + R);
      const vn = (m.vx - g.vx) * nx + (m.vy - g.vy) * ny;
      if (vn < 0) {
        m.vx -= 1.6 * vn * nx; m.vy -= 1.6 * vn * ny;
        g.vx += 0.1 * vn * nx; g.vy += 0.1 * vn * ny;
      }
    }
    const nearBlock = this.track.lifts.some((c) => Math.abs(g.x - c.x) < 80 && g.y > c.y0 - 80) || this.track.wheels.some((wd) => Math.hypot(g.x - wd.pick[0], g.y - wd.pick[1]) < 50);
    if (nearBlock || g.t > 30 || g.y > this.track.H) {
      g.done = true;
      this.fx.push(['giant', Math.round(g.x), Math.round(g.y)]);
    }
  }

  giantPos(): [number, number, number] | null {
    const g = this.giant;
    if (!g || g.done) return null;
    return [Math.round(g.x), Math.round(g.y), Math.round(g.a * 100) % 628];
  }

  /** Zustand der beweglichen Bausteine: Radwinkel×100, Förderband-Weg, Weichenwinkel×100 */
  blocks(): { wh: number[]; cv: number[]; rk: number; tn: number[]; dr: number[] } {
    const deg = (a: number) => Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 100);
    return { wh: this.wheel.map((w) => deg(w.ang)), cv: this.track.lifts.map((l, k) => Math.round((this.convs[k].t * l.v) % l.sp)), rk: Math.round(this.rocker.a * 100), tn: this.turnAng.map(deg), dr: this.drumAng.map(deg) };
  }

  /** Stream-Daten: [x, y, Drehung×100, Flags] je Murmel */
  frame(): number[][] {
    return this.marbles.map((m) => {
      let f = 0;
      if (m.place) f |= F.done;
      if (m.tube >= 0) f |= F.tube;
      if (m.basketUntil) f |= F.basket;
      if (m.shield) f |= F.shield;
      if (this.t < m.boostUntil) f |= F.boost;
      if (m.kin === 'conv' || m.kin === 'convWait') f |= F.behind;
      if (m.kin === 'over') f |= F.glass;
      if (m.layer === 1) f |= F.back;
      if (m.kin === 'spiral') f |= F.glass;
      return [Math.round(m.x), Math.round(m.on ? m.y : -60), Math.round(m.a * 100) % 628, f];
    });
  }
}

/* ---------- Durchmisch-Prüfung ---------- */

export function spearman(start: number[], finish: number[]): number {
  const n = finish.length;
  if (n < 3) return 0;
  const sPos = new Map(start.map((id, k) => [id, k]));
  const ranked = finish.slice().sort((a, b) => sPos.get(a)! - sPos.get(b)!);
  const sr = new Map(ranked.map((id, k) => [id, k]));
  let d2 = 0;
  finish.forEach((id, k) => (d2 += (sr.get(id)! - k) ** 2));
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export interface CheckResult { rho: number; overtakes: number; time: number; done: number; ok: boolean }

export function checkTrack(track: Track, runs = 3, marbles = 30, rnd: () => number = Math.random): CheckResult {
  let rho = 0, ov = 0, time = 0, done = 0;
  for (let k = 0; k < runs; k++) {
    const owners = Array.from({ length: marbles }, (_, i) => i % 6);
    const race = new Race(track, owners, [], [], rnd);
    while (!race.done && race.t < 120) race.step();
    rho += spearman(owners.map((_, i) => i), race.finished);
    ov += race.overtakes;
    time += race.t;
    done += race.finished.length / marbles;
  }
  rho /= runs;
  ov /= runs;
  time /= runs;
  done /= runs;
  return { rho, overtakes: ov, time, done, ok: done === 1 && rho < 0.5 && time < 105 };
}

export function generateGoodTrack(tries = 4, runs = 2, rnd: () => number = Math.random, forced?: DesignName): { track: Track; check: CheckResult } {
  let best: { track: Track; check: CheckResult } | null = null;
  // Bahnform und Spiegelung einmal auslosen, nur die Bausteine werden neu gewürfelt
  const design = forced && DESIGNS.includes(forced) ? forced : DESIGNS[Math.floor(rnd() * DESIGNS.length)];
  const mirrored = rnd() < 0.5;
  for (let k = 0; k < tries; k++) {
    const track = generateTrack(rnd, design, mirrored);
    const check = checkTrack(track, runs, 30, rnd);
    const score = (c: CheckResult) => c.done * 10 - c.rho - c.time / 200;
    if (!best || score(check) > score(best.check)) best = { track, check };
    if (check.ok) return { track, check };
  }
  return best!;
}
