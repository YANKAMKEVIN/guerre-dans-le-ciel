// Le Dragon : un corps en segments qui suit le poitrail, et sept têtes sur leurs cous (Apocalypse 12:3).
import { Matrix4, Quaternion, Vector3 } from 'three';
import { NECK, NHEAD, NSEG, SPACING } from './config';
import { clamp, damp, lerp } from './math';
import type { Dragon, Head } from './types';
import type { World } from './world';
import { spawnFire } from './combat';

const UP = new Vector3(0, 1, 0);
const hF = new Vector3(), hR = new Vector3(), hU = new Vector3(), hT = new Vector3(), hP0 = new Vector3(), hP1 = new Vector3();
const hW = new Vector3(), tail = new Vector3(), tmp = new Vector3(), look = new Quaternion(), m4 = new Matrix4();
/** bouche de chaque tête, dans le repère de la tête */
export const MOUTH_OFFSET = new Vector3(0, -1, 18);

/** Orientation d'un objet placé en `from` qui regarde `target` (comme Object3D.lookAt pour un objet sans parent). */
export function lookQuat(out: Quaternion, from: Vector3, target: Vector3): Quaternion {
  return out.setFromRotationMatrix(m4.lookAt(target, from, UP));
}

export function makeDragon(): Dragon {
  const segs = [];
  for (let i = 0; i < NSEG; i++) segs.push({ pos: new Vector3(), r: lerp(15, 3.2, Math.pow(i / (NSEG - 1), 1.15)), visible: true });
  const heads: Head[] = [];
  for (let k = 0; k < NHEAD; k++) {
    const neck = [];
    for (let i = 0; i < NECK; i++) neck.push({ pos: new Vector3(), r: lerp(11, 6.5, i / (NECK - 1)) });
    heads.push({ k, alive: true, pos: new Vector3(), quat: new Quaternion(), hp: 120, cool: 3, flash: 0, wordT: -9, phase: k * 0.9, lunge: 0, snap: false, neck });
  }
  return { pos: new Vector3(), v: new Vector3(0, 60, 0), visible: false, headVisible: true, alive: false, hp: 0, max: 140, ang: 0, dying: -1, dieT: 0, flash: 0, wordT: -9, ringT: 4, segs, heads };
}

export function spawnDragon(w: World): void {
  const D = w.dragon, P = w.player;
  D.alive = true;
  D.dying = -1;
  D.visible = true;
  D.headVisible = true;
  D.pos.copy(P.pos).addScaledVector(P.fwd, 650);
  D.pos.y = w.terrain.height(D.pos.x, D.pos.z) - 120; // il surgit de la vallée
  D.v.set(0, 150, 0);
  D.segs.forEach((s, i) => {
    s.visible = true;
    s.pos.copy(D.pos);
    s.pos.y -= (i + 1) * SPACING;
  });
  const hp = w.headHp;
  for (const h of D.heads) {
    h.alive = true;
    h.hp = hp;
    h.snap = true;
    h.cool = w.rng.range(3, 6);
    h.flash = 0;
    for (const n of h.neck) n.pos.copy(D.pos);
  }
  D.max = NHEAD * hp;
  D.hp = D.max;
  w.events.push({ type: 'hint', key: 'diadem' });
  w.phase = 'boss';
  w.sfx('roar');
}

function updateHeads(w: World, dt: number, rage: boolean): void {
  const D = w.dragon, P = w.player, J0 = D.pos, t0 = w.time;
  hF.copy(D.v);
  if (hF.lengthSq() < 1) hF.set(0, 0, 1);
  hF.normalize();
  hR.crossVectors(hF, UP).normalize();
  hU.crossVectors(hR, hF).normalize();
  for (const h of D.heads) {
    if (!h.alive) continue;
    const k = h.k, a = (k - 3) * 0.36;
    hT.copy(J0)
      .addScaledVector(hF, 100 * Math.cos(a))
      .addScaledVector(hR, 160 * Math.sin(a) + Math.sin(t0 * 1.1 + h.phase) * 12)
      .addScaledVector(hU, 72 + (3 - Math.abs(k - 3)) * 15 + Math.sin(t0 * 1.4 + h.phase) * 15);
    if (h.lunge > 0) {
      hW.copy(P.pos).sub(hT).normalize();
      hT.addScaledVector(hW, 70 * h.lunge);
      h.lunge = Math.max(0, h.lunge - dt * 1.8);
    }
    if (h.snap) {
      h.pos.copy(hT);
      h.snap = false;
    } else h.pos.lerp(hT, damp(6, dt));
    if (h.pos.distanceTo(P.pos) < 1300) lookQuat(look, h.pos, P.pos);
    else lookQuat(look, h.pos, hW.copy(h.pos).add(hF));
    h.quat.slerp(look, damp(5, dt));
    // cou : courbe de Bézier du poitrail jusqu'à la nuque, qui ondule
    hP0.copy(J0).addScaledVector(hF, 14).addScaledVector(hU, 8).addScaledVector(hR, (k - 3) * 3);
    tail.set(0, 0, -1).applyQuaternion(h.quat).multiplyScalar(-14).add(h.pos);
    hP1.copy(hP0).lerp(tail, 0.5).addScaledVector(hU, 38);
    for (let i = 0; i < NECK; i++) {
      const t = (i + 1) / (NECK + 1), u = 1 - t, n = h.neck[i];
      if (!n) continue;
      n.pos.set(
        u * u * hP0.x + 2 * u * t * hP1.x + t * t * tail.x,
        u * u * hP0.y + 2 * u * t * hP1.y + t * t * tail.y,
        u * u * hP0.z + 2 * u * t * hP1.z + t * t * tail.z,
      );
      const st = Math.sin(t * Math.PI);
      n.pos.addScaledVector(hR, Math.sin(t0 * 2.3 - i * 0.7 + h.phase) * 5.5 * st);
      n.pos.addScaledVector(hU, Math.cos(t0 * 1.9 - i * 0.6 + h.phase) * 3 * st);
    }
    if (h.flash > 0) h.flash = Math.max(0, h.flash - dt * 5);
    h.cool -= dt;
    if (h.cool <= 0 && w.state === 'play') {
      // deux boules de feu visées en avance sur l'ange, et la tête mord
      h.cool = w.rng.range(4, 5.6) * (rage ? 0.75 : 1) * w.df.rate;
      h.lunge = 1;
      hW.copy(MOUTH_OFFSET).applyQuaternion(h.quat).add(h.pos);
      const t = hW.distanceTo(P.pos) / 270;
      for (let q = 0; q < 2; q++) {
        tmp.copy(P.pos).addScaledVector(P.vel, t * w.rng.range(0.6, 1.05)).sub(hW).normalize();
        tmp.x += w.rng.range(-0.08, 0.08);
        tmp.y += w.rng.range(-0.08, 0.08);
        tmp.z += w.rng.range(-0.08, 0.08);
        spawnFire(w, hW, tmp.normalize(), 270, 5, 11);
      }
      w.sfx('fire', hW);
    }
    if (w.state === 'play' && P.sinceHit > 0.9 && h.pos.distanceTo(P.pos) < 28) w.damagePlayer(20);
  }
  let hp = 0;
  for (const h of D.heads) if (h.alive) hp += h.hp;
  D.hp = hp;
}

