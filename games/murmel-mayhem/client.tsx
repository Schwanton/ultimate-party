import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ControllerViewProps, GameClientModule, HostViewProps, PlayerInfo } from '@up/sdk';
import { Confetti, HostTimer, PhoneTimer, PhoneWait, Podium, sfx, useServerNow, useStream, vibrate } from '@up/ui';
import { PALETTE, PATTERNS, drawDesignMarble, mainColor, marbleUrl, tileUrl, type Design } from './muster';

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
  farbweiche: 'weiche', umleitung: 'weiche', wurmloch: 'weiche', kanone: 'weiche',
  beben: 'ereignis', oel: 'ereignis', riese: 'ereignis', tausch: 'ereignis',
};
const HOLE = ['farbweiche', 'umleitung'];
const ICON: Record<string, string> = {
  turbo: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4',
  feder: 'M6 21h12M8 18l8-2-8-2 8-2-8-2 8-2M12 8V3M9 5l3-3 3 3',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4M6 8h4M14 8h4',
  schild: 'M5 18a7 7 0 0 1 14 0zM3 18h18M12 8V5',
  kleber: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z',
  schranke: 'M4 21V7M4 9h17v4H4M9 9l-3 4M14 9l-3 4M19 9l-3 4',
  gegenfeder: 'M4 14a8 8 0 0 1 16 0zM10 14v6h4v-6',
  falltuer: 'M3 9h7M14 9l4 5M4 15l2 6h12l2-6z',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
  bremse: 'M3 10h18M5 10v6M9 10v6M13 10v6M17 10v6M21 10v6',
  farbweiche: 'M3 9h6l4 6M15 9h6M12 3v3',
  umleitung: 'M3 9h6l4 6M15 9h6M12 18v3',
  wurmloch: 'M5 20V9a5 5 0 0 1 10 0v4a3 3 0 0 0 6 0V4',
  kanone: 'M4 18l14-12M14 4l5 1 1 5M4 20h8',
  beben: 'M2 12h4l2-5 3 10 3-8 2 3h6',
  oel: 'M12 4c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9zM4 21h16',
  riese: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M9 8a4 4 0 0 1 3-1',
  tausch: 'M4 8h14l-3-3M20 16H6l3 3',
};

const FLAG = { done: 1, tube: 2, basket: 4, shield: 8, boost: 16, behind: 32, glass: 64 };
const IT = { on: 1, closed: 2, gust: 4, kick: 8 };
const R = 9;
const FALLBACK: Design = { c: 12, c2: 13, p: 'uni' };

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
const DISPLAY = 'Cinzel, Georgia, serif';
const BG = 'radial-gradient(circle at 50% 30%, #3a2716 0, #140d08 75%)';

/** Murmel mit Muster als Bild */
function Marble({ d, size, style }: { d: Design | undefined; size: number; style?: CSSProperties }) {
  return <img src={marbleUrl(d ?? FALLBACK)} alt="" width={size} height={size} style={{ width: size, height: size, flex: 'none', display: 'inline-block', ...style }} />;
}

/** Schrift im Muster der Murmel */
function PatternText({ d, children, size, style }: { d: Design | undefined; children: ReactNode; size: number; style?: CSSProperties }) {
  const dd = d ?? FALLBACK;
  return (
    <span style={{ filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.8)) drop-shadow(0 0 1px rgba(0,0,0,.9))', display: 'inline-block', minWidth: 0, ...style }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, lineHeight: 1.15, backgroundImage: `url(${tileUrl(dd)})`, backgroundSize: `${Math.round(size * 0.9)}px`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextStroke: `1px ${dd.c === 13 ? '#888' : 'rgba(0,0,0,.35)'}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{children}</span>
    </span>
  );
}

/** Messing-Plakette mit Emaille-Rand (Karten und Listen) */
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

/* ================= Bahn ================= */

type Pt = [number, number];
interface Row { i: number; key: string; dir: number; pts: Pt[]; end: string; mid: string | null; wear: number }
interface Geo {
  W: number;
  H: number;
  rows: Row[];
  segs: { ax: number; ay: number; bx: number; by: number; kind: string }[];
  pins: [number, number][];
  wippes: { px: number; py: number; half: number; rest: number }[];
  wheels: { cx: number; cy: number; r: number; hub: number; n: number }[];
  turns: { cx: number; cy: number; r: number; w: number }[];
  drums: { cx: number; cy: number; r: number; w: number; inA: number; outA: number; gap: number }[];
  over: Pt[];
  conv: { x: number; y0: number; y1: number; sp: number; v: number };
  rocker: { px: number; py: number; half: number };
  loop: { cx: number; cy: number; r: number };
  spiral: Pt[];
  sockets: { id: number; x: number; y: number; row: number; hole: boolean }[];
  finish: { x0: number; x1: number; y: number };
  labels: { t: string; x: number; y: number }[];
  marks: { row: number; kind: string }[];
  route: Pt[];
}
interface PubItem { id: number; kind: string; owner: string; x: number; y: number; row: number; dir: number; born: number; on: boolean; toggle: boolean; tube: Pt[] | null; forward: boolean }
type Designs = Record<string, Design>;

function railY(r: Row, x: number) {
  const p = r.pts, d = r.dir;
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

type G2 = CanvasRenderingContext2D;

function line(g: G2, ax: number, ay: number, bx: number, by: number, specs: [string, number, number][]) {
  g.lineCap = 'round';
  for (const [c, w, dy] of specs) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(ax, ay + dy); g.lineTo(bx, by + dy); g.stroke(); }
}
function brassGrad(g: G2, y0: number, y1: number) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, '#f3d38a'); gr.addColorStop(0.5, '#c8963c'); gr.addColorStop(1, '#7a5418');
  return gr;
}
function disc(g: G2, x: number, y: number, r: number) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r * 1.1);
  gr.addColorStop(0, '#fbe7b0'); gr.addColorStop(0.45, '#d4a24a'); gr.addColorStop(1, '#6e4a14');
  return gr;
}
const RAIL: [string, number, number][] = [['#3d270b', 11, 0], ['#c8963c', 7, 0], ['#fbe7b0', 2, -2]];

/** Feste Bahn einmal vorzeichnen: hinten (Hintergrund und Förderband) und vorn (Schienen) */
function renderTrack(geo: Geo, t: (k: string) => string): { back: HTMLCanvasElement; front: HTMLCanvasElement } {
  const back = document.createElement('canvas');
  back.width = geo.W;
  back.height = geo.H;
  let g = back.getContext('2d')!;
  const bg = g.createRadialGradient(geo.W / 2, geo.H * 0.4, 60, geo.W / 2, geo.H * 0.45, geo.W * 0.6);
  bg.addColorStop(0, '#3a2716'); bg.addColorStop(1, '#140d08');
  g.fillStyle = bg; g.fillRect(0, 0, geo.W, geo.H);
  g.strokeStyle = '#e7c27a'; g.globalAlpha = 0.05;
  for (const [cx, cy, r] of [[1060, 120, 80], [300, 420, 60], [900, 760, 70], [200, 1300, 90], [1800, 900, 110], [2100, 1450, 70], [1500, 350, 60], [700, 1600, 80]]) {
    g.lineWidth = r * 0.22; g.setLineDash([r * 0.25, r * 0.2]); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }
  g.setLineDash([]); g.globalAlpha = 1;
  const c = geo.conv;
  for (const dx of [-12, 12]) line(g, c.x + dx, c.y0 + 10, c.x + dx, c.y1 - 10, [['#2a1a0c', 8, 0], ['#8a6424', 4, 0]]);
  g.strokeStyle = '#5a3a12'; g.lineWidth = 3; g.setLineDash([6, 5]);
  g.beginPath(); g.moveTo(c.x, c.y0 + 10); g.lineTo(c.x, c.y1 - 10); g.stroke(); g.setLineDash([]);
  for (const cy of [c.y0 + 10, c.y1 - 10]) { g.fillStyle = disc(g, c.x, cy, 16); g.beginPath(); g.arc(c.x, cy, 16, 0, Math.PI * 2); g.fill(); }

  const front = document.createElement('canvas');
  front.width = geo.W;
  front.height = geo.H;
  g = front.getContext('2d')!;
  // Abnutzung: Delle dunkler, poliert glänzend
  for (const mk of geo.marks) {
    const r = geo.rows[mk.row];
    if (!r) continue;
    const x = (r.pts[0][0] + r.pts[r.pts.length - 1][0]) / 2, y = railY(r, x);
    g.fillStyle = mk.kind === 'delle' ? 'rgba(20,10,4,.6)' : 'rgba(255,246,220,.5)';
    g.beginPath(); g.ellipse(x, y + 18, 70, 6, 0, 0, Math.PI * 2); g.fill();
    g.font = `700 12px ${DISPLAY}`; g.textAlign = 'center';
    g.fillStyle = mk.kind === 'delle' ? '#f0a08f' : '#bfe3ff';
    g.fillText(t(mk.kind === 'delle' ? 'track.delle' : 'track.poliert'), x, y + 40);
  }
  for (const s of geo.segs) {
    if (s.kind === 'glass') line(g, s.ax, s.ay, s.bx, s.by, [['rgba(217,238,252,.55)', 6, 0], ['rgba(255,255,255,.25)', 2, -1]]);
    else if (s.kind === 'frame') line(g, s.ax, s.ay, s.bx, s.by, [['#2a1a0c', 14, 0], ['#6e4a14', 9, 0]]);
    else if (s.kind === 'wall') line(g, s.ax, s.ay, s.bx, s.by, [['#3d270b', 12, 0], ['#a87a30', 8, 0], ['#f3d38a', 2, 0]]);
    else if (s.kind === 'tramp') {
      // Trampolin: rot-weißes Sprungtuch zwischen zwei Federn
      line(g, s.ax, s.ay, s.bx, s.by, [['#3d270b', 9, 0]]);
      const n = 8;
      for (let k = 0; k < n; k++) {
        const f0 = k / n, f1 = (k + 1) / n;
        line(g, s.ax + (s.bx - s.ax) * f0, s.ay + (s.by - s.ay) * f0, s.ax + (s.bx - s.ax) * f1, s.ay + (s.by - s.ay) * f1, [[k % 2 ? '#f4e6c8' : '#d3452f', 5, 0]]);
      }
      for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) { g.strokeStyle = '#a87a30'; g.lineWidth = 2; g.beginPath(); for (let k = 0; k < 5; k++) g.lineTo(x + (k % 2 ? 4 : -4), y + 4 + k * 4); g.stroke(); }
    } else line(g, s.ax, s.ay, s.bx, s.by, RAIL);
  }
  for (const [x, y] of geo.pins) { g.fillStyle = disc(g, x, y, 3.6); g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill(); }
  for (const w of geo.wippes) {
    g.fillStyle = brassGrad(g, w.py, w.py + 30);
    g.beginPath(); g.moveTo(w.px - 12, w.py + 30); g.lineTo(w.px, w.py); g.lineTo(w.px + 12, w.py + 30); g.closePath(); g.fill();
  }
  const lp = geo.loop;
  g.strokeStyle = '#3d270b'; g.lineWidth = 11; g.beginPath(); g.arc(lp.cx, lp.cy, lp.r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#c8963c'; g.lineWidth = 7; g.beginPath(); g.arc(lp.cx, lp.cy, lp.r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#fbe7b0'; g.lineWidth = 2; g.beginPath(); g.arc(lp.cx, lp.cy, lp.r - 2, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
  const rk = geo.rocker;
  g.fillStyle = brassGrad(g, rk.py, rk.py + 30);
  g.beginPath(); g.moveTo(rk.px - 12, rk.py + 30); g.lineTo(rk.px, rk.py); g.lineTo(rk.px + 12, rk.py + 30); g.closePath(); g.fill();
  for (const l of geo.labels) {
    g.globalAlpha = 0.85; g.fillStyle = '#e7c27a'; g.textAlign = 'center';
    g.font = `700 ${l.t === 'ziel' ? 22 : 13}px ${DISPLAY}`;
    g.fillText(t(`track.${l.t}`), l.x, l.y);
  }
  g.globalAlpha = 1;
  return { back, front };
}

