import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo } from '@up/sdk';
import { Avatar, Confetti, HostTimer, PhoneTimer, PhoneWait, Podium, Scoreboard, sfx, useServerNow, useStream, vibrate } from '@up/ui';

/* ================= Stil: Glas und Messing ================= */

const BRASS = '#e9c46a';
const BRASS_L = '#f6dd9c';
const INK = '#140d08';
const TEXT = '#f4e6c8';
const MUTED = '#cdb894';
const DIM = '#b89a64';
const LINE = '#5a3a12';
const ENAMEL: Record<string, string> = { hilfe: '#3fa36b', falle: '#d3452f', weiche: '#e8b923', ereignis: '#4a7fc1' };
const SORT: Record<string, string> = {
  turbo: 'hilfe', feder: 'hilfe', magnet: 'hilfe', schild: 'hilfe',
  kleber: 'falle', schranke: 'falle', gegenfeder: 'falle', falltuer: 'falle', wind: 'falle', bremse: 'falle',
  farbweiche: 'weiche', bruecke: 'weiche', umleitung: 'weiche', wurmloch: 'weiche', kanone: 'weiche',
  beben: 'ereignis', oel: 'ereignis', riese: 'ereignis', tausch: 'ereignis',
};
const SWITCH_ONLY = ['farbweiche', 'bruecke', 'umleitung'];
const ICON: Record<string, string> = {
  turbo: 'M5 6l6 6-6 6M12 6l6 6-6 6',
  feder: 'M6 21h12M8 18l8-2-8-2 8-2-8-2 8-2M12 8V3M9 5l3-3 3 3',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4M6 8h4M14 8h4',
  schild: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z',
  kleber: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z',
  schranke: 'M4 21V7M4 9h17v4H4M9 9l-3 4M14 9l-3 4M19 9l-3 4',
  gegenfeder: 'M12 20V8M7 12l5-5 5 5M6 4h12',
  falltuer: 'M3 9h7M14 9h7M10 9l4 6M12 21v-4',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
  bremse: 'M3 17h18M3 13h18M6 9l2 2M11 9l2 2M16 9l2 2',
  farbweiche: 'M12 21v-7M12 14L6 6M12 14l6-8M6 6H3M18 6h3',
  bruecke: 'M3 16c4-8 14-8 18 0M3 16h18M8 16v-3M12 16v-4M16 16v-3',
  umleitung: 'M5 19V9a4 4 0 0 1 4-4h9M15 2l3 3-3 3',
  wurmloch: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  kanone: 'M3 17l12-7 2 4-12 7zM18 11h3M18 7l2-2M18 15l2 2',
  beben: 'M2 12h4l2-5 3 10 3-8 2 3h6',
  oel: 'M12 4c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9zM4 21h16',
  riese: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M9 8a4 4 0 0 1 3-1',
  tausch: 'M4 8h14l-3-3M20 16H6l3 3',
};
const ICON_PATHS: Record<string, Path2D> = {};
const iconPath = (k: string) => (ICON_PATHS[k] ??= new Path2D(ICON[k] ?? ICON.turbo));

const FLAG = { far: 1, back: 2, hidden: 4, done: 8, stuck: 16, boost: 32, shield: 64, air: 128 };

function useFonts() {
  useEffect(() => {
    if (document.getElementById('murmel-fonts')) return;
    const l = document.createElement('link');
    l.id = 'murmel-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }, []);
}

const FONT = "'Barlow Semi Condensed', system-ui, sans-serif";
const DISPLAY = "Cinzel, Georgia, serif";
const BG = 'radial-gradient(circle at 50% 30%, #3a2716 0, #140d08 75%)';

function darken(hex: string, f = 0.45): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return '#222';
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

function marbleCss(color: string, size: number): CSSProperties {
  return { width: size, height: size, borderRadius: '50%', flex: 'none', display: 'inline-block', background: `radial-gradient(circle at 35% 30%, #ffffff 0, ${color} 28%, ${darken(color)} 100%)` };
}

/** Messing-Plakette mit Emaille-Rand */
function Badge({ kind, size = 48, dim = false, owner }: { kind: string; size?: number; dim?: boolean; owner?: string }) {
  return (
    <span style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'inline-flex' }}>
      <span style={{ width: size, height: size, borderRadius: '50%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.45 : 1, background: 'radial-gradient(circle at 35% 30%, #fbe7b0 0, #d4a24a 45%, #6e4a14 100%)', border: `${Math.max(3, Math.round(size / 11))}px solid ${ENAMEL[SORT[kind]] ?? BRASS}`, boxShadow: `0 2px 0 ${INK}, 0 0 0 1.5px ${INK}` }}>
        <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" aria-hidden="true"><path d={ICON[kind] ?? ''} fill="none" stroke="#2a1a0c" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {owner && <span style={{ position: 'absolute', right: -3, top: -3, width: size * 0.32, height: size * 0.32, borderRadius: '50%', background: owner, border: `2px solid ${INK}` }} />}
    </span>
  );
}

/* ================= Bahn zeichnen ================= */

interface Geo {
  H: number;
  segs: { id: number; role: string; layer: number; row: number; pts: [number, number][] }[];
  mixers: { kind: string; x: number; y: number; side: number; turn: number }[];
  turns: string[];
  sockets: { id: number; x: number; y: number; kind: 'rail' | 'switch'; row: number; dust?: boolean }[];
  panels: { x: number; y: number; w: number; h: number; holes: [number, number, number][] }[];
  branches: { id: number; base: number; dust: boolean }[];
  marks: { kind: string; x: number; y: number }[];
  conveyor: { x: number; y0: number; y1: number } | null;
}
interface PubItem { id: number; kind: string; owner: string; x: number; y: number; age: number; on: boolean; toggle: boolean; exit: [number, number] | null }

const WW = 1200;

function strokePath(g: CanvasRenderingContext2D, pts: [number, number][], dy = 0) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y + dy) : g.moveTo(x, y + dy)));
  g.stroke();
}

function rails(g: CanvasRenderingContext2D, pts: [number, number][], specs: [string, number, number][]) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [c, w, dy] of specs) {
    g.strokeStyle = c;
    g.lineWidth = w;
    strokePath(g, pts, dy);
  }
}

const FRONT_LIP: [string, number, number][] = [['#3d270b', 13, 0], ['#c8963c', 9, 0], ['#fbe7b0', 2, -2.5]];
const BACK_LIP: [string, number, number][] = [['#5a3a12', 5, -11], ['#a87a30', 2, -12]];
const COPPER: [string, number, number][] = [['#2a140a', 10, 0], ['#9a5232', 7, 0], ['#d99a72', 1.5, -2]];

function brassGrad(g: CanvasRenderingContext2D, y0: number, y1: number) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, '#f3d38a');
  gr.addColorStop(0.5, '#c8963c');
  gr.addColorStop(1, '#7a5418');
  return gr;
}

function discFill(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r * 1.1);
  gr.addColorStop(0, '#fbe7b0');
  gr.addColorStop(0.45, '#d4a24a');
  gr.addColorStop(1, '#6e4a14');
  return gr;
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign, color = '#e7c27a', size = 12) {
  g.font = `700 ${size}px ${DISPLAY}`;
  g.textAlign = align;
  g.fillStyle = color;
  g.globalAlpha = 0.85;
  g.fillText(text, x, y);
  g.globalAlpha = 1;
}