export function updateDragon(w: World, dt: number): void {
  const D = w.dragon, P = w.player;
  if (!D.alive) return;
  if (D.flash > 0) D.flash = Math.max(0, D.flash - dt * 5);
  if (D.dying >= 0) {
    // le corps se défait segment par segment
    D.dieT -= dt;
    D.v.multiplyScalar(1 - dt * 0.8);
    D.v.y -= 30 * dt;
    while (D.dieT <= 0 && D.dying >= 0) {
      const s = D.segs[D.dying];
      if (s) {
        w.burst(s.pos, 8, 2, 0.4, 26, 110, 1.4);
        s.visible = false;
      }
      D.dying--;
      D.dieT += 0.07;
      if (D.dying % 4 === 0) w.sfx('boom');
      w.score += 20;
    }
    if (D.dying < 0) {
      w.burst(D.pos, 9, 5, 1.5, 260, 240, 2.6);
      w.burst(D.pos, 9, 1.5, 0.2, 160, 120, 3);
      D.headVisible = false;
      D.alive = false;
      w.sfx('boom');
      w.score += 5000;
      w.pending = { t: 2.4, n: -1 };
    }
  } else {
    const left = w.headsLeft(), rage = left <= 3;
    D.ang += dt * (rage ? 0.55 : 0.4);
    const orR = 380 - (NHEAD - left) * 24; // il se rapproche à mesure qu'il perd ses têtes
    tmp.set(P.pos.x + Math.cos(D.ang) * orR, P.pos.y + Math.sin(D.ang * 1.7) * 110, P.pos.z + Math.sin(D.ang) * orR).addScaledVector(P.fwd, 140);
    tmp.sub(D.pos);
    const dist = tmp.length();
    tmp.normalize().multiplyScalar(Math.min(rage ? 285 : 250, 60 + dist));
    D.v.lerp(tmp, damp(1.3, dt));
    updateHeads(w, dt, rage);
    if (rage && w.state === 'play') {
      D.ringT -= dt;
      if (D.ringT <= 0) {
        // anneau de feu en phase de rage
        D.ringT = 7;
        for (let k = 0; k < 18; k++) {
          const a = (k / 18) * 6.283;
          tmp.set(Math.cos(a), w.rng.range(-0.12, 0.12), Math.sin(a)).normalize();
          spawnFire(w, D.pos, tmp, 190, 6, 12);
        }
        w.sfx('ringFire');
        w.word('ANNEAU DE FEU', D.pos, 'crit');
      }
    }
    if (w.state === 'play' && P.sinceHit > 0.9)
      for (const s of D.segs) {
        const rr = s.r + 4;
        if (s.pos.distanceToSquared(P.pos) < rr * rr) {
          w.damagePlayer(16);
          break;
        }
      }
  }
  D.pos.addScaledVector(D.v, dt);
  let prev = D.pos;
  for (const s of D.segs) {
    tmp.copy(s.pos).sub(prev);
    const l = tmp.length() || 1;
    s.pos.copy(prev).addScaledVector(tmp, SPACING / l);
    prev = s.pos;
  }
}

/** fissures du diadème selon les dégâts : 0 intact, 1 fissuré, 2 très fissuré */
export const crownDamage = (hp: number, max: number): 0 | 1 | 2 => {
  const f = clamp(hp / max, 0, 1);
  return f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
};
