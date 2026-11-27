/**
 * Sternenpakt – Spielregeln ohne Netzwerk (auch für Tests).
 * Längen in „Feldern“, Zeiten in Spielsekunden (1 Jahr = 60 s).
 * Der Server ruft tick() auf und schickt die Ansichten.
 */

export const YEAR = 60;
/** Sekunden pro Feld */
export const FLIGHT = 6;
export const START_MONEY = 100;
export const BASE_RANGE = 3;
export const PIRATE_RANGE = 3;
/** Geld je Wirtschaftsstufe und Jahr (ohne Handel) */
export const ECO_MONEY = 15;
/** Schiffe je Industriestufe und Jahr (ohne Produktion) */
export const IND_SHIPS = 3;
export const HEART_SHIPS = 30;
export const HEART_POINTS = 150;
export const STAR_POINTS = 100;
export const TECHS = ['weapons', 'range', 'prod', 'trade', 'cloak'] as const;
export type Tech = (typeof TECHS)[number];
export const KINDS = ['eco', 'ind', 'sci'] as const;
export type Kind = (typeof KINDS)[number];
const BASE_COST: Record<Kind, number> = { eco: 20, ind: 30, sci: 60 };
/** Besondere Sterne: Goldstern, Werft, Forschungsnebel, Festung; dazu das Herz der Galaxie */
export const SPECIALS = ['gold', 'yard', 'lab', 'fort'] as const;
export type Special = (typeof SPECIALS)[number] | 'heart' | '';

export interface Star {
  name: string;
  x: number;
  y: number;
  /** Reich (Index) oder -1 = frei */
  owner: number;
  ships: number;
  /** angefangene Schiffe (0–1) */
  acc: number;
  eco: number;
  ind: number;
  sci: number;
  /** Heimatstern von Reich … oder -1 */
  home: number;
  sp: Special;
  /** Zielstern für neu gebaute Schiffe oder -1 */
  rally: number;
}

export interface Fleet {
  id: number;
  owner: number;
  ships: number;
  /** Start-Stern dieses Teilflugs oder -1 (Piratenflotte aus dem All) */
  from: number;
  to: number;
  /** weitere Stationen nach „to“ (Weg über eigene Sterne) */
  path: number[];
  /** dieser Teilflug geht durch ein Wurmloch */
  wh: boolean;
  x0: number;
  y0: number;
  t0: number;
  t1: number;
}

/** Piratenflotte, die im All wartet */
export interface Parked {
  id: number;
  owner: number;
  ships: number;
  x: number;
  y: number;
}

export type MissionKind = 'hold' | 'conquer' | 'special' | 'heart' | 'give' | 'home' | 'ships';
export interface Mission {
  k: MissionKind;
  /** Stern (hold) */
  star?: number;
  /** Reich (conquer) */
  target?: number;
  pts: number;
  done: boolean;
  failed: boolean;
}

export interface Empire {
  /** Spieler-ID oder "ki1" … */
  id: string;
  name: string;
  color: string;
  /** vom Computer gesteuert (Computer-Reich oder Testspieler) */
  auto: boolean;
  /** echter Mitspieler (zählt in der UP!-Rangliste) */
  human: boolean;
  money: number;
  tech: Record<Tech, number>;
  research: Tech;
  /** Forschungspunkte auf dem Weg zur nächsten Stufe */
  rp: number;
  homeX: number;
  homeY: number;
  pirate: boolean;
  /** Spielzeit, zu der die nächste Piratenflotte erscheint */
  pirateAt: number | null;
  /** endgültig raus (nur Computer-Reiche) */
  out: boolean;
  /** so viele Schiffe bleiben beim Herholen, Zielstern-Auftrag und „Alle“ zurück */
  guard: number;
  /** Jahreswechsel mit dem Herz der Galaxie */
  heartYears: number;
  /** insgesamt verschenktes Geld */
  given: number;
  /** angebotene Geheimaufträge (3) und gewählte (2) */
  offer: Mission[];
  missions: Mission[];
}

export interface Nebula { x: number; y: number; r: number }

export type GameEvent =
  | { k: 'conquer'; star: number; by: number; prev: number }
  | { k: 'hold'; star: number; owner: number; by: number }
  | { k: 'reinforce'; star: number; owner: number }
  | { k: 'pirate'; e: number }
  | { k: 'spawn'; e: number; ships: number }
  | { k: 'out'; e: number }
  | { k: 'tech'; e: number; tech: Tech; level: number }
  | { k: 'year'; year: number }
  | { k: 'heart'; e: number }
  | { k: 'rallyLost'; e: number; star: number }
  | { k: 'mission'; e: number; m: MissionKind }
  | { k: 'win'; e: number }
  | { k: 'end' };

export interface GameState {
  stars: Star[];
  fleets: Fleet[];
  parked: Parked[];
  empires: Empire[];
  /** Nebelfelder (Kreise, durch die man nicht fliegen kann) */
  neb: Nebula[];
  /** Wurmloch-Paare (Sterne) */
  wh: [number, number][];
  /** Index des Herz-Sterns */
  heart: number;
  /** Spielzeit in Sekunden */
  sim: number;
  /** aktuelles Jahr (1 …) */
  year: number;
  years: number;
  nextId: number;
  /** Besitzer jedes Sterns zu Beginn jedes Jahres (für den Zeitraffer) */
  history: number[][];
  over: boolean;
  /** Sofortsieger (mehr als die Hälfte der Sterne) */
  winner: number | null;
  /** Sterne für den Sofortsieg (0 = kein Sofortsieg; fehlt = mehr als die Hälfte) */
  winAt?: number;
}

/* ---------------- Zufall ---------------- */

export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = <T,>(arr: readonly T[], rng: Rng) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const STAR_NAMES = [
  'Sirius', 'Wega', 'Rigel', 'Kastor', 'Pollux', 'Arktur', 'Atlas', 'Helix', 'Orion', 'Kepler', 'Lyra', 'Mira',
  'Deneb', 'Altair', 'Spica', 'Antares', 'Capella', 'Prokyon', 'Achernar', 'Hadar', 'Acrux', 'Shaula', 'Bellatrix',
  'Elnath', 'Alnilam', 'Mintaka', 'Saiph', 'Regulus', 'Algol', 'Mizar', 'Alkor', 'Dubhe', 'Merak', 'Alioth', 'Polaris',
  'Thuban', 'Kochab', 'Ankaa', 'Diphda', 'Hamal', 'Menkar', 'Mirfak', 'Markab', 'Scheat', 'Enif', 'Sadr', 'Albireo',
  'Nunki', 'Sabik', 'Izar', 'Zosma', 'Porrima', 'Gienah', 'Alphard', 'Suhail', 'Avior', 'Kanopus', 'Adhara', 'Wezen',
  'Aludra', 'Mirzam', 'Naos', 'Atria', 'Zaurak', 'Cursa', 'Arneb', 'Nihal', 'Phakt', 'Wasat', 'Alhena', 'Tejat', 'Nova',
  'Zenit', 'Vesta', 'Juno', 'Ceres', 'Pallas', 'Hyperion', 'Tethys', 'Rhea', 'Dione', 'Titan', 'Oberon', 'Ariel',
  'Triton', 'Nereid', 'Proteus', 'Galatea', 'Io', 'Europa', 'Kallisto', 'Ganymed', 'Lumen', 'Quasar', 'Pulsar', 'Fornax',
  'Draco', 'Cygnus', 'Pyxis', 'Vela', 'Carina', 'Tukan', 'Lynx', 'Hydra', 'Corvus', 'Aquila', 'Lacerta', 'Volans',
];