interface PartState { flags: number; left: number; flash: number; flashC: string; ang: number; arm: number; h: number }

/** Farbsensor vor dem Teil: leuchtet in der Farbe der Murmel auf */
function drawSensor(g: G2, it: PubItem, geo: Geo, st: PartState, now: number, owner: string) {
  const r = geo.rows[it.row];
  const x = it.x - it.dir * 90, y = railY(r, x) - 40;
  g.strokeStyle = '#7a5418'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x, y + 24); g.stroke();
  g.fillStyle = brassGrad(g, y - 10, y + 10);
  g.fillRect(x - 12, y - 9, 24, 18);
  g.strokeStyle = '#3d270b'; g.lineWidth = 1.5; g.strokeRect(x - 12, y - 9, 24, 18);
  const age = (now - st.flash) / 1000;
  g.fillStyle = age < 0.45 ? st.flashC : '#1d2a33';
  g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill();
  if (age < 0.45) {
    g.globalAlpha = 1 - age / 0.45; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 9 + age * 20, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  }
  g.fillStyle = owner; g.strokeStyle = INK; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x + 14, y - 10, 5, 0, Math.PI * 2); g.fill(); g.stroke();
}

/** Ein Teil als Mechanik zeichnen */
function drawPart(g: G2, it: PubItem, geo: Geo, st: PartState, now: number, owner: string) {
  const r = geo.rows[it.row];
  const { x, dir } = it;
  const y = railY(r, x);
  const kick = st.flags & IT.kick;
  switch (it.kind) {
    case 'turbo': {
      const cy = y - 13 - 24, rr = 16;
      st.ang += (kick ? 0.5 : 0.06) * dir;
      g.fillStyle = disc(g, x, cy, rr); g.beginPath(); g.arc(x, cy, rr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3d270b'; g.lineWidth = 2;
      for (let k = 0; k < 6; k++) { const a = st.ang + (k * Math.PI) / 3; g.beginPath(); g.moveTo(x, cy); g.lineTo(x + Math.cos(a) * rr, cy + Math.sin(a) * rr); g.stroke(); }
      g.strokeStyle = ENAMEL.hilfe; g.lineWidth = 3; g.beginPath(); g.arc(x, cy, rr + 2, 0, Math.PI * 2); g.stroke();
      break;
    }
    case 'feder':
    case 'kanone': {
      const cat = it.kind === 'kanone';
      st.h = kick ? 1 : st.h * 0.85;
      const len = cat ? 36 : 26;
      const ang = -(0.15 + st.h * 1.0) * dir;
      g.save(); g.translate(x - dir * len * 0.5, y - 4); g.rotate(dir > 0 ? -ang : ang);
      line(g, 0, 0, dir * len, 0, [['#3d270b', 9, 0], [cat ? (it.on ? ENAMEL.weiche : '#6b6153') : ENAMEL.hilfe, 5, 0]]);
      if (cat) { g.fillStyle = '#7a5418'; g.beginPath(); g.arc(dir * len, -4, 7, 0, Math.PI); g.fill(); }
      g.restore();
      g.strokeStyle = '#a87a30'; g.lineWidth = 2;
      g.beginPath(); for (let k = 0; k < 5; k++) g.lineTo(x - dir * (len * 0.5 - 4) + (k % 2 ? 4 : -4), y + 2 + k * 3); g.stroke();
      break;
    }
    case 'magnet': {
      const mx = x - dir * 85, my = railY(r, x - dir * 85) - 50;
      g.strokeStyle = '#3d270b'; g.lineWidth = 12; g.lineCap = 'butt';
      g.beginPath(); g.arc(mx, my, 16, Math.PI, 0); g.stroke();
      g.strokeStyle = '#d3452f'; g.lineWidth = 8; g.beginPath(); g.arc(mx, my, 16, Math.PI, Math.PI * 1.5); g.stroke();
      g.strokeStyle = '#3e63dd'; g.beginPath(); g.arc(mx, my, 16, Math.PI * 1.5, 0); g.stroke();
      g.fillStyle = '#c8c8c8'; g.fillRect(mx - 20, my, 8, 8); g.fillRect(mx + 12, my, 8, 8);
      g.strokeStyle = 'rgba(159,215,255,.35)'; g.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const off = ((now / 6 + k * 40) % 120);
        g.beginPath(); g.arc(mx, my + 10, 20 + off * 0.6, 0.2, Math.PI - 0.2); g.stroke();
      }
      g.lineCap = 'round';
      break;
    }
    case 'schild': {
      const cy = y - 34;
      g.fillStyle = 'rgba(159,215,255,.18)'; g.strokeStyle = 'rgba(217,238,252,.75)'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, cy, 14, Math.PI, 0); g.lineTo(x + 14, cy + 6); g.lineTo(x - 14, cy + 6); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = brassGrad(g, cy + 6, cy + 12); g.fillRect(x - 17, cy + 6, 34, 6);
      g.strokeStyle = '#7a5418'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, cy + 12); g.lineTo(x, y - 18); g.stroke();
      if (kick) { g.strokeStyle = '#9fd7ff'; g.lineWidth = 3; g.beginPath(); g.arc(x, y - 13, 16, 0, Math.PI * 2); g.stroke(); }
      break;
    }
    case 'kleber': {
      const left = Math.max(0, st.left) / 5;
      const xa = x - dir * 150;
      g.globalAlpha = 0.25 + 0.7 * left;
      g.strokeStyle = 'rgba(214,150,30,.9)'; g.lineWidth = 3 + 6 * left;
      g.beginPath(); g.moveTo(xa, railY(r, xa) - 5); g.lineTo(x, y - 5); g.stroke();
      g.fillStyle = 'rgba(214,150,30,.9)';
      for (let k = 0; k < 6; k++) { const dx = xa + ((x - xa) * (k + 0.5)) / 6; g.beginPath(); g.ellipse(dx, railY(r, dx) + 6, 3, (4 + (k % 3) * 2) * (0.3 + left), 0, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
      break;
    }
    case 'bremse': {
      const left = Math.max(0, st.left) / 6;
      const xa = x - dir * 140;
      g.strokeStyle = `rgba(150,110,70,${0.3 + 0.6 * left})`; g.lineWidth = 2;
      for (let k = 0; k <= 14; k++) { const bx = xa + ((x - xa) * k) / 14, by = railY(r, bx) - 4; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + dir * 3, by - 8 - 4 * left); g.stroke(); }
      break;
    }
    case 'gegenfeder': {
      const raised = st.left > 0;
      st.h += ((raised ? 1 : 0) - st.h) * 0.2;
      const top = y - 4 - 14 * st.h;
      g.fillStyle = '#7a5418'; g.fillRect(x - 3, top, 6, y - top);
      g.fillStyle = kick ? '#ff8a73' : ENAMEL.falle;
      g.beginPath(); g.arc(x, top, 11, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(x - 4, top - 5, 2.5, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'schranke': {
      st.arm += ((st.flags & IT.closed ? 1 : 0) - st.arm) * 0.2;
      const px = x + dir * 26, py = y - 46;
      g.fillStyle = brassGrad(g, py, y); g.fillRect(px - 4, py, 8, y - py);
      const a = (1 - st.arm) * -1.35 * dir;
      g.save(); g.translate(px, py); g.rotate(a);
      for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? '#f4e6c8' : ENAMEL.falle; g.fillRect(-dir * (k * 8 + 8) - (dir > 0 ? 8 : 0), -3, 8, 6); }
      g.restore();
      break;
    }
    case 'wind': {
      const fx = x, fy = y - 24;
      const gust = st.flags & IT.gust;
      st.ang += gust ? 0.45 : 0.04;
      g.fillStyle = brassGrad(g, fy - 18, fy + 18); g.beginPath(); g.arc(fx, fy, 17, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3d270b'; g.lineWidth = 4;
      for (let k = 0; k < 3; k++) { const a = st.ang + (k * 2 * Math.PI) / 3; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(a) * 14, fy + Math.sin(a) * 14); g.stroke(); }
      if (gust) {
        g.strokeStyle = 'rgba(191,227,255,.4)'; g.lineWidth = 2;
        for (let k = 0; k < 4; k++) { const off = (now * 0.3 + k * 47) % 190; const lx = fx - dir * off; g.beginPath(); g.moveTo(lx, fy - 14 + k * 9); g.lineTo(lx - dir * 26, fy - 14 + k * 9); g.stroke(); }
      }
      break;
    }
    case 'falltuer': {
      const open = kick;
      st.h = open ? 1 : st.h * 0.9;
      g.save(); g.translate(x - 10, y); g.rotate(st.h * 1.2 * dir);
      line(g, 0, 0, 20, 0, [['#3d270b', 8, 0], [ENAMEL.falle, 4, 0]]);
      g.restore();
      g.strokeStyle = '#a87a30'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(x - 16, y + 18); g.lineTo(x - 12, y + 44); g.lineTo(x + 12, y + 44); g.lineTo(x + 16, y + 18); g.stroke();
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - 13 + k * 13, y + 20); g.lineTo(x - 11 + k * 11, y + 44); g.stroke(); }
      line(g, x + dir * 26, y + 46, x + dir * 26, y - 8, [['#7a5418', 3, 0]]);
      break;
    }
    case 'farbweiche':
    case 'umleitung': {
      const rimC = it.kind === 'farbweiche' ? owner : ENAMEL.weiche;
      const allOpen = it.kind === 'umleitung' && it.on;
      g.fillStyle = INK; g.fillRect(x - 22, y - 3, 44, 7);
      g.save(); g.translate(x - dir * 22, y);
      g.rotate((allOpen ? 1.1 : it.kind === 'farbweiche' ? 0.35 : 0) * dir);
      line(g, 0, 0, dir * 44, 0, [['#3d270b', 8, 0], [rimC, 4, 0]]);
      g.restore();
      if (it.kind === 'farbweiche') {
        g.font = `700 11px ${FONT}`; g.textAlign = 'center'; g.fillStyle = it.on ? owner : '#f4e6c8';
        g.fillText(it.on ? '▼' : '✕', x, y + 22);
      }
      break;
    }
    case 'wurmloch': {
      const tube = it.tube;
      if (tube) {
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = 'rgba(191,227,255,.16)'; g.lineWidth = 24;
        g.beginPath(); tube.forEach(([tx, ty], k) => (k ? g.lineTo(tx, ty) : g.moveTo(tx, ty))); g.stroke();
        g.strokeStyle = 'rgba(217,238,252,.5)'; g.lineWidth = 2;
        for (const off of [-11, 11]) { g.beginPath(); tube.forEach(([tx, ty], k) => (k ? g.lineTo(tx + off * 0.7, ty) : g.moveTo(tx + off * 0.7, ty))); g.stroke(); }
        const end = tube[tube.length - 1];
        g.fillStyle = brassGrad(g, end[1] - 8, end[1] + 8); g.beginPath(); g.arc(end[0], end[1], 12, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = brassGrad(g, y - 30, y - 6);
      g.beginPath(); g.ellipse(x, y - 18, 16, 10, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = it.on ? '#0c0805' : '#6b6153';
      g.beginPath(); g.ellipse(x, y - 18, 10, 6, 0, 0, Math.PI * 2); g.fill();
      break;
    }
  }
}

/** Bewegliche Bausteine: Mühlräder, Förderband-Körbe, Kippweiche */
interface Blocks { wh: number[]; cv: number; rk: number; tn?: number[]; dr?: number[] }
function drawWheels(g: G2, geo: Geo, b: Blocks | null, now: number) {
  geo.wheels.forEach((w, k) => {
    const ang = b ? (b.wh[k] ?? 0) / 100 : -now / 900;
    g.fillStyle = disc(g, w.cx, w.cy, w.hub); g.beginPath(); g.arc(w.cx, w.cy, w.hub, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3d270b'; g.lineWidth = 3;
    for (let s = 0; s < w.n; s++) {
      const a = ang + (s + 0.5) * (2 * Math.PI / w.n);
      g.beginPath(); g.moveTo(w.cx + Math.cos(a) * 18, w.cy + Math.sin(a) * 18); g.lineTo(w.cx + Math.cos(a) * (w.r + 12), w.cy + Math.sin(a) * (w.r + 12)); g.stroke();
    }
    g.strokeStyle = '#a87a30'; g.lineWidth = 4; g.beginPath(); g.arc(w.cx, w.cy, w.r + 12, 0, Math.PI * 2); g.stroke();
  });
}
function drawBuckets(g: G2, geo: Geo, b: Blocks | null, now: number) {
  const c = geo.conv;
  const len = c.y0 - c.y1;
  const off = b ? b.cv : ((now / 1000) * c.v) % c.sp;
  g.strokeStyle = '#e7c27a'; g.lineWidth = 2.5;
  for (let s = off; s < len; s += c.sp) {
    const y = c.y0 - s;
    g.beginPath(); g.moveTo(c.x - 11, y - 14); g.lineTo(c.x - 11, y); g.lineTo(c.x + 11, y); g.lineTo(c.x + 11, y - 14); g.stroke();
  }
}
function drawRocker(g: G2, geo: Geo, a: number) {
  const rk = geo.rocker;
  const c = Math.cos(a), s = Math.sin(a);
  line(g, rk.px - c * rk.half, rk.py - s * rk.half, rk.px + c * rk.half, rk.py + s * rk.half, RAIL);
  g.fillStyle = '#3d270b'; g.beginPath(); g.arc(rk.px, rk.py, 4, 0, Math.PI * 2); g.fill();
}
/** Glasröhren (Spirale und Röhre über die Trennwand), Murmeln darin werden zwischen Füllung und Rand gezeichnet */
function drawSpiral(g: G2, geo: Geo, inner?: () => void) {
  const tubes = [geo.spiral, geo.over ?? []].filter((t) => t.length > 1);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(191,227,255,.14)'; g.lineWidth = 26;
  for (const sp of tubes) { g.beginPath(); sp.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
  inner?.();
  g.strokeStyle = 'rgba(217,238,252,.5)'; g.lineWidth = 2;
  for (const sp of tubes) for (const off of [-12, 12]) { g.beginPath(); sp.forEach(([x, y], k) => (k ? g.lineTo(x + off, y) : g.moveTo(x + off, y))); g.stroke(); }
  const sp = geo.spiral;
  g.fillStyle = brassGrad(g, sp[0][1] - 20, sp[0][1] + 20); g.beginPath(); g.ellipse(sp[0][0], sp[0][1] - 2, 22, 10, 0, 0, Math.PI * 2); g.fill();
}

/** Drehkreuze: Messingnabe mit vier Armen */
function drawTurns(g: G2, geo: Geo, b: Blocks | null, now: number) {
  (geo.turns ?? []).forEach((td, k) => {
    const ang = b?.tn ? (b.tn[k] ?? 0) / 100 : (td.w * now) / 1000;
    for (let a = 0; a < 4; a++) {
      const r2 = ang + (a * Math.PI) / 2;
      line(g, td.cx, td.cy, td.cx + Math.cos(r2) * td.r, td.cy + Math.sin(r2) * td.r, [['#3d270b', 8, 0], ['#c8963c', 4, 0]]);
    }
    g.fillStyle = disc(g, td.cx, td.cy, 8); g.beginPath(); g.arc(td.cx, td.cy, 8, 0, Math.PI * 2); g.fill();
  });
}

/** Lotterie-Trommeln: Glasring mit Messingrippen, oben Einwurf, vorn Ausgang */
function drawDrums(g: G2, geo: Geo, b: Blocks | null, now: number, inner?: () => void) {
  (geo.drums ?? []).forEach((dd, k) => {
    const ang = b?.dr ? (b.dr[k] ?? 0) / 100 : (dd.w * now) / 1000;
    g.fillStyle = 'rgba(191,227,255,.08)'; g.beginPath(); g.arc(dd.cx, dd.cy, dd.r, 0, Math.PI * 2); g.fill();
    // Ring mit zwei Öffnungen
    const arcs: [number, number][] = [];
    const gaps = [[dd.inA, 0.5], [dd.outA, dd.gap]].map(([a, w]) => [((a - w) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), w * 2]).sort((x, y) => x[0] - y[0]);
    for (let i = 0; i < gaps.length; i++) {
      const start = gaps[i][0] + gaps[i][1];
      const end = i + 1 < gaps.length ? gaps[i + 1][0] : gaps[0][0] + 2 * Math.PI;
      arcs.push([start, end]);
    }
    for (const [a0, a1] of arcs) {
      g.strokeStyle = '#3d270b'; g.lineWidth = 9; g.beginPath(); g.arc(dd.cx, dd.cy, dd.r + 1.5, a0, a1); g.stroke();
      g.strokeStyle = 'rgba(217,238,252,.75)'; g.lineWidth = 4; g.beginPath(); g.arc(dd.cx, dd.cy, dd.r + 1.5, a0, a1); g.stroke();
    }
    inner?.();
    for (let a = 0; a < 3; a++) {
      const ra = ang + (a * 2 * Math.PI) / 3, c = Math.cos(ra), s = Math.sin(ra);
      line(g, dd.cx + c * (dd.r - 18), dd.cy + s * (dd.r - 18), dd.cx + c * dd.r, dd.cy + s * dd.r, [['#3d270b', 7, 0], ['#c8963c', 3, 0]]);
    }
    g.strokeStyle = 'rgba(200,150,60,.5)'; g.lineWidth = 2;
    for (let a = 0; a < 3; a++) { const ra = ang + (a * 2 * Math.PI) / 3 + Math.PI / 3; g.beginPath(); g.moveTo(dd.cx, dd.cy); g.lineTo(dd.cx + Math.cos(ra) * (dd.r - 6), dd.cy + Math.sin(ra) * (dd.r - 6)); g.stroke(); }
    g.fillStyle = disc(g, dd.cx, dd.cy, 7); g.beginPath(); g.arc(dd.cx, dd.cy, 7, 0, Math.PI * 2); g.fill();
  });
}

/* ================= TV ================= */

function Host(props: HostViewProps) {
  useFonts();
  const { view } = props;
  const inner = (() => {
    switch (view.screen) {
      case 'werkstatt': return <HostWerkstatt {...props} />;
      case 'intro': return <HostIntro {...props} />;
      case 'build':
      case 'reveal':
      case 'umbau': return <HostOverview {...props} />;
      case 'flight': return <HostRace {...props} />;
      case 'race': return <HostRace {...props} />;
      case 'result': return <HostResult {...props} />;
      case 'final': return <HostFinal {...props} />;
    }
    return null;
  })();
  return <div style={{ position: 'absolute', inset: 0, background: INK, color: TEXT, fontFamily: FONT, overflow: 'hidden' }}>{inner}</div>;
}

function useTrackLayer(geo: Geo | undefined, version: number, t: (k: string) => string) {
  return useMemo(() => (geo ? renderTrack(geo, t) : null), [version, !!geo, geo?.H]); // eslint-disable-line react-hooks/exhaustive-deps
}

const blankState = (): PartState => ({ flags: 1, left: 9, flash: -1e9, flashC: '#fff', ang: 0, arm: 0, h: 0 });

function Overview({ geo, version, items, width, height, t, colorOf, highlight, fresh }: {
  geo: Geo; version: number; items: PubItem[]; width: number; height: number; t: (k: string) => string; colorOf: (id: string) => string;
  highlight?: { x: number; y: number } | null; fresh?: { id: number; kind: string; owner: string; x: number; y: number }[];
}) {
  const layer = useTrackLayer(geo, version, t);
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = Math.min(width / geo.W, height / geo.H);
  const w = Math.round(geo.W * scale), h = Math.round(geo.H * scale);
  useEffect(() => {
    const c = ref.current;
    if (!c || !layer) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    g.drawImage(layer.back, 0, 0);
    drawBuckets(g, geo, null, 0);
    g.drawImage(layer.front, 0, 0);
    for (const wd of geo.wippes) line(g, wd.px - Math.cos(wd.rest) * wd.half, wd.py - Math.sin(wd.rest) * wd.half, wd.px + Math.cos(wd.rest) * wd.half, wd.py + Math.sin(wd.rest) * wd.half, RAIL);
    drawWheels(g, geo, null, 0);
    drawTurns(g, geo, null, 0);
    drawDrums(g, geo, null, 0);
    drawRocker(g, geo, 0);
    drawSpiral(g, geo);
    const freshIds = new Set((fresh ?? []).map((f) => f.id));
    for (const it of items) {
      if (freshIds.has(it.id)) continue;
      const own = colorOf(it.owner);
      drawPart(g, it, geo, blankState(), 0, own);
      drawSensor(g, it, geo, blankState(), 0, own);
    }
  }, [layer, items, w, h, scale, fresh, colorOf, geo]);
  return (
    <div style={{ position: 'relative', width: w, height: h, flex: 'none', borderRadius: 14, overflow: 'hidden', boxShadow: `0 0 0 2px ${LINE}` }}>
      <canvas ref={ref} style={{ width: w, height: h, display: 'block' }} />
      {(fresh ?? []).filter((f) => f.id > 0).map((f, k) => (
        <span key={f.id} className="anim-pop" style={{ position: 'absolute', left: f.x * scale - 14, top: f.y * scale - 30, animationDelay: `${0.45 * k}s`, animationFillMode: 'both' }}>
          <Badge kind={f.kind} size={28} owner={colorOf(f.owner)} />
        </span>
      ))}
      {highlight && (
        <span style={{ position: 'absolute', left: highlight.x * scale - 30, top: highlight.y * scale - 30, width: 60, height: 60, borderRadius: '50%', border: `4px solid ${BRASS_L}`, boxShadow: `0 0 24px ${BRASS}`, animation: 'mmPulse 1.2s ease-in-out infinite' }} />
      )}
      <style>{'@keyframes mmPulse { 0%,100% { transform: scale(.85); opacity: .7 } 50% { transform: scale(1.15); opacity: 1 } }'}</style>
    </div>
  );
}

function Title({ size = 30 }: { size?: number }) {
  return <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, color: BRASS, lineHeight: 1.1 }}>Murmel-Mayhem</span>;
}

/** Sich drehende große Murmel (Werkstatt) */
function SpinMarble({ d, size }: { d: Design; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = (n: number) => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== size * dpr) { c.width = size * dpr; c.height = size * dpr; }
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      drawDesignMarble(g, size / 2, size / 2, n / 700, d, size / 2 - 2);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [d, size]);
  return <canvas ref={ref} style={{ width: size, height: size, display: 'block', flex: 'none' }} aria-hidden="true" />;
}

function HostWerkstatt({ view, t, player }: HostViewProps) {
  const ids = view.players as string[];
  const designs = view.designs as Designs;
  const ready = new Set(view.ready as string[]);
  const size = ids.length <= 4 ? 150 : ids.length <= 8 ? 112 : 88;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 18, padding: '34px 56px', background: BG }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Title size={26} />
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 48, color: TEXT }}>{t('werk.title')}</span>
          <span style={{ fontSize: 22, color: MUTED }}>{t('werk.text')}</span>
        </div>
        <HostTimer deadline={view.deadline} duration={view.duration} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 22, alignContent: 'center', justifyContent: 'center' }}>
        {ids.map((id) => {
          const p = player(id);
          const d = designs[id] ?? FALLBACK;
          const done = ready.has(id);
          return (
            <div key={id} style={{ width: size + 70, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 8px', borderRadius: 18, background: done ? 'rgba(233,196,106,.14)' : 'rgba(255,255,255,.04)', border: `1.5px solid ${done ? BRASS : LINE}` }}>
              <SpinMarble d={d} size={size} />
              <PatternText d={d} size={Math.round(size / 4.2)} style={{ maxWidth: size + 56 }}>{p?.name ?? '?'}</PatternText>
              <span style={{ fontSize: 16, fontWeight: 600, color: done ? BRASS_L : DIM }}>{done ? t('werk.done') : t('werk.busy')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HostIntro({ view, t, player }: HostViewProps) {
  const rules = ['intro.r1', 'intro.r2', 'intro.r3', 'intro.r4'];
  const designs = view.designs as Designs;
  const colorOf = (id: string) => mainColor(designs[id]);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 36, padding: '34px 48px', background: BG }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
        <Overview geo={view.geo} version={view.trackV} items={[]} width={640} height={540} t={t} colorOf={colorOf} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, maxWidth: 640 }}>
          {(view.players as string[]).map((id) => (
            <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Marble d={designs[id]} size={26} /><PatternText d={designs[id]} size={17}>{player(id)?.name}</PatternText></span>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center' }}>
        <span className="anim-pop" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 58, color: BRASS, textShadow: '0 4px 0 #6e4a14' }}>{t('title')}</span>
        <p className="anim-up" style={{ fontSize: 22, lineHeight: 1.4, color: TEXT, margin: 0 }}>{t('intro.text', { n: view.perPlayer })}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map((k, i) => (
            <div key={k} className="anim-up" style={{ display: 'flex', gap: 14, alignItems: 'center', animationDelay: `${0.3 + i * 0.25}s` }}>
              <Badge kind={['turbo', 'kleber', 'farbweiche', 'tausch'][i]} size={40} />
              <span style={{ fontSize: 19, color: MUTED, lineHeight: 1.35 }}>{t(k)}</span>
            </div>
          ))}
        </div>
        <p className="anim-up" style={{ fontSize: 18, color: DIM, animationDelay: '1.2s', margin: 0 }}>{t('intro.keep', { cap: view.cap })}</p>
        <p className="anim-up" style={{ fontSize: 17, color: DIM, animationDelay: '1.4s', margin: 0 }}>{t('intro.points', { total: view.total })}</p>
      </div>
    </div>
  );
}

function umbauVars(vars: Record<string, string | number> | undefined, t: (k: string) => string) {
  if (!vars) return undefined;
  const out: Record<string, string | number> = { ...vars };
  if (typeof vars.from === 'string') out.from = t(`end.${vars.from}`);
  if (typeof vars.to === 'string') out.to = t(`end.${vars.to}`);
  return out;
}

function HostOverview({ view, t, player }: HostViewProps) {
  const items = view.items as PubItem[];
  const fresh = view.screen === 'reveal' ? (view.fresh as { id: number; kind: string; owner: string; x: number; y: number; moved: boolean }[]) : undefined;
  const umbau = view.umbau;
  const ids = (view.players ?? []) as string[];
  const designs = (view.designs ?? {}) as Designs;
  const colorOf = useMemo(() => (id: string) => mainColor(designs[id]), [designs]);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 28, padding: '30px 40px', background: BG, alignItems: 'center' }}>
      <Overview geo={view.geo} version={view.trackV} items={items} width={800} height={660} t={t} colorOf={colorOf} fresh={fresh} highlight={view.screen === 'umbau' ? umbau : null} />
      <div style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Title size={24} />
            <span style={{ fontSize: 17, color: MUTED }}>{t('round', { n: view.round, total: view.total })}{view.last ? ` · ${t('lastRound')}` : ''}</span>
          </div>
          {view.screen === 'build' && <HostTimer deadline={view.deadline} duration={view.duration} />}
        </div>
        {view.screen === 'build' && (
          <>
            <h1 style={{ fontFamily: DISPLAY, fontSize: 34, color: TEXT, margin: 0 }}>{t('build.title')}</h1>
            <p style={{ fontSize: 19, color: MUTED, lineHeight: 1.4, margin: 0 }}>{t(view.last ? 'build.textLast' : 'build.text', { cap: view.cap })}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
              {ids.map(player).filter(Boolean).map((p) => {
                const done = (view.ready as string[]).includes(p!.id);
                return (
                  <span key={p!.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 5px', borderRadius: 30, background: done ? 'rgba(233,196,106,.18)' : 'rgba(255,255,255,.04)', border: `1px solid ${done ? BRASS : LINE}` }}>
                    <Marble d={designs[p!.id]} size={30} />
                    <b style={{ fontSize: 16 }}>{p!.name}</b>
                    <span style={{ fontSize: 14, color: done ? BRASS_L : DIM }}>{done ? t('build.done') : t('build.building')}</span>
                  </span>
                );
              })}
            </div>
            {umbau && umbau.key && (
              <p style={{ marginTop: 'auto', fontSize: 17, color: DIM, lineHeight: 1.4 }}>{t('build.changed')} {t(umbau.key, umbauVars(umbau.vars, t))}{umbau.vars?.worn ? ` ${t('umbau.wear', umbauVars(umbau.vars, t))}` : ''}</p>
            )}
          </>
        )}
        {view.screen === 'reveal' && (
          <>
            <h1 style={{ fontFamily: DISPLAY, fontSize: 34, color: TEXT, margin: 0 }}>{t('reveal.title')}</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'hidden' }}>
              {fresh!.map((f, k) => {
                const p = player(f.owner);
                return (
                  <div key={k} className="anim-up" style={{ display: 'flex', alignItems: 'center', gap: 10, animationDelay: `${k * 0.45}s`, animationFillMode: 'both' }}>
                    <Badge kind={f.kind} size={34} owner={colorOf(f.owner)} />
                    <PatternText d={designs[f.owner]} size={17}>{p?.name}</PatternText>
                    <span style={{ fontSize: 18 }}>{t(`k.${f.kind}`)}</span>
                    {f.moved && <span style={{ fontSize: 14, color: DIM }}>{t('reveal.moved')}</span>}
                    {f.id < 0 && <span style={{ fontSize: 14, color: DIM }}>{t('reveal.event')}</span>}
                  </div>
                );
              })}
              {fresh!.length === 0 && <p style={{ fontSize: 19, color: MUTED }}>{t('reveal.none')}</p>}
            </div>
          </>
        )}
        {view.screen === 'umbau' && (
          <>
            <h1 style={{ fontFamily: DISPLAY, fontSize: 34, color: TEXT, margin: 0 }}>{t('umbau.title')}</h1>
            <p className="anim-up" style={{ fontSize: 24, lineHeight: 1.35 }}>{t(umbau.key, umbauVars(umbau.vars, t))}</p>
            {view.wear && <p className="anim-up" style={{ fontSize: 19, color: MUTED, lineHeight: 1.4, animationDelay: '.5s' }}>{t('umbau.wear', { worn: view.wear.worn, polished: view.wear.polished })}</p>}
            <p style={{ fontSize: 17, color: DIM }}>{t('umbau.items')}</p>
          </>
        )}
      </div>
    </div>
  );
}

