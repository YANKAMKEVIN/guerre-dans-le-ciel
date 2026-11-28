// Projectiles : traits de lumière de l'ange, boules de feu ennemies, orbe du Jugement.
import { Vector3 } from 'three';
import { BOLT_SPEED } from './config';
import { damp } from './math';
import { multiWord } from './score';
import type { Fire, Head } from './types';
import type { World } from './world';

const tmp = new Vector3();

/** gueule embrasée : seul moment où le diadème ne protège plus la tête */
export const headOpen = (h: Head): boolean => h.alive && (h.cool < 1.1 || h.lunge > 0.05);

export function spawnFire(w: World, from: Vector3, d: Vector3, speed: number, r: number, dmg: number): void {
  let f: Fire | null = null;
  for (const o of w.fires) if (o.life <= 0) { f = o; break; }
  if (!f) return;
  f.pos.copy(from);
  f.v.copy(d).multiplyScalar(speed);
  f.life = 6;
  f.r = r;
  f.dmg = dmg;
}

/* ---------- Jugement : orbe de lumière qui suit la cible et explose ---------- */
export function explodeJudgement(w: World): void {
  const J = w.J, p = J.pos;
  J.on = false;
  w.burst(p, 9, 7, 3, 150, 260, 1.4);
  w.burst(p, 8, 5, 1.5, 80, 120, 2);
  w.events.push({ type: 'ring', x: p.x, y: p.y, z: p.z });
  w.shake = w.reduced ? 0 : 0.45;
  w.stopT = 0.09;
  w.sfx('judgeBoom');
  let nk = 0;
  for (let i = w.demons.length - 1; i >= 0; i--) {
    const d = w.demons[i];
    if (d && d.pos.distanceTo(p) < 120) {
      w.registerHit();
      w.killDemon(i, true);
      nk++;
    }
  }
  const mw = multiWord(nk);
  if (mw) w.word(mw, p, 'feat');
  for (const f of w.fires) if (f.life > 0 && f.pos.distanceTo(p) < 170) f.life = 0;
  const D = w.dragon;
  if (D.alive && D.dying < 0) {
    let any = false;
    for (const h of D.heads)
      if (h.alive && h.pos.distanceTo(p) < 150) {
        any = true;
        hitHead(w, h, 16, h.pos, true);
      }
    if (any) w.word('JUGEMENT !', p, 'crit');
  }
}

export function updateJudgement(w: World, dt: number): void {
  const J = w.J;
  if (!J.on) return;
  J.life += dt;
  if (w.lock) {
    tmp.copy(w.lock.pos).sub(J.pos);
    if (tmp.length() < 40) {
      explodeJudgement(w);
      return;
    }
    tmp.normalize().multiplyScalar(500);
    J.v.lerp(tmp, damp(3.2, dt));
  }
  J.pos.addScaledVector(J.v, dt);
  if (J.life > 2.6 || J.pos.y < w.terrain.height(J.pos.x, J.pos.z) + 10) explodeJudgement(w);
}

/* ---------- têtes du Dragon ---------- */
export function hitHead(w: World, h: Head, dmg: number, p: Vector3, crit: boolean): void {
  if (!h.alive) return;
  h.hp -= dmg;
  h.flash = 1;
  w.registerHit();
  w.burst(p, 9, 6, 2, crit ? 24 : 10, 100, 0.6);
  w.sfx('hit');
  w.score += Math.round(dmg * 12 * w.mult);
  if (w.time - h.wordT > 0.6) {
    w.word(crit ? 'GUEULE OUVERTE !' : 'DIADÈME', p, crit ? 'crit' : '');
    h.wordT = w.time;
  }
  if (h.hp <= 0) killHead(w, h);
}

export function killHead(w: World, h: Head): void {
  h.alive = false;
  h.hp = 0;
  w.burst(h.pos, 9, 3, 0.6, 160, 200, 1.8);
  w.burst(h.pos, 8, 6, 2, 60, 90, 1.2);
  for (const n of h.neck) w.burst(n.pos, 8, 2, 0.4, 14, 80, 1);
  w.sfx('roar');
  w.sfx('boom');
  w.stopT = 0.14;
  w.shake = w.reduced ? 0 : 0.6;
  const n = w.headsLeft();
  w.word(n ? 'UNE TÊTE TOMBE ! ' + (w.dragon.heads.length - n) + '/7' : 'LA DERNIÈRE TÊTE !', h.pos, 'feat');
  w.gain(Math.round(600 * w.mult), h.pos);
  if (!n) {
    w.dragon.hp = 0;
    checkDragonDown(w);
  }
}

