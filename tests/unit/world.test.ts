import { describe, expect, it } from 'vitest';
import { World } from '../../src/sim/world';
import { DODGE_COOL, FIXED_DT, J_COOL, SKY_CEIL, COMBO_T } from '../../src/sim/config';
import { demonAlt } from '../../src/sim/demons';
import type { GameEvent } from '../../src/sim/types';
import { demonAhead, playing, run } from './helpers';

const types = (ev: GameEvent[]): string[] => ev.map((e) => (e.type === 'sfx' ? 'sfx:' + e.name : e.type));

describe('déroulement d’une partie', () => {
  it('commence en vague I, puis fait apparaître 5 démons', () => {
    const { w, ev } = playing();
    expect(w.state).toBe('play');
    expect(w.wave).toBe(1);
    expect(w.banner.title).toBe('Vague I');
    expect(types(ev)).toContain('sfx:wave');
    expect(w.demons.length).toBe(0);
    const ev2 = run(w, 3);
    expect(w.demons.length).toBe(5);
    expect(ev2.filter((e) => e.type === 'demonSpawn').length).toBe(5);
  });
  it('envoie les renforts quand il reste deux démons, puis la vague suivante', () => {
    const { w } = playing();
    run(w, 3);
    for (const d of w.demons) d.cool = 999;
    w.killDemon(0);
    w.killDemon(0);
    expect(w.reinf).toBe(3);
    w.killDemon(0);
    run(w, 0.1);
    expect(w.demons.length).toBe(5);
    expect(w.banner.title).toBe('Renforts !');
    while (w.demons.length) w.killDemon(0);
    run(w, 0.1);
    expect(w.wave).toBe(2);
    expect(w.banner.title).toBe('Vague II');
  });
  it('amène le Dragon après la troisième vague', () => {
    const { w } = playing();
    w.skipToBoss();
    expect(w.phase).toBe('bossintro');
    expect(w.moodTarget).toBe(1);
    const ev = run(w, 0.2);
    expect(w.phase).toBe('boss');
    expect(w.dragon.alive).toBe(true);
    expect(w.dragon.heads.every((h) => h.alive && h.hp === 120)).toBe(true);
    expect(ev.some((e) => e.type === 'hint')).toBe(true);
    expect(w.waveLabel()).toBe('Le Dragon');
  });
  it('retourne au menu proprement', () => {
    const { w } = playing();
    run(w, 3);
    w.setPaused(true);
    w.toMenu();
    expect(w.state).toBe('menu');
    expect(w.paused).toBe(false);
    expect(w.demons.length).toBe(0);
    expect(w.dragon.visible).toBe(false);
    expect(w.events.filter((e) => e.type === 'demonRemove').length).toBe(5);
  });
});

describe('dégâts, esquive, mort et victoire', () => {
  it('un coup de 10 retire 6 en Pèlerin, 12 en Gardien, 14 en Archange', () => {
    const loss = [0, 1, 2].map((i) => {
      const { w } = playing({ diff: i as 0 | 1 | 2 });
      w.damagePlayer(10);
      return 100 - w.player.hp;
    });
    expect(loss[0]).toBeCloseTo(6);
    expect(loss[1]).toBeCloseTo(12);
    expect(loss[2]).toBeCloseTo(14);
  });
  it('l’esquive rend invulnérable puis se recharge', () => {
    const { w } = playing();
    w.dodge();
    expect(w.player.dodgeT).toBeGreaterThan(0);
    w.damagePlayer(50);
    expect(w.player.hp).toBe(100);
    w.dodge(); // en recharge : sans effet
    run(w, 0.5);
    w.damagePlayer(10);
    expect(w.player.hp).toBeLessThan(100);
    run(w, DODGE_COOL);
    expect(w.player.dodgeCool).toBe(0);
  });
  it('la Lumière remonte après 5 s sans coup', () => {
    const { w } = playing();
    w.damagePlayer(20);
    const hp = w.player.hp;
    run(w, 4);
    for (const d of w.demons) d.cool = 999;
    expect(w.player.hp).toBe(hp);
    run(w, 3);
    expect(w.player.hp).toBeGreaterThan(hp + 2);
    expect(w.player.regenFrom).toBe(hp);
  });
  it('la chute : état « dead », fin émise, ralenti puis panneau', () => {
    const { w } = playing();
    w.damagePlayer(999);
    expect(w.state).toBe('dead');
    expect(w.player.hp).toBe(0);
    expect(w.events.some((e) => e.type === 'end' && !e.won)).toBe(true);
    const t0 = w.time;
    run(w, 0.5);
    expect(w.time - t0).toBeLessThan(0.2); // ralenti
    run(w, 3);
    expect(w.deadT).toBeGreaterThan(w.deathPanelDelay);
  });
  it('sans ralenti quand les animations sont réduites', () => {
    const { w } = playing({ reduced: true });
    w.damagePlayer(999);
    const t0 = w.time;
    run(w, 0.5);
    expect(w.time - t0).toBeCloseTo(0.5, 1);
    expect(w.deathPanelDelay).toBe(0.6);
  });
  it('la victoire émet la fin et rend le ciel', () => {
    const { w } = playing();
    w.moodTarget = 1;
    w.win();
    expect(w.state).toBe('won');
    expect(w.moodTarget).toBe(0);
    expect(w.events.some((e) => e.type === 'end' && e.won)).toBe(true);
  });
});