interface Frame { round: number; t: number; m: number[][]; o: number[]; p: number[]; ow: number[]; it: [number, number, number][]; w: number[]; b: Blocks; fx: (string | number)[][]; g: [number, number, number] | null; q: number; oil: number }
interface Effect { kind: 'ring' | 'text' | 'pop'; x: number; y: number; at: number; color: string; text?: string; sub?: string; r?: number; big?: boolean }

const TW = 1054, TH = 720;

/** Rennen und Kamerafahrt: Kamera folgt dem Feld (links/rechts und oben/unten), die erste Murmel bleibt immer im Bild */
function HostRace({ view, t, player }: HostViewProps) {
  const geo = view.geo as Geo;
  const flight = view.screen === 'flight';
  const layer = useTrackLayer(geo, view.trackV, t);
  const frame = useStream<Frame>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frames = useRef<{ prev: Frame | null; cur: Frame | null; at: number }>({ prev: null, cur: null, at: 0 });
  const cam = useRef({ x: 300, y: 200, s: 0.8, init: false });
  const effects = useRef<Effect[]>([]);
  const banner = useRef<{ text: string; at: number } | null>(null);
  const [bannerText, setBannerText] = useState<{ text: string; key: number } | null>(null);
  const items = view.items as PubItem[];
  const pids = view.players as string[];
  const designs = (view.designs ?? {}) as Designs;
  const ownerDesigns = useMemo(() => pids.map((id) => designs[id] ?? FALLBACK), [pids, designs]);
  const ownerColors = useMemo(() => ownerDesigns.map((d) => mainColor(d)), [ownerDesigns]);
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const freshIds = useMemo(() => new Set((flight ? view.fresh : []) as number[]), [flight, view.fresh]);
  const flightStart = useRef(performance.now());
  const partState = useRef(new Map<number, PartState>());
  const fr = !flight && frame && frame.round === view.round && frame.m.length === view.n ? frame : null;
  const stOf = (id: number) => {
    let s = partState.current.get(id);
    if (!s) { s = blankState(); partState.current.set(id, s); }
    return s;
  };
  const route = geo.route;
  /** Kamerafahrt: geglätteter Weg entlang der Strecke, langsamer bei Teilen (vor allem neuen) und an Anfang und Ende */
  const flightPath = useMemo(() => {
    const cum0 = [0];
    for (let k = 1; k < route.length; k++) cum0.push(cum0[k - 1] + Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]));
    const L0 = cum0[cum0.length - 1] || 1;
    const STEP = 20;
    let pts: Pt[] = [];
    for (let s = 0, k = 1; s <= L0; s += STEP) {
      while (k < route.length - 1 && cum0[k] < s) k++;
      const f = Math.max(0, Math.min(1, (s - cum0[k - 1]) / (cum0[k] - cum0[k - 1] || 1)));
      pts.push([route[k - 1][0] + (route[k][0] - route[k - 1][0]) * f, route[k - 1][1] + (route[k][1] - route[k - 1][1]) * f]);
    }
    // zweimal gleitender Mittelwert über ±300 px: keine Ecken mehr
    for (let pass = 0; pass < 2; pass++) {
      const W2 = 15;
      pts = pts.map((_, i) => {
        let x = 0, y = 0, n = 0;
        for (let j = Math.max(0, i - W2); j <= Math.min(pts.length - 1, i + W2); j++) { x += pts[j][0]; y += pts[j][1]; n++; }
        return [x / n, y / n] as Pt;
      });
    }
    const near = (x: number, y: number) => {
      let best = 0, bd = Infinity;
      pts.forEach(([px, py], i) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = i; } });
      return best * STEP;
    };
    const stops = items.map((it) => ({ s: near(it.x, it.y - 20), w: freshIds.has(it.id) ? 0.75 : 0.45 }));
    const L = (pts.length - 1) * STEP;
    // Zeit je Wegstück aus der Geschwindigkeit, dann umgekehrt: Weg zu jeder Zeit
    const tAt = [0];
    for (let i = 1; i < pts.length; i++) {
      const s = i * STEP;
      let slow = 0;
      for (const st of stops) slow = Math.max(slow, st.w * Math.exp(-(((s - st.s) / 260) ** 2)));
      const ramp = Math.min(1, (s + 150) / 700, (L - s + 150) / 700);
      const v = Math.max(0.12, (1 - slow) * ramp);
      tAt.push(tAt[i - 1] + STEP / v);
    }
    const T = tAt[tAt.length - 1] || 1;
    return { pts, tAt: tAt.map((x) => x / T) };
  }, [route, items, freshIds]);

  useEffect(() => {
    if (flight) {
      flightStart.current = performance.now();
      banner.current = { text: t('flight.banner', { n: view.round }), at: performance.now() };
      setBannerText({ text: banner.current.text, key: banner.current.at });
      sfx.custom((s) => { s.tone(392, 0.25, { type: 'triangle', vol: 0.06 }); s.tone(523, 0.3, { type: 'triangle', vol: 0.06, at: 0.2 }); s.tone(659, 0.45, { type: 'triangle', vol: 0.06, at: 0.4 }); });
    }
  }, [flight]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fr) return;
    const f = frames.current;
    if (f.cur !== fr) { f.prev = f.cur ?? fr; f.cur = fr; f.at = performance.now(); }
    for (const [id, flags, left] of fr.it) { const s = stOf(id); s.flags = flags; s.left = left; }
    const n = performance.now();
    const M = fr.m.length, mult = view.mult ?? 1;
    for (const e of fr.fx) {
      const kind = e[0];
      const it = typeof e[1] === 'number' ? itemById.get(e[1]) : undefined;
      if (kind === 'trap' && it) {
        const p = player(it.owner);
        effects.current.push({ kind: 'ring', x: it.x, y: it.y - 12, at: n, color: '#d3452f', r: 30 });
        effects.current.push({ kind: 'text', x: it.x, y: it.y + 40, at: n, color: '#ff9b88', text: `${t(`k.${it.kind}`)} · ${p?.name ?? ''}` });
        sfx.custom((s) => { s.tone(220, 0.18, { type: 'square', vol: 0.06, to: 110 }); s.noise(0.08, { filter: 900, vol: 0.08 }); });
      } else if (kind === 'help' && it) {
        effects.current.push({ kind: 'ring', x: it.x, y: it.y - 14, at: n, color: '#3fa36b', r: 24 });
        sfx.custom((s) => s.tone(520, 0.14, { type: 'triangle', vol: 0.07, to: 1040 }));
      } else if (kind === 'toggle' && it) {
        effects.current.push({ kind: 'ring', x: it.x, y: it.y - 10, at: n, color: '#e8b923', r: 34 });
        effects.current.push({ kind: 'text', x: it.x, y: it.y - 60, at: n, color: '#f6d35b', text: t('race.flipped', { name: player(it.owner)?.name ?? '' }) });
        sfx.custom((s) => { s.tone(1400, 0.04, { type: 'square', vol: 0.06 }); s.tone(900, 0.05, { type: 'square', vol: 0.05, at: 0.05 }); });
      } else if (kind === 'shield') {
        const m = fr.m[Number(e[1])];
        if (m) effects.current.push({ kind: 'ring', x: m[0], y: m[1], at: n, color: '#9fd7ff', r: 20 });
      } else if (kind === 'loop') {
        const m = fr.m[Number(e[1])];
        if (m && Number(e[2]) === 1) { effects.current.push({ kind: 'text', x: geo.loop.cx, y: geo.loop.cy - 70, at: n, color: '#f6dd9c', text: t('race.loop') }); sfx.custom((s) => s.tone(700, 0.25, { type: 'sine', vol: 0.05, to: 1400 })); }
      } else if (kind === 'finish') {
        const i = Number(e[1]);
        const place = Number(e[2]);
        const pts = ((M - place + 1) * 10 + (place === 1 ? 100 : 0)) * mult;
        const m = fr.m[i];
        effects.current.push({ kind: 'pop', x: m ? m[0] : geo.finish.x0 + 100, y: geo.finish.y - 50, at: n, color: ownerColors[fr.ow[i]] ?? '#fff', text: `+${pts}`, sub: t('race.placeN', { n: place }), big: place === 1 });
        if (place === 1) {
          banner.current = { text: t('race.first', { name: player(pids[fr.ow[i]])?.name ?? '', pts: 100 * mult }), at: n };
          sfx.play('cheer');
        } else sfx.custom((s) => s.tone(1200 + Math.random() * 300, 0.06, { type: 'sine', vol: 0.05 }));
      } else if (kind === 'event') {
        banner.current = { text: t(`ev.${e[1]}`, { name: player(pids[Number(e[2])] ?? '')?.name ?? '' }), at: n };
        sfx.custom((s) => { s.tone(140, 0.6, { type: 'sawtooth', vol: 0.12, to: 70 }); s.noise(0.5, { filter: 400, type: 'lowpass', vol: 0.2 }); });
      } else if (kind === 'kanone') {
        sfx.custom((s) => { s.noise(0.2, { filter: 300, type: 'lowpass', vol: 0.25 }); s.tone(90, 0.25, { type: 'sine', vol: 0.15, to: 40 }); });
      } else if (kind === 'tube') {
        sfx.custom((s) => s.tone(300, 0.35, { type: 'sine', vol: 0.06, to: 900 }));
      } else if (kind === 'gust') {
        sfx.custom((s) => s.noise(0.8, { filter: 900, sweepTo: 400, vol: 0.08 }));
      } else if (kind === 'hit' || kind === 'clack' || kind === 'boing') {
        // Geräusche nur, wenn es im Bild passiert
        const x = Number(e[1]), y = Number(e[2]);
        const cm = cam.current;
        if (Math.abs(x - cm.x) > 800 || Math.abs(y - cm.y) > 500) continue;
        if (kind === 'hit') {
          const str = Number(e[3]) || 3;
          sfx.custom((s) => { s.tone(1700 + Math.random() * 1400, 0.035, { type: 'triangle', vol: Math.min(0.05, 0.007 * str) }); s.noise(0.02, { filter: 5000, type: 'highpass', vol: Math.min(0.04, 0.005 * str) }); });
        } else if (kind === 'clack') {
          sfx.custom((s) => { s.tone(300, 0.07, { type: 'square', vol: 0.035, to: 220 }); s.noise(0.05, { filter: 700, type: 'lowpass', vol: 0.08 }); });
        } else {
          sfx.custom((s) => s.tone(150, 0.28, { type: 'sine', vol: 0.07, to: 430 }));
        }
      } else if (kind === 'giant') {
        effects.current.push({ kind: 'ring', x: Number(e[1]), y: Number(e[2]), at: n, color: '#bbbbbb', r: 50 });
      }
    }
    if (banner.current && n - banner.current.at < 50) setBannerText({ text: banner.current.text, key: banner.current.at });
  }, [fr]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Hintergrund-Geräusche: Rollen je nach Tempo, Rauschen in den Glasröhren, Rattern am Förderband */
  useEffect(() => {
    if (flight) return;
    const id = setInterval(() => {
      const { prev, cur } = frames.current;
      if (!cur || !prev) return;
      const cm = cam.current;
      let n = 0, sum = 0, glass = 0, behind = 0;
      cur.m.forEach((q, i) => {
        const p = prev.m[i] ?? q;
        if (q[3] & FLAG.done || Math.abs(q[0] - cm.x) > 700 || Math.abs(q[1] - cm.y) > 420) return;
        if (q[3] & FLAG.glass) glass++;
        else if (q[3] & FLAG.behind) behind++;
        else { const v = Math.hypot(q[0] - p[0], q[1] - p[1]) * 30; if (v < 2000) { n++; sum += v; } }
      });
      const avg = n ? sum / n : 0;
      sfx.custom((s) => {
        if (n && avg > 40) s.noise(0.27, { filter: 160 + Math.min(900, avg * 0.7), type: 'lowpass', vol: Math.min(0.09, 0.016 * Math.sqrt(n)) * Math.min(1, avg / 350) });
        if (glass) s.noise(0.27, { filter: 2600, type: 'bandpass', vol: 0.012 * Math.min(4, glass) });
        if (behind) { s.tone(95, 0.04, { type: 'square', vol: 0.025 }); s.tone(95, 0.04, { type: 'square', vol: 0.02, at: 0.12 }); }
      });
    }, 220);
    return () => clearInterval(id);
  }, [flight]);

  useEffect(() => {
    if (!bannerText) return;
    const id = setTimeout(() => setBannerText(null), 2600);
    return () => clearTimeout(id);
  }, [bannerText]);

  useEffect(() => {
    let raf = 0;
    const flightAt = (p: number): Pt => {
      const { pts, tAt } = flightPath;
      let lo = 0, hi = tAt.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tAt[mid] < p) lo = mid; else hi = mid; }
      const f = Math.max(0, Math.min(1, (p - tAt[lo]) / (tAt[hi] - tAt[lo] || 1)));
      return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
    };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvasRef.current;
      if (!c || !layer) return;
      const g = c.getContext('2d');
      if (!g) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== TW * dpr) { c.width = TW * dpr; c.height = TH * dpr; }
      const { prev, cur, at } = frames.current;
      const n = performance.now();
      const a = Math.min(1, (n - at) / 34);
      const pos = (i: number): [number, number, number, number] => {
        const q = cur!.m[i], p = prev?.m[i] ?? q;
        const jump = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 120;
        return jump ? [q[0], q[1], q[2] / 100, q[3]] : [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a, q[2] / 100, q[3]];
      };
      // Kamera
      // feste Zoomstufe (kein Rein- und Rauszoomen), Kamera folgt der Spitzengruppe
      const ts = TW / 1250;
      let tx = cam.current.x, ty = cam.current.y;
      let leader: [number, number] | null = null;
      if (flight) {
        const p = Math.min(1, (n - flightStart.current) / ((view.dur ?? 8) * 1000 - 600));
        [tx, ty] = flightAt(p);
      } else if (cur) {
        const live: number[] = [];
        for (const i of cur.o) { const m = cur.m[i]; if (!(m[3] & FLAG.done) && m[1] > -20) live.push(i); }
        if (live.length) {
          const band = live.slice(0, Math.max(1, Math.ceil(live.length * 0.35)));
          tx = 0; ty = 0;
          for (const i of band) { const [x, y] = pos(i); tx += x; ty += y; }
          tx /= band.length; ty /= band.length;
          const [lx, ly] = pos(live[0]);
          leader = [lx, ly];
        } else if (cur.m.length) { tx = (geo.finish.x0 + geo.finish.x1) / 2; ty = geo.finish.y - 120; }
        else { tx = 500; ty = 250; }
      } else { tx = 500; ty = 250; }
      const cm = cam.current;
      if (!cm.init) { cm.x = tx; cm.y = ty; cm.s = ts; cm.init = true; }
      // weich hinterher, aber nie schneller als ein Stück pro Bild
      const k = flight ? 0.1 : 0.035;
      const maxStep = flight ? 40 : 22;
      cm.x += Math.max(-maxStep, Math.min(maxStep, (tx - cm.x) * k));
      cm.y += Math.max(-maxStep, Math.min(maxStep, (ty - cm.y) * k));
      cm.s = ts;
      const vw = TW / cm.s, vh = TH / cm.s;
      let left = Math.max(-20, Math.min(geo.W - vw + 20, cm.x - vw / 2));
      let top = Math.max(-80, Math.min(geo.H - vh + 40, cm.y - vh / 2));
      if (leader) {
        const mx = Math.min(90, vw / 4), my = Math.min(80, vh / 4);
        const nl = Math.min(Math.max(left, leader[0] + mx - vw), leader[0] - mx);
        const nt = Math.min(Math.max(top, leader[1] + my - vh), leader[1] - my);
        cm.x += nl - left; cm.y += nt - top; left = nl; top = nt;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = INK; g.fillRect(0, 0, TW, TH);
      if (cur?.q) g.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      g.scale(cm.s, cm.s);
      g.translate(-left, -top);
      const sx = Math.max(0, Math.floor(left)), sy = Math.max(0, Math.floor(top));
      const sw = Math.min(geo.W - sx, Math.ceil(vw) + 2), sh = Math.min(geo.H - sy, Math.ceil(vh) + 2);
      const blit = (img: HTMLCanvasElement) => { if (sw > 0 && sh > 0) g.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh); };
      blit(layer.back);
      const blocks = cur ? cur.b : null;
      drawBuckets(g, geo, blocks, n);
      const M = cur ? cur.m.length : 0;
      if (cur) for (let i = 0; i < M; i++) {
        const [x, y, ang, f] = pos(i);
        if (f & FLAG.behind) drawDesignMarble(g, x, y, ang, ownerDesigns[cur.ow[i]] ?? FALLBACK, R, 0.9);
      }
      blit(layer.front);
      // Ölpest
      if (cur && cur.oil >= 0) {
        const r = geo.rows[cur.oil];
        if (r) { g.strokeStyle = 'rgba(40,60,90,.55)'; g.lineWidth = 22; g.lineCap = 'round'; g.beginPath(); r.pts.forEach(([x, y], k2) => (k2 ? g.lineTo(x, y - 8) : g.moveTo(x, y - 8))); g.stroke(); }
      }
      geo.wippes.forEach((wd, k2) => {
        const ang = cur ? (cur.w[k2] ?? wd.rest * 100) / 100 : wd.rest;
        line(g, wd.px - Math.cos(ang) * wd.half, wd.py - Math.sin(ang) * wd.half, wd.px + Math.cos(ang) * wd.half, wd.py + Math.sin(ang) * wd.half, RAIL);
        g.fillStyle = '#3d270b'; g.beginPath(); g.arc(wd.px, wd.py, 4, 0, Math.PI * 2); g.fill();
      });
      drawWheels(g, geo, blocks, n);
      drawTurns(g, geo, blocks, n);
      drawDrums(g, geo, blocks, n);
      drawRocker(g, geo, blocks ? blocks.rk / 100 : 0);
      /** Bei der Kamerafahrt führen die Teile vor, was sie tun (Falltür klappt auf, Schlagbaum geht zu …) */
      const demo = (it: PubItem): [PubItem, PartState] => {
        const st = stOf(it.id);
        if (!flight) return [it, st];
        const ph = (n / 2600 + it.id * 0.37) % 1;
        st.flags = (ph < 0.14 ? IT.kick : 0) | (ph > 0.2 && ph < 0.7 ? IT.closed : 0) | (ph > 0.3 && ph < 0.75 ? IT.gust : 0);
        st.left = 6 - Math.floor(ph * 6);
        return [it.toggle ? { ...it, on: ph < 0.5 } : it, st];
      };
      for (const it of items) if (it.kind === 'wurmloch') { const [d, st] = demo(it); drawPart(g, d, geo, st, n, ownerColors[pids.indexOf(it.owner)] ?? '#fff'); }
      // Farbsensoren
      for (const it of items) {
        const r = geo.rows[it.row];
        const st = stOf(it.id);
        if (cur) {
          const sx2 = it.x - it.dir * 90, sy2 = railY(r, sx2) - R - 4;
          for (let i = 0; i < M; i++) {
            const m = cur.m[i];
            if (Math.abs(m[0] - sx2) < 12 && Math.abs(m[1] - sy2) < 20) { st.flash = n; st.flashC = ownerColors[cur.ow[i]] ?? '#fff'; }
          }
        }
        drawSensor(g, it, geo, st, n, ownerColors[pids.indexOf(it.owner)] ?? '#fff');
      }
      if (cur) for (let i = 0; i < M; i++) {
        const [x, y, ang, f] = pos(i);
        if (y < -30 || f & (FLAG.behind | FLAG.glass)) continue;
        const d = ownerDesigns[cur.ow[i]] ?? FALLBACK;
        if (f & FLAG.boost) { g.globalAlpha = 0.3; g.fillStyle = mainColor(d); g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
        drawDesignMarble(g, x, y, ang, d, R, f & FLAG.tube ? 0.85 : 1);
        if (f & FLAG.shield) { g.strokeStyle = 'rgba(159,215,255,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.stroke(); }
      }
      for (const it of items) if (it.kind !== 'wurmloch') { const [d, st] = demo(it); drawPart(g, d, geo, st, n, ownerColors[pids.indexOf(it.owner)] ?? '#fff'); }
      drawSpiral(g, geo, () => {
        if (cur) for (let i = 0; i < M; i++) {
          const [x, y, ang, f] = pos(i);
          if (f & FLAG.glass) drawDesignMarble(g, x, y, ang, ownerDesigns[cur.ow[i]] ?? FALLBACK, R);
        }
      });
      // Kamerafahrt: jedes Teil mit Schild (Name, Erbauer, was es tut); neue leuchten
      if (flight) {
        const boxes: [number, number, number, number][] = [];
        for (const it of items) {
          const fresh = freshIds.has(it.id);
          const col = ownerColors[pids.indexOf(it.owner)] ?? '#fff';
          if (fresh) {
            const pulse = 0.5 + 0.5 * Math.sin(n / 160);
            g.globalAlpha = 0.35 + 0.5 * pulse; g.strokeStyle = col; g.lineWidth = 5;
            g.beginPath(); g.arc(it.x, it.y - 18, 38 + pulse * 8, 0, Math.PI * 2); g.stroke();
            g.globalAlpha = 1;
          }
          const l1 = `${fresh ? `${t('flight.new')} · ` : ''}${t(`k.${it.kind}`)} · ${player(it.owner)?.name ?? ''}`;
          const l2 = t(`d.${it.kind}`);
          g.font = `700 17px ${FONT}`;
          const w1 = g.measureText(l1).width;
          g.font = `500 14px ${FONT}`;
          const w2 = g.measureText(l2).width;
          const bw = Math.max(w1, w2) + 22, bx = it.x - bw / 2;
          // Schilder nicht übereinander: bei Überschneidung eine Etage höher
          let by = it.y - 128;
          for (let tries = 0; tries < 4 && boxes.some(([x, y, w, h]) => bx < x + w && bx + bw > x && by < y + h && by + 46 > y); tries++) by -= 54;
          boxes.push([bx, by, bw, 46]);
          if (by < it.y - 128) { g.strokeStyle = 'rgba(233,196,106,.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(it.x, by + 54); g.lineTo(it.x, it.y - 74); g.stroke(); }
          g.fillStyle = 'rgba(20,13,8,.88)'; g.strokeStyle = fresh ? col : 'rgba(233,196,106,.55)'; g.lineWidth = fresh ? 3 : 1.5;
          g.beginPath(); g.roundRect(bx, by, bw, 46, 9); g.fill(); g.stroke();
          g.beginPath(); g.moveTo(it.x - 7, by + 46); g.lineTo(it.x, by + 54); g.lineTo(it.x + 7, by + 46); g.closePath(); g.fillStyle = fresh ? col : 'rgba(233,196,106,.55)'; g.fill();
          g.textAlign = 'center';
          g.font = `700 17px ${FONT}`; g.fillStyle = fresh ? col : TEXT; g.fillText(l1, it.x, by + 20);
          g.font = `500 14px ${FONT}`; g.fillStyle = MUTED; g.fillText(l2, it.x, by + 38);
        }
      }
      // Krone über der führenden Murmel
      if (leader) {
        const [lx, ly] = leader;
        const bob = Math.sin(n / 180) * 2, cy = ly - 24 + bob;
        g.fillStyle = '#f6dd9c'; g.strokeStyle = '#6e4a14'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(lx - 9, cy + 6); g.lineTo(lx - 9, cy - 3); g.lineTo(lx - 4.5, cy + 2); g.lineTo(lx, cy - 6); g.lineTo(lx + 4.5, cy + 2); g.lineTo(lx + 9, cy - 3); g.lineTo(lx + 9, cy + 6); g.closePath(); g.fill(); g.stroke();
      }
      if (cur?.g) {
        const [gx, gy, ga] = cur.g;
        const gr = g.createRadialGradient(gx - 8, gy - 10, 2, gx, gy, 26);
        gr.addColorStop(0, '#f2f2f2'); gr.addColorStop(0.4, '#9a9a9a'); gr.addColorStop(1, '#3a3a3a');
        g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, 26, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 3; g.beginPath(); g.arc(gx, gy, 15, ga / 100, ga / 100 + 1.4); g.stroke();
      }
      const fs = 1 / Math.max(0.55, cm.s);
      effects.current = effects.current.filter((e) => {
        const age = n - e.at;
        if (e.kind === 'ring') {
          if (age > 700) return false;
          g.globalAlpha = 1 - age / 700; g.strokeStyle = e.color; g.lineWidth = 4;
          g.beginPath(); g.arc(e.x, e.y, (e.r ?? 24) * (0.6 + age / 700), 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
          return true;
        }
        if (e.kind === 'pop') {
          // Punkte springen über dem Ziel auf
          if (age > 2300) return false;
          const s = age < 180 ? 0.4 + (age / 180) * 0.9 : age < 300 ? 1.3 - ((age - 180) / 120) * 0.3 : 1;
          g.save();
          g.globalAlpha = age > 1700 ? Math.max(0, (2300 - age) / 600) : 1;
          g.translate(e.x, e.y - age * 0.035);
          g.scale(s * fs, s * fs);
          g.font = `700 ${e.big ? 34 : 24}px ${DISPLAY}`; g.textAlign = 'center';
          g.lineWidth = 6; g.strokeStyle = INK; g.strokeText(e.text ?? '', 0, 0);
          g.fillStyle = e.color; g.fillText(e.text ?? '', 0, 0);
          g.font = `700 13px ${FONT}`; g.lineWidth = 4;
          g.strokeText(e.sub ?? '', 0, 17); g.fillStyle = TEXT; g.fillText(e.sub ?? '', 0, 17);
          g.restore();
          return true;
        }
        if (age > 1500) return false;
        g.globalAlpha = 1 - age / 1500;
        g.font = `700 ${Math.round(16 * fs)}px ${FONT}`; g.textAlign = 'center';
        g.lineWidth = 5; g.strokeStyle = INK; g.strokeText(e.text ?? '', e.x, e.y - age / 40);
        g.fillStyle = e.color; g.fillText(e.text ?? '', e.x, e.y - age / 40);
        g.globalAlpha = 1;
        return true;
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layer, items, ownerColors, ownerDesigns, geo, flight, freshIds, flightPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const ranking: { pid: string; done: number; owner: number }[] = [];
  if (fr) {
    const seen = new Set<number>();
    for (const i of fr.o) {
      const ow = fr.ow[i];
      if (seen.has(ow)) continue;
      seen.add(ow);
      const p = player(pids[ow]);
      if (p) ranking.push({ pid: p.id, owner: ow, done: fr.m.filter((m, k) => fr.ow[k] === ow && m[3] & FLAG.done).length });
    }
  }
  const barH = 560;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      <div style={{ position: 'relative', width: TW, height: TH }}>
        <canvas ref={canvasRef} style={{ width: TW, height: TH, display: 'block' }} />
        {bannerText && (
          <div key={bannerText.key} className="anim-pop" style={{ position: 'absolute', left: '50%', top: 70, transform: 'translateX(-50%)', padding: '12px 28px', borderRadius: 16, background: 'rgba(20,13,8,.88)', border: `2px solid ${BRASS}`, fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, color: BRASS_L, whiteSpace: 'nowrap', boxShadow: `0 0 30px ${BRASS}55` }}>{bannerText.text}</div>
        )}
      </div>
      <div style={{ width: 1280 - TW, boxSizing: 'border-box', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 12, background: 'linear-gradient(180deg, #2b1d12, #1a110a)', borderLeft: `1px solid ${LINE}` }}>
        <Title size={20} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 15, color: MUTED }}>{t('round', { n: view.round, total: view.total })}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28 }}>{fr ? fmtTime(fr.t) : '0:00'}</span>
        </div>
        {flight ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 17, color: TEXT, lineHeight: 1.35 }}>{t('flight.text')}</span>
            {pids.map((id) => (
              <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Marble d={designs[id]} size={22} /><PatternText d={designs[id]} size={16} style={{ maxWidth: 160 }}>{player(id)?.name}</PatternText></span>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: DIM }}>{t('race.start')}</span>
              <div style={{ position: 'relative', width: 40, height: barH, flex: 'none', borderRadius: 8, background: 'rgba(255,255,255,.04)', border: `1px solid ${LINE}` }}>
                {fr && fr.p.map((p, i) => (
                  <img key={i} src={marbleUrl(ownerDesigns[fr.ow[i]] ?? FALLBACK)} alt="" style={{ position: 'absolute', left: 4 + (i % 3) * 10, top: Math.min(barH - 12, (p / 1000) * barH - 6), width: 12, height: 12, transition: 'top .3s linear' }} />
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
                    <Marble d={ownerDesigns[r.owner]} size={18} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {r.done > 0 && <span style={{ fontSize: 12, color: BRASS_L }}>{r.done}✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Zahl zählt hoch, sobald die Zeile erscheint */
function CountUp({ value, delay, from = 0 }: { value: number; delay: number; from?: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf = 0;
    const id = setTimeout(() => {
      const t0 = performance.now();
      const tick = (n: number) => {
        const f = Math.min(1, (n - t0) / 900);
        setV(Math.round(from + (value - from) * (1 - Math.pow(1 - f, 3))));
        if (f < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(id); cancelAnimationFrame(raf); };
  }, [value, delay, from]);
  return <>{v}</>;
}

/** Punktetafel: wer wie viele Punkte für seine Murmeln bekommt – rechts daneben der Gesamtstand */
function HostResult({ view, t, player }: HostViewProps) {
  const ids = view.players as string[];
  const designs = view.designs as Designs;
  const marbles = view.marbles as [number, number, number][];
  const rows = ids.map((id, k) => ({ id, list: marbles.filter((m) => m[0] === k), sum: view.points[id] ?? 0, trap: view.trapPts[id] ?? 0 })).sort((a, b) => b.sum - a.sum);
  const step = Math.min(0.5, 4 / Math.max(1, rows.length));
  const totalAt = (rows.length - 1) * step + 1.4;
  const total = ids.map((id) => ({ id, before: view.before[id] ?? 0, after: view.after[id] ?? 0 })).sort((a, b) => b.after - a.after);
  const big = rows.length <= 6;
  const rowH = big ? 56 : rows.length <= 9 ? 44 : 36;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 22, padding: '24px 32px', background: BG }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 32, color: BRASS }}>{t('result.title')}</span>
          <span style={{ fontSize: 17, color: MUTED }}>{t('round', { n: view.round, total: view.total })}{view.mult > 1 ? ` · ${t('double')}` : ''}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: big ? 8 : 4 }}>
          {rows.map((r, k) => {
            const d = designs[r.id];
            const delay = (rows.length - 1 - k) * step;
            return (
              <div key={r.id} className="anim-pop" style={{ height: rowH, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: `28px ${big ? 40 : 30}px 170px 1fr 76px`, alignItems: 'center', gap: 10, padding: '0 10px', borderRadius: 12, background: k === 0 ? 'rgba(233,196,106,.12)' : 'rgba(255,255,255,.035)', border: `1px solid ${k === 0 ? BRASS : 'transparent'}`, animationDelay: `${delay}s`, animationFillMode: 'both' }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: big ? 22 : 17, color: BRASS_L }}>{k + 1}.</span>
                <Marble d={d} size={big ? 38 : 28} />
                <PatternText d={d} size={big ? 26 : 20} style={{ maxWidth: 170 }}>{player(r.id)?.name ?? '?'}</PatternText>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, overflow: 'hidden', maxHeight: rowH - 6 }}>
                  {r.list.map(([, place, pts]) => (
                    <span key={place} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, padding: '1px 6px', borderRadius: 7, border: `2px solid ${mainColor(d)}`, fontSize: big ? 14 : 12, color: MUTED, background: place === 1 ? 'rgba(233,196,106,.25)' : 'transparent' }}>
                      {place}.<b style={{ color: TEXT }}>+{pts}</b>
                    </span>
                  ))}
                  {r.trap > 0 && <span style={{ display: 'inline-flex', gap: 3, padding: '1px 6px', borderRadius: 7, border: '2px solid #d3452f', fontSize: big ? 14 : 12, color: '#ff9b88' }}>{t('result.trapChip')}<b>+{r.trap}</b></span>}
                  {r.list.length === 0 && r.trap === 0 && <span style={{ fontSize: 13, color: DIM }}>{t('result.nothing')}</span>}
                </span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: big ? 26 : 20, textAlign: 'right', color: BRASS_L }}>+<CountUp value={r.sum} delay={delay * 1000} /></span>
              </div>
            );
          })}
        </div>
        <span style={{ fontSize: 13.5, color: DIM, textAlign: 'center' }}>{t('result.rule', { mult: view.mult > 1 ? ` ${t('double')}` : '' })}</span>
      </div>
      <div className="anim-up" style={{ width: 330, flex: 'none', display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 14px', borderRadius: 18, background: 'linear-gradient(180deg, #2b1d12, #1a110a)', border: `1.5px solid ${BRASS}`, boxShadow: `0 0 30px ${BRASS}22`, animationDelay: `${totalAt}s`, animationFillMode: 'both' }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, color: BRASS, textAlign: 'center' }}>{t('result.total')}</span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: big ? 8 : 4 }}>
          {total.map((r, k) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: big ? '6px 8px' : '3px 8px', borderRadius: 10, background: k === 0 ? 'rgba(233,196,106,.16)' : 'rgba(255,255,255,.03)' }}>
              <span style={{ width: 24, fontFamily: DISPLAY, fontWeight: 700, fontSize: big ? 20 : 16, color: BRASS_L }}>{k + 1}.</span>
              <Marble d={designs[r.id]} size={big ? 30 : 22} />
              <PatternText d={designs[r.id]} size={big ? 20 : 16} style={{ flex: 1, minWidth: 0 }}>{player(r.id)?.name ?? '?'}</PatternText>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: big ? 22 : 17, color: TEXT }}><CountUp from={r.before} value={r.after} delay={totalAt * 1000 + 400} /></span>
            </div>
          ))}
        </div>
      </div>
      <style>{'@keyframes mmGrow { from { transform: scaleX(0) } }'}</style>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT, color: TEXT, background: BG, margin: '-18px -18px -22px', padding: '18px 16px 22px', minHeight: '100dvh', boxShadow: color ? `inset 0 4px 0 ${color}` : undefined }}>
      {children}
    </div>
  );
}