/* ---------------- Wege (auch auf dem Handy benutzt) ---------------- */

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Abstand eines Punkts zu einer Strecke */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return dist(px, py, ax + dx * t, ay + dy * t);
}

/** Führt die gerade Strecke durch ein Nebelfeld? */
export function blocked(neb: readonly Nebula[], ax: number, ay: number, bx: number, by: number) {
  for (const n of neb) if (segDist(n.x, n.y, ax, ay, bx, by) < n.r) return true;
  return false;
}

/** Vorberechnete Verbindungen: Abstand (Infinity = Nebel dazwischen) und Wurmloch-Partner */
export interface Links { n: number; d: Float64Array; wh: Int32Array }

export function buildLinks(pos: readonly (readonly [number, number] | readonly number[])[], neb: readonly Nebula[], wh: readonly (readonly [number, number] | readonly number[])[]): Links {
  const n = pos.length;
  const d = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = blocked(neb, pos[i][0], pos[i][1], pos[j][0], pos[j][1]) ? Infinity : dist(pos[i][0], pos[i][1], pos[j][0], pos[j][1]);
      d[i * n + j] = v;
      d[j * n + i] = v;
    }
  }
  const w = new Int32Array(n).fill(-1);
  for (const [a, b] of wh) { w[a] = b; w[b] = a; }
  return { n, d, wh: w };
}

/** Flugdauer eines Teilflugs a → b oder null, wenn er nicht geht */
export function hopTime(L: Links, a: number, b: number, range: number): number | null {
  if (a === b) return null;
  if (L.wh[a] === b) return FLIGHT;
  const d = L.d[a * L.n + b];
  return d <= range + sameMoment ? d * FLIGHT : null;
}

/**
 * Schnellster Weg von „from“ nach „to“, Zwischenhalte nur auf eigenen Sterne.
 * Liefert die Stationen nach „from“ (letzte = Ziel) oder null.
 */
export function findRoute(L: Links, owners: readonly number[], me: number, from: number, to: number, range: number): number[] | null {
  if (from === to || from < 0 || to < 0 || from >= L.n || to >= L.n) return null;
  if (hopTime(L, from, to, range) != null) return [to];
  const n = L.n;
  const best = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  best[from] = 0;
  for (;;) {
    let u = -1, bu = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && best[i] < bu) { bu = best[i]; u = i; }
    if (u < 0) return null;
    if (u === to) break;
    done[u] = 1;
    if (u !== from && owners[u] !== me) continue;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const t = hopTime(L, u, v, range);
      if (t == null) continue;
      // kleiner Aufschlag je Zwischenhalt, damit direkte Flüge bevorzugt werden
      const c = bu + t + 0.01;
      if (c < best[v]) { best[v] = c; prev[v] = u; }
    }
  }
  const path: number[] = [];
  for (let v = to; v !== from; v = prev[v]) path.unshift(v);
  return path;
}

/* ---------------- Karte ---------------- */

export interface MapStar { x: number; y: number; ships: number; home: number; sp: Special }
export interface GalaxyMap { stars: MapStar[]; neb: Nebula[]; wh: [number, number][]; heart: number }

/** Abstand der Heimatsterne */
const HOME_GAP = 5.6;
/** Nachbarreich, wenn die Heimatsterne höchstens so weit auseinander liegen */
const NEIGHBOR = HOME_GAP * 1.5;

/**
 * Heimatsterne zufällig verteilen und so lange verschieben, bis jedes Reich 3–4 Nachbarreiche
 * in ähnlichem Abstand hat (bei wenigen Reichen: alle anderen; wo 3 geometrisch kaum geht, mindestens 2).
 */
function placeHomes(n: number, rng: Rng, need: number): [number, number][] | null {
  const max = Math.min(4, n - 1);
  const R = HOME_GAP * Math.sqrt(n) * 0.6;
  const p: [number, number][] = [];
  for (let g = 0; p.length < n && g < 5000; g++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (p.every(([px, py]) => dist(px, py, x, y) >= HOME_GAP)) p.push([x, y]);
  }
  if (p.length < n) return null;
  if (n === 1) return p;
  const energy = () => {
    let e = 0;
    const avg: number[] = [];
    for (let i = 0; i < n; i++) {
      let c = 0, sum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = dist(p[i][0], p[i][1], p[j][0], p[j][1]);
        if (d <= NEIGHBOR) { c++; sum += d; }
      }
      e += Math.max(0, need - c) ** 2 * 4 + Math.max(0, c - max) ** 2 * 4;
      avg.push(c ? sum / c : HOME_GAP);
    }
    return e + Math.max(0, Math.max(...avg) / Math.min(...avg) - 1.18) * 20;
  };
  let e0 = energy();
  const steps = 5000;
  for (let it = 0; it < steps && e0 > 0; it++) {
    const i = Math.floor(rng() * n);
    const old = p[i];
    const q: [number, number] = [old[0] + (rng() - 0.5) * HOME_GAP * 0.9, old[1] + (rng() - 0.5) * HOME_GAP * 0.9];
    if (!p.every(([px, py], j) => j === i || dist(px, py, q[0], q[1]) >= HOME_GAP)) continue;
    p[i] = q;
    const e1 = energy();
    const temp = 0.5 * (1 - it / steps) + 0.01;
    if (e1 <= e0 || rng() < Math.exp(-(e1 - e0) / temp)) e0 = e1;
    else p[i] = old;
  }
  return e0 === 0 ? p : null;
}

/**
 * Neue Karte: jede Partie eine zufällige Galaxie. Jedes Reich hat 3–4 Nachbarreiche in ähnlichem Abstand
 * und dieselbe (gedrehte) Nachbarschaft. Dazu besondere Sterne (etwa 1 je Reich, für alle ähnlich weit),
 * das Herz in der Mitte, 1–2 Wurmloch-Paare und Nebelfelder, die Engstellen bilden.
 */
