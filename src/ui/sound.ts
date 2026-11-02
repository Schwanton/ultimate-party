/**
 * UP! Sounds – alles wird live im Browser erzeugt (Web Audio), keine Audiodateien, keine Lizenzen.
 * Sounds spielen nur auf dem TV. Lautstärke wird pro Gerät gespeichert.
 *
 *   import { sfx } from '@up/ui';
 *   sfx.play('ding');
 */

export type SoundName =
  | 'pop' | 'whoosh' | 'join' | 'tick' | 'tickUrgent' | 'timeUp' | 'ding' | 'wrong' | 'stamp'
  | 'fanfare' | 'cheer' | 'drumroll' | 'score' | 'beep' | 'go' | 'reveal' | 'sneaky' | 'select';

type Listener = () => void;

class Sfx {
  private ctx: AudioContext | null = null;
  private fxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private listeners = new Set<Listener>();
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private musicNext = 0;
  /** Automatische Plattform-Sounds (Timer, Übergänge, Konfetti …). Spiele können sie abschalten. */
  auto = true;
  fxVolume = load('up:fx', 0.8);
  musicVolume = load('up:music', 0.35);

  /** Auf dem Gerät aktivieren (nur der TV ruft das auf) */
  enabledOnDevice = false;

  get unlocked() {
    return this.ctx?.state === 'running';
  }

  enableOnThisDevice() {
    this.enabledOnDevice = true;
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.unlock();
  }