function TopBar({ me, design, title, right }: { me: PlayerInfo; design: Design | undefined; title: string; right?: ReactNode }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingLeft: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Marble d={design} size={30} />
          <b style={{ fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</b>
        </div>
        {right}
      </div>
      <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 700, fontSize: 23, color: BRASS }}>{title}</h1>
    </>
  );
}

/** Bahn als SVG (Handy) */
function PlanSvg({ geo, scale, children }: { geo: Geo; scale: number; children?: ReactNode }) {
  return (
    <svg width={geo.W * scale} height={geo.H * scale} viewBox={`0 0 ${geo.W} ${geo.H}`} style={{ display: 'block' }}>
      <rect width={geo.W} height={geo.H} fill="#1f150d" />
      <line x1={geo.conv.x} y1={geo.conv.y0} x2={geo.conv.x} y2={geo.conv.y1} stroke="#6e4a14" strokeWidth={22} strokeDasharray="14 10" />
      {geo.segs.map((s, i) => (
        <line key={i} x1={s.ax} y1={s.ay} x2={s.bx} y2={s.by} stroke={s.kind === 'glass' ? '#9fc2d8' : s.kind === 'tramp' ? '#d3452f' : '#c8963c'} strokeWidth={s.kind === 'glass' ? 5 : 11} strokeLinecap="round" opacity={s.kind === 'glass' ? 0.6 : 1} />
      ))}
      {geo.wheels.map((w, i) => <circle key={`w${i}`} cx={w.cx} cy={w.cy} r={w.r + 10} fill="none" stroke="#a87a30" strokeWidth={10} />)}
      {(geo.drums ?? []).map((w, i) => <circle key={`d${i}`} cx={w.cx} cy={w.cy} r={w.r} fill="rgba(191,227,255,.12)" stroke="#9fc2d8" strokeWidth={6} />)}
      {(geo.turns ?? []).map((w, i) => <g key={`t${i}`}><line x1={w.cx - w.r} y1={w.cy} x2={w.cx + w.r} y2={w.cy} stroke="#c8963c" strokeWidth={8} /><line x1={w.cx} y1={w.cy - w.r} x2={w.cx} y2={w.cy + w.r} stroke="#c8963c" strokeWidth={8} /></g>)}
      {(geo.over ?? []).length > 1 && <polyline points={geo.over.map((p) => p.join(',')).join(' ')} fill="none" stroke="#9fc2d8" strokeWidth={20} opacity={0.4} />}
      <circle cx={geo.loop.cx} cy={geo.loop.cy} r={geo.loop.r} fill="none" stroke="#c8963c" strokeWidth={10} />
      <polyline points={geo.spiral.map((p) => p.join(',')).join(' ')} fill="none" stroke="#9fc2d8" strokeWidth={20} opacity={0.4} />
      <rect x={geo.finish.x0} y={geo.finish.y - 40} width={geo.finish.x1 - geo.finish.x0} height={40} fill="rgba(233,196,106,.25)" />
      {children}
    </svg>
  );
}

