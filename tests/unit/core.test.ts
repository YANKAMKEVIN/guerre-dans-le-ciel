import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/rng';
import { clamp, deadZone, lerp, smooth01, damp } from '../../src/sim/math';
import { fmtN, fmtT, killWord, multOf, multiWord, rankNext, rankOf, tierOf } from '../../src/sim/score';
import { DIFF, diffOf } from '../../src/sim/config';

describe('Rng', () => {
  it('rejoue la même suite pour la même graine', () => {
    const a = new Rng(5), b = new Rng(5);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('change de suite avec la graine', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });
  it('reste dans [0, 1) et dans les bornes de range', () => {
    const r = new Rng(9);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const x = r.range(-3, 7);
      expect(x).toBeGreaterThanOrEqual(-3);
      expect(x).toBeLessThan(7);
    }
  });
  it('est à peu près uniforme', () => {
    const r = new Rng(3), bins = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) {
      const k = Math.floor(r.next() * 4);
      bins[k] = (bins[k] ?? 0) + 1;
    }
    for (const b of bins) expect(Math.abs(b - 10000)).toBeLessThan(500);
  });
});

describe('outils numériques', () => {
  it('clamp, lerp, smooth01', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(smooth01(0, 1, 0.5)).toBe(0.5);
    expect(smooth01(0, 1, 2)).toBe(1);
  });
  it('zone morte : rien sous 7 %, plein régime au bout', () => {
    expect(deadZone(0.05)).toBe(0);
    expect(deadZone(-0.06)).toBe(0);
    expect(deadZone(1)).toBe(1);
    expect(deadZone(-1)).toBe(-1);
    expect(deadZone(0.5)).toBeCloseTo(0.645);
  });
  it('lissage exponentiel indépendant du pas', () => {
    const one = damp(3, 0.1), two = 1 - (1 - damp(3, 0.05)) ** 2;
    expect(one).toBeCloseTo(two, 10);
  });
});

describe('score, rangs et mots', () => {
  it('multiplicateur : +0,5 tous les 5 coups, plafonné à ×3', () => {
    expect(multOf(0)).toBe(1);
    expect(multOf(4)).toBe(1);
    expect(multOf(5)).toBe(1.5);
    expect(multOf(19)).toBe(2.5);
    expect(multOf(200)).toBe(3);
    expect(tierOf(5)).toBe(1);
    expect(tierOf(20)).toBe(4);
  });
  it('formate à la française', () => {
    expect(fmtN(12400).replace(/\s/g, ' ')).toBe('12 400');
    expect(fmtN(950)).toBe('950');
    expect(fmtN(1234.6).replace(/\s/g, ' ')).toBe('1 235');
    expect(fmtT(125)).toBe('2 min 05 s');
    expect(fmtT(59.6)).toBe('1 min 00 s');
  });
  it('rangs (mêmes cas que la critique « interface »)', () => {
    expect(rankOf(false, 1000, 100)).toBe(0);
    expect(rankOf(false, 30000, 100)).toBe(1);
    expect(rankOf(true, 10000, 100)).toBe(1);
    expect(rankOf(true, 60000, 61)).toBe(1);
    expect(rankOf(true, 60000, 40)).toBe(2);
    expect(rankOf(false, 90000, 0)).toBe(1);
    expect(rankNext(2)).toMatch(/plus haut/);
    expect(rankNext(1)).toMatch(/Séraphin/);
    expect(rankNext(0)).toMatch(/Chérubin/);
  });
  it('mots d’impact variés, mots d’exploit réservés', () => {
    const ws = new Set([0, 0.4, 0.99].map((x) => killWord(false, false, x)[0]));
    expect(ws.size).toBe(3);
    expect(killWord(false, false, 0.1)[1]).toBe('kill');
    expect(killWord(true, false, 0.1)[0]).toBe('JUGÉ !');
    expect(killWord(false, true, 0.1)).toEqual(['VAGUE PURIFIÉE !', 'feat']);
    expect(multiWord(1)).toBeNull();
    expect(multiWord(2)).toBe('DOUBLÉ !');
    expect(multiWord(3)).toBe('TRIPLÉ !');
    expect(multiWord(5)).toBe('LÉGION BALAYÉE !');
  });
  it('difficultés : Gardien encaisse 1,2 (décision du 21/11)', () => {
    expect(DIFF.map((d) => d.dmg)).toEqual([0.6, 1.2, 1.4]);
    expect(diffOf(7).n).toBe('Gardien');
  });
});
