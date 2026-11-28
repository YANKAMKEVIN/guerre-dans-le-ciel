// Vol de l'ange : commandes, plafond et sol, élan, esquive, régénération et tir.
import { BOLT_SPEED, DODGE_T, SKY_CEIL } from './config';
import { clamp, damp, deadZone, lerp } from './math';
import type { World } from './world';
import { Vector3 } from 'three';

const UP = new Vector3(0, 1, 0);
const side = new Vector3();
const dir = new Vector3();

export function updatePlayer(w: World, dt: number): void {
  const P = w.player, I = w.input, S = w.settings;
  let sx: number, sy: number, boost = false;
  if (w.state === 'play') {
    sx = clamp(deadZone(I.mx) * S.sens + I.kx, -1, 1);
    sy = clamp(deadZone(I.my) * S.sens + I.ky, -1, 1) * (S.invY ? -1 : 1);
    boost = I.boost;
  } else if (w.state === 'dead') {
    sx = 0.3;
    sy = 0.9;
  } else {
    // vol libre derrière le menu
    sx = Math.sin(w.time * 0.3) * 0.22;
    sy = clamp((P.pos.y - 320) * 0.004 + P.pitch * 1.2, -0.4, 0.4);
  }
  P.boost = boost;
  P.yaw -= sx * (1.85 + (P.speed > 150 ? 0.25 : 0)) * dt;
  P.pitch = clamp(P.pitch - sy * 1.4 * dt, -1.15, 1.15);
  const gy = w.terrain.height(P.pos.x, P.pos.z);
  if (w.state !== 'dead') {
    if (P.pos.y < gy + 110 && P.pitch < 0.3) P.pitch += 2.4 * dt;
    if (P.pos.y > SKY_CEIL && P.pitch > -0.2) P.pitch -= 1.8 * dt;
  }
  P.speed = lerp(P.speed, boost ? 195 : 112, damp(3, dt));
  const cp = Math.cos(P.pitch);
  P.fwd.set(-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp);
  P.vel.copy(P.fwd).multiplyScalar(P.speed);
  P.pos.addScaledVector(P.vel, dt);
  P.grounded = P.pos.y < gy + 14;
  if (P.grounded) P.pos.y = gy + 14;
  P.roll = lerp(P.roll, -sx * 0.75, damp(5, dt));
  P.jCool = Math.max(0, P.jCool - dt);
  P.dodgeCool = Math.max(0, P.dodgeCool - dt);
  if (P.dodgeT > 0) {
    P.dodgeT = Math.max(0, P.dodgeT - dt);
    side.crossVectors(P.fwd, UP).normalize();
    P.pos.addScaledVector(side, P.dodgeDir * 330 * (P.dodgeT / DODGE_T + 0.2) * dt);
  }
  P.castT = Math.max(0, P.castT - dt * 2.2);
  // tir et régénération
  P.fireT -= dt;
  P.sinceHit += dt;
  const regen = P.sinceHit > 5 && w.state === 'play' && P.hp < 100;
  if (regen) P.hp = Math.min(100, P.hp + 2 * dt);
  else P.regenFrom = P.hp;
  if (w.state === 'play' && I.fire && P.fireT <= 0) {
    P.fireT = 0.13;
    const L = w.lock;
    dir.copy(P.fwd);
    if (L) {
      const t = L.pos.distanceTo(P.pos) / BOLT_SPEED;
      dir.copy(L.pos).addScaledVector(L.vel, t).sub(P.pos).normalize();
    }
    let b = null;
    for (const o of w.bolts) if (o.life <= 0) { b = o; break; }
    if (b) {
      b.pos.copy(P.pos).addScaledVector(P.fwd, 8);
      b.v.copy(dir).multiplyScalar(BOLT_SPEED);
      b.life = 1.5;
      b.ref = L ? L.ref : null;
      b.tgt = L ? L.pos : null;
      w.sfx('shoot');
      P.castT = 1;
    }
  }
}
