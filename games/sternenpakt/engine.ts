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
export const TECHS = ['weapons', 'range', 'prod', 'trade', 'cloak'] as const;
export type Tech = (typeof TECHS)[number];
export const KINDS = ['eco', 'ind', 'sci'] as const;
export type Kind = (typeof KINDS)[number];
const BASE_COST: Record<Kind, number> = { eco: 20, ind: 30, sci: 60 };

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
}

export interface Fleet {
  id: number;
  owner: number;
  ships: number;
  /** Start-Stern oder -1 (Piratenflotte aus dem All) */
  from: number;
  to: number;
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
}

export type GameEvent =
  | { k: 'conquer'; star: number; by: number; prev: number }
  | { k: 'hold'; star: number; owner: number; by: number }
  | { k: 'reinforce'; star: number; owner: number }
  | { k: 'pirate'; e: number }
  | { k: 'spawn'; e: number; ships: number }
  | { k: 'out'; e: number }
  | { k: 'tech'; e: number; tech: Tech; level: number }
  | { k: 'year'; year: number }
  | { k: 'win'; e: number }
  | { k: 'end' };

export interface GameState {
  stars: Star[];
  fleets: Fleet[];
  parked: Parked[];
  empires: Empire[];
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
const shuffled = <T,>(arr: T[], rng: Rng) => {
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

/* ---------------- Karte ---------------- */

export interface MapStar { x: number; y: number; ships: number; home: number }

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/**
 * Neue Karte: Heimatsterne auf einem Kreis, jeder mit derselben (zufälligen) Nachbarschaft,
 * dazu ein freier Stern zwischen je zwei Reichen. So sind alle Startplätze gleich fair.
 */
export function generateMap(n: number, rng: Rng): MapStar[] {
  const per = n >= 9 ? 4 : 5;
  const R = Math.max(4.8, (n * 6.6) / (2 * Math.PI));
  const theta = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2;
  for (let attempt = 0; attempt < 2000; attempt++) {
    // Vorlage relativ zur Richtung zur Mitte
    const tpl: { d: number; a: number; ships: number }[] = [];
    let ok = true;
    for (let k = 0; k < per && ok; k++) {
      let placed = false;
      for (let tries = 0; tries < 80 && !placed; tries++) {
        const d = 1.6 + rng() * 1.35;
        const a = (rng() * 2 - 1) * 1.95;
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
    for (let i = 0; i < n; i++) {
      const th = theta(i);
      const hx = Math.cos(th) * R, hy = Math.sin(th) * R;
      stars.push({ x: hx, y: hy, ships: 10, home: i });
      for (const t of tpl) {
        const a = th + Math.PI + t.a;
        stars.push({ x: hx + Math.cos(a) * t.d, y: hy + Math.sin(a) * t.d, ships: t.ships, home: -1 });
      }
    }
    // Abstände zwischen den Nachbarschaften prüfen
    let minD = Infinity;
    for (let i = 0; i < stars.length; i++) for (let j = i + 1; j < stars.length; j++) minD = Math.min(minD, dist(stars[i].x, stars[i].y, stars[j].x, stars[j].y));
    if (minD < 1.3) continue;
    // Freie Sterne in der Mitte: zwischen Reich i und i+1, möglichst weit außen, aber mit Abstand
    const phi = theta(0) + Math.PI / n;
    let best: { r: number; near: number } | null = null;
    for (let r = R * 0.95; r >= 0.6; r -= 0.05) {
      const x = Math.cos(phi) * r, y = Math.sin(phi) * r;
      const near = Math.min(...stars.map((s) => dist(x, y, s.x, s.y)));
      // Abstand zu den anderen Mittelsternen (Kreis mit n Punkten)
      const ring = n > 1 ? 2 * r * Math.sin(Math.PI / n) : Infinity;
      if (near < 1.45 || ring < 1.45) continue;
      if (near <= 2.9) { best = { r, near }; break; }
      if (!best || near < best.near) best = { r, near };
    }
    if (!best) continue;
    for (let i = 0; i < n; i++) {
      const a = theta(i) + Math.PI / n;
      stars.push({ x: Math.cos(a) * best.r, y: Math.sin(a) * best.r, ships: 2 + ((i * 7 + attempt) % 2), home: -1 });
    }
    return stars;
  }
  throw new Error('Karte konnte nicht erzeugt werden');
}

/* ---------------- Spiel anlegen ---------------- */

export interface EmpireSeed { id: string; name: string; color: string; auto: boolean; human: boolean }

export function createGame(seeds: EmpireSeed[], years: number, rng: Rng): GameState {
  const map = generateMap(seeds.length, rng);
  const names = shuffled(STAR_NAMES, rng);
  const stars: Star[] = map.map((m, i) => ({
    name: names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''),
    x: m.x, y: m.y, owner: m.home, ships: m.ships, acc: 0,
    eco: m.home >= 0 ? 2 : 0, ind: m.home >= 0 ? 2 : 0, sci: m.home >= 0 ? 1 : 0, home: m.home,
  }));
  const empires: Empire[] = seeds.map((s, i) => {
    const h = stars.find((st) => st.home === i)!;
    return {
      ...s, money: START_MONEY, tech: { weapons: 1, range: 0, prod: 0, trade: 0, cloak: 0 }, research: 'weapons', rp: 0,
      homeX: h.x, homeY: h.y, pirate: false, pirateAt: null, out: false,
    };
  });
  return { stars, fleets: [], parked: [], empires, sim: 0, year: 1, years, nextId: 1, history: [stars.map((s) => s.owner)], over: false, winner: null };
}

/* ---------------- Werte ---------------- */

export const rangeOf = (s: GameState, e: number) => BASE_RANGE + s.empires[e].tech.range;
export const techCost = (level: number) => 8 * level;
export const starDist = (s: GameState, a: number, b: number) => dist(s.stars[a].x, s.stars[a].y, s.stars[b].x, s.stars[b].y);

export function upgradeCost(s: GameState, e: number, star: number, kind: Kind) {
  const st = s.stars[star];
  const emp = s.empires[e];
  const far = Math.max(0, dist(st.x, st.y, emp.homeX, emp.homeY) - 3);
  return Math.round(BASE_COST[kind] * (st[kind] + 1) * (1 + far * 0.1));
}

export function incomeOf(s: GameState, e: number) {
  const emp = s.empires[e];
  let sum = 0;
  for (const st of s.stars) if (st.owner === e) sum += st.eco * (10 + 3 * emp.tech.trade) + 5;
  return sum;
}

export const researchRate = (s: GameState, e: number) => s.stars.reduce((a, st) => a + (st.owner === e ? st.sci : 0), 0);
export const productionOf = (s: GameState, e: number, star: number) => s.stars[star].ind * (2 + s.empires[e].tech.prod);
export const starCount = (s: GameState, e: number) => s.stars.reduce((a, st) => a + (st.owner === e ? 1 : 0), 0);
export function shipCount(s: GameState, e: number) {
  let n = 0;
  for (const st of s.stars) if (st.owner === e) n += st.ships;
  for (const f of s.fleets) if (f.owner === e) n += f.ships;
  for (const p of s.parked) if (p.owner === e) n += p.ships;
  return n;
}
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
export const defenseWeapons = (s: GameState, star: number) => (s.stars[star].owner >= 0 ? s.empires[s.stars[star].owner].tech.weapons : 1) + 1;

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

/** Flotte losschicken. Liefert einen Fehlertext oder null. */
export function sendFleet(s: GameState, e: number, o: Order): string | null {
  if (s.over) return 'over';
  const to = s.stars[o.to];
  if (!to) return 'target';
  let x0: number, y0: number, range: number;
  if (o.parked != null) {
    const p = s.parked.find((q) => q.id === o.parked && q.owner === e);
    if (!p) return 'source';
    const n = Math.max(1, Math.min(p.ships, Math.floor(o.n)));
    if (dist(p.x, p.y, to.x, to.y) > PIRATE_RANGE + sameMoment) return 'range';
    x0 = p.x; y0 = p.y; range = PIRATE_RANGE;
    p.ships -= n;
    if (p.ships <= 0) s.parked = s.parked.filter((q) => q !== p);
    s.fleets.push({ id: s.nextId++, owner: e, ships: n, from: -1, to: o.to, x0, y0, t0: s.sim, t1: s.sim + dist(x0, y0, to.x, to.y) * FLIGHT });
    return null;
  }
  const from = s.stars[o.from];
  if (!from || from.owner !== e || o.from === o.to) return 'source';
  const n = Math.floor(o.n);
  if (!(n >= 1) || n > from.ships) return 'ships';
  range = rangeOf(s, e);
  if (starDist(s, o.from, o.to) > range + sameMoment) return 'range';
  from.ships -= n;
  s.fleets.push({ id: s.nextId++, owner: e, ships: n, from: o.from, to: o.to, x0: from.x, y0: from.y, t0: s.sim, t1: s.sim + starDist(s, o.from, o.to) * FLIGHT });
  return null;
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

export function setResearch(s: GameState, e: number, tech: Tech) {
  if (TECHS.includes(tech)) s.empires[e].research = tech;
}

export function giveMoney(s: GameState, from: number, to: number, amount: number): string | null {
  const a = Math.floor(amount);
  if (from === to || !s.empires[to] || !(a >= 1) || a > s.empires[from].money) return 'money';
  s.empires[from].money -= a;
  s.empires[to].money += a;
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

/* ---------------- Zeit ---------------- */

function freeSpot(s: GameState, rng: Rng) {
  const xs = s.stars.map((st) => st.x), ys = s.stars.map((st) => st.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  let best = { x: 0, y: 0, score: -Infinity };
  for (let i = 0; i < 300; i++) {
    const x = minX + rng() * (maxX - minX), y = minY + rng() * (maxY - minY);
    const ds = s.stars.map((st) => dist(x, y, st.x, st.y));
    const near = Math.min(...ds);
    const inRange = ds.filter((d) => d <= PIRATE_RANGE).length;
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
    ev.push({ k: 'conquer', star: f.to, by: f.owner, prev });
  } else {
    st.ships = r.def;
    ev.push({ k: 'hold', star: f.to, owner: prev, by: f.owner });
  }
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
    const half = s.stars.length / 2;
    const winner = s.empires.findIndex((_, e) => starCount(s, e) > half);
    if (winner >= 0) {
      s.winner = winner;
      s.over = true;
      s.history.push(s.stars.map((st) => st.owner));
      ev.push({ k: 'win', e: winner });
      break;
    }
    if (s.sim >= yearEnd - sameMoment) {
      if (s.year >= s.years) {
        s.over = true;
        s.history.push(s.stars.map((st) => st.owner));
        ev.push({ k: 'end' });
        break;
      }
      newYear(s, ev, rng);
    }
  }
  return ev;
}

/** Rangliste aller Reiche: Sterne, dann Schiffe */
export function standings(s: GameState) {
  return s.empires
    .map((_, e) => ({ e, stars: starCount(s, e), ships: shipCount(s, e) }))
    .sort((a, b) => b.stars - a.stars || b.ships - a.ships || a.e - b.e);
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
        const score = (weight[k] / cost) * (0.85 + rng() * 0.3);
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
  for (const f of s.fleets) if (f.owner === e) incoming.set(f.to, (incoming.get(f.to) ?? 0) + f.ships);
  const ownStars = (o: number) => (o >= 0 ? starCount(s, o) : 0);
  const sources = own.filter((x) => x.st.ships >= 2).sort((a, b) => b.st.ships - a.st.ships);
  const frontier = (i: number) => s.stars.some((t, j) => t.owner !== e && starDist(s, i, j) <= range);
  for (const { st, i } of sources) {
    let avail = st.ships;
    let best: { j: number; need: number; score: number } | null = null;
    s.stars.forEach((t, j) => {
      if (t.owner === e || starDist(s, i, j) > range) return;
      const def = t.ships + (t.owner >= 0 ? Math.ceil(productionOf(s, t.owner, j) * (starDist(s, i, j) * FLIGHT) / YEAR) : 0);
      const need = Math.max(0, shipsNeeded(def, defenseWeapons(s, j), attW) + (t.owner >= 0 ? 1 : 0) - (incoming.get(j) ?? 0));
      if (need === 0 || need > avail) return;
      const score = need + starDist(s, i, j) * 0.6 + (t.owner >= 0 ? 2 + ownStars(t.owner) * 0.4 : 0) + rng() * 1.5;
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
      const dest = own.filter((x) => x.i !== i && starDist(s, i, x.i) <= range && frontier(x.i))
        .sort((a, b) => starDist(s, i, a.i) - starDist(s, i, b.i))[0];
      if (dest) cmds.push({ kind: 'send', order: { from: i, to: dest.i, n: avail - 1 } });
    }
  }
  // Piratenflotten
  for (const p of s.parked.filter((q) => q.owner === e)) {
    let best: { j: number; need: number } | null = null;
    s.stars.forEach((t, j) => {
      if (t.owner === e || dist(p.x, p.y, t.x, t.y) > PIRATE_RANGE) return;
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