export function generateMap(n: number, rng: Rng): GalaxyMap {
  const per = n >= 9 ? 4 : 5;
  for (let attempt = 0; attempt < 400; attempt++) {
    // erst streng 3 Nachbarreiche versuchen, dann mit 2 zufrieden sein
    const homes = placeHomes(n, rng, Math.min(attempt < 4 ? 3 : 2, n - 1));
    if (!homes) continue;
    const cx = homes.reduce((a, h) => a + h[0], 0) / n, cy = homes.reduce((a, h) => a + h[1], 0) / n;
    // Vorlage der Nachbarschaft (relativ zur Richtung zur Mitte)
    const tpl: { d: number; a: number; ships: number }[] = [];
    let ok = true;
    for (let k = 0; k < per && ok; k++) {
      let placed = false;
      for (let tries = 0; tries < 80 && !placed; tries++) {
        const d = 1.6 + rng() * 1.35;
        const a = (rng() * 2 - 1) * 2.1;
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (tpl.every((t) => dist(x, y, Math.cos(t.a) * t.d, Math.sin(t.a) * t.d) >= 1.35)) {
          tpl.push({ d, a, ships: Math.floor(rng() * 4) });
          placed = true;
        }
      }
      if (!placed) ok = false;
    }
    if (!ok) continue;
    const stars: MapStar[] = [];
    homes.forEach(([hx, hy], i) => {
      const th = n > 1 ? Math.atan2(cy - hy, cx - hx) : rng() * Math.PI * 2;
      stars.push({ x: hx, y: hy, ships: 10, home: i, sp: '' });
      for (const t of tpl) stars.push({ x: hx + Math.cos(th + t.a) * t.d, y: hy + Math.sin(th + t.a) * t.d, ships: t.ships, home: -1, sp: '' });
    });
    const far = (x: number, y: number, min: number) => stars.every((s) => dist(x, y, s.x, s.y) >= min);
    let minD = Infinity;
    for (let i = 0; i < stars.length; i++) for (let j = i + 1; j < stars.length; j++) minD = Math.min(minD, dist(stars[i].x, stars[i].y, stars[j].x, stars[j].y));
    if (minD < 1.3) continue;
    // Herz der Galaxie in der Mitte
    let hx = cx, hy = cy;
    if (!far(hx, hy, 1.7)) {
      let found = false;
      for (let k = 0; k < 60 && !found; k++) {
        const a = rng() * Math.PI * 2, r = 0.4 + rng() * 2.2;
        if (far(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.7)) { hx = cx + Math.cos(a) * r; hy = cy + Math.sin(a) * r; found = true; }
      }
      if (!found) continue;
    }
    // Besondere Sterne: Kandidaten zwischen Nachbarreichen, Auswahl so fair wie möglich
    const cands: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (dist(homes[i][0], homes[i][1], homes[j][0], homes[j][1]) > NEIGHBOR) continue;
      const mx = (homes[i][0] + homes[j][0]) / 2, my = (homes[i][1] + homes[j][1]) / 2;
      const px = -(homes[j][1] - homes[i][1]), py = homes[j][0] - homes[i][0];
      const pl = Math.hypot(px, py) || 1;
      for (const off of [-2.4, -1.6, -1.1, -0.5, 0, 0.5, 1.1, 1.6, 2.4]) cands.push([mx + (px / pl) * off, my + (py / pl) * off]);
    }
    if (n === 1) for (let k = 0; k < 8; k++) { const a = rng() * Math.PI * 2; cands.push([homes[0][0] + Math.cos(a) * 4, homes[0][1] + Math.sin(a) * 4]); }
    const good = cands.filter(([x, y]) => far(x, y, 1.45) && dist(x, y, hx, hy) >= 1.8);
    const kSpec = Math.max(2, n);
    if (good.length < kSpec) continue;
    let pick: [number, number][] | null = null, pickScore = Infinity;
    for (let tries = 0; tries < 250; tries++) {
      const sel = shuffled(good, rng).slice(0, kSpec);
      let bad = false;
      for (let a = 0; a < sel.length && !bad; a++) for (let b = a + 1; b < sel.length; b++) if (dist(sel[a][0], sel[a][1], sel[b][0], sel[b][1]) < 1.6) { bad = true; break; }
      if (bad) continue;
      const near = homes.map(([x, y]) => Math.min(...sel.map(([sx, sy]) => dist(x, y, sx, sy))));
      const score = Math.max(...near) - Math.min(...near) + Math.max(...near) * 0.05;
      if (score < pickScore) { pickScore = score; pick = sel; }
    }
    if (!pick || pickScore > 1.5) continue;
    const types = shuffled(SPECIALS, rng);
    pick.forEach(([x, y], i) => stars.push({ x, y, ships: 3 + Math.floor(rng() * 2), home: -1, sp: types[i % types.length] }));
    const heart = stars.length;
    stars.push({ x: hx, y: hy, ships: HEART_SHIPS, home: -1, sp: 'heart' });
    // Grenzen der Galaxie
    const xs = stars.map((s) => s.x), ys = stars.map((s) => s.y);
    const minX = Math.min(...xs) - 0.5, maxX = Math.max(...xs) + 0.5, minY = Math.min(...ys) - 0.5, maxY = Math.max(...ys) + 0.5;
    const spot = (min: number) => {
      for (let k = 0; k < 200; k++) {
        const x = minX + rng() * (maxX - minX), y = minY + rng() * (maxY - minY);
        if (far(x, y, min)) return [x, y] as [number, number];
      }
      return null;
    };
    // Wurmlöcher: je zwei neue Sterne weit auseinander
    const wh: [number, number][] = [];
    const pairs = n >= 6 ? 2 : 1;
    const span = Math.max(maxX - minX, maxY - minY);
    for (let p = 0; p < pairs; p++) {
      let best: [[number, number], [number, number]] | null = null, bd = 0;
      for (let k = 0; k < 40; k++) {
        const a = spot(1.5), b = spot(1.5);
        if (!a || !b) continue;
        const d = dist(a[0], a[1], b[0], b[1]);
        if (d > bd && dist(a[0], a[1], hx, hy) > 2 && dist(b[0], b[1], hx, hy) > 2) { bd = d; best = [a, b]; }
      }
      if (!best || bd < Math.max(6, span * 0.45)) break;
      wh.push([stars.length, stars.length + 1]);
      stars.push({ x: best[0][0], y: best[0][1], ships: 2, home: -1, sp: '' });
      stars.push({ x: best[1][0], y: best[1][1], ships: 2, home: -1, sp: '' });
    }
    if (!wh.length) continue;
    // Nebelfelder: Gruppen aus 2–3 Kreisen in freien Flecken
    const neb: Nebula[] = [];
    const want = Math.max(2, Math.round(n * 0.7));
    const fits = (c: Nebula) => stars.every((s) => dist(c.x, c.y, s.x, s.y) >= c.r + 0.75);
    const homeIdx = stars.map((s, i) => (s.home >= 0 ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < want * 30 && neb.length < want * 2.5; k++) {
      const r0 = 0.75 + rng() * 0.45;
      const c0 = spot(r0 + 0.75);
      if (!c0) continue;
      const group: Nebula[] = [{ x: c0[0], y: c0[1], r: r0 }];
      const parts = 1 + Math.floor(rng() * 2);
      for (let q = 0; q < parts; q++) {
        const a = rng() * Math.PI * 2, r = 0.6 + rng() * 0.4;
        const c = { x: c0[0] + Math.cos(a) * (r0 * 0.9), y: c0[1] + Math.sin(a) * (r0 * 0.9), r };
        if (fits(c)) group.push(c);
      }
      // Nachbarschaft jedes Reichs bleibt frei erreichbar
      const all = [...neb, ...group];
      let fine = true;
      for (const h of homeIdx) {
        for (let j = h + 1; j <= h + per && fine; j++) if (blocked(all, stars[h].x, stars[h].y, stars[j].x, stars[j].y)) fine = false;
      }
      if (!fine) continue;
      // alle Sterne mit Grundreichweite verbunden?
      const L = buildLinks(stars.map((s) => [s.x, s.y]), all, wh);
      const seen = new Uint8Array(stars.length);
      const stack = [0];
      seen[0] = 1;
      while (stack.length) {
        const u = stack.pop()!;
        for (let v = 0; v < stars.length; v++) if (!seen[v] && hopTime(L, u, v, BASE_RANGE) != null) { seen[v] = 1; stack.push(v); }
      }
      if (!seen.every((x) => x)) continue;
      neb.push(...group);
      if (neb.length >= want * 2) break;
    }
    // ohne Nebel: Karte trotzdem verbunden?
    const L = buildLinks(stars.map((s) => [s.x, s.y]), neb, wh);
    const seen = new Uint8Array(stars.length);
    const stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const u = stack.pop()!;
      for (let v = 0; v < stars.length; v++) if (!seen[v] && hopTime(L, u, v, BASE_RANGE) != null) { seen[v] = 1; stack.push(v); }
    }
    if (!seen.every((x) => x)) continue;
    return { stars, neb, wh, heart };
  }
  throw new Error('Karte konnte nicht erzeugt werden');
}