function Controller(props: ControllerViewProps) {
  const { view, t, me } = props;
  const design = view.design as Design | undefined;
  const color = view.color ?? me.color;
  switch (view.screen) {
    case 'werkstatt':
      return <PhoneWerkstatt {...props} />;
    case 'intro':
      return <Phone color={color}><PhoneWait title={t('title')} text={t('phone.intro', { n: view.perPlayer })} emoji={<Marble d={design} size={96} />} /></Phone>;
    case 'build':
      return view.step === 'remove' ? <PhoneRemove {...props} /> : <PhoneBuild {...props} />;
    case 'race':
      return <PhoneRace {...props} />;
    case 'watch':
      return (
        <Phone color={color}>
          <PhoneWait title={t(view.key)} text={view.mine?.length ? t('phone.yours', { list: view.mine.map((f: { kind: string }) => t(`k.${f.kind}`)).join(', ') }) : t('lookAtTv')} emoji={<Marble d={design} size={96} />} />
        </Phone>
      );
    case 'result':
      return (
        <Phone color={color}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
            {view.place === 1 && <Confetti pieces={14} silent />}
            <Marble d={design} size={86} />
            <PatternText d={design} size={44}>+{view.points}</PatternText>
            <p style={{ fontSize: 18, color: MUTED, margin: 0 }}>{t('phone.finished', { n: view.finished, of: view.of })}</p>
            {view.traps > 0 && <p style={{ fontSize: 17, color: '#ff9b88', margin: 0 }}>{t('phone.traps', { n: view.traps })}</p>}
            <p style={{ fontSize: 17, margin: 0 }}>{t('me.place', { place: view.place, of: view.players })} · {t('me.score', { n: view.score })}</p>
          </div>
        </Phone>
      );
    case 'final':
      return <Phone color={color}><PhoneWait title={t('me.place', { place: view.place, of: view.of })} text={t('me.score', { n: view.score })} emoji={<Marble d={design} size={100} />} /></Phone>;
  }
  return <Phone color={color}><PhoneWait title={t('lookAtTv')} emoji={<Marble d={design} size={96} />} /></Phone>;
}