export function checkDragonDown(w: World): void {
  const D = w.dragon;
  if (D.hp <= 0 && D.dying < 0) {
    D.hp = 0;
    D.dying = D.segs.length - 1;
    D.dieT = 0;
    w.phase = 'bossdying';
    w.setBanner('Le serpent ancien vacille', '', 3);
    w.sfx('roar');
  }
}

/* ---------- traits de lumière ---------- */
export function updateBolts(w: World, dt: number): void {
  const D = w.dragon;
  for (const b of w.bolts) {
    if (b.life <= 0) continue;
    b.life -= dt;
    if (b.ref && b.tgt && b.ref.alive) {
      // traits verrouillés : légère courbe vers la cible
      tmp.copy(b.tgt).sub(b.pos);
      if (tmp.lengthSq() > 1) {
        tmp.normalize().multiplyScalar(BOLT_SPEED);
        b.v.lerp(tmp, damp(5, dt));
      }
    }
    b.pos.addScaledVector(b.v, dt);
    let hit = false;
    const p = b.pos;
    for (let i = w.demons.length - 1; i >= 0 && !hit; i--) {
      const d = w.demons[i];
      if (d && p.distanceToSquared(d.pos) < 19 * 19) {
        hit = true;
        d.hp--;
        d.flash = 1;
        w.learn('fire');
        w.registerHit();
        w.burst(p, 8, 6, 2, 16, 80, 0.5);
        w.sfx('hit');
        if (d.hp <= 0) w.killDemon(i);
        else if (w.time - d.wordT > 0.5) {
          w.word('TOUCHÉ', p);
          d.wordT = w.time;
        }
      }
    }
    if (!hit && D.alive && D.dying < 0) {
      for (const h of D.heads) {
        if (!h.alive) continue;
        if (p.distanceToSquared(h.pos) < 26 * 26) {
          hit = true;
          const open = headOpen(h);
          hitHead(w, h, open ? 5 : 0.6, p, open); // diadème : la tête n'est vulnérable que gueule ouverte
          break;
        }
        for (const n of h.neck) {
          const rr = n.r + 6;
          if (p.distanceToSquared(n.pos) < rr * rr) {
            hit = true;
            hitHead(w, h, 0.4, p, false);
            break;
          }
        }
        if (hit) break;
      }
      if (!hit)
        for (const s of D.segs) {
          const rr = s.r + 7;
          if (p.distanceToSquared(s.pos) < rr * rr) {
            hit = true;
            w.burst(p, 4, 3, 3, 6, 50, 0.3);
            D.flash = 0.3;
            // le corps transmet un peu de dégâts à la tête la plus proche : jamais de blocage
            let nh: Head | null = null, nd = 1e9;
            for (const h of D.heads)
              if (h.alive) {
                const dd = h.pos.distanceTo(p);
                if (dd < nd) { nd = dd; nh = h; }
              }
            if (nh) {
              nh.hp -= 0.15;
              nh.flash = Math.max(nh.flash, 0.3);
              if (nh.hp <= 0) killHead(w, nh);
            }
            if (w.time - D.wordT > 1.2) {
              w.word('ÉCAILLES : VISEZ LES TÊTES', p);
              D.wordT = w.time;
            }
            break;
          }
        }
    }
    if (hit || b.life <= 0) b.life = 0;
  }
}

/* ---------- boules de feu ---------- */
export function updateFires(w: World, dt: number): void {
  const P = w.player;
  for (const f of w.fires) {
    if (f.life <= 0) continue;
    f.life -= dt;
    f.pos.addScaledVector(f.v, dt);
    const rr = f.r + 4.5;
    if (w.state === 'play' && P.dodgeT <= 0 && f.pos.distanceToSquared(P.pos) < rr * rr) {
      w.damagePlayer(f.dmg);
      w.burst(P.pos, 1.6, 0.55, 0.15, 10, 60, 0.45);
      f.life = 0;
    }
  }
}