/** Drei feste Ebenen: hinten, Platten + innere Rinnenkante + Mischstellen, vordere Rinnenkante */
function renderLayers(geo: Geo, t: (k: string) => string): HTMLCanvasElement[] {
  const H = geo.H;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = WW;
    c.height = H;
    return c;
  };
  const [c0, c1, c2] = [mk(), mk(), mk()];
  // Ebene 0: Hintergrund, hintere Kupferwege
  let g = c0.getContext('2d')!;
  const bg = g.createRadialGradient(WW / 2, H * 0.35, 50, WW / 2, H * 0.4, H * 0.8);
  bg.addColorStop(0, '#3a2716');
  bg.addColorStop(1, '#140d08');
  g.fillStyle = bg;
  g.fillRect(0, 0, WW, H);
  g.strokeStyle = '#e7c27a';
  g.globalAlpha = 0.05;
  for (const [cx, cy, r] of [[1100, 120, 80], [80, 600, 70], [90, H * 0.78, 100], [1000, H * 0.92, 60], [700, H * 0.45, 45], [300, H * 0.25, 55]]) {
    g.lineWidth = r * 0.22;
    g.setLineDash([r * 0.25, r * 0.2]);
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }
  g.setLineDash([]);
  g.globalAlpha = 1;
  for (const s of geo.segs) {
    if (s.layer !== 1) continue;
    const dust = s.role === 'dust';
    g.globalAlpha = dust ? 0.5 : 0.8;
    rails(g, s.pts, COPPER);
    if (dust) {
      g.globalAlpha = 0.5;
      g.strokeStyle = '#b8a99a';
      g.lineWidth = 7;
      g.setLineDash([1, 9]);
      strokePath(g, s.pts);
      g.setLineDash([]);
    }
    g.globalAlpha = 1;
  }
  const dustSeg = geo.segs.find((s) => s.role === 'dust');
  if (dustSeg) {
    g.font = `600 14px ${FONT}`;
    g.fillStyle = '#b8a99a';
    g.textAlign = 'center';
    const p = dustSeg.pts[Math.floor(dustSeg.pts.length / 2)];
    g.fillText(t('track.dust'), p[0] - 50, p[1] + 30);
  }
  // Ebene 1: Platten, Start, Förderband, innere Kante, Mischstellen
  g = c1.getContext('2d')!;
  for (const p of geo.panels) {
    g.beginPath();
    const r = 18;
    g.moveTo(p.x + r, p.y);
    g.arcTo(p.x + p.w, p.y, p.x + p.w, p.y + p.h, r);
    g.arcTo(p.x + p.w, p.y + p.h, p.x, p.y + p.h, r);
    g.arcTo(p.x, p.y + p.h, p.x, p.y, r);
    g.arcTo(p.x, p.y, p.x + p.w, p.y, r);
    g.closePath();
    for (const [hx, hy, hr] of p.holes) {
      g.moveTo(hx + hr, hy);
      g.arc(hx, hy, hr, 0, Math.PI * 2, true);
    }
    g.fillStyle = brassGrad(g, p.y, p.y + p.h);
    g.fill('evenodd');
    g.strokeStyle = '#3d270b';
    g.lineWidth = 2;
    g.stroke();
    for (const [hx, hy, hr] of p.holes) {
      g.strokeStyle = '#6e4a14';
      g.lineWidth = 6;
      g.beginPath(); g.arc(hx, hy, hr + 4, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(hx, hy, hr * 0.75, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        g.fillStyle = '#f3d38a';
        g.beginPath(); g.arc(hx + (hr + 4) * Math.cos(a), hy + (hr + 4) * Math.sin(a), 2.4, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = '#f3d38a';
    const n = Math.max(2, Math.floor(p.w / 28));
    for (let k = 0; k < n; k++) {
      const x = p.x + 14 + (k * (p.w - 28)) / (n - 1);
      for (const y of [p.y + 10, p.y + p.h - 10]) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
    }
  }
  // Starttrichter
  g.fillStyle = 'rgba(191,227,255,.12)';
  g.strokeStyle = 'rgba(217,238,252,.55)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(522, 22); g.lineTo(678, 22); g.lineTo(630, 84); g.lineTo(570, 84); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = '#c8963c'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(516, 20); g.lineTo(684, 20); g.stroke();
  label(g, t('track.start'), 695, 46, 'left');
  // Förderband
  if (geo.conveyor) {
    const { x, y0, y1 } = geo.conveyor;
    for (const dx of [-12, 12]) rails(g, [[x + dx, y1], [x + dx, y0]], [['#3d270b', 7, 0], ['#c8963c', 4, 0]]);
    g.strokeStyle = '#5a3a12'; g.lineWidth = 3; g.setLineDash([6, 5]);
    strokePath(g, [[x, y1], [x, y0]]);
    g.setLineDash([]);
    g.strokeStyle = '#e7c27a'; g.lineWidth = 2.5;
    for (let y = y0 + 40; y < y1 - 20; y += 60) { g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x + 10, y); g.lineTo(x + 10, y + 10); g.lineTo(x - 10, y + 10); g.stroke(); }
    for (const cy of [y0, y1]) {
      g.fillStyle = discFill(g, x, cy, 16); g.beginPath(); g.arc(x, cy, 16, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a5418'; g.lineWidth = 3; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, cy, 19, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
    rails(g, [[x - 14, y0 + 5], [x - 110, y0 + 24]], [['#3d270b', 12, 0], ['#c8963c', 8, 0]]);
  }
  for (const s of geo.segs) if (s.layer === 0 && (s.role === 'row' || s.role === 'curve' || s.role === 'finish')) rails(g, s.pts, BACK_LIP);
  for (const s of geo.segs) if (s.role === 'catch') rails(g, s.pts, [['#3d270b', 7, 0], ['#a87a30', 4, 0]]);
  for (const m of geo.mixers) {
    const dr = m.side;
    if (m.kind === 'trichter') {
      const cx = m.x + 4 * dr, top = m.y - 2;
      g.fillStyle = 'rgba(191,227,255,.12)';
      g.strokeStyle = 'rgba(217,238,252,.6)';
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(cx - 72, top); g.lineTo(cx + 72, top); g.lineTo(cx + 14, top + 78); g.lineTo(cx - 14, top + 78); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(217,238,252,.35)'; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(cx, top + 22, 50, 9, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(cx, top + 46, 30, 6, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#c8963c'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(cx - 78, top); g.lineTo(cx + 78, top); g.stroke();
    } else if (m.kind === 'nagel') {
      const x0 = dr > 0 ? 1000 : 58;
      let ri = 0;
      for (let y = m.y + 10; y < m.y + 112; y += 17, ri++) {
        for (let x = x0 + (ri % 2 ? 11 : 0); x < x0 + 130; x += 22) {
          g.fillStyle = discFill(g, x, y, 3.6); g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill();
        }
      }
    } else if (m.kind === 'wippe') {
      const px = m.x + 22 * dr, py = m.y + 52;
      g.fillStyle = brassGrad(g, py, py + 26);
      g.beginPath(); g.moveTo(px - 12, py + 26); g.lineTo(px, py); g.lineTo(px + 12, py + 26); g.closePath(); g.fill();
      rails(g, [[px - 60, py - 12 * dr], [px + 60, py + 12 * dr]], [['#3d270b', 11, 0], ['#c8963c', 7, 0]]);
    } else if (m.kind === 'schanze') {
      g.strokeStyle = 'rgba(231,194,122,.7)'; g.lineWidth = 2; g.setLineDash([4, 6]);
      g.beginPath(); g.moveTo(m.x + 28 * dr, m.y - 20); g.quadraticCurveTo(m.x + 82 * dr, m.y + 4, m.x + 16 * dr, m.y + 75); g.stroke();
      g.setLineDash([]);
    }
    const key: Record<string, string> = { trichter: 'track.trichter', nagel: 'track.nagel', wippe: 'track.wippe', flieh: 'track.flieh', schanze: 'track.schanze' };
    if (key[m.kind]) label(g, t(key[m.kind]), dr > 0 ? 1190 : 10, m.y + 64, dr > 0 ? 'right' : 'left');
  }
  // Ebene 2: vordere Kanten, Schanzen-Lippen, Ziel
  g = c2.getContext('2d')!;
  for (const s of geo.segs) if (s.layer === 0 && (s.role === 'row' || s.role === 'curve' || s.role === 'finish')) rails(g, s.pts, FRONT_LIP);
  for (const m of geo.mixers) {
    if (m.kind === 'schanze') rails(g, [[m.x - 18 * m.side, m.y - 6], [m.x + 12 * m.side, m.y - 2], [m.x + 28 * m.side, m.y - 20]], FRONT_LIP);
  }
  const fin = geo.segs.find((s) => s.role === 'finish');
  if (fin) {
    const y = fin.pts[0][1];
    g.fillStyle = brassGrad(g, y + 18, y + 44);
    g.fillRect(540, y + 18, 120, 26);
    g.strokeStyle = '#3d270b'; g.lineWidth = 1.5; g.strokeRect(540, y + 18, 120, 26);
    g.font = `700 15px ${DISPLAY}`; g.fillStyle = '#2a1a0c'; g.textAlign = 'center';
    g.fillText(t('track.finish'), 600, y + 37);
  }
  for (const mk2 of geo.marks) {
    if (mk2.kind === 'delle') {
      g.strokeStyle = '#1a0e05'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(mk2.x - 14, mk2.y - 4); g.lineTo(mk2.x - 4, mk2.y + 2); g.lineTo(mk2.x + 4, mk2.y - 3); g.lineTo(mk2.x + 14, mk2.y + 3); g.stroke();
      label(g, t('track.delle'), mk2.x, mk2.y + 26, 'center', '#f0a08f', 12);
    } else {
      g.fillStyle = '#fff6dc';
      for (const [dx, dy, r] of [[-14, -16, 3], [6, -20, 2], [16, -12, 2.5]]) { g.beginPath(); g.arc(mk2.x + dx, mk2.y + dy, r, 0, Math.PI * 2); g.fill(); }
      label(g, t('track.poliert'), mk2.x, mk2.y + 26, 'center', '#bfe3ff', 12);
    }
  }
  return [c0, c1, c2];
}

function drawMarble(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) {
  g.globalAlpha = alpha;
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.28, color);
  gr.addColorStop(1, darken(color));
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.globalAlpha = alpha * 0.85;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(x - r * 0.35, y - r * 0.4, r * 0.22, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
}

function drawBadge(g: CanvasRenderingContext2D, x: number, y: number, r: number, kind: string, owner: string | undefined, alpha: number, off = false) {
  g.globalAlpha = alpha;
  g.fillStyle = off ? '#6b6153' : ENAMEL[SORT[kind]] ?? BRASS;
  g.strokeStyle = '#2a1a0c'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y, r + 3, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = discFill(g, x, y, r - 1);
  g.beginPath(); g.arc(x, y, r - 1, 0, Math.PI * 2); g.fill();
  const sc = (r * 1.25) / 24;
  g.save();
  g.translate(x - 12 * sc, y - 12 * sc);
  g.scale(sc, sc);
  g.strokeStyle = '#2a1a0c'; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.stroke(iconPath(kind));
  g.restore();
  if (owner) {
    g.fillStyle = owner; g.strokeStyle = INK; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x + r + 2, y - r, 7, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.globalAlpha = 1;
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  useFonts();
  const { view } = props;
  const inner = (() => {
    switch (view.screen) {
      case 'intro': return <HostIntro {...props} />;
      case 'build':
      case 'reveal':
      case 'umbau': return <HostOverview {...props} />;
      case 'race': return <HostRace {...props} />;
      case 'result': return <HostResult {...props} />;
      case 'final': return <HostFinal {...props} />;
    }
    return null;
  })();
  return <div style={{ position: 'absolute', inset: 0, background: INK, color: TEXT, fontFamily: FONT, overflow: 'hidden' }}>{inner}</div>;
}

/** Bahn-Ebenen einmal pro Bahnstand erzeugen */
function useLayers(geo: Geo | undefined, version: number, t: (k: string) => string) {
  return useMemo(() => (geo ? renderLayers(geo, t) : null), [version, !!geo]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Overview({ geo, version, items, height, t, player, highlight, fresh, freshDelay }: {
  geo: Geo; version: number; items: PubItem[]; height: number; t: (k: string) => string; player: (id: string) => PlayerInfo | undefined;
  highlight?: { x: number; y: number } | null; fresh?: { id: number; kind: string; owner: string; x: number; y: number }[]; freshDelay?: number;
}) {
  const layers = useLayers(geo, version, t);
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = height / geo.H;
  const w = Math.round(WW * scale);
  useEffect(() => {
    const c = ref.current;
    if (!c || !layers) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    for (const l of layers) g.drawImage(l, 0, 0);
    const freshIds = new Set((fresh ?? []).map((f) => f.id));
    for (const it of items) if (!freshIds.has(it.id)) drawBadge(g, it.x, it.y + 24, 16, it.kind, player(it.owner)?.color, it.age ? 0.5 : 1);
  }, [layers, items, height, w, scale, fresh, player]);
  return (
    <div style={{ position: 'relative', width: w, height, flex: 'none', borderRadius: 14, overflow: 'hidden', boxShadow: `0 0 0 2px ${LINE}` }}>
      <canvas ref={ref} style={{ width: w, height, display: 'block' }} />
      {(fresh ?? []).filter((f) => f.id > 0).map((f, k) => (
        <span key={f.id} className="anim-pop" style={{ position: 'absolute', left: f.x * scale - 16, top: (f.y + 24) * scale - 16, animationDelay: `${(freshDelay ?? 0.45) * k}s`, animationFillMode: 'both' }}>
          <Badge kind={f.kind} size={32} owner={player(f.owner)?.color} />
        </span>
      ))}
      {highlight && (
        <span style={{ position: 'absolute', left: highlight.x * scale - 34, top: highlight.y * scale - 34, width: 68, height: 68, borderRadius: '50%', border: `4px solid ${BRASS_L}`, boxShadow: `0 0 24px ${BRASS}`, animation: 'mmPulse 1.2s ease-in-out infinite' }} />
      )}
      <style>{'@keyframes mmPulse { 0%,100% { transform: scale(.85); opacity: .7 } 50% { transform: scale(1.15); opacity: 1 } }'}</style>
    </div>
  );
}

function Title({ size = 30 }: { size?: number }) {
  return <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, color: BRASS, lineHeight: 1.1 }}>Murmel-Mayhem</span>;
}

function HostIntro({ view, t }: HostViewProps) {
  const rules = ['intro.r1', 'intro.r2', 'intro.r3', 'intro.r4'];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 40, padding: '34px 56px', background: BG }}>
      <Overview geo={view.geo} version={view.trackV} items={[]} height={652} t={t} player={() => undefined} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center' }}>
        <span className="anim-pop" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, color: BRASS, textShadow: '0 4px 0 #6e4a14' }}>{t('title')}</span>
        <p className="anim-up" style={{ fontSize: 24, lineHeight: 1.4, color: TEXT }}>{t('intro.text', { n: view.perPlayer })}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map((k, i) => (
            <div key={k} className="anim-up" style={{ display: 'flex', gap: 14, alignItems: 'center', animationDelay: `${0.3 + i * 0.25}s` }}>
              <Badge kind={['turbo', 'kleber', 'farbweiche', 'tausch'][i]} size={44} />
              <span style={{ fontSize: 20, color: MUTED, lineHeight: 1.35 }}>{t(k)}</span>
            </div>
          ))}
        </div>
        <p className="anim-up" style={{ fontSize: 18, color: DIM, animationDelay: '1.4s' }}>{t('intro.points', { total: view.total })}</p>
      </div>
    </div>
  );
}

