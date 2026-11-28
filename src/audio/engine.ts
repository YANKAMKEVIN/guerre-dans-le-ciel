// Son et musique procéduraux : aucun fichier audio, tout est synthétisé dans le navigateur.
import { clamp } from '../sim/math';
import type { Pos3, SfxName } from '../sim/types';
import type { World } from '../sim/world';
import { THEMES, playStep, type ThemeName } from './music';
import { bell, choir, drum, noise, tone, type Voices } from './voices';

const MUSIC_GAIN = 2.2;

export interface AudioGraph extends Voices {
  master: GainNode;
  music: GainNode;
  /** filtre qui assourdit la musique quand la Lumière est basse */
  mlp: BiquadFilterNode;
  fx: GainNode;
  wf: BiquadFilterNode;
  wg: GainNode;
  th: Record<ThemeName, GainNode>;
}

export class AudioEngine {
  ac: AudioContext | null = null;
  au: AudioGraph | null = null;
  muted = false;
  musicOn = true;
  vol = { music: 0.6, sfx: 0.85 };
  private theme: ThemeName | null = null;
  private next = 0;
  private step = 0;
  private intensity = 0;
  private heartT = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** À appeler sur un geste de l'utilisateur (politique d'autoplay). */
  init(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    let ac: AudioContext;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new Ctor();
    } catch {
      return;
    }
    this.ac = ac;
    const master = ac.createGain();
    master.gain.value = this.muted ? 0 : 1;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(comp).connect(ac.destination);
    // réverbération de cathédrale générée
    const len = (ac.sampleRate * 3.4) | 0, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const rev = ac.createConvolver();
    rev.buffer = ir;
    const revG = ac.createGain();
    revG.gain.value = 0.5;
    rev.connect(revG).connect(master);
    const music = ac.createGain();
    music.gain.value = this.musicOn ? this.vol.music * MUSIC_GAIN : 0;
    const mlp = ac.createBiquadFilter();
    mlp.type = 'lowpass';
    mlp.frequency.value = 20000;
    mlp.Q.value = 0.5;
    music.connect(mlp).connect(master);
    const mr = ac.createGain();
    mr.gain.value = 0.55;
    mlp.connect(mr).connect(rev);
    const fx = ac.createGain();
    fx.gain.value = this.vol.sfx;
    fx.connect(master);
    const fr = ac.createGain();
    fr.gain.value = 0.22;
    fx.connect(fr).connect(rev);
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const wind = ac.createBufferSource();
    wind.buffer = nb;
    wind.loop = true;
    const wf = ac.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 500;
    wf.Q.value = 0.6;
    const wg = ac.createGain();
    wg.gain.value = 0;
    wind.connect(wf).connect(wg).connect(fx);
    wind.start();
    const th = {} as Record<ThemeName, GainNode>;
    for (const k of ['menu', 'sky', 'fire'] as const) {
      th[k] = ac.createGain();
      th[k].connect(music);
      th[k].gain.value = 0;
    }
    this.au = { ac, nb, master, music, mlp, fx, wf, wg, th };
    this.next = ac.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  suspend(): void {
    if (this.ac) void this.ac.suspend();
  }
  resume(): void {
    if (this.ac) void this.ac.resume();
  }

  setVolumes(): void {
    const A = this.au, ac = this.ac;
    if (!A || !ac) return;
    A.master.gain.setTargetAtTime(this.muted ? 0 : 1, ac.currentTime, 0.05);
    A.music.gain.setTargetAtTime(this.musicOn ? this.vol.music * MUSIC_GAIN : 0, ac.currentTime, 0.1);
    A.fx.gain.setTargetAtTime(this.vol.sfx, ac.currentTime, 0.05);
  }

  private schedule(): void {
    const A = this.au, ac = this.ac;
    if (!A || !ac || !this.theme) return;
    const sd = 60 / THEMES[this.theme].bpm / 4;
    while (this.next < ac.currentTime + 0.15) {
      playStep(A, this.theme, this.step, this.next, sd, A.th[this.theme], this.intensity);
      this.next += sd;
      this.step++;
    }
  }
  private setTheme(k: ThemeName): void {
    const A = this.au, ac = this.ac;
    if (!A || !ac || this.theme === k) return;
    const now = ac.currentTime;
    if (this.theme) A.th[this.theme].gain.setTargetAtTime(0, now, 0.7);
    A.th[k].gain.cancelScheduledValues(now);
    A.th[k].gain.setTargetAtTime(1, now, 0.5);
    this.theme = k;
    this.step = 0;
    this.next = Math.max(this.next, now + 0.05);
  }

  /** Une fois par image : thème selon la phase, vent selon la vitesse, cœur et musique assourdie quand la Lumière est basse. */
  update(w: World): void {
    const A = this.au, ac = this.ac;
    if (!A || !ac) return;
    const boss = w.phase === 'boss' || w.phase === 'bossintro' || w.phase === 'bossdying';
    this.setTheme(w.state === 'play' ? (boss ? 'fire' : 'sky') : 'menu');
    this.intensity = w.state === 'play' ? (w.demons.length || w.dragon.alive ? 1 : 0.3) : 0;
    const P = w.player, sp = clamp((P.speed - 112) / 83, 0, 1), now = ac.currentTime, low = w.lowLight();
    A.mlp.frequency.setTargetAtTime(low ? 1100 : 20000, now, 0.25);
    if (low && !w.paused && w.time >= this.heartT) {
      this.heartT = w.time + 0.95;
      this.play('heart');
    }
    const dodge = P.dodgeT > 0;
    A.wg.gain.setTargetAtTime(w.state === 'play' ? 0.035 + sp * 0.07 + (dodge ? 0.06 : 0) : 0.008, now, 0.2);
    A.wf.frequency.setTargetAtTime(380 + sp * 900 + (dodge ? 600 : 0), now, 0.2);
  }

  /** Effet sonore ; `at` atténue avec la distance à l'ange. */
  play(name: SfxName | 'heart' | 'tick' | 'rank', at: Pos3 | null = null, arg = 0, listener: Pos3 | null = null): void {
    const A = this.au, ac = this.ac;
    if (!A || !ac) return;
    const t = ac.currentTime, fx = A.fx;
    const dv = at && listener ? clamp(1 - Math.hypot(at.x - listener.x, at.y - listener.y, at.z - listener.z) / 1400, 0.12, 1) : 1;
    const T = (f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void => tone(A, fx, f0, f1, dur, type, vol);
    switch (name) {
      case 'shoot': {
        const p = 1 + Math.random() * 0.1;
        T(1320 * p, 1760 * p, 0.12, 'sine', 0.028);
        T(1980 * p, 990 * p, 0.1, 'triangle', 0.012);
        noise(A, t, 0.05, 'highpass', 7000, 4000, 0.5, 0.012, fx);
        break;
      }
      case 'hit':
        noise(A, t, 0.12, 'bandpass', 1500, 600, 1.2, 0.1, fx);
        T(190, 60, 0.14, 'sine', 0.12);
        break;
      case 'boom':
        noise(A, t, 1, 'lowpass', 1800, 110, 0.7, 0.34 * dv, fx);
        T(90, 30, 0.85, 'sine', 0.3 * dv);
        break;
      case 'roar':
        this.roar(t);
        break;
      case 'heart':
        drum(A, t, fx, 0.2, 46);
        drum(A, t + 0.2, fx, 0.13, 42);
        break;
      case 'tick':
        bell(A, 79 + arg * 2, t, fx, 0.04);
        break;
      case 'rank':
        for (const m of [62, 69, 74]) choir(A, m, t, 0.9, fx, 0.03);
        bell(A, 86, t, fx, 0.06);
        if (arg) {
          bell(A, 90, t + 0.12, fx, 0.05);
          bell(A, 93, t + 0.24, fx, 0.05);
        }
        break;
      case 'tier':
        bell(A, 74 + arg * 3, t, fx, 0.06);
        bell(A, 81 + arg * 3, t + 0.07, fx, 0.045);
        break;
      case 'hurt':
        noise(A, t, 0.28, 'lowpass', 1000, 140, 1, 0.2, fx);
        T(210, 70, 0.3, 'square', 0.05);
        break;
      case 'fire':
        noise(A, t, 0.5, 'lowpass', 2400, 280, 0.8, 0.09 * dv, fx);
        T(160, 70, 0.35, 'sawtooth', 0.025 * dv);
        break;
      case 'whoosh':
        noise(A, t, 0.38, 'bandpass', 380, 2600, 1.6, 0.16, fx);
        break;
      case 'judge':
        for (const m of [62, 66, 69, 74]) choir(A, m, t, 0.7, fx, 0.035);
        T(300, 1400, 0.55, 'sine', 0.05);
        break;
      case 'judgeBoom':
        noise(A, t, 1.4, 'lowpass', 2600, 90, 0.6, 0.42, fx);
        T(70, 26, 1.2, 'sine', 0.36);
        for (let k = 0; k < 5; k++) bell(A, 86 + ([0, 4, 7, 12, 16][k] as number), t + k * 0.04, fx, 0.035);
        break;
      case 'wave':
        for (const m of [62, 65, 69]) choir(A, m, t, 1.4, fx, 0.03);
        drum(A, t, fx, 0.2, 58);
        break;
      case 'ringFire':
        T(70, 35, 1.2, 'sawtooth', 0.18);
        break;
      case 'win':
        [[62, 66, 69], [67, 71, 74], [69, 73, 76], [74, 78, 81]].forEach((c, i) => {
          for (const m of c) choir(A, m, t + i * 0.55, i === 3 ? 3 : 0.6, fx, 0.04);
          bell(A, (c[2] as number) + 12, t + i * 0.55, fx, 0.05);
        });
        break;
      case 'lose':
        [[57, 60, 64], [55, 58, 62], [53, 57, 60], [50, 53, 57]].forEach((c, i) => {
          for (const m of c) choir(A, m - 12, t + i * 0.7, i === 3 ? 2.5 : 0.8, fx, 0.035);
        });
        drum(A, t, fx, 0.25, 48);
        break;
    }
  }

  private roar(t: number): void {
    const A = this.au as AudioGraph, ac = A.ac, s = ac.createBufferSource();
    s.buffer = A.nb;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(360, t);
    f.frequency.linearRampToValueAtTime(640, t + 0.5);
    f.frequency.linearRampToValueAtTime(240, t + 1.9);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.25);
    g.gain.setTargetAtTime(0, t + 1.2, 0.35);
    s.connect(f).connect(g).connect(A.fx);
    s.start(t);
    s.stop(t + 2.8);
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(68, t);
    o.frequency.linearRampToValueAtTime(96, t + 0.4);
    o.frequency.linearRampToValueAtTime(46, t + 1.9);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 23;
    const lg = ac.createGain();
    lg.gain.value = 10;
    lfo.connect(lg).connect(o.frequency);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 750;
    const og = ac.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.24, t + 0.2);
    og.gain.setTargetAtTime(0, t + 1.3, 0.3);
    o.connect(lp).connect(og).connect(A.fx);
    o.start(t);
    lfo.start(t);
    o.stop(t + 2.8);
    lfo.stop(t + 2.8);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
