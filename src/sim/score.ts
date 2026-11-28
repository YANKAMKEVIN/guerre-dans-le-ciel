// Score, combo, rangs et mots d'impact : fonctions pures.
import { COMBO_T } from './config';

export { COMBO_T };
/** Multiplicateur de score : +0,5 tous les 5 coups enchaînés, jusqu'à ×3. */
export const multOf = (combo: number): number => 1 + Math.min(4, Math.floor(combo / 5)) * 0.5;
export const tierOf = (combo: number): number => Math.round((multOf(combo) - 1) * 2);
/** « 12 400 » */
export const fmtN = (n: number): string => Math.round(n).toLocaleString('fr-FR');
export const fmtT = (s: number): string => {
  const r = Math.round(s);
  return Math.floor(r / 60) + ' min ' + String(r % 60).padStart(2, '0') + ' s';
};

export const RANKS = ['Ange', 'Chérubin', 'Séraphin'] as const;
export const RANK_SCORE = [25000, 50000] as const;
export const RANK_HURT = 60;
/** Rang de fin de partie : selon l'issue, le score et la Lumière perdue. */
export function rankOf(won: boolean, sc: number, lost: number): 0 | 1 | 2 {
  return won && sc >= RANK_SCORE[1] && lost <= RANK_HURT ? 2 : won || sc >= RANK_SCORE[0] ? 1 : 0;
}
export const rankNext = (r: number): string =>
  r === 2
    ? 'Le plus haut rang.'
    : r === 1
      ? 'Séraphin : vaincre le Dragon avec ' + fmtN(RANK_SCORE[1]) + ' points en perdant au plus ' + RANK_HURT + ' de Lumière.'
      : 'Chérubin : vaincre le Dragon, ou atteindre ' + fmtN(RANK_SCORE[0]) + ' points.';

export type WordClass = '' | 'kill' | 'feat' | 'crit' | 'pts';
const KILL_WORDS = ['TERRASSÉ !', 'PRÉCIPITÉ !', 'FOUDROYÉ !'] as const;
const MULTI_WORDS = ['DOUBLÉ !', 'TRIPLÉ !'] as const;
/** Mots variés pour un démon abattu, plus grands pour un exploit (dernier démon d'une vague). */
export function killWord(byJudge: boolean, lastOfWave: boolean, rnd: number): [string, WordClass] {
  if (lastOfWave) return ['VAGUE PURIFIÉE !', 'feat'];
  const w = byJudge ? 'JUGÉ !' : (KILL_WORDS[Math.min(KILL_WORDS.length - 1, Math.floor(rnd * KILL_WORDS.length))] as string);
  return [w, 'kill'];
}
/** Doublé ou triplé d'un seul Jugement. */
export const multiWord = (n: number): string | null => (n < 2 ? null : (MULTI_WORDS[n - 2] ?? 'LÉGION BALAYÉE !'));
