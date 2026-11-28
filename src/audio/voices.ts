// Voix de synthèse (Web Audio) : chœur, harpe, cloche, cuivres, basse, bruit filtré, tambour.
export interface Voices {
  ac: AudioContext;
  nb: AudioBuffer;
}
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export function osc(ac: AudioContext, type: OscillatorType, f: number, t: number, stop: number, dest: AudioNode, det = 0): OscillatorNode {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = det;
  o.connect(dest);
  o.start(t);
  o.stop(stop);
  return o;
}
export function env(ac: AudioContext, t: number, a: number, peak: number, hold: number, rel: number, dest: AudioNode): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.setTargetAtTime(0, t + a + hold, rel);
  g.connect(dest);
  return g;
}
export function choir({ ac }: Voices, m: number, t: number, len: number, dest: AudioNode, vol: number): void {
  const g = env(ac, t, Math.min(0.7, len * 0.4), vol, len * 0.6, 0.45, dest);
  const f1 = ac.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = 720;
  f1.Q.value = 2.5;
  const f2 = ac.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = 1180;
  f2.Q.value = 3.5;
  const pre = ac.createGain();
  pre.connect(f1);
  pre.connect(f2);
  f1.connect(g);
  f2.connect(g);
  const st = t + len + 2.5, vib = ac.createOscillator();
  vib.frequency.value = 5;
  const vg = ac.createGain();
  vg.gain.value = 4;
  vib.connect(vg);
  vib.start(t);
  vib.stop(st);
  for (const d of [-11, 0, 10]) vg.connect(osc(ac, 'sawtooth', mtof(m), t, st, pre, d).detune);
}
export function pluck({ ac }: Voices, m: number, t: number, dest: AudioNode, vol: number, dec = 0.4): void {
  const g = env(ac, t, 0.004, vol, 0, dec / 3, dest), lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.setTargetAtTime(700, t, dec / 3);
  lp.connect(g);
  osc(ac, 'triangle', mtof(m), t, t + dec * 2.5, lp);
  osc(ac, 'sawtooth', mtof(m), t, t + dec * 2.5, lp, 6);
}
export function bell({ ac }: Voices, m: number, t: number, dest: AudioNode, vol: number): void {
  osc(ac, 'sine', mtof(m), t, t + 3.5, env(ac, t, 0.003, vol, 0, 0.7, dest));
  osc(ac, 'sine', mtof(m) * 2.76, t, t + 1.5, env(ac, t, 0.003, vol * 0.35, 0, 0.25, dest));
}
export function brass({ ac }: Voices, m: number, t: number, len: number, dest: AudioNode, vol: number): void {
  const g = env(ac, t, 0.05, vol, len, 0.18, dest), lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.linearRampToValueAtTime(2400, t + 0.07);
  lp.frequency.setTargetAtTime(900, t + 0.08, 0.2);
  lp.connect(g);
  for (const d of [-7, 7]) osc(ac, 'sawtooth', mtof(m), t, t + len + 1, lp, d);
}
export function bass({ ac }: Voices, m: number, t: number, len: number, dest: AudioNode, vol: number, type: OscillatorType = 'triangle'): void {
  const g = env(ac, t, 0.02, vol, len, 0.2, dest), lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  lp.connect(g);
  osc(ac, type, mtof(m), t, t + len + 1, lp);
}
export function noise({ ac, nb }: Voices, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, dest: AudioNode): void {
  const s = ac.createBufferSource();
  s.buffer = nb;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}
export function drum(v: Voices, t: number, dest: AudioNode, vol: number, f = 68): void {
  const g = env(v.ac, t, 0.002, vol, 0, 0.18, dest), o = osc(v.ac, 'sine', f, t, t + 1, g);
  o.frequency.setValueAtTime(f * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.35);
  noise(v, t, 0.22, 'lowpass', 900, 200, 0.7, vol * 0.5, dest);
}
export function tone({ ac }: Voices, dest: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}