/* ---------------- Spiel anlegen ---------------- */

export interface EmpireSeed { id: string; name: string; color: string; auto: boolean; human: boolean }

const linkCache = new WeakMap<GameState, Links>();
export function linksOf(s: GameState) {
  let L = linkCache.get(s);
  if (!L) {
    L = buildLinks(s.stars.map((st) => [st.x, st.y]), s.neb, s.wh);
    linkCache.set(s, L);
  }
  return L;
}
export const ownersOf = (s: GameState) => s.stars.map((st) => st.owner);

export function createGame(seeds: EmpireSeed[], years: number, rng: Rng): GameState {
  const map = generateMap(seeds.length, rng);
  const names = shuffled(STAR_NAMES, rng);
  const stars: Star[] = map.stars.map((m, i) => ({
    name: m.sp === 'heart' ? '' : names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''),
    x: m.x, y: m.y, owner: m.home, ships: m.ships, acc: 0,
    eco: m.home >= 0 ? 2 : 0, ind: m.home >= 0 ? 2 : 0, sci: m.home >= 0 ? 1 : 0, home: m.home, sp: m.sp, rally: -1,
  }));
  const empires: Empire[] = seeds.map((s, i) => {
    const h = stars.find((st) => st.home === i)!;
    return {
      ...s, money: START_MONEY, tech: { weapons: 1, range: 0, prod: 0, trade: 0, cloak: 0 }, research: 'weapons', rp: 0,
      homeX: h.x, homeY: h.y, pirate: false, pirateAt: null, out: false, guard: 1, heartYears: 0, given: 0, offer: [], missions: [],
    };
  });
  const s: GameState = {
    stars, fleets: [], parked: [], empires, neb: map.neb, wh: map.wh, heart: map.heart,
    sim: 0, year: 1, years, nextId: 1, history: [stars.map((st) => st.owner)], over: false, winner: null,
  };
  empires.forEach((_, e) => { s.empires[e].offer = offerMissions(s, e, rng); });
  return s;
}

/* ---------------- Werte ---------------- */

export const rangeOf = (s: GameState, e: number) => BASE_RANGE + s.empires[e].tech.range;
export const techCost = (level: number) => 4 * level;
export const starDist = (s: GameState, a: number, b: number) => dist(s.stars[a].x, s.stars[a].y, s.stars[b].x, s.stars[b].y);

export function upgradeCost(s: GameState, e: number, star: number, kind: Kind) {
  const st = s.stars[star];
  const emp = s.empires[e];
  const far = Math.max(0, dist(st.x, st.y, emp.homeX, emp.homeY) - 3);
  const yard = kind === 'ind' && st.sp === 'yard' ? 0.5 : 1;
  return Math.round(BASE_COST[kind] * (st[kind] + 1) * (1 + far * 0.1) * yard);
}

/** Geld eines Sterns pro Jahr */
export const starIncome = (s: GameState, e: number, st: Star) => st.eco * (ECO_MONEY + 3 * s.empires[e].tech.trade) * (st.sp === 'gold' ? 2 : 1) + 5;
export function incomeOf(s: GameState, e: number) {
  let sum = 0;
  for (const st of s.stars) if (st.owner === e) sum += starIncome(s, e, st);
  return sum;
}

export const researchRate = (s: GameState, e: number) => s.stars.reduce((a, st) => a + (st.owner === e ? st.sci + (st.sp === 'lab' ? 2 : 0) : 0), 0);
export const productionOf = (s: GameState, e: number, star: number) => s.stars[star].ind * (IND_SHIPS + s.empires[e].tech.prod);
export const starCount = (s: GameState, e: number) => s.stars.reduce((a, st) => a + (st.owner === e ? 1 : 0), 0);
export function shipCount(s: GameState, e: number) {
  let n = 0;
  for (const st of s.stars) if (st.owner === e) n += st.ships;
  for (const f of s.fleets) if (f.owner === e) n += f.ships;
  for (const p of s.parked) if (p.owner === e) n += p.ships;
  return n;
}
export const specialCount = (s: GameState, e: number) => s.stars.reduce((a, st) => a + (st.owner === e && st.sp && st.sp !== 'heart' ? 1 : 0), 0);
/** Punkte ohne Geheimaufträge (die zeigt auch der Fernseher) */
export const publicPoints = (s: GameState, e: number) => starCount(s, e) * STAR_POINTS + s.empires[e].heartYears * HEART_POINTS;
export const missionPoints = (s: GameState, e: number) => s.empires[e].missions.reduce((a, m) => a + (m.done ? m.pts : 0), 0);
/** Getarnt: Flotte ist für andere unsichtbar */
export const cloaked = (s: GameState, f: { owner: number; ships: number }) => f.ships <= 5 * s.empires[f.owner].tech.cloak;

