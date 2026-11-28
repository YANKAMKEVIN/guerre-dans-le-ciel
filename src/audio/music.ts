// Musique : trois thèmes (menu, vagues, Dragon) sur un séquenceur commun en doubles croches.
import { bass, bell, brass, choir, drum, noise, pluck, type Voices } from './voices';

export type ThemeName = 'menu' | 'sky' | 'fire';
interface Theme {
  bpm: number;
  chords: number[][];
  mel: [number, number][];
}
export const THEMES: Record<ThemeName, Theme> = {
  menu: { bpm: 64, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], mel: [[74, 0], [77, 8], [76, 0], [72, 8], [72, 0], [69, 8], [67, 0], [69, 8]] },
  sky: { bpm: 84, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], mel: [[74, 0], [77, 8], [74, 0], [72, 8], [72, 0], [69, 8], [67, 0], [69, 8]] },
  fire: { bpm: 104, chords: [[38, 41, 45], [34, 38, 41], [43, 46, 50], [45, 49, 52]], mel: [[74, 0], [73, 8], [70, 0], [69, 8], [67, 0], [70, 8], [69, 0], [61, 8]] },
};

/** note de mélodie jouée au pas s de la mesure bar, s'il y en a une */
export function melodyAt(T: Theme, bar: number, s: number): number | null {
  for (let i = 0; i < T.mel.length; i++) {
    const x = T.mel[i] as [number, number];
    if (x[1] === s && i >> 1 === bar) return x[0];
  }
  return null;
}

export function playStep(v: Voices, k: ThemeName, step: number, t: number, sd: number, dest: AudioNode, I: number): void {
  const T = THEMES[k], s = step % 16, bar = (step >> 4) % 4, ch = T.chords[bar] as [number, number, number], barLen = sd * 16;
  if (k === 'menu') {
    if (s === 0) {
      for (const m of ch) choir(v, m + 12, t, barLen * 1.05, dest, 0.035);
      bass(v, ch[0] - 12, t, barLen, dest, 0.09);
    }
    if (s === 0 && bar % 2 === 0) bell(v, (T.mel[bar * 2] as [number, number])[0], t, dest, 0.04);
    return;
  }
  if (k === 'sky') {
    if (s === 0) {
      for (const m of ch) choir(v, m + 12, t, barLen * 1.02, dest, 0.03);
      bass(v, ch[0] - 12, t, barLen, dest, 0.1);
    }
    if (s % 2 === 0) {
      const arp = [0, 1, 2, 1, 0, 1, 2, 3][(s / 2) | 0] as number, m = arp === 3 ? ch[0] + 12 : (ch[arp] as number);
      pluck(v, m + 12, t, dest, 0.035 + I * 0.015, 0.45);
    }
    const ml = melodyAt(T, bar, s);
    if (ml !== null) bell(v, ml, t, dest, 0.045);
    if (I > 0.2) {
      if (s === 0 || s === 10) drum(v, t, dest, 0.16 * I, 62);
      if (s === 4 || s === 12) noise(v, t, 0.12, 'bandpass', 1800, 900, 1.2, 0.035 * I, dest);
    }
    return;
  }
  // fire : cuivres, ostinato et tambours de guerre
  if (s === 0) {
    for (const m of ch) choir(v, m + 24, t, barLen * 1.02, dest, 0.028);
    brass(v, ch[0] + 12, t, 0.38, dest, 0.05);
    brass(v, ch[1] + 12, t, 0.38, dest, 0.04);
    brass(v, ch[2] + 12, t, 0.38, dest, 0.04);
  }
  if (s === 6 || s === 10) {
    brass(v, ch[0] + 12, t, 0.14, dest, 0.04);
    brass(v, ch[2] + 12, t, 0.14, dest, 0.035);
  }
  pluck(v, ch[0] + 24 + ([0, 0, 7, 0, 12, 0, 7, 3][s % 8] as number), t, dest, 0.03, 0.22);
  if (s === 0 || s === 6 || s === 8) bass(v, ch[0], t, sd * 3, dest, 0.12, 'sawtooth');
  const ml = melodyAt(T, bar, s);
  if (ml !== null) brass(v, ml - 12, t, sd * 7, dest, 0.035);
  if (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14) drum(v, t, dest, (s === 0 || s === 8 ? 0.24 : 0.13) * (0.6 + I * 0.4), s === 0 || s === 8 ? 55 : 72);
  if (s === 4 || s === 12) noise(v, t, 0.14, 'bandpass', 2000, 800, 1, 0.05, dest);
}
