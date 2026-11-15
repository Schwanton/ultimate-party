/**
 * Murmel-Mayhem – Bahn und echte 2D-Physik (ohne Netzwerk, auch für Tests und die Durchmisch-Prüfung).
 *
 * Murmeln sind Kugeln mit Schwung: sie rollen über Messingkanten, prallen an Wänden und Stiften ab,
 * stoßen sich gegenseitig und drehen sich. Reihenenden sind meist offen (die Murmel fällt auf die
 * nächste Reihe), sonst sitzt dort eine Mischstelle (Trichter, Nagelfeld, Wippe). Manche Reihen haben
 * mittendrin eine Stufe mit Nägeln. Alle Teile sind Mechanik mit Farbsensor davor.
 * Weltkoordinaten: 1200 breit, y nach unten.
 */

export const W = 1200;
export const R = 9;
export const TICK = 1 / 30;
export const SUB = 4;
const G = 1150;
const ROWS = 12;
const TOP = 150;
const GAP = 200;
const DROP = 70;
const STEP_DY = 50;

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
/** Klappen brauchen eine Reihe darunter (nicht in der letzten Reihe) */
export const NOT_LAST: CardKind[] = ['farbweiche', 'umleitung'];
/** Teile, die ihr Erbauer im Rennen umlegen kann */
export const TOGGLE: CardKind[] = ['farbweiche', 'umleitung', 'wurmloch', 'kanone'];
export const TOGGLE_START: Partial<Record<CardKind, boolean>> = { farbweiche: true, umleitung: false, wurmloch: false, kanone: false };
/** Ladungen einer Falle pro Rennen (im zweiten Rennen die Hälfte) */
const CHARGES: Partial<Record<ItemKind, number>> = { kleber: 5, schranke: 3, gegenfeder: 4, falltuer: 4, wind: 3, bremse: 6 };

export type EndKind = 'offen' | 'trichter' | 'nagel' | 'wippe';

export interface Row { i: number; y0: number; dir: 1 | -1; xa: number; xb: number; end: EndKind; step: number | null; wear: number }
export interface Seg { ax: number; ay: number; bx: number; by: number; th: number; e: number; kind: 'rail' | 'wall' | 'glass' | 'frame'; row: number }
export interface Pin { x: number; y: number; r: number }
export interface WippeDef { px: number; py: number; half: number; rest: number }
export interface Socket { id: number; row: number; x: number; y: number }
export interface Mark { row: number; kind: 'delle' | 'poliert' }

export interface Track {
  H: number;
  rows: Row[];
  segs: Seg[];
  pins: Pin[];
  wippes: WippeDef[];
  sockets: Socket[];
  finish: { x0: number; x1: number; y: number };
  labels: { t: string; x: number; y: number }[];
  marks: Mark[];
}

export function railY(row: Row, x: number): number {
  const base = row.y0 + ((x - row.xa) / (row.xb - row.xa)) * DROP;
  if (row.step !== null && (row.dir > 0 ? x > row.step : x < row.step)) return base + STEP_DY;
  return base;
}
const endY = (r: Row) => railY(r, r.xb);

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/* ---------- Bahn erzeugen ---------- */

export function generateTrack(rnd: () => number = Math.random): Track {
  // Reihenenden: etwa zwei Drittel offen, sonst Mischstelle; 2 Reihen mit Nägel-Stufe in der Mitte
  let ends: EndKind[] = [];
  for (let k = 0; k < 100; k++) {
    ends = shuffle(['trichter', 'trichter', 'nagel', 'wippe', 'offen', 'offen', 'offen', 'offen', 'offen', 'offen', 'offen'] as EndKind[], rnd);
    if (ends.some((e, i) => e !== 'offen' && ends[i + 1] !== undefined && ends[i + 1] !== 'offen')) continue;
    break;
  }
  // Stufen nur in Reihen mit offenem Ende (sonst fehlt unten der Platz)
  const stepRows = shuffle([2, 3, 4, 5, 6, 7, 8, 9].filter((i) => ends[i] === 'offen'), rnd).slice(0, 2);
  const rows: Row[] = [];
  for (let i = 0; i < ROWS; i++) {
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
    rows.push({ i, y0: TOP + GAP * i, dir, xa: dir > 0 ? 30 : 1170, xb: dir > 0 ? 1066 : 134, end: i < ROWS - 1 ? ends[i] : 'offen', step: stepRows.includes(i) ? (dir > 0 ? 560 + Math.round(rnd() * 80) : 640 - Math.round(rnd() * 80)) : null, wear: 1 });
  }
  const track: Track = { H: rows[ROWS - 1].y0 + DROP + 200, rows, segs: [], pins: [], wippes: [], sockets: [], finish: { x0: 40, x1: 470, y: 0 }, labels: [], marks: [] };
  buildStatics(track);
  for (const r of rows) {
    const xs = r.dir > 0 ? [270, 560, 850] : [930, 640, 350];
    for (const x of xs) {
      if (r.step !== null && Math.abs(x - r.step) < 150) continue;
      if (r.i === 0 && x < 300) continue;
      track.sockets.push({ id: track.sockets.length, row: r.i, x, y: Math.round(railY(r, x)) });
    }
  }
  return track;
}