/** Kampf wie im Original: abwechselnd, Verteidiger zuerst und mit +1 Waffen */
export function fight(att: number, attW: number, def: number, defW: number) {
  for (;;) {
    if (def <= 0) return { att, def: 0 };
    att -= defW;
    if (att <= 0) return { att: 0, def };
    def -= attW;
    if (def <= 0) return { att, def: 0 };
  }
}
/** Waffen des Verteidigers: eigene Stufe + 1, Festung + 2 */
export const defenseWeapons = (s: GameState, star: number) =>
  (s.stars[star].owner >= 0 ? s.empires[s.stars[star].owner].tech.weapons : 1) + 1 + (s.stars[star].sp === 'fort' ? 2 : 0);

/** Wie viele Schiffe braucht man mindestens, um diesen Stern zu erobern? */
export function shipsNeeded(def: number, defW: number, attW: number) {
  if (def <= 0) return 1;
  let lo = 1, hi = 1;
  while (fight(hi, attW, def, defW).att <= 0) hi *= 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fight(mid, attW, def, defW).att > 0) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export const sameMoment = 1e-6;

/* ---------------- Befehle ---------------- */

export type Order = { from: number; parked?: number; to: number; n: number };

/** Weg für eine Flotte dieses Reichs (über eigene Sterne und Wurmlöcher) */
export const routeFor = (s: GameState, e: number, from: number, to: number) => findRoute(linksOf(s), ownersOf(s), e, from, to, rangeOf(s, e));

function launch(s: GameState, e: number, from: number, route: number[], n: number) {
  const L = linksOf(s);
  const to = route[0];
  const t = hopTime(L, from, to, Infinity)!;
  const st = s.stars[from];
  s.fleets.push({ id: s.nextId++, owner: e, ships: n, from, to, path: route.slice(1), wh: L.wh[from] === to, x0: st.x, y0: st.y, t0: s.sim, t1: s.sim + t });
}

/** Flotte losschicken. Liefert einen Fehlertext oder null. */
export function sendFleet(s: GameState, e: number, o: Order): string | null {
  if (s.over) return 'over';
  const to = s.stars[o.to];
  if (!to) return 'target';
  if (o.parked != null) {
    const p = s.parked.find((q) => q.id === o.parked && q.owner === e);
    if (!p) return 'source';
    const n = Math.max(1, Math.min(p.ships, Math.floor(o.n)));
    if (dist(p.x, p.y, to.x, to.y) > PIRATE_RANGE + sameMoment || blocked(s.neb, p.x, p.y, to.x, to.y)) return 'range';
    p.ships -= n;
    if (p.ships <= 0) s.parked = s.parked.filter((q) => q !== p);
    s.fleets.push({ id: s.nextId++, owner: e, ships: n, from: -1, to: o.to, path: [], wh: false, x0: p.x, y0: p.y, t0: s.sim, t1: s.sim + dist(p.x, p.y, to.x, to.y) * FLIGHT });
    return null;
  }
  const from = s.stars[o.from];
  if (!from || from.owner !== e || o.from === o.to) return 'source';
  const n = Math.floor(o.n);
  if (!(n >= 1) || n > from.ships) return 'ships';
  const route = routeFor(s, e, o.from, o.to);
  if (!route) return 'range';
  from.ships -= n;
  launch(s, e, o.from, route, n);
  return null;
}

/** Schiffe von mehreren eigenen Sternen herholen (die Wache bleibt jeweils zurück). Liefert die Zahl der Schiffe. */
export function pullShips(s: GameState, e: number, to: number, froms: number[]) {
  if (s.over || s.stars[to]?.owner !== e) return 0;
  let total = 0;
  for (const f of new Set(froms)) {
    const st = s.stars[f];
    if (!st || st.owner !== e || f === to) continue;
    const n = st.ships - s.empires[e].guard;
    if (n >= 1 && !sendFleet(s, e, { from: f, to, n })) total += n;
  }
  return total;
}

/** Zielstern für neue Schiffe setzen (target -1 = aufheben) */
export function setRally(s: GameState, e: number, star: number, target: number): string | null {
  const st = s.stars[star];
  if (!st || st.owner !== e) return 'star';
  if (target < 0) { st.rally = -1; return null; }
  if (target === star || s.stars[target]?.owner !== e) return 'target';
  if (!routeFor(s, e, star, target)) return 'range';
  st.rally = target;
  return null;
}

export function setGuard(s: GameState, e: number, n: number) {
  const g = Math.floor(n);
  if (g >= 0 && g <= 9999) s.empires[e].guard = g;
}

export function upgrade(s: GameState, e: number, star: number, kind: Kind): string | null {
  const st = s.stars[star];
  if (!st || st.owner !== e || !KINDS.includes(kind)) return 'star';
  const cost = upgradeCost(s, e, star, kind);
  if (s.empires[e].money < cost) return 'money';
  s.empires[e].money -= cost;
  st[kind]++;
  return null;
}

/** Liegt ein eigener Stern an der Grenze (fremder oder freier Stern direkt erreichbar)? */
export function isFrontier(s: GameState, e: number, star: number) {
  const L = linksOf(s), r = rangeOf(s, e);
  return s.stars.some((t, j) => t.owner !== e && hopTime(L, star, j, r) != null);
}

/** Günstigster Stern für einen Ausbau; „border“ = nur Sterne an der Grenze (falls es welche gibt) */
export function bestUpgrade(s: GameState, e: number, kind: Kind, border = false): { star: number; cost: number } | null {
  let own = s.stars.map((st, i) => ({ st, i })).filter((x) => x.st.owner === e).map((x) => x.i);
  if (border) {
    const f = own.filter((i) => isFrontier(s, e, i));
    if (f.length) own = f;
  }
  let best: { star: number; cost: number } | null = null;
  for (const i of own) {
    const cost = upgradeCost(s, e, i, kind);
    if (!best || cost < best.cost || (cost === best.cost && s.stars[i].ships > s.stars[best.star].ships)) best = { star: i, cost };
  }
  return best;
}