/** Murmel-Werkstatt: Hauptfarbe, Zweitfarbe und Muster wählen */
function PhoneWerkstatt({ view, t, send, me }: ControllerViewProps) {
  const server = view.design as Design;
  const [d, setD] = useState<Design>(server);
  useEffect(() => setD(server), [server.c, server.c2, server.p]); // eslint-disable-line react-hooks/exhaustive-deps
  const taken = new Set(view.taken as number[]);
  const set = (patch: Partial<Design>) => {
    if (view.ready) return;
    const next = { ...d, ...patch };
    setD(next);
    vibrate(12);
    send({ type: 'design', design: next });
  };
  const swatch = (k: number, active: boolean, disabled: boolean, onClick: () => void, label: string) => (
    <button key={k} type="button" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}
      style={{ width: 40, height: 40, borderRadius: '50%', padding: 0, border: active ? `3px solid ${BRASS_L}` : `2px solid ${INK}`, background: PALETTE[k], boxShadow: active ? `0 0 0 2px ${INK}, 0 0 12px ${BRASS}` : 'none', opacity: disabled ? 0.18 : 1, position: 'relative' }}>
      {disabled && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT, fontWeight: 700 }}>✕</span>}
    </button>
  );
  return (
    <Phone color={PALETTE[d.c]}>
      <TopBar me={me} design={d} title={t('werk.phoneTitle')} right={<PhoneTimer deadline={view.deadline} duration={view.duration} />} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <SpinMarble d={d} size={112} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <PatternText d={d} size={30} style={{ maxWidth: '100%' }}>{me.name}</PatternText>
          <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.3 }}>{t('werk.hint')}</span>
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, color: DIM }}>{t('werk.main')}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PALETTE.map((_, k) => swatch(k, d.c === k, taken.has(k) || view.ready, () => set({ c: k, c2: d.c2 === k ? d.c : d.c2 }), t('werk.colorN', { n: k + 1 })))}
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, color: DIM }}>{t('werk.pattern')}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {PATTERNS.map((p) => (
          <button key={p} type="button" aria-pressed={d.p === p} disabled={view.ready} onClick={() => set({ p })}
            style={{ minHeight: 70, borderRadius: 12, border: d.p === p ? `3px solid ${BRASS_L}` : `1px solid ${LINE}`, background: d.p === p ? 'rgba(233,196,106,.16)' : 'rgba(255,255,255,.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: TEXT, fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>
            <Marble d={{ ...d, p }} size={36} />
            {t(`pat.${p}`)}
          </button>
        ))}
      </div>
      {d.p !== 'uni' && (
        <>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, color: DIM }}>{t('werk.second')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PALETTE.map((_, k) => swatch(k, d.c2 === k, k === d.c || view.ready, () => set({ c2: k }), t('werk.colorN', { n: k + 1 })))}
          </div>
        </>
      )}
      <button type="button" onClick={() => send({ type: 'ready', on: !view.ready })}
        style={{ marginTop: 'auto', minHeight: 54, borderRadius: 12, border: 0, background: view.ready ? 'transparent' : 'linear-gradient(180deg, #f3d38a, #c8963c)', boxShadow: view.ready ? `inset 0 0 0 1px ${DIM}` : '0 3px 0 #6e4a14', color: view.ready ? TEXT : INK, fontFamily: FONT, fontWeight: 700, fontSize: 18 }}>
        {view.ready ? t('werk.change') : t('werk.ready')}
      </button>
    </Phone>
  );
}

