/**
 * Tank Trouble – Musik und Geräusche (alles mit dem Synthesizer von @up/ui erzeugt).
 * Musik wie bei Wii Play: Marsch-Trommeln als Grundlage, je mehr los ist, desto mehr Instrumente kommen dazu.
 */

import { sfx, type MusicTrack, type SynthApi } from '@up/ui';

/* ---------------- Musik ---------------- */

const CHORDS = [
  [220, 261.63, 329.63], // a-Moll
  [174.61, 220, 261.63], // F-Dur
  [196, 246.94, 293.66], // G-Dur
  [164.81, 207.65, 246.94], // E-Dur
];
const BASS = [110, 87.31, 98, 82.41];
const MELODY = [
  [440, 0, 523.25, 0, 659.25, 587.33, 523.25, 493.88],
  [440, 0, 0, 523.25, 698.46, 0, 659.25, 523.25],
  [493.88, 0, 587.33, 0, 783.99, 698.46, 587.33, 493.88],
  [415.3, 0, 493.88, 0, 659.25, 0, 587.33, 493.88],
];
const MELODY_B = [
  [659.25, 0, 659.25, 698.46, 783.99, 0, 698.46, 659.25],
  [587.33, 0, 523.25, 0, 440, 0, 523.25, 587.33],
  [493.88, 0, 523.25, 587.33, 659.25, 0, 587.33, 523.25],
  [493.88, 0, 0, 0, 415.3, 0, 493.88, 0],
];

export interface MusicState {
  /** 1 = nur Trommeln … 5 = volle Besetzung */
  layers: number;
  /** schneller, wenn es eng wird */
  urgent: boolean;
}

export function battleTrack(state: { current: MusicState }): MusicTrack {
  return {
    bpm: () => (state.current.urgent ? 150 : 138),
    step(s: SynthApi, i: number) {
      const L = state.current.layers;
      const bar = Math.floor(i / 8) % 4;
      const part = Math.floor(i / 32) % 2;
      const k = i % 8;
      // 1: Marsch-Trommel + Bass-Trommel
      if (k === 0 || k === 4) s.tone(95, 0.16, { type: 'sine', vol: 0.42, to: 42 });
      const snare = [0, 0, 1, 0, 0, 1, 1, 1][k] || (bar === 3 && k >= 4);
      if (snare) s.noise(0.09, { filter: 1800, vol: k % 2 ? 0.09 : 0.13 });
      if (L < 2) return;
      // 2: Bass
      const root = BASS[bar];
      s.tone(k % 2 ? root * 2 : root, 0.17, { type: 'sawtooth', vol: 0.07 });
      if (L < 3) return;
      // 3: Arpeggio
      const ch = CHORDS[bar];
      s.tone(ch[[0, 1, 2, 1][k % 4]] * 2, 0.1, { type: 'square', vol: 0.028 });
      if (L < 4) return;
      // 4: Melodie (Trompete)
      const f = (part ? MELODY_B : MELODY)[bar][k];
      if (f) s.tone(f, 0.2, { type: 'triangle', vol: 0.11 });
      if (L < 5) return;
      // 5: Becken und Bläser-Stöße
      s.noise(0.04, { filter: 8000, type: 'highpass', vol: 0.035 });
      if (k === 0) ch.forEach((n) => s.tone(n, 0.28, { type: 'sawtooth', vol: 0.025 }));
    },
  };
}

/* ---------------- Geräusche ---------------- */

