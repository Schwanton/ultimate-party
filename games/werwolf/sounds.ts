/**
 * Werwolf-Klänge (nur auf dem TV). Erst wird eine Sound-Datei aus games/werwolf/klaenge/ versucht,
 * fehlt sie, gibt es einen selbst erzeugten Ersatzklang.
 */

import { sfx } from '@up/ui';

type Synth = Parameters<Parameters<typeof sfx.custom>[0]>[0];

const FILES: Record<string, string> = {
  rooster: 'hahn', owl: 'eule', crickets: 'grillen', bell: 'glocke', howl: 'heulen', drumroll: 'trommelwirbel', heartbeat: 'herzschlag', page: 'seite',
};

const SYNTH: Record<string, (s: Synth) => void> = {
  rooster: (s) => {
    s.tone(620, 0.18, { type: 'sawtooth', vol: 0.06, to: 900 });
    s.tone(900, 0.5, { type: 'sawtooth', vol: 0.06, at: 0.18, to: 700 });
  },
  bell: (s) => {
    s.tone(523, 1.8, { type: 'sine', vol: 0.22 });
    s.tone(1046, 1.2, { type: 'sine', vol: 0.08 });
    s.tone(659, 1.5, { type: 'sine', vol: 0.1, at: 0.02 });
  },
  howl: (s) => {
    s.tone(330, 0.6, { type: 'sine', vol: 0.12, to: 620, attack: 0.2 });
    s.tone(620, 1.6, { type: 'sine', vol: 0.12, at: 0.6, to: 440 });
  },
  owl: (s) => {
    s.tone(420, 0.35, { type: 'sine', vol: 0.08, to: 380, attack: 0.05 });
    s.tone(400, 0.5, { type: 'sine', vol: 0.08, at: 0.5, to: 360, attack: 0.05 });
  },
  crickets: (s) => {
    for (let i = 0; i < 6; i++) s.tone(4200, 0.03, { type: 'square', vol: 0.012, at: i * 0.06 });
  },
  heartbeat: (s) => {
    s.tone(60, 0.12, { vol: 0.35, to: 40 });
    s.tone(55, 0.12, { vol: 0.25, to: 38, at: 0.22 });
  },
  page: (s) => s.noise(0.2, { filter: 2400, type: 'bandpass', sweepTo: 900, vol: 0.08 }),
};

const cache = new Map<string, Promise<AudioBuffer | null> | AudioBuffer | null>();

/** Datei laden (einmal), null wenn sie fehlt */
function load(name: string): Promise<AudioBuffer | null> | AudioBuffer | null {
  const file = FILES[name];
  if (!file) return null;
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const p = sfx.loadSample(`/game/werwolf/klaenge/${file}.mp3`).then((b) => {
    cache.set(name, b);
    return b;
  });
  cache.set(name, p);
  return p;
}

export function play(name: string, vol = 1) {
  if (name === 'pop' || name === 'fanfare') return sfx.play(name, { always: true });
  const b = load(name);
  if (b && !(b instanceof Promise)) return sfx.playSample(b, vol);
  if (b instanceof Promise) {
    void b.then((buf) => (buf ? sfx.playSample(buf, vol) : fallback(name)));
    return;
  }
  fallback(name);
}

function fallback(name: string) {
  if (name === 'drumroll') return sfx.play('drumroll', { always: true });
  const f = SYNTH[name];
  if (f) sfx.custom(f);
}

let ambience: ReturnType<typeof setInterval> | null = null;

/** Nachts: Grillen und ab und zu eine Eule */
export function startNightAmbience() {
  if (ambience) return;
  let k = 0;
  const tick = () => {
    k++;
    play('crickets', 0.45);
    if (k % 3 === 2) play('owl', 0.6);
  };
  tick();
  ambience = setInterval(tick, 5200);
}

/** Herzschlag in den letzten 15 Sekunden (Diskussion und Abstimmung) */
export function heartbeatIfClose(left: number) {
  if (left > 0 && left <= 15000) play('heartbeat', left <= 6000 ? 0.9 : 0.6);
}

export function stopAmbience() {
  if (ambience) clearInterval(ambience);
  ambience = null;
}