/** Feste Kanten, Stifte und Wippen aus den Reihen bauen (auch nach einem Umbau) */
export function buildStatics(track: Track) {
  const { rows } = track;
  const segs: Seg[] = [];
  const pins: Pin[] = [];
  const labels: Track['labels'] = [];
  const wippes: WippeDef[] = [];
  const seg = (ax: number, ay: number, bx: number, by: number, th: number, e: number, kind: Seg['kind'], row = -1) => segs.push({ ax, ay, bx, by, th, e, kind, row });
  for (const r of rows) {
    const flat = { ...r, step: null };
    if (r.step !== null) {
      seg(r.xa, railY(r, r.xa), r.step, railY(flat, r.step), 4, 0.25, 'rail', r.i);
      const x2 = r.step - r.dir * 26;
      seg(x2, railY(flat, x2) + STEP_DY, r.xb, endY(r), 4, 0.25, 'rail', r.i);
      for (let x = r.step + r.dir * 4, k = 0; r.dir > 0 ? x < r.step + 140 : x > r.step - 140; x += r.dir * 32, k++) {
        pins.push({ x, y: railY(flat, x) + 16 + (k % 2 ? 4 : 0), r: 3.6 });
      }
      labels.push({ t: 'stufe', x: r.step + r.dir * 70, y: railY(flat, r.step) - 30 });
    } else {
      seg(r.xa, railY(r, r.xa), r.xb, endY(r), 4, 0.25, 'rail', r.i);
    }
    if (r.i < ROWS - 1) {
      // Reihenende offen: die Murmel prallt an den Rahmen und fällt auf die nächste Reihe
      const ey = endY(r);
      const cx = r.dir > 0 ? 1090 : 110;
      if (r.end === 'trichter') {
        seg(cx - 70, ey + 8, cx - 15, ey + 66, 3, 0.2, 'glass');
        seg(cx + 70, ey + 8, cx + 15, ey + 66, 3, 0.2, 'glass');
        labels.push({ t: 'trichter', x: cx, y: ey - 30 });
      } else if (r.end === 'nagel') {
        const x0 = r.dir > 0 ? 1000 : 62;
        for (let k = 0; k < 3; k++) for (let x = x0 + (k % 2 ? 0 : 15); x < x0 + 140; x += 30) pins.push({ x, y: ey + 20 + k * 25, r: 3.6 });
        labels.push({ t: 'nagel', x: x0 + 70, y: ey - 30 });
      } else if (r.end === 'wippe') {
        wippes.push({ px: r.dir > 0 ? 1065 : 135, py: ey + 64, half: 56, rest: r.dir > 0 ? -0.3 : 0.3 });
        labels.push({ t: 'wippe', x: r.dir > 0 ? 1065 : 135, y: ey - 30 });
      }
    }
  }
  seg(22, -200, 22, track.H, 6, 0.3, 'frame');
  seg(1178, -200, 1178, track.H, 6, 0.3, 'frame');
  seg(40, -40, 40, 60, 3, 0.2, 'glass');
  seg(40, 60, 104, 112, 3, 0.2, 'glass');
  seg(240, -40, 240, 50, 3, 0.2, 'glass');
  seg(240, 50, 146, 112, 3, 0.2, 'glass');
  labels.push({ t: 'start', x: 300, y: 40 });
  const last = rows[ROWS - 1];
  const fy = endY(last) + 90;
  seg(40, fy, 470, fy, 5, 0.2, 'rail');
  seg(40, fy - 130, 40, fy, 5, 0.3, 'wall');
  seg(470, fy - 26, 470, fy, 5, 0.3, 'wall');
  labels.push({ t: 'ziel', x: 255, y: fy + 30 });
  track.finish = { x0: 40, x1: 470, y: fy };
  track.segs = segs;
  track.pins = pins;
  track.labels = labels;
  track.wippes = wippes;
}