function HostOverview({ view, t, player }: HostViewProps) {
  const now = useServerNow(250);
  const items = view.items as PubItem[];
  const fresh = view.screen === 'reveal' ? (view.fresh as { id: number; kind: string; owner: string; x: number; y: number; moved: boolean }[]) : undefined;
  const umbau = view.screen === 'umbau' ? view.umbau : view.screen === 'build' ? view.umbau : null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 34, padding: '34px 56px 34px 56px', background: BG }}>
      <Overview geo={view.geo} version={view.trackV} items={items} height={652} t={t} player={player} fresh={fresh} highlight={view.screen === 'umbau' ? umbau : null} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Title />
            <span style={{ fontSize: 18, color: MUTED }}>{t('round', { n: view.round, total: view.total })}{view.last ? ` · ${t('lastRound')}` : ''}</span>
          </div>
          {view.screen === 'build' && <HostTimer deadline={view.deadline} duration={view.duration} />}
        </div>
        {view.screen === 'build' && (
          <>
            <h1 style={{ fontFamily: DISPLAY, fontSize: 38, color: TEXT, margin: 0 }}>{t('build.title')}</h1>
            <p style={{ fontSize: 21, color: MUTED, lineHeight: 1.4, margin: 0 }}>{t(view.last ? 'build.textLast' : 'build.text')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
              {(props_ids(view, player) as PlayerInfo[]).map((p) => {
                const done = (view.ready as string[]).includes(p.id);
                return (
                  <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px', borderRadius: 30, background: done ? 'rgba(233,196,106,.18)' : 'rgba(255,255,255,.04)', border: `1px solid ${done ? BRASS : LINE}` }}>
                    <span style={{ borderRadius: '50%', boxShadow: `0 0 0 3px ${p.color}` }}><Avatar player={p} size={34} /></span>
                    <b style={{ fontSize: 17 }}>{p.name}</b>
                    <span style={{ fontSize: 15, color: done ? BRASS_L : DIM }}>{done ? t('build.done') : t('build.building')}</span>
                  </span>
                );
              })}
            </div>
            {umbau && umbau.key && (
              <p style={{ marginTop: 'auto', fontSize: 18, color: DIM, lineHeight: 1.4 }}>{t('build.changed')} {t(umbau.key, umbauVars(umbau.vars, t))}{umbau.vars?.worn ? ` ${t('umbau.wear', umbauVars(umbau.vars, t))}` : ''}</p>
            )}
          </>
        )}
        {view.screen === 'reveal' && (
          <>
            <h1 style={{ fontFamily: DISPLAY, fontSize: 38, color: TEXT, margin: 0 }}>{t('reveal.title')}</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
              {fresh!.map((f, k) => {
                const p = player(f.owner);
                return (
                  <div key={k} className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 12, animationDelay: `${k * 0.45}s`, animationFillMode: 'both' }}>
                    <Badge kind={f.kind} size={38} owner={p?.color} />
                    <b style={{ fontSize: 19, color: p?.color ?? TEXT }}>{p?.name}</b>
                    <span style={{ fontSize: 19 }}>{t(`k.${f.kind}`)}</span>
                    {f.moved && <span style={{ fontSize: 15, color: DIM }}>{t('reveal.moved')}</span>}
                    {f.id < 0 && <span style={{ fontSize: 15, color: DIM }}>{t('reveal.event')}</span>}
                  </div>
                );
              })}
              {fresh!.length === 0 && <p style={{ fontSize: 20, color: MUTED }}>{t('reveal.none')}</p>}
            </div>
          </>
        )}
        {view.screen === 'umbau' && (
          <>
            <h1 style={{ fontFamily: DISPLAY, fontSize: 38, color: TEXT, margin: 0 }}>{t('umbau.title')}</h1>
            <p className="anim-up" style={{ fontSize: 26, lineHeight: 1.35 }}>{t(umbau.key, umbauVars(umbau.vars, t))}</p>
            {view.wear && <p className="anim-up" style={{ fontSize: 20, color: MUTED, lineHeight: 1.4, animationDelay: '.5s' }}>{t('umbau.wear', { worn: view.wear.worn, polished: view.wear.polished })}</p>}
            <p style={{ fontSize: 18, color: DIM }}>{t('umbau.items')}</p>
          </>
        )}
        <span style={{ display: 'none' }}>{now}</span>
      </div>
    </div>
  );
}