export function setResearch(s: GameState, e: number, tech: Tech) {
  if (TECHS.includes(tech)) s.empires[e].research = tech;
}

export function giveMoney(s: GameState, from: number, to: number, amount: number): string | null {
  const a = Math.floor(amount);
  if (from === to || !s.empires[to] || !(a >= 1) || a > s.empires[from].money) return 'money';
  s.empires[from].money -= a;
  s.empires[to].money += a;
  s.empires[from].given += a;
  return null;
}

/** Eine Forschungsstufe verschenken: kostet 20 Geld je Stufe, man muss sie selbst schon haben */
export const techGiftCost = (s: GameState, to: number, tech: Tech) => 20 * (s.empires[to].tech[tech] + 1);
export function giveTech(s: GameState, from: number, to: number, tech: Tech): string | null {
  if (from === to || !s.empires[to] || !TECHS.includes(tech)) return 'tech';
  const next = s.empires[to].tech[tech] + 1;
  if (s.empires[from].tech[tech] < next) return 'level';
  const cost = techGiftCost(s, to, tech);
  if (s.empires[from].money < cost) return 'money';
  s.empires[from].money -= cost;
  s.empires[to].tech[tech] = next;
  return null;
}

/* ---------------- Geheimaufträge ---------------- */

export const MISSION_PTS: Record<MissionKind, number> = { hold: 800, conquer: 900, special: 1500, heart: 1000, give: 500, home: 600, ships: 1000 };
/** Auftragsarten, die schon während des Spiels erfüllt werden (alle anderen erst am Ende) */
export const LIVE_MISSIONS: MissionKind[] = ['conquer', 'heart', 'give'];

/** 3 verschiedene Aufträge zur Wahl */
export function offerMissions(s: GameState, e: number, rng: Rng): Mission[] {
  const emp = s.empires[e];
  const make = (k: MissionKind, extra: Partial<Mission> = {}): Mission => ({ k, pts: MISSION_PTS[k], done: false, failed: false, ...extra });
  const list: Mission[] = [];
  // Stern X am Ende halten: ein besonderer Stern, Wurmloch-Stern oder Stern bei einem Nachbarn
  const homeOf = s.stars.findIndex((st) => st.home === e);
  const holdable = s.stars.map((st, i) => ({ st, i }))
    .filter(({ st, i }) => st.sp !== 'heart' && st.home < 0 && i !== homeOf && dist(st.x, st.y, emp.homeX, emp.homeY) > 3.2 && dist(st.x, st.y, emp.homeX, emp.homeY) < HOME_GAP * 1.4);
  if (holdable.length) list.push(make('hold', { star: holdable[Math.floor(rng() * holdable.length)].i }));
  const others = s.empires.map((x, i) => ({ i, d: dist(x.homeX, x.homeY, emp.homeX, emp.homeY) })).filter((x) => x.i !== e).sort((a, b) => a.d - b.d);
  if (others.length) {
    const pickIdx = Math.floor(rng() * Math.min(3, others.length));
    list.push(make('conquer', { target: others[pickIdx].i, pts: pickIdx === 0 ? 600 : 900 }));
  }
  if (s.stars.filter((st) => st.sp && st.sp !== 'heart').length >= 4) list.push(make('special'));
  if (s.years >= 6) list.push(make('heart'));
  if (emp.human && s.empires.filter((x) => x.human).length >= 2) list.push(make('give'));
  list.push(make('home'));
  if (s.empires.length >= 2) list.push(make('ships'));
  return shuffled(list, rng).slice(0, 3);
}

