// Démons : apparition autour de l'ange, orbite, tir de boules de feu.
import { Vector3 } from 'three';
import { SKY_CEIL } from './config';
import { damp } from './math';
import type { Demon } from './types';
import type { World } from './world';
import { spawnFire } from './combat';

const tmp = new Vector3();

/** Altitude d'un démon : entre le relief + 40 et le plafond − 40, sinon il devient inatteignable (blocage en vague 3, ronde 4). */
export function demonAlt(w: World, x: number, z: number, y: number): number {
  return Math.max(w.terrain.height(x, z) + 40, Math.min(SKY_CEIL - 40, y));
}

export function makeDemon(w: World): Demon {
  const R = w.rng;
  return {
    id: w.newDemonId(), alive: true, pos: new Vector3(), v: new Vector3(), hp: w.diff === 2 ? 10 : 7,
    orbit: R.range(0, 6.28), orbS: R.range(0.25, 0.6) * (R.next() < 0.5 ? -1 : 1), rad: R.range(150, 300), h: R.range(-50, 90),
    cool: R.range(1.5, 3.5), ph: R.range(0, 6), throwT: 0, flash: 0, wordT: -9,
  };
}

export function spawnDemons(w: World, n: number): void {
  const P = w.player, R = w.rng;
  for (let i = 0; i < n; i++) {
    const d = makeDemon(w), a = R.range(0, 6.283);
    d.pos.set(P.pos.x + Math.cos(a) * R.range(520, 760), P.pos.y + R.range(-60, 140), P.pos.z + Math.sin(a) * R.range(520, 760));
    d.pos.y = demonAlt(w, d.pos.x, d.pos.z, d.pos.y);
    w.demons.push(d);
    w.events.push({ type: 'demonSpawn', demon: d });
  }
}

export function updateDemons(w: World, dt: number): void {
  const P = w.player;
  for (const d of w.demons) {
    d.orbit += dt * d.orbS;
    if (d.flash > 0) d.flash = Math.max(0, d.flash - dt * 6);
    tmp.set(P.pos.x + Math.cos(d.orbit) * d.rad, P.pos.y + d.h, P.pos.z + Math.sin(d.orbit) * d.rad).addScaledVector(P.fwd, 90);
    tmp.y = demonAlt(w, tmp.x, tmp.z, tmp.y);
    tmp.sub(d.pos);
    const dist = tmp.length();
    tmp.normalize().multiplyScalar(Math.min(235, dist * 1.6));
    d.v.lerp(tmp, damp(2.2, dt));
    d.pos.addScaledVector(d.v, dt);
    d.throwT = Math.max(0, d.throwT - dt * 2.2);
    d.cool -= dt;
    const dp = d.pos.distanceTo(P.pos);
    if (d.cool <= 0 && dp < 650 && w.state === 'play') {
      d.cool = w.rng.range(1.5, 2.7) * w.df.rate;
      const t = dp / 250;
      tmp.copy(P.pos).addScaledVector(P.vel, t * w.rng.range(0.8, 1.05)).sub(d.pos).normalize();
      spawnFire(w, d.pos, tmp, 250, 3.2, 9);
      d.throwT = 1;
      w.sfx('fire', d.pos);
    }
  }
}