function props_ids(view: any, player: (id: string) => PlayerInfo | undefined): PlayerInfo[] {
  const ids: string[] = view.players ?? Object.keys(view.after ?? {});
  return ids.map(player).filter(Boolean) as PlayerInfo[];
}

function umbauVars(vars: Record<string, string | number> | undefined, t: (k: string) => string) {
  if (!vars) return undefined;
  const out: Record<string, string | number> = { ...vars };
  if (typeof vars.from === 'string') out.from = t(`track.${vars.from}`);
  if (typeof vars.to === 'string') out.to = t(`track.${vars.to}`);
  return out;
}

interface Frame { round: number; t: number; m: number[][]; o: number[]; p: number[]; ow: number[]; it: [number, number][]; fx: (string | number)[][]; g: [number, number] | null; q: number; oil: number }
interface Effect { kind: 'ring' | 'text'; x: number; y: number; at: number; color: string; text?: string; r?: number }

function HostRace({ view, t, player }: HostViewProps) {
  const geo = view.geo as Geo;
  const layers = useLayers(geo, view.trackV, t);
  const frame = useStream<Frame>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frames = useRef<{ prev: Frame | null; cur: Frame | null; at: number }>({ prev: null, cur: null, at: 0 });
  const cam = useRef({ y: 600, h: 820, init: false });
  const effects = useRef<Effect[]>([]);
  const banner = useRef<{ text: string; at: number } | null>(null);
  const [bannerText, setBannerText] = useState<{ text: string; key: number } | null>(null);
  const [edge, setEdge] = useState<[number, number]>([0, 0]);
  const items = view.items as PubItem[];
  const pids = view.players as string[];
  const ownerColors = useMemo(() => pids.map((id) => player(id)?.color ?? '#ffffff'), [pids, player]);
  const owners = view.owners as string[];
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const itemState = useRef(new Map<number, number>());
  const W = 1054, H = 720;
  const fr = frame && frame.round === view.round && frame.m.length === owners.length ? frame : null;
  void owners;

  // neue Daten + Effekte
  useEffect(() => {
    if (!fr) return;
    const f = frames.current;
    if (f.cur !== fr) {
      f.prev = f.cur ?? fr;
      f.cur = fr;
      f.at = performance.now();
    }
    for (const [id, st] of fr.it) itemState.current.set(id, st);
    const n = performance.now();
    for (const e of fr.fx) {
      const kind = e[0];
      if (kind === 'trap') {
        const it = itemById.get(Number(e[1]));
        if (it) {
          const p = player(it.owner);
          effects.current.push({ kind: 'ring', x: it.x, y: it.y + 24, at: n, color: '#d3452f', r: 30 });
          effects.current.push({ kind: 'text', x: it.x, y: it.y + 66, at: n, color: '#ff9b88', text: `${t(`k.${it.kind}`)} · ${p?.name ?? ''}` });
          sfx.custom((s) => { s.tone(220, 0.18, { type: 'square', vol: 0.06, to: 110 }); s.noise(0.08, { filter: 900, vol: 0.08 }); });
        }
      } else if (kind === 'help') {
        const it = itemById.get(Number(e[1]));
        if (it) {
          effects.current.push({ kind: 'ring', x: it.x, y: it.y + 24, at: n, color: '#3fa36b', r: 26 });
          sfx.custom((s) => s.tone(520, 0.14, { type: 'triangle', vol: 0.07, to: 1040 }));
        }
      } else if (kind === 'toggle') {
        const it = itemById.get(Number(e[1]));
        if (it) {
          effects.current.push({ kind: 'ring', x: it.x, y: it.y + 24, at: n, color: '#e8b923', r: 34 });
          effects.current.push({ kind: 'text', x: it.x, y: it.y - 26, at: n, color: '#f6d35b', text: t('race.flipped', { name: player(it.owner)?.name ?? '' }) });
          sfx.custom((s) => { s.tone(1400, 0.04, { type: 'square', vol: 0.06 }); s.tone(900, 0.05, { type: 'square', vol: 0.05, at: 0.05 }); });
        }
      } else if (kind === 'shield') {
        const i = Number(e[1]);
        const m = fr.m[i];
        if (m) effects.current.push({ kind: 'ring', x: m[0], y: m[1], at: n, color: '#9fd7ff', r: 20 });
      } else if (kind === 'finish') {
        const i = Number(e[1]);
        if (Number(e[2]) === 1) {
          banner.current = { text: t('race.first', { name: player(pids[fr.ow[i]])?.name ?? '' }), at: n };
          sfx.play('cheer');
        } else sfx.custom((s) => s.tone(1200 + Math.random() * 300, 0.06, { type: 'sine', vol: 0.05 }));
      } else if (kind === 'event') {
        const p = player(pids[Number(e[2])] ?? '');
        banner.current = { text: t(`ev.${e[1]}`, { name: p?.name ?? '' }), at: n };
        sfx.custom((s) => { s.tone(140, 0.6, { type: 'sawtooth', vol: 0.12, to: 70 }); s.noise(0.5, { filter: 400, type: 'lowpass', vol: 0.2 }); });
      } else if (kind === 'flieh' || kind === 'jump' || kind === 'kanone' || kind === 'wurm') {
        const i = Number(kind === 'flieh' || kind === 'jump' ? e[1] : e[2]);
        const m = fr.m[i];
        if (m && kind !== 'jump') effects.current.push({ kind: 'text', x: m[0], y: m[1] - 22, at: n, color: TEXT, text: t(`race.${kind}`) });
        if (kind === 'kanone') sfx.custom((s) => { s.noise(0.25, { filter: 300, type: 'lowpass', vol: 0.3 }); s.tone(90, 0.3, { type: 'sine', vol: 0.2, to: 40 }); });
        if (kind === 'wurm') sfx.custom((s) => s.tone(900, 0.2, { type: 'sine', vol: 0.08, to: 200 }));
      } else if (kind === 'platt') {
        sfx.custom((s) => s.noise(0.15, { filter: 500, vol: 0.12 }));
      }
    }
    if (banner.current && n - banner.current.at < 50) setBannerText({ text: banner.current.text, key: banner.current.at });
  }, [fr]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bannerText) return;
    const id = setTimeout(() => setBannerText(null), 2600);
    return () => clearTimeout(id);
  }, [bannerText]);

  // Zeichnen
  useEffect(() => {
    let raf = 0;
    let lastEdge = '';
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvasRef.current;
      if (!c || !layers) return;
      const g = c.getContext('2d');
      if (!g) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
      const { prev, cur, at } = frames.current;
      const n = performance.now();
      const a = Math.min(1, (n - at) / 34);
      const pos = (i: number): [number, number, number] => {
        const q = cur!.m[i], p = prev?.m[i] ?? q;
        const jump = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 140;
        return jump ? [q[0], q[1], q[2]] : [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a, q[2]];
      };
      // Kamera: folgt der Mitte des Feldes
      let targetY = 400, targetH = 820;
      if (cur) {
        const active = cur.o.filter((i) => !(cur.m[i][2] & (FLAG.done | FLAG.hidden)) || (cur.m[i][2] & FLAG.back));
        const live = active.filter((i) => !(cur.m[i][2] & FLAG.done));
        if (live.length) {
          const lo = Math.floor(live.length * 0.15), hi = Math.max(lo, Math.ceil(live.length * 0.85) - 1);
          const band = live.slice(lo, hi + 1).map((i) => cur.m[i][1]);
          const y0 = Math.min(...band), y1 = Math.max(...band);
          targetY = (y0 + y1) / 2;
          targetH = Math.max(820, Math.min(1500, y1 - y0 + 380));
        } else {
          targetY = geo.H - 300;
        }
      }
      const cm = cam.current;
      if (!cm.init && cur) { cm.y = targetY; cm.h = targetH; cm.init = true; }
      cm.y += (targetY - cm.y) * 0.035;
      cm.h += (targetH - cm.h) * 0.02;
      const scale = Math.min(W / WW, H / cm.h);
      const viewH = H / scale;
      const top = Math.max(-40, Math.min(geo.H - viewH + 40, cm.y - viewH / 2));
      const ox = (W - WW * scale) / 2;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = INK;
      g.fillRect(0, 0, W, H);
      if (cur?.q) g.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      g.translate(ox, -top * scale);
      g.scale(scale, scale);
      const sy = Math.max(0, top), sh = Math.min(geo.H - sy, viewH + 2);
      const blit = (l: HTMLCanvasElement) => g.drawImage(l, 0, sy, WW, sh, 0, sy, WW, sh);
      blit(layers[0]);
      if (!cur) { blit(layers[1]); blit(layers[2]); return; }
      const M = cur.m.length;
      // hintere Ebene
      for (let i = 0; i < M; i++) {
        const [x, y, f] = pos(i);
        if (f & FLAG.back) drawMarble(g, x, y, 7, ownerColors[cur.ow[i]], 0.75);
      }
      blit(layers[1]);
      // Ölpest
      if (cur.oil >= 0) {
        const s = geo.segs[cur.oil];
        if (s) { g.strokeStyle = 'rgba(40,60,90,.55)'; g.lineWidth = 26; g.lineCap = 'round'; strokePath(g, s.pts, -10); }
      }
      // vordere Murmeln: erst hintere Spur, dann vordere
      for (const far of [true, false]) {
        for (let i = 0; i < M; i++) {
          const [x, y, f] = pos(i);
          if (f & (FLAG.back | FLAG.hidden)) continue;
          if (!!(f & FLAG.far) !== far) continue;
          const col = ownerColors[cur.ow[i]];
          if (f & FLAG.boost) {
            g.globalAlpha = 0.35; g.fillStyle = col;
            g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
          }
          drawMarble(g, x, y, far ? 8 : 9, col, far ? 0.88 : 1);
          if (f & FLAG.shield) { g.strokeStyle = '#9fd7ff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.stroke(); }
          if (f & FLAG.stuck) { g.strokeStyle = '#d3452f'; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
        }
      }
      // führende Murmel jeder Farbe: Leuchtring
      const seen = new Set<number>();
      for (const i of cur.o) {
        const ow = cur.ow[i];
        if (seen.has(ow)) continue;
        seen.add(ow);
        const [x, y, f] = pos(i);
        if (f & (FLAG.hidden | FLAG.back | FLAG.done)) continue;
        g.strokeStyle = '#fff6dc'; g.lineWidth = 1.5; g.globalAlpha = 0.9;
        g.beginPath(); g.arc(x, y, 12.5, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
      blit(layers[2]);
      // Teile
      for (const it of items) {
        const st = itemState.current.get(it.id) ?? (it.on ? 1 : 0);
        const off = it.toggle && !(st & 1);
        if (it.kind === 'schranke' && st & 2) {
          g.strokeStyle = '#2a1a0c'; g.lineWidth = 8; g.lineCap = 'butt';
          g.beginPath(); g.moveTo(it.x, it.y - 36); g.lineTo(it.x, it.y - 4); g.stroke();
          g.strokeStyle = '#d3452f'; g.lineWidth = 5; g.setLineDash([5, 5]);
          g.beginPath(); g.moveTo(it.x, it.y - 36); g.lineTo(it.x, it.y - 4); g.stroke(); g.setLineDash([]);
        }
        g.strokeStyle = '#7a5418'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(it.x, it.y); g.lineTo(it.x, it.y + 10); g.stroke();
        drawBadge(g, it.x, it.y + 24, 13, it.kind, player(it.owner)?.color, it.age ? 0.5 : 1, off || !!(st & 4));
        if (it.exit && !off) {
          g.strokeStyle = it.kind === 'kanone' ? 'rgba(232,185,35,.5)' : 'rgba(159,215,255,.5)';
          g.lineWidth = 2; g.setLineDash([4, 6]);
          g.beginPath(); g.arc(it.exit[0], it.exit[1] - 14, 14, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        }
      }
      // Riesenmurmel
      if (cur.g) {
        const [gx, gy] = cur.g;
        const gr = g.createRadialGradient(gx - 8, gy - 10, 2, gx, gy, 26);
        gr.addColorStop(0, '#f2f2f2'); gr.addColorStop(0.4, '#9a9a9a'); gr.addColorStop(1, '#3a3a3a');
        g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, 24, 0, Math.PI * 2); g.fill();
      }
      // Effekte
      effects.current = effects.current.filter((e) => {
        const age = n - e.at;
        if (e.kind === 'ring') {
          if (age > 700) return false;
          g.globalAlpha = 1 - age / 700;
          g.strokeStyle = e.color; g.lineWidth = 4;
          g.beginPath(); g.arc(e.x, e.y, (e.r ?? 24) * (0.6 + age / 700), 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
          return true;
        }
        if (age > 1500) return false;
        g.globalAlpha = 1 - age / 1500;
        g.font = `700 ${Math.round(16 / Math.max(0.6, scale))}px ${FONT}`;
        g.textAlign = 'center';
        g.lineWidth = 5; g.strokeStyle = INK;
        g.strokeText(e.text ?? '', e.x, e.y - age / 40);
        g.fillStyle = e.color;
        g.fillText(e.text ?? '', e.x, e.y - age / 40);
        g.globalAlpha = 1;
        return true;
      });
      // Pfeile für Murmeln außerhalb des Bildes
      let above = 0, below = 0;
      for (let i = 0; i < M; i++) {
        const f = cur.m[i][2];
        if (f & (FLAG.done | FLAG.hidden)) continue;
        if (cur.m[i][1] < top + 20) above++;
        else if (cur.m[i][1] > top + viewH - 20) below++;
      }
      const key = `${above},${below}`;
      if (key !== lastEdge) { lastEdge = key; setEdge([above, below]); }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layers, items, ownerColors, geo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seitenleiste: Rennverlauf und Rangliste (beste Murmel je Farbe)
  const ranking: { pid: string; color: string; done: number }[] = [];
  if (fr) {
    const seen = new Set<number>();
    for (const i of fr.o) {
      const ow = fr.ow[i];
      if (seen.has(ow)) continue;
      seen.add(ow);
      const p = player(pids[ow]);
      if (p) ranking.push({ pid: p.id, color: p.color, done: fr.m.filter((m, k) => fr.ow[k] === ow && m[2] & FLAG.done).length });
    }
  }
  const barH = 560;
  const cm = cam.current;
  const vis = fr ? { top: Math.max(0, (cm.y - cm.h / 2) / view.geo.H), h: cm.h / view.geo.H } : null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      <div style={{ position: 'relative', width: W, height: H }}>
        <canvas ref={canvasRef} style={{ width: W, height: H, display: 'block' }} />
        {edge[0] > 0 && <EdgePill top>{t('race.above', { n: edge[0] })}</EdgePill>}
        {edge[1] > 0 && <EdgePill>{t('race.below', { n: edge[1] })}</EdgePill>}
        {bannerText && (
          <div key={bannerText.key} className="anim-pop" style={{ position: 'absolute', left: '50%', top: 90, transform: 'translateX(-50%)', padding: '12px 28px', borderRadius: 16, background: 'rgba(20,13,8,.88)', border: `2px solid ${BRASS}`, fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, color: BRASS_L, whiteSpace: 'nowrap', boxShadow: `0 0 30px ${BRASS}55` }}>{bannerText.text}</div>
        )}
      </div>
      <div style={{ width: 1280 - W, boxSizing: 'border-box', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 12, background: 'linear-gradient(180deg, #2b1d12, #1a110a)', borderLeft: `1px solid ${LINE}` }}>
        <Title size={20} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 15, color: MUTED }}>{t('round', { n: view.round, total: view.total })}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28 }}>{fr ? fmtTime(fr.t) : '0:00'}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: DIM }}>{t('race.start')}</span>
            <div style={{ position: 'relative', width: 40, height: barH, flex: 'none', borderRadius: 8, background: 'rgba(255,255,255,.04)', border: `1px solid ${LINE}` }}>
              {vis && <span style={{ position: 'absolute', left: -3, width: 44, top: Math.min(barH - 20, vis.top * barH), height: Math.max(20, Math.min(barH, vis.h * barH)), border: `2px solid ${BRASS}`, borderRadius: 6, boxSizing: 'border-box' }} />}
              {fr && fr.p.map((p, i) => (
                <span key={i} style={{ position: 'absolute', left: 6 + (i % 3) * 10, top: Math.min(barH - 10, (p / 1000) * barH - 5), ...marbleCss(ownerColors[fr.ow[i]], 10), transition: 'top .3s linear' }} />
              ))}
            </div>
            <span style={{ fontSize: 11, color: DIM }}>{t('race.finish')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: DIM }}>{t('race.best')}</span>
            {ranking.slice(0, 12).map((r, k) => {
              const p = player(r.pid)!;
              return (
                <div key={r.pid} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 8, background: 'rgba(255,255,255,.03)' }}>
                  <span style={{ width: 16, fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: BRASS }}>{k + 1}</span>
                  <span style={marbleCss(r.color, 17)} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  {r.done > 0 && <span style={{ fontSize: 12, color: BRASS_L }}>{r.done}✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EdgePill({ top, children }: { top?: boolean; children: ReactNode }) {
  return (
    <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', [top ? 'top' : 'bottom']: 12, padding: '5px 16px', borderRadius: 16, background: 'rgba(20,13,8,.85)', border: `1.5px solid ${BRASS}`, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>
  );
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function HostResult({ view, t, player }: HostViewProps) {
  const rows = Object.keys(view.after).map((id) => ({ player: player(id)!, before: view.before[id] ?? 0, after: view.after[id] })).filter((r) => r.player);
  const first = view.firstPid ? player(view.firstPid) : null;
  const trapKing = Object.entries(view.traps as Record<string, number>).sort((a, b) => b[1] - a[1])[0];
  const tk = trapKing && trapKing[1] > 0 ? player(trapKing[0]) : null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 16, padding: '30px 56px', background: BG }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Title />
        <span style={{ fontSize: 18, color: MUTED }}>{t('round', { n: view.round, total: view.total })}{view.mult > 1 ? ` · ${t('double')}` : ''}</span>
      </div>
      <div style={{ display: 'flex', gap: 30, fontSize: 20 }}>
        {first && <span>{t('result.first', { name: first.name })} <b style={{ color: BRASS_L }}>+{100 * view.mult}</b></span>}
        {tk && <span style={{ color: '#ff9b88' }}>{t('result.traps', { name: tk.name, n: trapKing[1] })}</span>}
      </div>
      <Scoreboard rows={rows} />
    </div>
  );
}

function HostFinal({ view, t, player }: HostViewProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 16, padding: '30px 56px', background: BG }}>
      <Title />
      <Podium ranking={view.ranking} player={player} pointsLabel={t('common.points')} />
    </div>
  );
}

