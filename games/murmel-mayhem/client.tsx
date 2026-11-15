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
  farbweiche: 'weiche', umleitung: 'weiche', wurmloch: 'weiche', kanone: 'weiche',
  beben: 'ereignis', oel: 'ereignis', riese: 'ereignis', tausch: 'ereignis',
};
const NOT_LAST = ['farbweiche', 'umleitung'];
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

const FLAG = { done: 1, tube: 2, basket: 4, shield: 8, boost: 16 };
const IT = { on: 1, closed: 2, gust: 4, kick: 8 };
const R = 9;
const WW = 1200;

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

function darken(hex: string, f = 0.45): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return '#222';
  return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
}

function marbleCss(color: string, size: number): CSSProperties {
  return { width: size, height: size, borderRadius: '50%', flex: 'none', display: 'inline-block', background: `radial-gradient(circle at 35% 30%, #ffffff 0, ${color} 28%, ${darken(color)} 100%)` };
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

interface Row { i: number; y0: number; dir: number; xa: number; xb: number; step: number | null; end: string; wear: number }
interface Geo {
  H: number;
  rows: Row[];
  segs: { ax: number; ay: number; bx: number; by: number; kind: string }[];
  pins: [number, number][];
  wippes: { px: number; py: number; half: number; rest: number }[];
  sockets: { id: number; x: number; y: number; row: number }[];
  finish: { x0: number; x1: number; y: number };
  labels: { t: string; x: number; y: number }[];
  marks: { row: number; kind: string }[];
}
interface PubItem { id: number; kind: string; owner: string; x: number; y: number; row: number; dir: number; age: number; on: boolean; toggle: boolean; tube: [number, number][] | null; forward: boolean }

const DROP = 70, STEP_DY = 50;
function railY(r: Row, x: number) {
  const base = r.y0 + ((x - r.xa) / (r.xb - r.xa)) * DROP;
  if (r.step !== null && (r.dir > 0 ? x > r.step : x < r.step)) return base + STEP_DY;
  return base;
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

/** Feste Bahn einmal vorzeichnen */
function renderTrack(geo: Geo, t: (k: string) => string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = WW;
  c.height = geo.H;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(WW / 2, geo.H * 0.35, 40, WW / 2, geo.H * 0.4, geo.H * 0.8);
  bg.addColorStop(0, '#3a2716'); bg.addColorStop(1, '#140d08');
  g.fillStyle = bg; g.fillRect(0, 0, WW, geo.H);
  g.strokeStyle = '#e7c27a'; g.globalAlpha = 0.05;
  for (const [cx, cy, r] of [[1060, 120, 80], [300, 420, 60], [900, 760, 70], [200, 1100, 90], [1000, 1400, 60], [500, 1800, 80], [900, 2200, 70]]) {
    g.lineWidth = r * 0.22; g.setLineDash([r * 0.25, r * 0.2]); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }
  g.setLineDash([]); g.globalAlpha = 1;
  g.fillStyle = 'rgba(122,84,24,.16)';
  for (const r of geo.rows) if (r.i % 2 === 0) g.fillRect(0, r.y0 - 44, WW, 5);
  // Abnutzung: Delle dunkler, poliert glänzend
  for (const mk of geo.marks) {
    const r = geo.rows[mk.row];
    if (!r) continue;
    const x = (r.xa + r.xb) / 2, y = railY(r, x);
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
    else line(g, s.ax, s.ay, s.bx, s.by, RAIL);
  }
  for (const [x, y] of geo.pins) { g.fillStyle = disc(g, x, y, 3.6); g.beginPath(); g.arc(x, y, 3.6, 0, Math.PI * 2); g.fill(); }
  for (const w of geo.wippes) {
    g.fillStyle = brassGrad(g, w.py, w.py + 30);
    g.beginPath(); g.moveTo(w.px - 12, w.py + 30); g.lineTo(w.px, w.py); g.lineTo(w.px + 12, w.py + 30); g.closePath(); g.fill();
  }
  for (const l of geo.labels) {
    g.globalAlpha = 0.85; g.fillStyle = '#e7c27a'; g.textAlign = 'center';
    g.font = `700 ${l.t === 'ziel' ? 18 : 12}px ${DISPLAY}`;
    g.fillText(t(`track.${l.t}`), l.x, l.y);
  }
  g.globalAlpha = 1;
  return c;
}

function drawMarble(g: G2, x: number, y: number, a: number, color: string, r = R, alpha = 1) {
  g.globalAlpha = alpha;
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.28, color); gr.addColorStop(1, darken(color));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.8;
  g.beginPath(); g.arc(x, y, r * 0.58, a, a + 1.3); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.beginPath(); g.arc(x, y, r * 0.58, a + Math.PI, a + Math.PI + 1.3); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.42, r * 0.2, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
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
  const alpha = it.age ? 0.65 : 1;
  g.globalAlpha = alpha;
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
      const mx = x - dir * 85, my = y - 50;
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
      const left = Math.max(0, st.left) / (it.age ? 3 : 5);
      const xa = x - dir * 150;
      g.globalAlpha = alpha * (0.25 + 0.7 * left);
      g.strokeStyle = 'rgba(214,150,30,.9)'; g.lineWidth = 3 + 6 * left;
      g.beginPath(); g.moveTo(xa, railY(r, xa) - 5); g.lineTo(x, y - 5); g.stroke();
      g.fillStyle = 'rgba(214,150,30,.9)';
      for (let k = 0; k < 6; k++) { const dx = xa + ((x - xa) * (k + 0.5)) / 6; g.beginPath(); g.ellipse(dx, railY(r, dx) + 6, 3, (4 + (k % 3) * 2) * (0.3 + left), 0, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'bremse': {
      const left = Math.max(0, st.left) / (it.age ? 3 : 6);
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
      // Klappe in der Schiene, Korb darunter, Aufzugschiene daneben
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
      // Klappe in der Schiene: offen = Murmel fällt auf die Reihe darunter
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

function useTrackLayer(geo: Geo | undefined, version: number, t: (k: string) => string) {
  return useMemo(() => (geo ? renderTrack(geo, t) : null), [version, !!geo]); // eslint-disable-line react-hooks/exhaustive-deps
}

const blankState = (): PartState => ({ flags: 1, left: 9, flash: -1e9, flashC: '#fff', ang: 0, arm: 0, h: 0 });

function Overview({ geo, version, items, height, t, player, highlight, fresh }: {
  geo: Geo; version: number; items: PubItem[]; height: number; t: (k: string) => string; player: (id: string) => PlayerInfo | undefined;
  highlight?: { x: number; y: number } | null; fresh?: { id: number; kind: string; owner: string; x: number; y: number }[];
}) {
  const layer = useTrackLayer(geo, version, t);
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = height / geo.H;
  const w = Math.round(WW * scale);
  useEffect(() => {
    const c = ref.current;
    if (!c || !layer) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d')!;
    g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    g.drawImage(layer, 0, 0);
    for (const wd of geo.wippes) line(g, wd.px - Math.cos(wd.rest) * wd.half, wd.py - Math.sin(wd.rest) * wd.half, wd.px + Math.cos(wd.rest) * wd.half, wd.py + Math.sin(wd.rest) * wd.half, RAIL);
    const freshIds = new Set((fresh ?? []).map((f) => f.id));
    for (const it of items) {
      if (freshIds.has(it.id)) continue;
      const own = player(it.owner)?.color ?? '#fff';
      drawPart(g, it, geo, blankState(), 0, own);
      drawSensor(g, it, geo, blankState(), 0, own);
    }
  }, [layer, items, height, w, scale, fresh, player, geo]);
  return (
    <div style={{ position: 'relative', width: w, height, flex: 'none', borderRadius: 14, overflow: 'hidden', boxShadow: `0 0 0 2px ${LINE}` }}>
      <canvas ref={ref} style={{ width: w, height, display: 'block' }} />
      {(fresh ?? []).filter((f) => f.id > 0).map((f, k) => (
        <span key={f.id} className="anim-pop" style={{ position: 'absolute', left: f.x * scale - 16, top: f.y * scale - 34, animationDelay: `${0.45 * k}s`, animationFillMode: 'both' }}>
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
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 34, padding: '34px 56px', background: BG }}>
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
              {ids.map(player).filter(Boolean).map((p) => {
                const done = (view.ready as string[]).includes(p!.id);
                return (
                  <span key={p!.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px', borderRadius: 30, background: done ? 'rgba(233,196,106,.18)' : 'rgba(255,255,255,.04)', border: `1px solid ${done ? BRASS : LINE}` }}>
                    <span style={{ borderRadius: '50%', boxShadow: `0 0 0 3px ${p!.color}` }}><Avatar player={p!} size={34} /></span>
                    <b style={{ fontSize: 17 }}>{p!.name}</b>
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
      </div>
    </div>
  );
}

interface Frame { round: number; t: number; m: number[][]; o: number[]; p: number[]; ow: number[]; it: [number, number, number][]; w: number[]; fx: (string | number)[][]; g: [number, number, number] | null; q: number; oil: number }
interface Effect { kind: 'ring' | 'text'; x: number; y: number; at: number; color: string; text?: string; r?: number }

function HostRace({ view, t, player }: HostViewProps) {
  const geo = view.geo as Geo;
  const layer = useTrackLayer(geo, view.trackV, t);
  const frame = useStream<Frame>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frames = useRef<{ prev: Frame | null; cur: Frame | null; at: number }>({ prev: null, cur: null, at: 0 });
  const cam = useRef({ y: 300, h: 900, init: false });
  const effects = useRef<Effect[]>([]);
  const banner = useRef<{ text: string; at: number } | null>(null);
  const [bannerText, setBannerText] = useState<{ text: string; key: number } | null>(null);
  const [edge, setEdge] = useState<[number, number]>([0, 0]);
  const items = view.items as PubItem[];
  const pids = view.players as string[];
  const ownerColors = useMemo(() => pids.map((id) => player(id)?.color ?? '#ffffff'), [pids, player]);
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const partState = useRef(new Map<number, PartState>());
  const W = 1054, H = 720;
  const fr = frame && frame.round === view.round && frame.m.length === view.n ? frame : null;
  const stOf = (id: number) => {
    let s = partState.current.get(id);
    if (!s) { s = blankState(); partState.current.set(id, s); }
    return s;
  };

  useEffect(() => {
    if (!fr) return;
    const f = frames.current;
    if (f.cur !== fr) { f.prev = f.cur ?? fr; f.cur = fr; f.at = performance.now(); }
    for (const [id, flags, left] of fr.it) { const s = stOf(id); s.flags = flags; s.left = left; }
    const n = performance.now();
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
      } else if (kind === 'finish') {
        const i = Number(e[1]);
        if (Number(e[2]) === 1) {
          banner.current = { text: t('race.first', { name: player(pids[fr.ow[i]])?.name ?? '' }), at: n };
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
      }
    }
    if (banner.current && n - banner.current.at < 50) setBannerText({ text: banner.current.text, key: banner.current.at });
  }, [fr]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bannerText) return;
    const id = setTimeout(() => setBannerText(null), 2600);
    return () => clearTimeout(id);
  }, [bannerText]);

  useEffect(() => {
    let raf = 0;
    let lastEdge = '';
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvasRef.current;
      if (!c || !layer) return;
      const g = c.getContext('2d');
      if (!g) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
      const { prev, cur, at } = frames.current;
      const n = performance.now();
      const a = Math.min(1, (n - at) / 34);
      const pos = (i: number): [number, number, number, number] => {
        const q = cur!.m[i], p = prev?.m[i] ?? q;
        const jump = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 120;
        return jump ? [q[0], q[1], q[2] / 100, q[3]] : [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a, q[2] / 100, q[3]];
      };
      // Kamera folgt der Mitte des Feldes
      let targetY = 300, targetH = 900;
      if (cur) {
        const live = cur.m.map((m, i) => [m[1], m[3], i]).filter(([y, f]) => !(f & FLAG.done) && y > -20).sort((p, q) => p[0] - q[0]);
        if (live.length) {
          const lo = live[Math.floor(live.length * 0.15)][0], hi = live[Math.max(0, Math.ceil(live.length * 0.85) - 1)][0];
          targetY = (lo + hi) / 2;
          targetH = Math.max(900, Math.min(1500, hi - lo + 380));
        } else targetY = geo.H - 300;
      }
      const cm = cam.current;
      if (!cm.init && cur) { cm.y = targetY; cm.h = targetH; cm.init = true; }
      cm.y += (targetY - cm.y) * 0.04;
      cm.h += (targetH - cm.h) * 0.02;
      const scale = Math.min(W / WW, H / cm.h);
      const viewH = H / scale;
      const top = Math.max(-60, Math.min(geo.H - viewH + 40, cm.y - viewH / 2));
      const ox = (W - WW * scale) / 2;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = INK; g.fillRect(0, 0, W, H);
      if (cur?.q) g.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      g.translate(ox, -top * scale);
      g.scale(scale, scale);
      const sy = Math.max(0, top), sh = Math.min(geo.H - sy, viewH + 2);
      g.drawImage(layer, 0, sy, WW, sh, 0, sy, WW, sh);
      // Ölpest
      if (cur && cur.oil >= 0) {
        const r = geo.rows[cur.oil];
        if (r) { g.strokeStyle = 'rgba(40,60,90,.55)'; g.lineWidth = 22; g.lineCap = 'round'; g.beginPath(); g.moveTo(r.xa, railY(r, r.xa) - 8); g.lineTo(r.xb, railY(r, r.xb) - 8); g.stroke(); }
      }
      // Wippen
      geo.wippes.forEach((wd, k) => {
        const ang = cur ? (cur.w[k] ?? wd.rest * 100) / 100 : wd.rest;
        line(g, wd.px - Math.cos(ang) * wd.half, wd.py - Math.sin(ang) * wd.half, wd.px + Math.cos(ang) * wd.half, wd.py + Math.sin(ang) * wd.half, RAIL);
        g.fillStyle = '#3d270b'; g.beginPath(); g.arc(wd.px, wd.py, 4, 0, Math.PI * 2); g.fill();
      });
      // Röhren und Teile hinter den Murmeln
      for (const it of items) if (it.kind === 'wurmloch') drawPart(g, it, geo, stOf(it.id), n, ownerColors[pids.indexOf(it.owner)] ?? '#fff');
      if (!cur) return;
      const M = cur.m.length;
      // Farbsensoren: leuchten auf, wenn eine Murmel darunter durchrollt
      for (const it of items) {
        const r = geo.rows[it.row];
        const sx = it.x - it.dir * 90, sy2 = railY(r, sx) - R - 4;
        const st = stOf(it.id);
        for (let i = 0; i < M; i++) {
          const m = cur.m[i];
          if (Math.abs(m[0] - sx) < 12 && Math.abs(m[1] - sy2) < 20) { st.flash = n; st.flashC = ownerColors[cur.ow[i]] ?? '#fff'; }
        }
        drawSensor(g, it, geo, st, n, ownerColors[pids.indexOf(it.owner)] ?? '#fff');
      }
      for (let i = 0; i < M; i++) {
        const [x, y, ang, f] = pos(i);
        if (y < -30) continue;
        const col = ownerColors[cur.ow[i]] ?? '#fff';
        if (f & FLAG.boost) { g.globalAlpha = 0.3; g.fillStyle = col; g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
        drawMarble(g, x, y, ang, col, R, f & FLAG.tube ? 0.85 : 1);
        if (f & FLAG.shield) { g.strokeStyle = 'rgba(159,215,255,.8)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.stroke(); }
      }
      // führende Murmel jeder Farbe: heller Ring
      const seen = new Set<number>();
      for (const i of cur.o) {
        const ow = cur.ow[i];
        if (seen.has(ow)) continue;
        seen.add(ow);
        const [x, y, , f] = pos(i);
        if (f & FLAG.done) continue;
        g.strokeStyle = '#fff6dc'; g.lineWidth = 1.5; g.globalAlpha = 0.9;
        g.beginPath(); g.arc(x, y, 12.5, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
      for (const it of items) if (it.kind !== 'wurmloch') drawPart(g, it, geo, stOf(it.id), n, ownerColors[pids.indexOf(it.owner)] ?? '#fff');
      if (cur.g) {
        const [gx, gy, ga] = cur.g;
        const gr = g.createRadialGradient(gx - 8, gy - 10, 2, gx, gy, 26);
        gr.addColorStop(0, '#f2f2f2'); gr.addColorStop(0.4, '#9a9a9a'); gr.addColorStop(1, '#3a3a3a');
        g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, 26, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 3; g.beginPath(); g.arc(gx, gy, 15, ga / 100, ga / 100 + 1.4); g.stroke();
      }
      effects.current = effects.current.filter((e) => {
        const age = n - e.at;
        if (e.kind === 'ring') {
          if (age > 700) return false;
          g.globalAlpha = 1 - age / 700; g.strokeStyle = e.color; g.lineWidth = 4;
          g.beginPath(); g.arc(e.x, e.y, (e.r ?? 24) * (0.6 + age / 700), 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
          return true;
        }
        if (age > 1500) return false;
        g.globalAlpha = 1 - age / 1500;
        g.font = `700 ${Math.round(16 / Math.max(0.6, scale))}px ${FONT}`; g.textAlign = 'center';
        g.lineWidth = 5; g.strokeStyle = INK; g.strokeText(e.text ?? '', e.x, e.y - age / 40);
        g.fillStyle = e.color; g.fillText(e.text ?? '', e.x, e.y - age / 40);
        g.globalAlpha = 1;
        return true;
      });
      let above = 0, below = 0;
      for (let i = 0; i < M; i++) {
        const m = cur.m[i];
        if (m[3] & FLAG.done || m[1] < -20) continue;
        if (m[1] < top + 20) above++;
        else if (m[1] > top + viewH - 20) below++;
      }
      const key = `${above},${below}`;
      if (key !== lastEdge) { lastEdge = key; setEdge([above, below]); }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layer, items, ownerColors, geo]); // eslint-disable-line react-hooks/exhaustive-deps

  const ranking: { pid: string; color: string; done: number }[] = [];
  if (fr) {
    const seen = new Set<number>();
    for (const i of fr.o) {
      const ow = fr.ow[i];
      if (seen.has(ow)) continue;
      seen.add(ow);
      const p = player(pids[ow]);
      if (p) ranking.push({ pid: p.id, color: p.color, done: fr.m.filter((m, k) => fr.ow[k] === ow && m[3] & FLAG.done).length });
    }
  }
  const barH = 560;
  const cm = cam.current;
  const vis = fr ? { top: Math.max(0, (cm.y - cm.h / 2) / geo.H), h: cm.h / geo.H } : null;
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
                <span key={i} style={{ position: 'absolute', left: 6 + (i % 3) * 10, top: Math.min(barH - 10, (p / 1000) * barH - 5), ...marbleCss(ownerColors[fr.ow[i]] ?? '#fff', 10), transition: 'top .3s linear' }} />
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
  return <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', [top ? 'top' : 'bottom']: 12, padding: '5px 16px', borderRadius: 16, background: 'rgba(20,13,8,.85)', border: `1.5px solid ${BRASS}`, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>;
}

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT, color: TEXT, background: BG, margin: '-18px -18px -22px', padding: '18px 16px 22px', minHeight: '100dvh', boxShadow: color ? `inset 0 4px 0 ${color}` : undefined }}>
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

/** Bahn als SVG (Handy) */
function PlanSvg({ geo, scale, children }: { geo: Geo; scale: number; children?: ReactNode }) {
  return (
    <svg width={WW * scale} height={geo.H * scale} viewBox={`0 0 ${WW} ${geo.H}`} style={{ display: 'block' }}>
      <rect width={WW} height={geo.H} fill="#1f150d" />
      {geo.segs.map((s, i) => (
        <line key={i} x1={s.ax} y1={s.ay} x2={s.bx} y2={s.by} stroke={s.kind === 'glass' ? '#9fc2d8' : '#c8963c'} strokeWidth={s.kind === 'glass' ? 5 : 11} strokeLinecap="round" opacity={s.kind === 'glass' ? 0.6 : 1} />
      ))}
      <rect x={geo.finish.x0} y={geo.finish.y - 40} width={geo.finish.x1 - geo.finish.x0} height={40} fill="rgba(233,196,106,.15)" />
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
    if (NOT_LAST.includes(selKind) && s.row >= view.lastRow) return false;
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
              <span style={{ fontSize: 15, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>{t(`k.${k}`)}</span>
              <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.2, textAlign: 'center' }}>{t(`d.${k}`)}</span>
              {pl ? <span style={{ fontSize: 12, fontWeight: 700, color: BRASS_L }}>{t('phone.placed')}</span> : active ? <span style={{ fontSize: 12, fontWeight: 700, color: INK, background: BRASS_L, borderRadius: 6, padding: '1px 6px' }}>{t('phone.chosen')}</span> : null}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 15, color: MUTED }}>
        {view.ready ? t('phone.readyWait') : sel !== null ? t('phone.pickSocket') : canMore ? t('phone.pickCard', { n: view.max - placed.length }) : t('phone.allPlaced')}
      </span>
      <div style={{ flex: 1, minHeight: 280, maxHeight: 440, overflow: 'auto', borderRadius: 14, border: `2px solid ${LINE}`, WebkitOverflowScrolling: 'touch' }}>
        <PlanSvg geo={geo} scale={scale}>
          {(view.items as { id: number; kind: string; x: number; y: number; mine: boolean; age: number }[]).map((it) => (
            <g key={`i${it.id}`} opacity={it.age ? 0.5 : 0.9}>
              <circle cx={it.x} cy={it.y - 20} r={28} fill={ENAMEL[SORT[it.kind]]} stroke={it.mine ? '#fff6dc' : INK} strokeWidth={5} />
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
                  <circle cx={s.x} cy={s.y - 20} r={34} fill={ENAMEL[SORT[k]]} stroke="#fff6dc" strokeWidth={6} />
                  <path d={ICON[k]} transform={`translate(${s.x - 21},${s.y - 41}) scale(1.75)`} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              );
            }
            return (
              <g key={s.id} onClick={() => ok && pickSocket(s.id)} style={{ cursor: ok ? 'pointer' : 'default' }}>
                <circle cx={s.x} cy={s.y - 20} r={44} fill={ok ? 'rgba(233,196,106,.22)' : 'transparent'} />
                <circle cx={s.x} cy={s.y - 20} r={26} fill="none" stroke={ok ? BRASS_L : '#7a6a50'} strokeWidth={ok ? 7 : 4} strokeDasharray="10 8" opacity={sel === null || ok ? 1 : 0.35} />
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
  const color = view.color ?? me.color;
  if (view.geo) PHONE_GEO.geo = view.geo;
  const geo = (view.geo ?? PHONE_GEO.geo) as Geo | null;
  const toggles = view.toggles as { id: number; kind: string; on: boolean; row: number; readyAt: number; x: number; y: number; forward: boolean }[];
  const scale = geo ? 360 / geo.H : 0;
  return (
    <Phone color={color}>
      <TopBar me={me} color={color} title={t('phone.race')} />
      <div style={{ display: 'flex', gap: 12 }}>
        {geo && (
          <div style={{ borderRadius: 12, overflow: 'hidden', border: `2px solid ${LINE}`, flex: 'none' }}>
            <PlanSvg geo={geo} scale={scale}>
              {(view.others as [number, number][]).map(([x, y], i) => <circle key={`o${i}`} cx={x} cy={y} r={16} fill="#8a7a66" />)}
              {toggles.map((tg, i) => (
                <g key={`t${tg.id}`}><circle cx={tg.x} cy={tg.y - 20} r={44} fill="#e8b923" stroke={INK} strokeWidth={5} /><text x={tg.x} y={tg.y - 2} fontSize={52} fontWeight={700} textAnchor="middle" fill={INK} fontFamily={FONT}>{String.fromCharCode(65 + i)}</text></g>
              ))}
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
