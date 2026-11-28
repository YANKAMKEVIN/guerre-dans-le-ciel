// Réglages du combat. Les valeurs sont celles de la version d'origine (index.html monolithique) : ne pas les changer sans décision de jeu.
export const SKY_CEIL = 1500; // plafond de l'ange ; les démons restent dessous et au-dessus du relief (blocage en vague 3, ronde 4)
export const J_COOL = 6;
export const DODGE_T = 0.45;
export const DODGE_COOL = 1.6;
export const LOW_HP = 30;
export const COMBO_T = 2.4;
export const NSEG = 46;
export const SPACING = 17;
export const NHEAD = 7;
export const HEAD_HP = 120;
export const NECK = 9;
export const BOLT_POOL = 70;
export const FIRE_POOL = 130;
export const BOLT_SPEED = 760;
export const LOCK_RANGE = 1400;
export const DEATH_PANEL = 2.8;
export const DEATH_PANEL_REDUCED = 0.6;
export const FIXED_DT = 1 / 120; // pas fixe de la simulation
export const MAX_FRAME_DT = 0.05; // un écart d'image plus long est tronqué, comme avant

export interface Difficulty {
  n: string;
  dmg: number;
  rate: number;
  hp: number;
  info: string;
}
// Gardien : 20 % de dégâts en plus (décision de Kevin du 21/11, voir A-VALIDER.md)
export const DIFF: readonly Difficulty[] = [
  { n: 'Pèlerin', dmg: 0.6, rate: 1.35, hp: 0.75, info: 'coups adoucis, tirs ennemis plus rares, têtes moins résistantes. Pour découvrir.' },
  { n: 'Gardien', dmg: 1.2, rate: 1, hp: 1, info: 'l’épreuve de référence.' },
  { n: 'Archange', dmg: 1.4, rate: 0.75, hp: 1.3, info: 'coups plus durs, ennemis plus vifs, démons et têtes plus résistants.' },
];
export type DiffIndex = 0 | 1 | 2;
export const diffOf = (i: number): Difficulty => DIFF[i] ?? (DIFF[1] as Difficulty);

export const WAVES = [
  { n: 5, reinf: 3, sub: 'Les anges déchus approchent.' },
  { n: 7, reinf: 6, sub: 'Ils reviennent plus nombreux.' },
  { n: 9, reinf: 8, sub: 'La dernière légion.' },
] as const;
export const ROMAN = ['I', 'II', 'III'] as const;