/* ================= Handy ================= */

function Phone({ children, color }: { children: ReactNode; color?: string }) {
  useFonts();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT, color: TEXT, background: BG, margin: '-18px -18px -22px', padding: '18px 16px 22px', minHeight: 'calc(100dvh - 0px)', boxShadow: color ? `inset 0 4px 0 ${color}` : undefined }}>
      {children}
    </div>
  );
}

function TopBar({ me, color, title, right }: { me: PlayerInfo; color: string; title: string; right?: ReactNode }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={marbleCss(color, 30)} />
          <b style={{ fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</b>
        </div>
        {right}
      </div>
      <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: 23, color: BRASS }}>{title}</h1>
    </>
  );
}

/** Bauplan als SVG (Handy) */
function PlanSvg({ geo, scale, children }: { geo: Geo; scale: number; children?: ReactNode }) {
  return (
    <svg width={WW * scale} height={geo.H * scale} viewBox={`0 0 ${WW} ${geo.H}`} style={{ display: 'block' }}>
      <rect width={WW} height={geo.H} fill="#1f150d" />
      {geo.segs.filter((s) => s.layer === 1).map((s) => (
        <polyline key={s.id} points={s.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.role === 'dust' ? '#7d6f62' : '#9a5232'} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} strokeDasharray={s.role === 'dust' ? '2 12' : undefined} />
      ))}
      {geo.conveyor && <line x1={geo.conveyor.x} y1={geo.conveyor.y0} x2={geo.conveyor.x} y2={geo.conveyor.y1} stroke="#c8963c" strokeWidth={10} opacity={0.6} />}
      {geo.segs.filter((s) => s.layer === 0 && s.role !== 'lift').map((s) => (
        <polyline key={s.id} points={s.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#c8963c" strokeWidth={s.role === 'catch' ? 5 : 11} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {geo.mixers.map((m, i) => (
        <g key={i} opacity={0.75}>
          {m.kind === 'trichter' && <path d={`M${m.x - 60} ${m.y} L${m.x + 60} ${m.y} L${m.x + 12} ${m.y + 70} L${m.x - 12} ${m.y + 70} Z`} fill="rgba(191,227,255,.15)" stroke="#d9eefc" strokeWidth={4} />}
          {m.kind === 'nagel' && <rect x={m.side > 0 ? 1000 : 58} y={m.y + 6} width={130} height={100} rx={10} fill="none" stroke="#e7c27a" strokeWidth={4} strokeDasharray="4 10" />}
          {m.kind === 'wippe' && <line x1={m.x - 40} y1={m.y + 40} x2={m.x + 70} y2={m.y + 60} stroke="#c8963c" strokeWidth={8} />}
        </g>
      ))}
      {children}
    </svg>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t, me } = props;
  const color = view.color ?? me.color;
  switch (view.screen) {
    case 'intro':
      return <Phone color={color}><PhoneWait title={t('title')} text={t('phone.intro', { n: view.perPlayer })} emoji={<span style={marbleCss(color, 90)} />} /></Phone>;
    case 'build':
      return <PhoneBuild {...props} />;
    case 'race':
      return <PhoneRace {...props} />;
    case 'watch':
      return (
        <Phone color={color}>
          <PhoneWait title={t(view.key)} text={view.mine?.length ? t('phone.yours', { list: view.mine.map((f: { kind: string }) => t(`k.${f.kind}`)).join(', ') }) : t('lookAtTv')} emoji={<span style={marbleCss(color, 90)} />} />
        </Phone>
      );
    case 'result':
      return (
        <Phone color={color}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
            {view.place === 1 && <Confetti pieces={14} silent />}
            <span style={marbleCss(color, 80)} />
            <h1 style={{ fontFamily: DISPLAY, fontSize: 30, margin: 0, color: BRASS }}>+{view.points}</h1>
            <p style={{ fontSize: 18, color: MUTED, margin: 0 }}>{t('phone.finished', { n: view.finished, of: view.of })}</p>
            {view.traps > 0 && <p style={{ fontSize: 17, color: '#ff9b88', margin: 0 }}>{t('phone.traps', { n: view.traps })}</p>}
            <p style={{ fontSize: 17, margin: 0 }}>{t('me.place', { place: view.place, of: view.players })} · {t('me.score', { n: view.score })}</p>
          </div>
        </Phone>
      );
    case 'final':
      return <Phone color={color}><PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} emoji={<span style={marbleCss(color, 100)} />} /></Phone>;
  }
  return <Phone color={color}><PhoneWait title={t('lookAtTv')} emoji={<span style={marbleCss(color, 90)} />} /></Phone>;
}

