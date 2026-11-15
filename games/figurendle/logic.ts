/**
 * Figurendle – Vergleich einer getippten Figur mit der gesuchten (ohne Netzwerk, auch für Tests).
 *
 * Spaltenarten (aus dem Content-Pack):
 *   gleich – gleicher Text = grün, sonst rot
 *   liste  – gleiche Liste = grün, Überschneidung = orange, sonst rot
 *   zahl   – gleich = grün, nah dran (nah / nahProzent) = orange, sonst rot; Pfeil zeigt, ob die gesuchte Zahl höher oder niedriger ist
 *   reihe  – Reihenfolge aus „werte“ (z. B. Arcs): gleich = grün, sonst rot mit Pfeil
 */

export interface Col {
  key: string;
  label: string;
  /** kurze Bezeichnung fürs Handy */
  kurz?: string;
  typ: 'gleich' | 'liste' | 'zahl' | 'reihe';
  /** Text für leere Liste bzw. 0 */
  leer?: string;
  einheit?: string;
  /** "gross": 3 Mrd. / 366 Mio. */
  format?: string;
  nah?: number;
  nahProzent?: number;
  werte?: string[];
}

export interface Fig {
  id: string;
  thema: string;
  name: string;
  auch?: string[];
  bekanntheit?: number;
  /** Seite im Wiki des Themas (für Bilder) */
  wiki?: string;
  werte: Record<string, unknown>;
  [field: string]: unknown;
}

/** Hinweis-Feld: Text, Farbe (g = stimmt, o = teilweise, r = falsch), Pfeil (u = gesuchte ist höher, d = niedriger) */
export interface Cell {
  t: string;
  c: 'g' | 'o' | 'r';
  a?: 'u' | 'd';
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);
const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function formatNumber(n: number, col: Col, lang: string): string {
  const de = lang !== 'en';
  if (n === 0 && col.leer) return col.leer;
  let s: string;
  if (col.format === 'gross' && n >= 1e9) s = `${trim(n / 1e9, de)} ${de ? 'Mrd.' : 'bn'}`;
  else if (col.format === 'gross' && n >= 1e6) s = `${trim(n / 1e6, de)} ${de ? 'Mio.' : 'M'}`;
  else s = n.toLocaleString(de ? 'de-DE' : 'en-US');
  return col.einheit ? `${s} ${col.einheit}` : s;
}

function trim(x: number, de: boolean) {
  const r = Math.round(x * 100) / 100;
  return r.toLocaleString(de ? 'de-DE' : 'en-US', { maximumFractionDigits: 2 });
}

/** Wert einer Figur als Text (für die Auflösung) */
export function valueText(fig: Fig, col: Col, lang: string): string {
  const v = fig.werte[col.key];
  if (col.typ === 'liste') {
    const l = asList(v);
    return l.length ? l.join(', ') : col.leer ?? '–';
  }
  if (col.typ === 'zahl') {
    const n = asNum(v);
    return n == null ? '?' : formatNumber(n, col, lang);
  }
  return v == null || v === '' ? '?' : String(v);
}

export function compareCell(guess: Fig, secret: Fig, col: Col, lang: string): Cell {
  const t = valueText(guess, col, lang);
  const gv = guess.werte[col.key];
  const sv = secret.werte[col.key];
  if (col.typ === 'liste') {
    const a = new Set(asList(gv));
    const b = new Set(asList(sv));
    const same = a.size === b.size && [...a].every((x) => b.has(x));
    if (same) return { t, c: 'g' };
    return { t, c: [...a].some((x) => b.has(x)) ? 'o' : 'r' };
  }
  if (col.typ === 'zahl') {
    const a = asNum(gv);
    const b = asNum(sv);
    if (a == null || b == null) return { t, c: a === b ? 'g' : 'r' };
    if (a === b) return { t, c: 'g' };
    const near = (col.nah != null && Math.abs(a - b) <= col.nah) || (col.nahProzent != null && b > 0 && Math.abs(a - b) <= (b * col.nahProzent) / 100);
    return { t, c: near ? 'o' : 'r', a: b > a ? 'u' : 'd' };
  }
  if (col.typ === 'reihe') {
    const order = col.werte ?? [];
    const ia = order.indexOf(String(gv));
    const ib = order.indexOf(String(sv));
    if (String(gv) === String(sv)) return { t, c: 'g' };
    if (ia < 0 || ib < 0) return { t, c: 'r' };
    return { t, c: 'r', a: ib > ia ? 'u' : 'd' };
  }
  return { t, c: String(gv ?? '') === String(sv ?? '') ? 'g' : 'r' };
}

export function compare(guess: Fig, secret: Fig, cols: Col[], lang: string): Cell[] {
  return cols.map((c) => compareCell(guess, secret, c, lang));
}

/** Passt eine Figur zu allen bisherigen Hinweisen? (für Bots) */
export function consistent(fig: Fig, hints: { fig: Fig; cells: Cell[] }[], cols: Col[], lang: string): boolean {
  return hints.every((h) => {
    const cells = compare(h.fig, fig, cols, lang);
    return cells.every((c, i) => c.c === h.cells[i].c && c.a === h.cells[i].a);
  });
}

/** Punkte im Modus „Jeder für sich“: 1000 − 50 je Fehlversuch (mindestens 250) + Platzbonus */
export const PLACE_BONUS = [300, 150, 75];
export function soloPoints(misses: number, place: number): number {
  return Math.max(250, 1000 - 50 * misses) + (PLACE_BONUS[place - 1] ?? 0);
}