/** Neuen Bauplatz ergänzen (Umbau) */
export function addSocket(track: Track, rnd: () => number = Math.random): Socket | null {
  for (let k = 0; k < 40; k++) {
    const r = track.rows[Math.floor(rnd() * ROWS)];
    const x = 220 + Math.round(rnd() * 760);
    if (track.sockets.some((s) => s.row === r.i && Math.abs(s.x - x) < 200)) continue;
    if (r.step !== null && Math.abs(x - r.step) < 150) continue;
    if (r.i === 0 && x < 300) continue;
    const so = { id: track.sockets.length, row: r.i, x, y: Math.round(railY(r, x)) };
    track.sockets.push(so);
    return so;
  }
  return null;
}

/** Mischstelle an einem Reihenende tauschen (Umbau) */
export function swapEnd(track: Track, rnd: () => number = Math.random): { row: number; from: EndKind; to: EndKind } {
  const cands = track.rows.filter((r) => r.i < ROWS - 1 && r.step === null);
  const r = cands[Math.floor(rnd() * cands.length)];
  const opts = (['trichter', 'nagel', 'wippe', 'offen'] as EndKind[]).filter((e) => e !== r.end);
  const to = opts[Math.floor(rnd() * opts.length)];
  const from = r.end;
  r.end = to;
  buildStatics(track);
  return { row: r.i, from, to };
}

/* ---------- Teile ---------- */

export interface Item {
  id: number;
  kind: ItemKind;
  owner: number;
  socket: number;
  /** 0 = neu, 1 = zweites Rennen (schwächer) */
  age: number;
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
  tubeLen?: number;
}

export interface RaceEvent { kind: EventKind; owner: number; at: number; done?: boolean; data?: number[] }

export function newItem(id: number, kind: ItemKind, owner: number, socket: number, on?: boolean): Item {
  return { id, kind, owner, socket, age: 0, on: on ?? TOGGLE_START[kind] ?? true, cool: 0, used: 0, trig: 0, hit: new Set(), closedUntil: 0, readyAt: 0, gustUntil: 0, kickAt: -9 };
}

/** Rohrpost: Ziel 1–2 Reihen weiter vorn oder 1 Reihe zurück */
export function makeTube(track: Track, so: Socket, rnd: () => number = Math.random): Pt[] {
  const back = so.row > 0 && rnd() < 0.35;
  const to = back ? so.row - 1 : Math.min(ROWS - 1, so.row + 1 + (rnd() < 0.5 ? 1 : 0));
  const r = track.rows[to];
  let tx = 260 + rnd() * 680;
  if (r.step !== null && Math.abs(tx - r.step) < 60) tx += 120;
  const ty = railY(r, tx) - 30;
  const a: Pt = [so.x, so.y - 14];
  const c1: Pt = [so.x, so.y - 120], c2: Pt = [tx, ty - 110];
  const out: Pt[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = k / 24, u = 1 - t;
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
  const so = track.sockets[it.socket];
  const end = it.tube[it.tube.length - 1];
  return end[1] > so.y + 40;
}

/* ---------- Rennen ---------- */

export const F = { done: 1, tube: 2, basket: 4, shield: 8, boost: 16 };

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
}

