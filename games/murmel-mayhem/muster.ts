/**
 * Murmel-Mayhem – Murmel-Design (Farben und Muster). Daten für Server und Handy/TV,
 * Zeichenfunktionen nur für den Browser (werden erst beim Aufruf benutzt).
 */

export const PALETTE = ['#e5484d', '#f2994a', '#f5d90a', '#9ad93b', '#46a758', '#12a594', '#3ec6e0', '#3e63dd', '#6e56cf', '#9b5de5', '#e93d82', '#a0703c', '#f2efe6', '#2e2e2e'];
export const PATTERNS = ['uni', 'halb', 'streifen', 'ringe', 'punkte', 'spirale', 'stern', 'karo'] as const;
export type Pattern = (typeof PATTERNS)[number];
export interface Design { c: number; c2: number; p: Pattern }

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Nächste freie Palettenfarbe zur Spielerfarbe der Lobby */
export function nearestFree(hex: string, taken: Set<number>): number {
  const [r, g, b] = hexRgb(hex);
  let best = -1, bd = Infinity;
  PALETTE.forEach((p, k) => {
    if (taken.has(k)) return;
    const [r2, g2, b2] = hexRgb(p);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bd) { bd = d; best = k; }
  });
  return best < 0 ? 0 : best;
}

/** Zweitfarbe mit gutem Kontrast */
export function contrast(c: number): number {
  const [r, g, b] = hexRgb(PALETTE[c]);
  return r * 0.3 + g * 0.59 + b * 0.11 > 150 ? 13 : 12;
}

export function validDesign(d: unknown): Design | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const c = Number(o.c), c2 = Number(o.c2);
  if (!Number.isInteger(c) || c < 0 || c >= PALETTE.length || !Number.isInteger(c2) || c2 < 0 || c2 >= PALETTE.length) return null;
  if (!PATTERNS.includes(o.p as Pattern)) return null;
  return { c, c2, p: o.p as Pattern };
}

/* ---------- Zeichnen (nur Browser) ---------- */

type G2 = CanvasRenderingContext2D;

function shade(hex: string, f: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

/** Muster in einen Kreis mit Radius r um (0,0) malen (ohne Glanz) */
export function paintPattern(g: G2, d: Design, r: number, square = false) {
  const c1 = PALETTE[d.c] ?? '#fff', c2 = PALETTE[d.c2] ?? '#000';
  g.save();
  g.beginPath();
  if (square) g.rect(-r, -r, 2 * r, 2 * r);
  else g.arc(0, 0, r, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = c1;
  g.fillRect(-r, -r, 2 * r, 2 * r);
  g.fillStyle = c2;
  g.strokeStyle = c2;
  switch (d.p) {
    case 'halb':
      g.fillRect(-r, 0, 2 * r, r);
      break;
    case 'streifen':
      for (let k = -2; k <= 2; k += 2) g.fillRect(-r, (k - 0.5) * r * 0.24, 2 * r, r * 0.24);
      break;
    case 'ringe':
      g.lineWidth = r * 0.2;
      g.beginPath(); g.arc(0, 0, r * 0.62, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(0, 0, r * 0.18, 0, Math.PI * 2); g.fill();
      if (square) { g.beginPath(); g.arc(0, 0, r * 1.1, 0, Math.PI * 2); g.stroke(); }
      break;
    case 'punkte': {
      const dots: [number, number][] = [[0, 0], [0.55, 0.3], [-0.55, 0.3], [0, -0.6], [0.5, -0.45], [-0.5, -0.45], [0.3, 0.75], [-0.3, 0.75]];
      for (const [x, y] of dots) { g.beginPath(); g.arc(x * r, y * r, r * 0.17, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'spirale':
      // Katzenauge: drei geschwungene Blätter
      for (let k = 0; k < 3; k++) {
        g.save();
        g.rotate((k * 2 * Math.PI) / 3);
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(r * 0.9, -r * 0.1, r * 1.05, r * 0.5);
        g.quadraticCurveTo(r * 0.4, r * 0.25, 0, 0);
        g.fill();
        g.restore();
      }
      break;
    case 'stern': {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.3 : r * 0.72;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      break;
    }
    case 'karo': {
      const s = (2 * r) / 4;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) g.fillRect(-r + i * s, -r + j * s, s, s);
      break;
    }
  }
  g.restore();
}

const spriteCache = new Map<string, HTMLCanvasElement>();
const keyOf = (d: Design) => `${d.c}.${d.c2}.${d.p}`;

/** Muster-Scheibe (ohne Glanz) als Bild, 64 px */
export function sprite(d: Design): HTMLCanvasElement {
  const k = keyOf(d);
  let c = spriteCache.get(k);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.translate(32, 32);
    paintPattern(g, d, 32);
    spriteCache.set(k, c);
  }
  return c;
}

/** Murmel mit Muster (dreht mit a) und festem Glanz zeichnen */
export function drawDesignMarble(g: G2, x: number, y: number, a: number, d: Design, r: number, alpha = 1) {
  g.globalAlpha = alpha;
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.drawImage(sprite(d), -r, -r, 2 * r, 2 * r);
  g.restore();
  const rim = g.createRadialGradient(x, y, r * 0.55, x, y, r);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,.45)');
  g.fillStyle = rim;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  const hi = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x - r * 0.35, y - r * 0.4, r * 0.7);
  hi.addColorStop(0, 'rgba(255,255,255,.75)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath(); g.arc(x - r * 0.35, y - r * 0.42, r * 0.17, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
}

const urlCache = new Map<string, string>();

/** Murmel als Bild-Adresse (für Listen und Knöpfe) */
export function marbleUrl(d: Design): string {
  const k = `m${keyOf(d)}`;
  let u = urlCache.get(k);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    drawDesignMarble(c.getContext('2d')!, 48, 48, -0.4, d, 46);
    u = c.toDataURL();
    urlCache.set(k, u);
  }
  return u;
}

/** Muster als Kachel (für Schrift in Musterfarben) */
export function tileUrl(d: Design): string {
  const k = `t${keyOf(d)}`;
  let u = urlCache.get(k);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = c.height = 40;
    const g = c.getContext('2d')!;
    g.translate(20, 20);
    paintPattern(g, d, 20, true);
    u = c.toDataURL();
    urlCache.set(k, u);
  }
  return u;
}

export function mainColor(d: Design | undefined): string {
  return d ? PALETTE[d.c] ?? '#fff' : '#fff';
}

export { shade };