function PhoneBuild({ view, t, send, me }: ControllerViewProps) {
  const geo = view.geo as Geo;
  const offers = view.offers as string[];
  const placed = view.placed as { card: number; socket: number }[];
  const taken = new Set<number>(view.taken as number[]);
  const [sel, setSel] = useState<number | null>(null);
  const color = view.color ?? me.color;
  const scale = 0.5;
  const placedCard = (c: number) => placed.find((p) => p.card === c);
  const canMore = placed.length < view.max;
  const selKind = sel !== null ? offers[sel] : null;
  const fitsSocket = (s: Geo['sockets'][number]) => {
    if (!selKind || SORT[selKind] === 'ereignis') return false;
    if (taken.has(s.id) || placed.some((p) => p.socket === s.id)) return false;
    if (SWITCH_ONLY.includes(selKind)) return s.kind === 'switch' && !(selKind === 'bruecke' && s.dust);
    if (s.kind !== 'rail') return false;
    if (selKind === 'kanone' && s.row >= 11) return false;
    return true;
  };
  const pickCard = (c: number) => {
    if (view.ready) return;
    if (placedCard(c)) { send({ type: 'unplace', card: c }); setSel(null); return; }
    if (!canMore) return;
    if (SORT[offers[c]] === 'ereignis') { send({ type: 'place', card: c, socket: -1 }); vibrate(20); setSel(null); return; }
    setSel(sel === c ? null : c);
  };
  const pickSocket = (id: number) => {
    if (sel === null) return;
    send({ type: 'place', card: sel, socket: id });
    vibrate(25);
    setSel(null);
  };
  return (
    <Phone color={color}>
      <TopBar me={me} color={color} title={t('phone.build', { n: view.round })} right={<PhoneTimer deadline={view.deadline} duration={view.duration} />} />
      <div style={{ display: 'flex', gap: 8 }}>
        {offers.map((k, c) => {
          const pl = placedCard(c);
          const active = sel === c;
          return (
            <button key={c} type="button" aria-pressed={active} onClick={() => pickCard(c)} disabled={view.ready}
              style={{ flex: 1, minWidth: 0, minHeight: 124, boxSizing: 'border-box', padding: '8px 4px', borderRadius: 12, border: active ? `3px solid ${BRASS_L}` : `1px solid ${pl ? BRASS : LINE}`, background: active ? 'rgba(233,196,106,.16)' : pl ? 'rgba(233,196,106,.08)' : 'rgba(255,255,255,.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontFamily: FONT, color: TEXT, opacity: !pl && !canMore ? 0.45 : 1 }}>
              <Badge kind={k} size={44} />
              <span style={{ fontSize: 15, fontWeight: 700 }}>{t(`k.${k}`)}</span>
              <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.2, textAlign: 'center' }}>{t(`d.${k}`)}</span>
              {pl ? <span style={{ fontSize: 12, fontWeight: 700, color: BRASS_L }}>{t('phone.placed')}</span> : active ? <span style={{ fontSize: 12, fontWeight: 700, color: INK, background: BRASS_L, borderRadius: 6, padding: '1px 6px' }}>{t('phone.chosen')}</span> : null}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 15, color: MUTED }}>
        {view.ready ? t('phone.readyWait') : sel !== null ? t(SWITCH_ONLY.includes(offers[sel]) ? 'phone.pickSwitch' : 'phone.pickSocket') : canMore ? t('phone.pickCard', { n: view.max - placed.length }) : t('phone.allPlaced')}
      </span>
      <div style={{ flex: 1, minHeight: 280, maxHeight: 440, overflow: 'auto', borderRadius: 14, border: `2px solid ${LINE}`, WebkitOverflowScrolling: 'touch' }}>
        <PlanSvg geo={geo} scale={scale}>
          {(view.items as { id: number; kind: string; x: number; y: number; mine: boolean; age: number }[]).map((it) => (
            <g key={`i${it.id}`} opacity={it.age ? 0.5 : 0.9}>
              <circle cx={it.x} cy={it.y} r={28} fill={ENAMEL[SORT[it.kind]]} stroke={it.mine ? '#fff6dc' : INK} strokeWidth={5} />
              <path d={ICON[it.kind]} transform={`translate(${it.x - 18},${it.y - 18}) scale(1.5)`} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
          {geo.sockets.filter((s) => !taken.has(s.id)).map((s) => {
            const mine = placed.find((p) => p.socket === s.id);
            const ok = fitsSocket(s);
            if (mine) {
              const k = offers[mine.card];
              return (
                <g key={s.id} onClick={() => pickCard(mine.card)} style={{ cursor: 'pointer' }}>
                  <circle cx={s.x} cy={s.y} r={34} fill={ENAMEL[SORT[k]]} stroke="#fff6dc" strokeWidth={6} />
                  <path d={ICON[k]} transform={`translate(${s.x - 21},${s.y - 21}) scale(1.75)`} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              );
            }
            return (
              <g key={s.id} onClick={() => ok && pickSocket(s.id)} style={{ cursor: ok ? 'pointer' : 'default' }}>
                <circle cx={s.x} cy={s.y} r={44} fill={ok ? 'rgba(233,196,106,.22)' : 'transparent'} />
                <circle cx={s.x} cy={s.y} r={26} fill={s.kind === 'switch' ? 'rgba(232,185,35,.25)' : 'none'} stroke={ok ? BRASS_L : '#7a6a50'} strokeWidth={ok ? 7 : 4} strokeDasharray={s.kind === 'switch' ? undefined : '10 8'} opacity={sel === null || ok ? 1 : 0.35} />
              </g>
            );
          })}
        </PlanSvg>
      </div>
      <span style={{ fontSize: 13, color: DIM }}>{t('phone.legend')}</span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={() => send({ type: 'ready', on: !view.ready })}
          style={{ flex: 1, minHeight: 54, borderRadius: 12, border: 0, background: view.ready ? 'transparent' : `linear-gradient(180deg, #f3d38a, #c8963c)`, boxShadow: view.ready ? `inset 0 0 0 1px ${DIM}` : '0 3px 0 #6e4a14', color: view.ready ? TEXT : INK, fontFamily: FONT, fontWeight: 700, fontSize: 18 }}>
          {view.ready ? t('phone.unready') : t('phone.ready')}
        </button>
      </div>
    </Phone>
  );
}

const PHONE_GEO_CACHE: { v: number; geo: Geo | null } = { v: -1, geo: null };

function toggleText(t: (k: string, v?: Record<string, string | number>) => string, tg: { kind: string; on: boolean; dust: boolean }) {
  const way = t(tg.dust ? 'way.dust' : 'way.short');
  return t(`tg.${tg.kind}.${tg.on ? 'on' : 'off'}`, { way });
}

function PhoneRace({ view, t, send, me }: ControllerViewProps) {
  const now = useServerNow(200);
  const color = view.color ?? me.color;
  if (view.geo) { PHONE_GEO_CACHE.v = view.trackV; PHONE_GEO_CACHE.geo = view.geo; }
  const geo = (view.geo ?? PHONE_GEO_CACHE.geo) as Geo | null;
  const toggles = view.toggles as { id: number; kind: string; on: boolean; row: number; readyAt: number; dust: boolean }[];
  const mapH = 360;
  const scale = geo ? mapH / geo.H : 0;
  return (
    <Phone color={color}>
      <TopBar me={me} color={color} title={t('phone.race')} />
      <div style={{ display: 'flex', gap: 12 }}>
        {geo && (
          <div style={{ borderRadius: 12, overflow: 'hidden', border: `2px solid ${LINE}`, flex: 'none' }}>
            <PlanSvg geo={geo} scale={scale}>
              {(view.others as [number, number][]).map(([x, y], i) => <circle key={`o${i}`} cx={x} cy={y} r={16} fill="#8a7a66" />)}
              {toggles.map((tg, i) => {
                const it = view.toggles[i];
                return <g key={`t${tg.id}`}><circle cx={it.x} cy={it.y} r={44} fill="#e8b923" stroke={INK} strokeWidth={5} /><text x={it.x} y={it.y + 18} fontSize={52} fontWeight={700} textAnchor="middle" fill={INK} fontFamily={FONT}>{String.fromCharCode(65 + i)}</text></g>;
              })}
              {(view.mine as [number, number, number][]).map(([x, y, d], i) => (
                <g key={`m${i}`}>
                  <circle cx={x} cy={y} r={46} fill={color} opacity={0.35} />
                  <circle cx={x} cy={y} r={26} fill={color} stroke="#fff6dc" strokeWidth={6} opacity={d ? 0.6 : 1} />
                </g>
              ))}
            </PlanSvg>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 13, color: DIM }}>{t('phone.best')}</span><span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 32 }}>{view.place > 0 ? t('phone.placeN', { n: view.place }) : '–'}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 13, color: DIM }}>{t('phone.inGoal')}</span><span style={{ fontSize: 22, fontWeight: 700 }}>{t('phone.ofN', { n: view.done, of: view.of })}</span></div>
          <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.3 }}>{toggles.length ? t('phone.mapHint') : t('phone.noToggles')}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toggles.map((tg, i) => {
          const cooling = tg.readyAt > now;
          return (
            <button key={tg.id} type="button" disabled={cooling}
              onClick={() => { vibrate(30); send({ type: 'toggle', item: tg.id }); }}
              style={{ minHeight: 88, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 16, border: cooling ? '2px solid #6e5a2a' : 0, background: cooling ? 'rgba(233,196,106,.08)' : 'linear-gradient(180deg, #f6d35b, #c9961a)', color: cooling ? MUTED : INK, fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', boxShadow: cooling ? undefined : '0 4px 0 #6e4a14', touchAction: 'manipulation' }}>
              <span style={{ width: 44, height: 44, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 24, background: cooling ? 'transparent' : INK, color: cooling ? BRASS : '#f6d35b', border: cooling ? `3px solid ${BRASS}` : undefined, boxSizing: 'border-box' }}>{String.fromCharCode(65 + i)}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: cooling ? TEXT : INK }}>{t(`k.${tg.kind}`)} · {t('phone.row', { n: tg.row })}</span>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>{toggleText(t, tg)}</span>
                <span style={{ fontSize: 13 }}>{cooling ? t('phone.cooldown') : t('phone.tapToFlip')}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Phone>
  );
}

export default { Host, Controller } satisfies GameClientModule;
