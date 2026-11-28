// Le pilote automatique joue des parties entières sans rendu, dans les trois difficultés.
// Graines fixes : chaque partie est rejouée à l'identique, un échec n'est donc jamais un hasard.
import { describe, expect, it } from 'vitest';
import { World } from '../../src/sim/world';
import { PILOTS, playGame } from '../../src/sim/bot';
import { DIFF } from '../../src/sim/config';

const SEEDS = [1, 2, 3];

describe('le bot finit la partie', () => {
  for (const diff of [0, 1, 2] as const)
    for (const seed of SEEDS)
      it(`${DIFF[diff]?.n}, graine ${seed} : victoire contre le Dragon`, () => {
        const r = playGame(new World({ seed, diff }), PILOTS.champion);
        console.log(`[bot] ${DIFF[diff]?.n} graine ${seed} :`, JSON.stringify(r));
        expect(r.outcome).toBe('won');
        expect(r.headsLeft).toBe(0);
        expect(r.wave).toBe(4);
        // les trois vagues et le Dragon ont bien été joués
        for (const k of ['vague 1', 'vague 2', 'vague 3', 'dragon']) expect(r.phases[k] ?? 0, k).toBeGreaterThan(5);
        expect(r.gameTime).toBeLessThan(600);
        expect(r.score).toBeGreaterThan(25000);
      });
});

describe('équilibre (mêmes pilotes que les critiques)', () => {
  it('Pèlerin reste abordable : le pilote « moyen » gagne', () => {
    for (const seed of SEEDS) expect(playGame(new World({ seed, diff: 0 }), PILOTS.moyen).outcome).toBe('won');
  });
  it('Archange est plus dur que Pèlerin : moins de Lumière au plus bas', () => {
    const hp = (diff: 0 | 2) => SEEDS.map((seed) => playGame(new World({ seed, diff }), PILOTS.champion).hpMin).reduce((a, b) => a + b, 0);
    expect(hp(2)).toBeLessThan(hp(0));
  });
  it('une partie rejouée avec la même graine est identique', () => {
    const a = playGame(new World({ seed: 4, diff: 1 }), PILOTS.expert), b = playGame(new World({ seed: 4, diff: 1 }), PILOTS.expert);
    expect(a).toEqual(b);
  });
});