/** Vor dem Bauen: welche eigenen Teile sollen weg? */
function PhoneRemove({ view, t, send, me }: ControllerViewProps) {
  const design = view.design as Design;
  const mine = view.mine as { id: number; kind: string; row: number }[];
  const sel = new Set(view.removing as number[]);
  const full = view.room === 0;
  return (
    <Phone color={mainColor(design)}>
      <TopBar me={me} design={design} title={t('phone.build', { n: view.round })} right={<PhoneTimer deadline={view.deadline} duration={view.duration} />} />
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.4 }}>{t(full ? 'rm.full' : 'rm.text', { cap: view.cap, max: view.maxRemove })}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mine.map((it) => {
          const on = sel.has(it.id);
          const blocked = !on && sel.size >= view.maxRemove;
          return (
            <button key={it.id} type="button" aria-pressed={on} disabled={blocked} onClick={() => { vibrate(15); send({ type: 'rmToggle', item: it.id }); }}
              style={{ minHeight: 62, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', borderRadius: 12, border: on ? '3px solid #ff8a73' : `1px solid ${LINE}`, background: on ? 'rgba(211,69,47,.18)' : 'rgba(255,255,255,.04)', color: TEXT, fontFamily: FONT, textAlign: 'left', opacity: blocked ? 0.45 : 1 }}>
              <Badge kind={it.kind} size={42} dim={on} />
              <span style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <b style={{ fontSize: 17, textDecoration: on ? 'line-through' : 'none' }}>{t(`k.${it.kind}`)}</b>
                <span style={{ fontSize: 13, color: MUTED }}>{t('phone.row', { n: it.row })}</span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: on ? '#ff9b88' : DIM }}>{on ? t('rm.goes') : t('rm.stays')}</span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => send({ type: 'rmDone' })}
        style={{ marginTop: 'auto', minHeight: 54, borderRadius: 12, border: 0, background: 'linear-gradient(180deg, #f3d38a, #c8963c)', boxShadow: '0 3px 0 #6e4a14', color: INK, fontFamily: FONT, fontWeight: 700, fontSize: 18 }}>
        {sel.size ? t('rm.confirm', { n: sel.size }) : t('rm.keep')}
      </button>
    </Phone>
  );
}