describe('combat', () => {
  it('verrouille un démon devant, pas derrière ni trop loin', () => {
    const { w } = playing();
    run(w, 3);
    for (const d of w.demons) d.pos.set(0, -5000, 0);
    const d = demonAhead(w);
    w.updateLock();
    expect(w.lock?.ref).toBe(d);
    d.pos.copy(w.player.pos).addScaledVector(w.player.fwd, -260);
    w.updateLock();
    expect(w.lock).toBeNull();
    d.pos.copy(w.player.pos).addScaledVector(w.player.fwd, 1500);
    w.updateLock();
    expect(w.lock).toBeNull();
  });
  it('les traits touchent et abattent un démon (points, mot, combo)', () => {
    const { w } = playing();
    run(w, 3);
    for (const d of w.demons) {
      d.cool = 999;
      d.pos.set(0, -5000, 0);
    }
    const d = demonAhead(w, 200), s0 = w.score;
    d.hp = 2;
    w.input.fire = true;
    const ev = run(w, 1.2, [], () => {
      if (d.alive) demonAhead(w, 200);
    });
    expect(d.alive).toBe(false);
    expect(w.score).toBeGreaterThan(s0);
    expect(w.tuto.done.fire).toBe(true);
    expect(ev.some((e) => e.type === 'word' && e.cls === 'pts')).toBe(true);
    expect(ev.some((e) => e.type === 'demonRemove')).toBe(true);
    expect(w.run.kills).toBe(1);
  });
  it('le Jugement balaie un groupe : doublé ou mieux', () => {
    const { w } = playing();
    run(w, 3);
    for (const d of w.demons) {
      d.cool = 999;
      d.pos.copy(w.player.pos).addScaledVector(w.player.fwd, 200);
    }
    w.judge();
    expect(w.player.jCool).toBe(J_COOL);
    const ev = run(w, 1.5, [], () => {
      for (const d of w.demons) d.pos.copy(w.player.pos).addScaledVector(w.player.fwd, 200);
    });
    expect(w.demons.length).toBeLessThan(5);
    expect(ev.some((e) => e.type === 'ring')).toBe(true);
    expect(ev.some((e) => e.type === 'word' && /DOUBLÉ|TRIPLÉ|LÉGION/.test(e.text))).toBe(true);
    expect(w.tuto.done.judge).toBe(true);
  });
  it('combo : palier sonore à 5 coups, remis à zéro après 2,4 s', () => {
    const { w } = playing();
    for (let i = 0; i < 4; i++) w.registerHit();
    expect(w.events.some((e) => e.type === 'sfx' && e.name === 'tier')).toBe(false);
    w.registerHit();
    expect(w.events.some((e) => e.type === 'sfx' && e.name === 'tier' && e.arg === 1)).toBe(true);
    expect(w.mult).toBe(1.5);
    run(w, COMBO_T + 0.1);
    expect(w.combo).toBe(0);
    expect(w.run.maxCombo).toBe(5);
  });
  it('démons atteignables : jamais au-dessus du plafond ni sous le relief', () => {
    const { w } = playing();
    expect(demonAlt(w, 0, 0, SKY_CEIL + 500)).toBe(SKY_CEIL - 40);
    expect(demonAlt(w, 0, 0, -1e4)).toBeGreaterThan(-1e4 + 100);
    run(w, 3);
    const d = w.demons[0];
    if (!d) throw new Error();
    d.h = 90;
    let maxY = -1e9;
    run(w, 5, [], () => {
      w.player.pos.y = SKY_CEIL + 5;
      w.player.pitch = 0;
      w.player.hp = 100;
      d.cool = 99;
      maxY = Math.max(maxY, d.pos.y);
    });
    expect(maxY).toBeLessThan(SKY_CEIL - 20);
  });
});