  unlock() {
    if (!this.enabledOnDevice) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.fxGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.fxGain.gain.value = this.fxVolume;
        this.musicGain.gain.value = this.musicVolume;
        this.fxGain.connect(this.ctx.destination);
        this.musicGain.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.ctx.onstatechange = () => this.emit();
      }
      if (this.ctx.state !== 'running') void this.ctx.resume().then(() => this.emit());
    } catch { /* kein Audio */ }
  }

  setVolumes(fx: number, music: number) {
    this.fxVolume = fx;
    this.musicVolume = music;
    save('up:fx', fx);
    save('up:music', music);
    if (this.fxGain) this.fxGain.gain.value = fx;
    if (this.musicGain) this.musicGain.gain.value = music;
    this.emit();
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /* ---------- Bausteine ---------- */

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; to?: number; out?: AudioNode; attack?: number } = {}) {
    const c = this.ctx!;
    const t = c.currentTime + (opts.at ?? 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const v = opts.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.out ?? this.fxGain!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { vol?: number; at?: number; filter?: number; type?: BiquadFilterType; sweepTo?: number; out?: AudioNode } = {}) {
    const c = this.ctx!;
    const t = c.currentTime + (opts.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.filter ?? 1200, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    const g = c.createGain();
    const v = opts.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.out ?? this.fxGain!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** Sound abspielen. `always` spielt auch, wenn das Spiel die automatischen Sounds abgeschaltet hat. */
  play(name: SoundName, opts: { always?: boolean } = {}) {
    if (!this.enabledOnDevice || (!this.auto && !opts.always)) return;
    this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return;
    try {
      this.compose(name);
    } catch { /* egal */ }
  }

  private compose(name: SoundName) {
    const N = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5]; // C-Dur ab c''
    switch (name) {
      case 'pop':
        this.tone(600, 0.12, { type: 'triangle', to: 1100, vol: 0.25 });
        break;
      case 'select':
        this.tone(880, 0.07, { type: 'square', vol: 0.08 });
        break;
      case 'whoosh':
        this.noise(0.45, { filter: 400, sweepTo: 3000, vol: 0.18 });
        break;
      case 'join':
        this.tone(N[2], 0.12, { type: 'triangle', vol: 0.22 });
        this.tone(N[4], 0.12, { type: 'triangle', vol: 0.22, at: 0.08 });
        this.tone(N[7], 0.22, { type: 'triangle', vol: 0.22, at: 0.16 });
        break;
      case 'tick':
        this.tone(1500, 0.05, { type: 'square', vol: 0.07 });
        break;
      case 'tickUrgent':
        this.tone(1900, 0.06, { type: 'square', vol: 0.12 });
        this.tone(950, 0.08, { type: 'sine', vol: 0.15 });
        break;
      case 'timeUp':
        this.tone(220, 0.5, { type: 'sawtooth', vol: 0.18, to: 180 });
        this.tone(165, 0.5, { type: 'square', vol: 0.1, to: 140 });
        break;
      case 'beep':
        this.tone(880, 0.18, { type: 'square', vol: 0.14 });
        break;
      case 'go':
        this.tone(1320, 0.45, { type: 'square', vol: 0.14 });
        this.tone(660, 0.45, { type: 'triangle', vol: 0.2 });
        break;
      case 'ding':
        [N[4], N[7]].forEach((f, i) => this.tone(f, 0.6, { type: 'sine', vol: 0.3, at: i * 0.1 }));
        this.tone(N[7] * 2, 0.5, { type: 'sine', vol: 0.08, at: 0.1 });
        break;
      case 'wrong':
        this.tone(330, 0.22, { type: 'square', vol: 0.12, to: 300 });
        this.tone(247, 0.4, { type: 'square', vol: 0.12, at: 0.2, to: 200 });
        break;
      case 'stamp':
        this.tone(140, 0.25, { type: 'sine', vol: 0.5, to: 50 });
        this.noise(0.12, { filter: 900, vol: 0.25, type: 'lowpass' });
        break;
      case 'reveal':
        this.noise(0.6, { filter: 800, sweepTo: 5000, vol: 0.12 });
        this.tone(N[0], 0.5, { type: 'triangle', vol: 0.15, at: 0.35, to: N[7] });
        break;
      case 'fanfare': {
        const seq = [[N[0], 0], [N[2], 0.12], [N[4], 0.24], [N[7], 0.36], [N[4], 0.6], [N[7], 0.72]] as const;
        seq.forEach(([f, at], i) => {
          this.tone(f, i === seq.length - 1 ? 0.9 : 0.2, { type: 'square', vol: 0.1, at });
          this.tone(f / 2, i === seq.length - 1 ? 0.9 : 0.2, { type: 'triangle', vol: 0.18, at });
        });
        break;
      }
      case 'cheer':
        // Jubel: gefiltertes Rauschen + kurzes Klatschen
        this.noise(1.6, { filter: 2200, vol: 0.12 });
        for (let i = 0; i < 14; i++) this.noise(0.05, { filter: 1600 + Math.random() * 2000, vol: 0.18, at: 0.05 + Math.random() * 1.3 });
        break;
      case 'drumroll':
        for (let i = 0; i < 22; i++) this.noise(0.06, { filter: 300, type: 'lowpass', vol: 0.15 + i * 0.01, at: i * 0.05 });
        this.tone(110, 0.3, { type: 'sine', vol: 0.4, at: 1.1, to: 55 });
        break;
      case 'score':
        for (let i = 0; i < 6; i++) this.tone(N[i] , 0.08, { type: 'triangle', vol: 0.12, at: i * 0.07 });
        break;
      case 'sneaky':
        [N[0] / 2, N[2] / 2, N[1] / 2, N[3] / 2].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.22, at: i * 0.2 }));
        break;
    }
  }

  /* ---------- Lobby-Musik: kleine, fröhliche Schleife ---------- */

  startMusic() {
    if (!this.enabledOnDevice || this.musicTimer) return;
    this.musicStep = 0;
    this.musicNext = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 50);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.musicVolume <= 0) return;
    const step = 60 / 112 / 2; // Achtel bei 112 bpm
    if (this.musicNext < c.currentTime) this.musicNext = c.currentTime + 0.05;
    const chords = [[261.63, 329.63, 392], [220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];
    const melody = [0, 2, 4, 2, 5, 4, 2, 1];
    while (this.musicNext < c.currentTime + 0.2) {
      const at = this.musicNext - c.currentTime;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const s = this.musicStep % 8;
      const chord = chords[bar];
      if (s % 2 === 0) this.tone(chord[0] / 2, step * 1.6, { type: 'triangle', vol: 0.22, at, out: this.musicGain! });
      this.tone(chord[(s + bar) % 3] * 2, step * 0.9, { type: 'sine', vol: 0.07, at, out: this.musicGain! });
      if (s === 0 || s === 4) this.tone(110, 0.12, { type: 'sine', vol: 0.35, at, to: 45, out: this.musicGain! });
      if (s === 2 || s === 6) this.noise(0.07, { filter: 6000, type: 'highpass', vol: 0.06, at, out: this.musicGain! });
      if (bar % 2 === 1 && s % 2 === 1) this.tone(chord[melody[s] % 3] * 4, step * 0.6, { type: 'square', vol: 0.025, at, out: this.musicGain! });
      this.musicStep++;
      this.musicNext += step;
    }
  }
}

function load(key: string, def: number) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : Math.max(0, Math.min(1, Number(v)));
  } catch {
    return def;
  }
}

function save(key: string, v: number) {
  try { localStorage.setItem(key, String(v)); } catch { /* egal */ }
}

export const sfx = new Sfx();