function PhoneBuild({ view, t, send, me }: ControllerViewProps) {
  const geo = view.geo as Geo;
  const offers = view.offers as string[];
  const placed = view.placed as { card: number; socket: number }[];
  const taken = new Set<number>(view.taken as number[]);
  const [sel, setSel] = useState<number | null>(null);
  const design = view.design as Design;
  const scale = 0.32;
  const scroller = useRef<HTMLDivElement>(null);
  const placedCard = (c: number) => placed.find((p) => p.card === c);
  const placedItems = placed.filter((p) => SORT[offers[p.card]] !== 'ereignis').length;
  const canMore = placed.length < view.max;
  const roomLeft = view.room - placedItems;
  const selKind = sel !== null ? offers[sel] : null;
  const fitsSocket = (s: Geo['sockets'][number]) => {
    if (!selKind || SORT[selKind] === 'ereignis') return false;
    if (taken.has(s.id) || placed.some((p) => p.socket === s.id)) return false;
    if (HOLE.includes(selKind) && !s.hole) return false;
    return true;
  };
  const cardOk = (c: number) => SORT[offers[c]] === 'ereignis' || roomLeft > 0;
  const pickCard = (c: number) => {
    if (view.ready) return;
    if (placedCard(c)) { send({ type: 'unplace', card: c }); setSel(null); return; }
    if (!canMore || !cardOk(c)) return;
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
    <Phone color={mainColor(design)}>
      <TopBar me={me} design={design} title={t('phone.build', { n: view.round })} right={<PhoneTimer deadline={view.deadline} duration={view.duration} />} />
      <div style={{ display: 'flex', gap: 8 }}>
        {offers.map((k, c) => {
          const pl = placedCard(c);
          const active = sel === c;
          const off = !pl && (!canMore || !cardOk(c));
          return (
            <button key={c} type="button" aria-pressed={active} onClick={() => pickCard(c)} disabled={view.ready}
              style={{ flex: 1, minWidth: 0, minHeight: 124, boxSizing: 'border-box', padding: '8px 4px', borderRadius: 12, border: active ? `3px solid ${BRASS_L}` : `1px solid ${pl ? BRASS : LINE}`, background: active ? 'rgba(233,196,106,.16)' : pl ? 'rgba(233,196,106,.08)' : 'rgba(255,255,255,.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontFamily: FONT, color: TEXT, opacity: off ? 0.45 : 1 }}>
              <Badge kind={k} size={44} />
              <span style={{ fontSize: 15, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>{t(`k.${k}`)}</span>
              <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.2, textAlign: 'center' }}>{t(`d.${k}`)}</span>
              {pl ? <span style={{ fontSize: 12, fontWeight: 700, color: BRASS_L }}>{t('phone.placed')}</span> : active ? <span style={{ fontSize: 12, fontWeight: 700, color: INK, background: BRASS_L, borderRadius: 6, padding: '1px 6px' }}>{t('phone.chosen')}</span> : null}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 15, color: MUTED }}>
        {view.ready ? t('phone.readyWait') : sel !== null ? t('phone.pickSocket') : canMore ? (roomLeft > 0 ? t('phone.pickCard', { n: Math.min(view.max - placed.length, roomLeft) }) : t('phone.capFull', { cap: view.cap })) : t('phone.allPlaced')}
      </span>
      <div ref={scroller} style={{ flex: 1, minHeight: 280, maxHeight: 440, overflow: 'auto', borderRadius: 14, border: `2px solid ${LINE}`, WebkitOverflowScrolling: 'touch' }}>
        <PlanSvg geo={geo} scale={scale}>
          {(view.items as { id: number; kind: string; x: number; y: number; mine: boolean }[]).map((it) => (
            <g key={`i${it.id}`} opacity={0.9}>
              <circle cx={it.x} cy={it.y - 20} r={30} fill={ENAMEL[SORT[it.kind]]} stroke={it.mine ? '#fff6dc' : INK} strokeWidth={it.mine ? 8 : 5} />
              <path d={ICON[it.kind]} transform={`translate(${it.x - 18},${it.y - 38}) scale(1.5)`} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
          {geo.sockets.filter((s) => !taken.has(s.id)).map((s) => {
            const mine = placed.find((p) => p.socket === s.id);
            const ok = fitsSocket(s);
            if (mine) {
              const k = offers[mine.card];
              return (
                <g key={s.id} onClick={() => pickCard(mine.card)} style={{ cursor: 'pointer' }}>
                  <circle cx={s.x} cy={s.y - 20} r={36} fill={ENAMEL[SORT[k]]} stroke="#fff6dc" strokeWidth={7} />
                  <path d={ICON[k]} transform={`translate(${s.x - 21},${s.y - 41}) scale(1.75)`} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              );
            }
            return (
              <g key={s.id} onClick={() => ok && pickSocket(s.id)} style={{ cursor: ok ? 'pointer' : 'default' }}>
                <circle cx={s.x} cy={s.y - 20} r={50} fill={ok ? 'rgba(233,196,106,.25)' : 'transparent'} />
                <circle cx={s.x} cy={s.y - 20} r={28} fill="none" stroke={ok ? BRASS_L : '#7a6a50'} strokeWidth={ok ? 8 : 5} strokeDasharray="10 8" opacity={sel === null || ok ? 1 : 0.35} />
              </g>
            );
          })}
        </PlanSvg>
      </div>
      <span style={{ fontSize: 13, color: DIM }}>{t('phone.legend')}</span>
      <button type="button" onClick={() => send({ type: 'ready', on: !view.ready })}
        style={{ minHeight: 54, borderRadius: 12, border: 0, background: view.ready ? 'transparent' : 'linear-gradient(180deg, #f3d38a, #c8963c)', boxShadow: view.ready ? `inset 0 0 0 1px ${DIM}` : '0 3px 0 #6e4a14', color: view.ready ? TEXT : INK, fontFamily: FONT, fontWeight: 700, fontSize: 18 }}>
        {view.ready ? t('phone.unready') : t('phone.ready')}
      </button>
    </Phone>
  );
}

const PHONE_GEO: { geo: Geo | null } = { geo: null };

function toggleText(t: (k: string, v?: Record<string, string | number>) => string, tg: { kind: string; on: boolean; forward: boolean }) {
  if (tg.kind === 'wurmloch') return t(`tg.wurmloch.${tg.on ? 'on' : 'off'}`, { where: t(tg.forward ? 'way.forward' : 'way.back') });
  return t(`tg.${tg.kind}.${tg.on ? 'on' : 'off'}`);
}

function PhoneRace({ view, t, send, me }: ControllerViewProps) {
  const now = useServerNow(200);
  const design = view.design as Design;
  const color = mainColor(design);
  if (view.geo) PHONE_GEO.geo = view.geo;
  const geo = (view.geo ?? PHONE_GEO.geo) as Geo | null;
  const toggles = view.toggles as { id: number; kind: string; on: boolean; row: number; readyAt: number; x: number; y: number; forward: boolean }[];
  const scale = geo ? 340 / geo.W : 0;
  return (
    <Phone color={color}>
      <TopBar me={me} design={design} title={t('phone.race')} />
      {geo && (
        <div style={{ borderRadius: 12, overflow: 'hidden', border: `2px solid ${LINE}`, alignSelf: 'center' }}>
          <PlanSvg geo={geo} scale={scale}>
            {(view.others as [number, number][]).map(([x, y], i) => <circle key={`o${i}`} cx={x} cy={y} r={18} fill="#8a7a66" />)}
            {toggles.map((tg, i) => (
              <g key={`t${tg.id}`}><circle cx={tg.x} cy={tg.y - 20} r={50} fill="#e8b923" stroke={INK} strokeWidth={6} /><text x={tg.x} y={tg.y + 1} fontSize={60} fontWeight={700} textAnchor="middle" fill={INK} fontFamily={FONT}>{String.fromCharCode(65 + i)}</text></g>
            ))}
            {(view.mine as [number, number, number][]).map(([x, y, d], i) => (
              <g key={`m${i}`}>
                <circle cx={x} cy={y} r={56} fill={color} opacity={0.35} />
                <circle cx={x} cy={y} r={30} fill={color} stroke="#fff6dc" strokeWidth={7} opacity={d ? 0.6 : 1} />
              </g>
            ))}
          </PlanSvg>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 13, color: DIM }}>{t('phone.best')}</span><span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 30 }}>{view.place > 0 ? t('phone.placeN', { n: view.place }) : '–'}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: 13, color: DIM }}>{t('phone.inGoal')}</span><span style={{ fontSize: 22, fontWeight: 700 }}>{t('phone.ofN', { n: view.done, of: view.of })}</span></div>
      </div>
      <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.3 }}>{toggles.length ? t('phone.mapHint') : t('phone.noToggles')}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {toggles.map((tg, i) => {
          const cooling = tg.readyAt > now;
          return (
            <button key={tg.id} type="button" disabled={cooling} onClick={() => { vibrate(30); send({ type: 'toggle', item: tg.id }); }}
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