/** Zwei der drei angebotenen Aufträge behalten */
export function chooseMissions(s: GameState, e: number, idx: number[]) {
  const emp = s.empires[e];
  const pick = [...new Set(idx.map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < emp.offer.length).slice(0, 2);
  if (pick.length !== Math.min(2, emp.offer.length)) return 'count';
  emp.missions = pick.map((i) => ({ ...emp.offer[i] }));
  return null;
}

/** Wer noch nicht gewählt hat, behält die ersten beiden */
export function autoMissions(s: GameState) {
  for (const emp of s.empires) if (!emp.missions.length) emp.missions = emp.offer.slice(0, 2).map((m) => ({ ...m }));
}

function liveMissionCheck(s: GameState, ev: GameEvent[]) {
  s.empires.forEach((emp, e) => {
    for (const m of emp.missions) {
      if (m.done || m.failed) continue;
      if ((m.k === 'heart' && emp.heartYears >= 3) || (m.k === 'give' && emp.given >= 200)) {
        m.done = true;
        ev.push({ k: 'mission', e, m: m.k });
      }
    }
  });
}

/** Aufträge am Spielende auswerten */
export function finishMissions(s: GameState) {
  const ships = s.empires.map((_, e) => shipCount(s, e));
  s.empires.forEach((emp, e) => {
    for (const m of emp.missions) {
      if (m.done || m.failed) continue;
      let ok = false;
      if (m.k === 'hold') ok = m.star != null && s.stars[m.star]?.owner === e;
      else if (m.k === 'special') ok = specialCount(s, e) >= 3;
      else if (m.k === 'home') ok = true;
      else if (m.k === 'ships') ok = ships.every((n, j) => j === e || n < ships[e]);
      if (ok) m.done = true;
      else m.failed = true;
    }
  });
}

/* ---------------- Zeit ---------------- */

function freeSpot(s: GameState, rng: Rng) {
  const xs = s.stars.map((st) => st.x), ys = s.stars.map((st) => st.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  let best = { x: 0, y: 0, score: -Infinity };
  for (let i = 0; i < 300; i++) {
    const x = minX + rng() * (maxX - minX), y = minY + rng() * (maxY - minY);
    if (s.neb.some((n) => dist(x, y, n.x, n.y) < n.r + 0.2)) continue;
    const ds = s.stars.map((st) => dist(x, y, st.x, st.y));
    const near = Math.min(...ds);
    const inRange = s.stars.filter((st, j) => ds[j] <= PIRATE_RANGE && !blocked(s.neb, x, y, st.x, st.y)).length;
    const score = (near >= 1.1 ? 10 : 0) + Math.min(inRange, 4) - (inRange === 0 ? 20 : 0) + rng();
    if (score > best.score) best = { x, y, score };
  }
  return best;
}

function checkEmpires(s: GameState, ev: GameEvent[]) {
  s.empires.forEach((emp, e) => {
    if (emp.out) return;
    const stars = starCount(s, e);
    if (stars > 0) {
      if (emp.pirate) { emp.pirate = false; emp.pirateAt = null; }
      return;
    }
    if (emp.pirate) return;
    const moving = s.fleets.some((f) => f.owner === e) || s.parked.some((p) => p.owner === e);
    if (moving) return;
    if (emp.human) {
      emp.pirate = true;
      emp.pirateAt = s.sim + YEAR;
      ev.push({ k: 'pirate', e });
    } else {
      emp.out = true;
      ev.push({ k: 'out', e });
    }
  });
}

function arrive(s: GameState, f: Fleet, ev: GameEvent[]) {
  const st = s.stars[f.to];
  if (st.owner === f.owner) {
    if (f.path.length) {
      // Zwischenhalt: gleich weiter zur nächsten Station
      const L = linksOf(s);
      const next = f.path.shift()!;
      f.from = f.to;
      f.wh = L.wh[f.to] === next;
      f.to = next;
      f.x0 = st.x;
      f.y0 = st.y;
      f.t0 = s.sim;
      f.t1 = s.sim + (hopTime(L, f.from, next, Infinity) ?? FLIGHT);
      s.fleets.push(f);
      return;
    }
    st.ships += f.ships;
    ev.push({ k: 'reinforce', star: f.to, owner: f.owner });
    return;
  }
  const prev = st.owner;
  const r = fight(f.ships, s.empires[f.owner].tech.weapons, st.ships, defenseWeapons(s, f.to));
  if (r.att > 0) {
    st.owner = f.owner;
    st.ships = r.att;
    st.acc = 0;
    st.rally = -1;
    ev.push({ k: 'conquer', star: f.to, by: f.owner, prev });
    if (prev >= 0) {
      // Zielstern-Aufträge auf diesen Stern verfallen
      s.stars.forEach((o, i) => {
        if (o.owner === prev && o.rally === f.to) { o.rally = -1; ev.push({ k: 'rallyLost', e: prev, star: i }); }
      });
      if (st.home === prev) for (const m of s.empires[prev].missions) if (m.k === 'home' && !m.done) m.failed = true;
      for (const m of s.empires[f.owner].missions) {
        if (m.k === 'conquer' && m.target === prev && !m.done) { m.done = true; ev.push({ k: 'mission', e: f.owner, m: 'conquer' }); }
      }
    }
  } else {
    st.ships = r.def;
    ev.push({ k: 'hold', star: f.to, owner: prev, by: f.owner });
  }
}

/** Jahreswechsel: Herz der Galaxie zählt */
function yearDone(s: GameState, ev: GameEvent[]) {
  const o = s.stars[s.heart]?.owner ?? -1;
  if (o >= 0) {
    s.empires[o].heartYears++;
    ev.push({ k: 'heart', e: o });
  }
  liveMissionCheck(s, ev);
}

function newYear(s: GameState, ev: GameEvent[], rng: Rng) {
  s.empires.forEach((emp, e) => {
    if (!emp.out) emp.money += incomeOf(s, e);
  });
  s.year++;
  s.history.push(s.stars.map((st) => st.owner));
  ev.push({ k: 'year', year: s.year });
  // Piraten bekommen jedes Jahr eine neue Flotte
  s.empires.forEach((emp, e) => {
    if (!emp.pirate || emp.pirateAt == null || s.sim + sameMoment < emp.pirateAt) return;
    const spot = freeSpot(s, rng);
    const ships = 5 + s.year;
    s.parked.push({ id: s.nextId++, owner: e, ships, x: spot.x, y: spot.y });
    emp.pirateAt = s.sim + YEAR;
    ev.push({ k: 'spawn', e, ships });
  });
}

/** Neue Schiffe an Sternen mit Zielstern losschicken */
function rallyShips(s: GameState, star: number, built: number, ev: GameEvent[]) {
  const st = s.stars[star];
  const e = st.owner;
  if (st.rally < 0 || e < 0) return;
  if (s.stars[st.rally].owner !== e) {
    st.rally = -1;
    ev.push({ k: 'rallyLost', e, star });
    return;
  }
  const n = Math.min(built, st.ships - s.empires[e].guard);
  if (n < 1) return;
  const route = routeFor(s, e, star, st.rally);
  if (!route) return;
  st.ships -= n;
  launch(s, e, star, route, n);
}

/** Spielzeit um dt Sekunden weiterdrehen. */
export function tick(s: GameState, dt: number, rng: Rng): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.over || dt <= 0) return ev;
  const end = s.sim + dt;
  while (!s.over && s.sim < end - sameMoment) {
    // nächster Zeitpunkt: Ende des Schritts, nächste Ankunft oder Jahreswechsel
    const yearEnd = s.year * YEAR;
    let next = Math.min(end, yearEnd);
    for (const f of s.fleets) if (f.t1 < next) next = Math.max(s.sim, f.t1);
    const step = next - s.sim;
    // Produktion und Forschung
    for (let i = 0; i < s.stars.length; i++) {
      const st = s.stars[i];
      if (st.owner < 0 || !st.ind) continue;
      st.acc += (productionOf(s, st.owner, i) / YEAR) * step;
      if (st.acc >= 1) {
        const whole = Math.floor(st.acc);
        st.ships += whole;
        st.acc -= whole;
        rallyShips(s, i, whole, ev);
      }
    }
    s.empires.forEach((emp, e) => {
      if (emp.out) return;
      emp.rp += (researchRate(s, e) / YEAR) * step;
      for (;;) {
        const cost = techCost(emp.tech[emp.research] + 1);
        if (emp.rp + sameMoment < cost) break;
        emp.rp = Math.max(0, emp.rp - cost);
        emp.tech[emp.research]++;
        ev.push({ k: 'tech', e, tech: emp.research, level: emp.tech[emp.research] });
      }
    });
    s.sim = next;
    // Ankünfte (in Reihenfolge)
    const arrived = s.fleets.filter((f) => f.t1 <= s.sim + sameMoment).sort((a, b) => a.t1 - b.t1);
    if (arrived.length) {
      s.fleets = s.fleets.filter((f) => !arrived.includes(f));
      for (const f of arrived) arrive(s, f, ev);
    }
    checkEmpires(s, ev);
    // Sofortsieg
    const need = s.winAt ?? Math.floor(s.stars.length / 2) + 1;
    const winner = need > 0 ? s.empires.findIndex((_, e) => starCount(s, e) >= need) : -1;
    if (winner >= 0) {
      s.winner = winner;
      s.over = true;
      s.history.push(s.stars.map((st) => st.owner));
      finishMissions(s);
      ev.push({ k: 'win', e: winner });
      break;
    }
    if (s.sim >= yearEnd - sameMoment) {
      yearDone(s, ev);
      if (s.year >= s.years) {
        s.over = true;
        s.history.push(s.stars.map((st) => st.owner));
        finishMissions(s);
        ev.push({ k: 'end' });
        break;
      }
      newYear(s, ev, rng);
    }
  }
  return ev;
}