interface Giant { x: number; y: number; vx: number; vy: number; a: number; done: boolean; still?: number }

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
  /** Aufenthaltszeit je Reihe (für die Abnutzung) */
  rowTime: number[];
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
      i, owner, on: false, x: 140, y: -60, vx: 0, vy: 0, a: rnd() * 6.28, w: 0, contact: false, still: 0, place: 0, finishedAt: 0,
      shield: false, boostUntil: 0, tube: -1, ts: 0, basketUntil: 0, basketX: 0, basketRow: 0,
    }));
    this.queue = this.marbles.slice();
    this.wippe = track.wippes.map((w) => ({ a: w.rest, w: 0 }));
    this.rowTime = track.rows.map(() => 0);
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
    for (const it of items) it.tubeLen = it.tube ? it.tube.reduce((acc, p, k) => (k ? acc + Math.hypot(p[0] - it.tube![k - 1][0], p[1] - it.tube![k - 1][1]) : 0), 0) : 0;
  }

  get done() {
    return this.finished.length === this.marbles.length;
  }

  private str(it: Item) {
    return it.age > 0 ? 0.6 : 1;
  }

  /** Fallen haben pro Rennen nur ein paar Ladungen */
  spent(it: Item): boolean {
    return this.left(it) === 0;
  }

  left(it: Item): number {
    const max = CHARGES[it.kind];
    if (max === undefined) return -1;
    return Math.max(0, (it.age > 0 ? Math.ceil(max / 2) : max) - it.used);
  }

  toggle(itemId: number, owner: number): boolean {
    const it = this.items.find((x) => x.id === itemId);
    if (!it || it.owner !== owner || !TOGGLE.includes(it.kind) || this.t < it.cool) return false;
    it.on = !it.on;
    it.cool = this.t + 2;
    this.fx.push(['toggle', it.id, it.on ? 1 : 0]);
    return true;
  }

  private rowOf(y: number) {
    return Math.max(0, Math.min(ROWS - 1, Math.floor((y - TOP + 80) / GAP)));
  }

  private posProgress(x: number, y: number) {
    const ri = this.rowOf(y);
    const r = this.track.rows[ri];
    return ri * 1200 + (r.dir > 0 ? x : W - x);
  }

  progress(i: number): number {
    const m = this.marbles[i];
    if (m.place) return 1e7 - m.place;
    if (!m.on) return -1000 - i;
    return this.posProgress(m.x, m.y);
  }

  /** Fortschritt 0..1 für die Rennverlauf-Leiste */
  share(i: number): number {
    const m = this.marbles[i];
    if (m.place) return 1;
    if (!m.on) return 0;
    return Math.max(0, Math.min(0.99, this.progress(i) / (ROWS * 1200)));
  }

  order(): number[] {
    return this.marbles.map((m) => m.i).sort((a, b) => this.progress(b) - this.progress(a));
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
      if (so.row >= ROWS - 1 || so.row !== row || Math.abs(m.x - so.x) > 22) continue;
      const own = m.owner === it.owner;
      const open = it.kind === 'umleitung' ? it.on : own ? it.on : !it.on;
      if (open) return true;
    }
    return false;
  }

  step() {
    const h = TICK / SUB;
    for (let k = 0; k < SUB; k++) this.sub(h);
    if (this.t >= this.nextSample) {
      this.nextSample = this.t + 0.5;
      const order = this.marbles.filter((m) => m.on && m.y > 125).map((m) => m.i).sort((a, b) => this.progress(b) - this.progress(a));
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

  private sub(dt: number) {
    this.t += dt;
    const t = this.t;
    while (this.queue.length && t >= this.nextRelease) {
      const m = this.queue.shift()!;
      m.on = true;
      m.x = 140 + (this.rnd() - 0.5) * 120;
      m.y = 10 + (this.rnd() - 0.5) * 30;
      m.vx = 30 + this.rnd() * 40;
      m.vy = 0;
      this.nextRelease = t + 0.06;
    }
    for (const ev of this.events) if (!ev.done && t >= ev.at) this.runEvent(ev);
    const quake = t < this.quakeUntil;
    const live = this.marbles.filter((m) => m.on && !m.place);
    for (const m of live) {
      if (m.tube >= 0) { this.stepTube(m, dt); continue; }
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
      if (m.tube >= 0 || m.basketUntil) continue;
      const band = this.bands.get(Math.floor(m.y / 100)) ?? [];
      let row = -1;
      for (const s of band) {
        if (m.x < Math.min(s.ax, s.bx) - 20 || m.x > Math.max(s.ax, s.bx) + 20 || m.y < Math.min(s.ay, s.by) - 20 || m.y > Math.max(s.ay, s.by) + 20) continue;
        if (s.kind === 'rail' && s.row >= 0 && this.holeOpen(m, s.row)) {
          if (m.vy < 240) m.vy = 240;
          continue;
        }
        const [qx, qy] = closest(s.ax, s.ay, s.bx, s.by, m.x, m.y);
        if (this.hit(m, qx, qy, s.th, s.e) && s.kind === 'rail' && s.row >= 0) row = s.row;
      }
      for (const p of this.pinBands.get(Math.floor(m.y / 100)) ?? []) {
        if (Math.abs(m.x - p.x) > 20 || Math.abs(m.y - p.y) > 20) continue;
        this.hit(m, p.x, p.y, p.r, 0.5);
      }
      this.wippeHit(m);
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
    }
    this.stepWippes(dt);
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      if (a.tube >= 0 || a.basketUntil) continue;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        if (b.tube >= 0 || b.basketUntil) continue;
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
        }
      }
    }
    if (this.giant) this.stepGiant(dt, live);
    const fin = this.track.finish;
    for (const m of live) {
      if (m.tube >= 0 || m.basketUntil) continue;
      m.a += m.w * dt;
      this.rowTime[this.rowOf(m.y)] += dt;
      const sp = Math.hypot(m.vx, m.vy);
      m.still = sp < 8 ? m.still + dt : 0;
      if (m.still > 1.8) {
        const closedGate = this.items.some((it) => it.kind === 'schranke' && t < it.closedUntil && Math.abs(m.x - this.track.sockets[it.socket].x) < 60);
        if (!closedGate) {
          const r = this.track.rows[this.rowOf(m.y)];
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
        m.x = 140; m.y = 10; m.vx = 40; m.vy = 0;
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

  private wippeHit(m: Marble) {
    this.track.wippes.forEach((wd, k) => {
      const st = this.wippe[k];
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
        const I = 4200;
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
      st.w += -(st.a - wd.rest) * 4 * dt;
      st.w *= Math.exp(-1.5 * dt);
      st.a += st.w * dt;
      if (st.a > 0.42) { st.a = 0.42; st.w = Math.min(0, st.w); }
      if (st.a < -0.42) { st.a = -0.42; st.w = Math.max(0, st.w); }
    });
  }

  /** Kräfte und Auslöser der Teile (Farbsensor: eigene oder fremde Farbe) */
  private fields(m: Marble, dt: number) {
    const t = this.t;
    for (const it of this.items) {
      const so = this.track.sockets[it.socket];
      if (Math.abs(m.y - so.y) > 120 || Math.abs(m.x - so.x) > 240) continue;
      const r = this.track.rows[so.row];
      const dir = r.dir;
      const own = m.owner === it.owner;
      const k = this.str(it);
      const onRail = () => Math.abs(m.y - (railY(r, m.x) - R - 4)) < 16;
      const before = (span: number) => (dir > 0 ? m.x > so.x - span && m.x < so.x + 6 : m.x < so.x + span && m.x > so.x - 6);
      const inZone = (len: number) => (dir > 0 ? m.x > so.x - len && m.x < so.x : m.x < so.x + len && m.x > so.x);
      switch (it.kind) {
        case 'turbo':
          if (own && !it.hit.has(m.i) && before(14) && onRail()) {
            it.hit.add(m.i); it.kickAt = t;
            m.vx = dir * Math.max(Math.abs(m.vx) + 260 * k, 520 * k);
            m.boostUntil = t + 1;
            this.fx.push(['help', it.id, m.i]);
          }
          break;
        case 'feder':
          if (own && !it.hit.has(m.i) && before(12) && onRail()) {
            it.hit.add(m.i); it.kickAt = t;
            m.vx = dir * 330 * k; m.vy = -560 * Math.sqrt(k);
            this.fx.push(['help', it.id, m.i]);
          }
          break;
        case 'magnet':
          if (own && inZone(170) && Math.abs(m.y - railY(r, m.x)) < 50) { m.vx += dir * 700 * k * dt; m.boostUntil = t + 0.2; }
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
              const f = Math.exp(-2.4 * k * dt);
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
            if (!this.wasShielded(it, m)) m.vx -= dir * 650 * k * dt;
          }
          break;
        }
        case 'schranke': {
          const ahead = dir > 0 ? m.x > so.x - 70 && m.x < so.x - 10 : m.x < so.x + 70 && m.x > so.x + 10;
          if (!own && ahead && onRail() && t >= it.readyAt && !this.spent(it)) {
            it.closedUntil = t + 2.5 * k; it.readyAt = t + 6.5; it.used++; it.trig++; it.kickAt = t;
            this.fx.push(['trap', it.id, m.i]);
          }
          break;
        }
        case 'falltuer':
          if (!own && !it.hit.has(m.i) && Math.abs(m.x - so.x) < 8 && onRail() && !this.spent(it) && this.trap(m, it)) {
            m.basketUntil = t + 2.5 * k; m.basketX = so.x; m.basketRow = so.row;
            m.x = so.x; m.y = so.y + 30; m.vx = 0; m.vy = 0;
          }
          break;
        case 'wurmloch':
          if (it.on && it.tube && !it.hit.has(m.i) && Math.abs(m.x - so.x) < 8 && onRail()) {
            it.hit.add(m.i);
            m.tube = it.id; m.ts = 0;
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
      if (it.kind === 'gegenfeder' && m.owner !== it.owner && !it.hit.has(m.i) && !this.spent(it)) {
        const probe = { x: m.x, y: m.y, vx: m.vx, vy: m.vy, w: m.w, contact: false };
        if (this.hit(probe, so.x, so.y - 10, 10, 0) && this.trap(m, it)) {
          m.x = probe.x; m.y = probe.y;
          m.vx = -r.dir * Math.max(260, Math.abs(m.vx) * 1.1) * this.str(it);
          m.vy = -160;
        }
      } else if (it.kind === 'schranke' && t < it.closedUntil) {
        const [qx, qy] = closest(so.x, so.y - 34, so.x, so.y - 2, m.x, m.y);
        this.hit(m, qx, qy, 4, 0.1);
      }
    }
  }

  private stepTube(m: Marble, dt: number) {
    const it = this.items.find((x) => x.id === m.tube)!;
    m.ts += 650 * dt;
    const pts = it.tube!;
    const len = it.tubeLen || 1;
    if (m.ts >= len) {
      const end = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      m.tube = -1;
      m.x = end[0]; m.y = end[1];
      m.vx = Math.sign(end[0] - prev[0] || 1) * 120; m.vy = 80;
      return;
    }
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
      const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      if (acc + l >= m.ts) {
        const f = (m.ts - acc) / (l || 1);
        m.x = pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f;
        m.y = pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f;
        break;
      }
      acc += l;
    }
    m.a += 20 * dt;
  }

  private runEvent(ev: RaceEvent) {
    ev.done = true;
    this.fx.push(['event', ev.kind, ev.owner]);
    if (ev.kind === 'beben') {
      this.quakeUntil = this.t + 2;
    } else if (ev.kind === 'oel') {
      const count = this.track.rows.map((r) => this.marbles.filter((m) => m.on && !m.place && this.rowOf(m.y) === r.i).length);
      const best = count.indexOf(Math.max(...count));
      this.oil = { row: Math.max(0, best), until: this.t + 8 };
      ev.data = [this.oil.row];
    } else if (ev.kind === 'riese') {
      this.giant = { x: 160, y: -40, vx: 60, vy: 0, a: 0, done: false };
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

  /** Riesenmurmel: schwere Kugel, rollt nur über Schienen und Wände, schiebt alles vor sich her */
  private stepGiant(dt: number, live: Marble[]) {
    const g = this.giant!;
    if (g.done) return;
    const GR = 26;
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
      if (g.still > 0.6) { g.vx += (g.x > W / 2 ? 1 : -1) * 260; g.vy -= 120; g.still = 0; }
    } else g.still = 0;
    if (gm.contact) g.vx *= Math.exp(-0.05 * dt);
    g.a += (gm.contact ? gm.w : g.vx / GR) * dt;
    for (const m of live) {
      if (m.tube >= 0 || m.basketUntil) continue;
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
    if (g.y > this.track.finish.y - 40 || g.y > this.track.H) g.done = true;
  }

  giantPos(): [number, number, number] | null {
    const g = this.giant;
    if (!g || g.done) return null;
    return [Math.round(g.x), Math.round(g.y), Math.round(g.a * 100) % 628];
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

export interface CheckResult { rho: number; overtakes: number; time: number; ok: boolean }

export function checkTrack(track: Track, runs = 5, marbles = 30, rnd: () => number = Math.random): CheckResult {
  let rho = 0, ov = 0, time = 0;
  for (let k = 0; k < runs; k++) {
    const owners = Array.from({ length: marbles }, (_, i) => i % 6);
    const race = new Race(track, owners, [], [], rnd);
    while (!race.done && race.t < 120) race.step();
    rho += spearman(owners.map((_, i) => i), race.finished);
    ov += race.overtakes;
    time += race.t;
  }
  rho /= runs;
  ov /= runs;
  time /= runs;
  return { rho, overtakes: ov, time, ok: rho < 0.3 && ov >= 40 };
}

export function generateGoodTrack(tries = 4, runs = 5, rnd: () => number = Math.random): { track: Track; check: CheckResult } {
  let best: { track: Track; check: CheckResult } | null = null;
  for (let k = 0; k < tries; k++) {
    const track = generateTrack(rnd);
    const check = checkTrack(track, runs, 30, rnd);
    if (!best || check.rho < best.check.rho) best = { track, check };
    if (check.ok) return { track, check };
  }
  return best!;
}