describe('Dragon', () => {
  const boss = (diff: 0 | 1 | 2 = 1) => {
    const { w } = playing({ diff });
    w.skipToBoss();
    run(w, 0.2);
    for (const h of w.dragon.heads) h.cool = 99;
    return w;
  };
  it('têtes plus ou moins résistantes selon la difficulté', () => {
    expect(boss(0).dragon.heads[0]?.hp).toBe(90);
    expect(boss(2).dragon.heads[0]?.hp).toBe(156);
  });
  it('le diadème protège la tête tant que la gueule est fermée', async () => {
    const w = boss();
    const { hitHead, headOpen } = await import('../../src/sim/combat');
    const h = w.dragon.heads[3];
    if (!h) throw new Error();
    expect(headOpen(h)).toBe(false);
    h.cool = 0.5;
    expect(headOpen(h)).toBe(true);
    hitHead(w, h, 5, h.pos, true);
    expect(h.hp).toBe(115);
  });
  it('sept têtes abattues : le corps se défait, puis victoire', async () => {
    const w = boss();
    const { killHead } = await import('../../src/sim/combat');
    for (const h of w.dragon.heads) killHead(w, h);
    expect(w.phase).toBe('bossdying');
    expect(w.headsLeft()).toBe(0);
    run(w, 8, [], () => (w.player.hp = 100));
    expect(w.dragon.alive).toBe(false);
    expect(w.state).toBe('won');
    expect(w.score).toBeGreaterThan(5000);
  });
  it('anneau de feu en phase de rage (trois têtes ou moins)', async () => {
    const w = boss();
    const { killHead } = await import('../../src/sim/combat');
    for (const h of w.dragon.heads.slice(0, 4)) killHead(w, h);
    w.dragon.ringT = 0.05;
    const ev = run(w, 0.3, [], () => (w.player.hp = 100));
    expect(ev.some((e) => e.type === 'sfx' && e.name === 'ringFire')).toBe(true);
    expect(w.fires.filter((f) => f.life > 0).length).toBeGreaterThanOrEqual(18);
  });
});

describe('temps et déterminisme', () => {
  it('la pause fige le temps de jeu', () => {
    const { w } = playing();
    w.setPaused(true);
    const t = w.time;
    run(w, 2);
    expect(w.time).toBe(t);
    w.setPaused(false);
    run(w, 1);
    expect(w.time).toBeGreaterThan(t);
  });
  it('l’arrêt sur image ralentit le temps', () => {
    const { w } = playing();
    w.stopT = 0.1;
    const t = w.time;
    w.frame(0.05);
    expect(w.time - t).toBeLessThan(0.01);
  });
  it('pas fixe : même résultat à 30 ou 60 images par seconde', () => {
    const a = new World({ seed: 3 }), b = new World({ seed: 3 });
    a.start();
    b.start();
    for (let i = 0; i < 600; i++) a.frame(1 / 60);
    for (let i = 0; i < 300; i++) b.frame(1 / 30);
    expect(Math.abs(a.time - b.time)).toBeLessThanOrEqual(FIXED_DT + 1e-9);
  });
  it('même graine et mêmes commandes : même partie', () => {
    const play = (seed: number) => {
      const w = new World({ seed });
      w.start();
      for (let i = 0; i < 1800; i++) {
        w.input.mx = Math.sin(i / 50);
        w.input.fire = i % 3 === 0;
        w.frame(1 / 60);
        w.events.length = 0;
      }
      return { score: w.score, pos: w.player.pos.toArray(), demons: w.demons.map((d) => d.pos.toArray()), hp: w.player.hp };
    };
    expect(play(11)).toEqual(play(11));
    expect(play(11)).not.toEqual(play(12));
  });
});