/** Rangliste aller Reiche: Punkte (mit Aufträgen erst am Ende), dann Sterne, dann Schiffe */
export function standings(s: GameState, withMissions = s.over) {
  return s.empires
    .map((_, e) => {
      const pub = publicPoints(s, e);
      const mis = withMissions ? missionPoints(s, e) : 0;
      return { e, stars: starCount(s, e), ships: shipCount(s, e), heart: s.empires[e].heartYears, mis, pts: pub + mis };
    })
    .sort((a, b) => b.pts - a.pts || b.stars - a.stars || b.ships - a.ships || a.e - b.e);
}

/* ---------------- Computer-Reiche ---------------- */

export type Command =
  | { kind: 'send'; order: Order }
  | { kind: 'up'; star: number; k: Kind }
  | { kind: 'res'; tech: Tech };

const RESEARCH_WEIGHT: Record<Tech, number> = { weapons: 3, range: 2, prod: 2, trade: 2, cloak: 0.6 };

/** Was würde der Computer jetzt tun? (Ausbau, Forschung, Flotten) */
export function autoPlan(s: GameState, e: number, rng: Rng): Command[] {
  const emp = s.empires[e];
  if (emp.out || s.over) return [];
  const cmds: Command[] = [];
  const L = linksOf(s);
  // Forschung ab und zu wechseln
  if (rng() < 0.08) {
    const total = TECHS.reduce((a, t) => a + RESEARCH_WEIGHT[t], 0);
    let r = rng() * total;
    for (const t of TECHS) {
      r -= RESEARCH_WEIGHT[t];
      if (r <= 0) { if (t !== emp.research) cmds.push({ kind: 'res', tech: t }); break; }
    }
  }
  const own = s.stars.map((st, i) => ({ st, i })).filter((x) => x.st.owner === e);
  // Ausbau: bestes Verhältnis aus Nutzen und Preis
  let money = emp.money;
  const early = s.year <= Math.ceil(s.years / 2);
  const weight: Record<Kind, number> = { eco: early ? 1.5 : 0.6, ind: 1.2, sci: 0.45 };
  const bought = new Map<string, number>();
  for (let n = 0; n < 6; n++) {
    let best: { i: number; k: Kind; score: number; cost: number } | null = null;
    for (const { i } of own) {
      for (const k of KINDS) {
        const extra = bought.get(`${i}${k}`) ?? 0;
        const cost = Math.round(upgradeCost(s, e, i, k) * ((s.stars[i][k] + 1 + extra) / (s.stars[i][k] + 1)));
        if (cost > money) continue;
        const bonus = (k === 'eco' && s.stars[i].sp === 'gold') || (k === 'ind' && s.stars[i].sp === 'yard') ? 1.8 : 1;
        const score = ((weight[k] * bonus) / cost) * (0.85 + rng() * 0.3);
        if (!best || score > best.score) best = { i, k, score, cost };
      }
    }
    if (!best) break;
    money -= best.cost;
    bought.set(`${best.i}${best.k}`, (bought.get(`${best.i}${best.k}`) ?? 0) + 1);
    cmds.push({ kind: 'up', star: best.i, k: best.k });
  }
  // Flotten
  const range = rangeOf(s, e);
  const attW = emp.tech.weapons;
  const incoming = new Map<number, number>();
  for (const f of s.fleets) {
    if (f.owner !== e) continue;
    const fin = f.path.length ? f.path[f.path.length - 1] : f.to;
    incoming.set(fin, (incoming.get(fin) ?? 0) + f.ships);
  }
  const ownStars = (o: number) => (o >= 0 ? starCount(s, o) : 0);
  const sources = own.filter((x) => x.st.ships >= 2).sort((a, b) => b.st.ships - a.st.ships);
  const frontier = (i: number) => s.stars.some((t, j) => t.owner !== e && hopTime(L, i, j, range) != null);
  for (const { st, i } of sources) {
    let avail = st.ships;
    let best: { j: number; need: number; score: number } | null = null;
    s.stars.forEach((t, j) => {
      const time = hopTime(L, i, j, range);
      if (t.owner === e || time == null) return;
      const def = t.ships + (t.owner >= 0 ? Math.ceil((productionOf(s, t.owner, j) * time) / YEAR) : 0);
      const need = Math.max(0, shipsNeeded(def, defenseWeapons(s, j), attW) + (t.owner >= 0 ? 1 : 0) - (incoming.get(j) ?? 0));
      if (need === 0 || need > avail) return;
      const value = t.sp === 'heart' ? 9 : t.sp ? 3 : 0;
      const score = need + (time / FLIGHT) * 0.6 + (t.owner >= 0 ? 2 + ownStars(t.owner) * 0.4 : 0) - value + rng() * 1.5;
      if (!best || score < best.score) best = { j, need, score };
    });
    if (best) {
      const b = best as { j: number; need: number };
      const n = Math.min(avail, b.need + Math.floor((avail - b.need) * 0.35));
      cmds.push({ kind: 'send', order: { from: i, to: b.j, n } });
      incoming.set(b.j, (incoming.get(b.j) ?? 0) + n);
      avail -= n;
    } else if (avail >= 6 && !frontier(i)) {
      // Hinterland: Schiffe Richtung Grenze schieben
      const dest = own.filter((x) => x.i !== i && hopTime(L, i, x.i, range) != null && frontier(x.i))
        .sort((a, b) => starDist(s, i, a.i) - starDist(s, i, b.i))[0];
      if (dest) cmds.push({ kind: 'send', order: { from: i, to: dest.i, n: avail - 1 } });
    }
  }
  // Piratenflotten
  for (const p of s.parked.filter((q) => q.owner === e)) {
    let best: { j: number; need: number } | null = null;
    s.stars.forEach((t, j) => {
      if (t.owner === e || dist(p.x, p.y, t.x, t.y) > PIRATE_RANGE || blocked(s.neb, p.x, p.y, t.x, t.y)) return;
      const need = shipsNeeded(t.ships, defenseWeapons(s, j), attW);
      if (need <= p.ships && (!best || need < best.need)) best = { j, need };
    });
    if (best) cmds.push({ kind: 'send', order: { from: -1, parked: p.id, to: (best as { j: number }).j, n: p.ships } });
  }
  return cmds;
}

export function applyCommand(s: GameState, e: number, c: Command) {
  if (c.kind === 'send') return sendFleet(s, e, c.order);
  if (c.kind === 'up') return upgrade(s, e, c.star, c.k);
  setResearch(s, e, c.tech);
  return null;
}