export const play = {
  shot: () => sfx.custom((s) => {
    s.tone(950, 0.09, { type: 'square', vol: 0.07, to: 260 });
    s.noise(0.05, { filter: 3500, type: 'highpass', vol: 0.07 });
    s.tone(140, 0.08, { type: 'sine', vol: 0.18, to: 60 });
  }),
  rocket: () => sfx.custom((s) => {
    s.noise(0.32, { filter: 900, sweepTo: 6000, vol: 0.13 });
    s.tone(320, 0.28, { type: 'sawtooth', vol: 0.05, to: 1300 });
    s.tone(120, 0.1, { type: 'sine', vol: 0.2, to: 50 });
  }),
  bounce: () => sfx.custom((s) => {
    s.tone(2400, 0.06, { type: 'triangle', vol: 0.07 });
    s.tone(3600, 0.05, { type: 'sine', vol: 0.04, at: 0.01 });
  }),
  fizzle: () => sfx.custom((s) => {
    s.noise(0.09, { filter: 2600, vol: 0.08 });
    s.tone(600, 0.06, { type: 'square', vol: 0.03, to: 150 });
  }),
  tankHit: () => sfx.custom((s) => {
    s.noise(0.8, { filter: 900, type: 'lowpass', sweepTo: 120, vol: 0.55 });
    s.tone(130, 0.55, { type: 'sine', vol: 0.45, to: 32 });
    s.tone(65, 0.7, { type: 'sawtooth', vol: 0.06, to: 30 });
    for (let i = 0; i < 6; i++) s.noise(0.05, { filter: 1500 + Math.random() * 2500, vol: 0.1, at: 0.12 + i * 0.07 + Math.random() * 0.05 });
  }),
  mineBoom: () => sfx.custom((s) => {
    s.noise(1.1, { filter: 600, type: 'lowpass', sweepTo: 80, vol: 0.7 });
    s.tone(85, 0.9, { type: 'sine', vol: 0.6, to: 25 });
    s.tone(45, 1.0, { type: 'sine', vol: 0.4, at: 0.05, to: 22 });
    for (let i = 0; i < 9; i++) s.noise(0.06, { filter: 1000 + Math.random() * 3000, vol: 0.12, at: 0.15 + i * 0.08 + Math.random() * 0.05 });
  }),
  minePlace: () => sfx.custom((s) => {
    s.tone(180, 0.06, { type: 'square', vol: 0.08 });
    s.tone(1300, 0.07, { type: 'sine', vol: 0.08, at: 0.08 });
  }),
  mineBeep: () => sfx.custom((s) => s.tone(1700, 0.05, { type: 'square', vol: 0.045 })),
  block: () => sfx.custom((s) => {
    s.noise(0.25, { filter: 500, vol: 0.18 });
    for (let i = 0; i < 4; i++) s.tone(300 + Math.random() * 400, 0.05, { type: 'triangle', vol: 0.06, at: 0.04 + i * 0.05 });
  }),
  pickup: () => sfx.custom((s) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => s.tone(f, 0.12, { type: 'triangle', vol: 0.13, at: i * 0.06 }))),
  shieldBreak: () => sfx.custom((s) => {
    s.tone(1800, 0.25, { type: 'sine', vol: 0.12, to: 300 });
    s.noise(0.2, { filter: 5000, type: 'highpass', vol: 0.08 });
  }),
  powerSpawn: () => sfx.custom((s) => {
    s.tone(880, 0.3, { type: 'sine', vol: 0.06, to: 1760 });
    s.tone(1320, 0.25, { type: 'sine', vol: 0.04, at: 0.1, to: 2640 });
  }),
  engine: (n: number) => sfx.custom((s) => {
    s.noise(0.17, { filter: 150, type: 'lowpass', vol: Math.min(0.24, 0.08 + n * 0.03) });
    s.tone(44 + Math.random() * 8, 0.15, { type: 'sawtooth', vol: Math.min(0.05, 0.018 + n * 0.006) });
  }),
  countdown: (n: number) => sfx.custom((s) => {
    s.tone(n > 0 ? 660 : 1320, n > 0 ? 0.16 : 0.5, { type: 'square', vol: 0.12 });
    if (n <= 0) s.tone(660, 0.5, { type: 'triangle', vol: 0.18 });
  }),
  missionIntro: () => sfx.custom((s) => {
    for (let i = 0; i < 16; i++) s.noise(0.06, { filter: 1700, vol: 0.06 + i * 0.006, at: i * 0.07 });
    s.tone(110, 0.4, { type: 'sine', vol: 0.4, at: 1.12, to: 50 });
    [440, 554.37, 659.25].forEach((f) => s.tone(f, 0.6, { type: 'sawtooth', vol: 0.04, at: 1.12 }));
  }),
  clear: () => sfx.custom((s) => {
    const seq: [number, number, number][] = [[523.25, 0, 0.14], [523.25, 0.15, 0.14], [523.25, 0.3, 0.14], [659.25, 0.45, 0.3], [587.33, 0.78, 0.14], [659.25, 0.93, 0.14], [783.99, 1.08, 0.7]];
    seq.forEach(([f, at, d]) => { s.tone(f, d, { type: 'square', vol: 0.09, at }); s.tone(f / 2, d, { type: 'triangle', vol: 0.15, at }); });
    s.tone(98, 0.4, { type: 'sine', vol: 0.4, at: 1.08, to: 45 });
  }),
  fail: () => sfx.custom((s) => {
    [392, 369.99, 349.23, 329.63].forEach((f, i) => s.tone(f, i === 3 ? 0.9 : 0.32, { type: 'sawtooth', vol: 0.08, at: i * 0.34, to: i === 3 ? 280 : undefined }));
  }),
};
