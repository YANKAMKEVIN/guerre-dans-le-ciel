// Pilote automatique : vise la cible la plus proche, tire quand la cible est verrouillée, et selon son niveau
// lance le Jugement et esquive. Porté depuis les « critiques » (tests/critiques.js) ; le hasard du pilote a sa propre graine.
// Le virage a un terme intégral : sans lui, un démon qui tourne autour de l'ange garde un retard constant plus large que
// le cône de verrouillage, et le pilote le poursuit sans fin (ronde 4).
import { Vector3 } from 'three';
import { clamp } from './math';
import { Rng } from './rng';
import type { World } from './world';

export interface PilotLevel {
  /** retard de réaction (s) : le pilote vise la position d'il y a `delay` secondes */
  delay: number;
  /** bruit de visée (rad) */
  noise: number;
  /** probabilité de tirer à chaque décision quand une cible est verrouillée */
  fireRate: number;
  judge: boolean;
  dodge: boolean;
  /** esquive « lucide » : seulement contre une boule de feu qui arrive vraiment, un peu plus tôt */
  smartDodge?: boolean;
}
export const PILOTS = {
  expert: { delay: 0, noise: 0, fireRate: 1, judge: true, dodge: true },
  /** pilote de la CI : réflexes parfaits et esquive lucide */
  champion: { delay: 0, noise: 0, fireRate: 1, judge: true, dodge: true, smartDodge: true },
  moyen: { delay: 0, noise: 0, fireRate: 1, judge: false, dodge: false },
  debutant: { delay: 0.35, noise: 0.25, fireRate: 0.6, judge: false, dodge: false },
} as const satisfies Record<string, PilotLevel>;

const HIST = 64;
const rel = new Vector3(), relV = new Vector3();

export class Pilot {
  private readonly rng: Rng;
  private readonly hist: { t: number; has: boolean; p: Vector3 }[] = [];
  private head = 0;
  private len = 0;
  private iy = 0;
  private lt: number;
  /** intervalle entre deux décisions (s), comme le setInterval de 60 ms d'origine */
  readonly period = 0.06;

  constructor(private readonly w: World, private readonly o: PilotLevel, seed = 7) {
    this.rng = new Rng(seed);
    for (let i = 0; i < HIST; i++) this.hist.push({ t: 0, has: false, p: new Vector3() });
    this.lt = w.time;
  }

  private push(t: number, p: Vector3 | null): void {
    const e = this.hist[(this.head + this.len) % HIST] as { t: number; has: boolean; p: Vector3 };
    e.t = t;
    e.has = !!p;
    if (p) e.p.copy(p);
    if (this.len < HIST) this.len++;
    else this.head = (this.head + 1) % HIST;
  }
  private at(i: number): { t: number; has: boolean; p: Vector3 } {
    return this.hist[(this.head + i) % HIST] as { t: number; has: boolean; p: Vector3 };
  }

  /** Une décision : écrit les commandes dans world.input. */
  tick(): void {
    const w = this.w, P = w.player, o = this.o, D = w.dragon;
    if (w.state !== 'play') return;
    let tgt: Vector3 | null = null, best = 1e9;
    for (const d of w.demons) {
      const dd = d.pos.distanceTo(P.pos);
      if (dd < best) { best = dd; tgt = d.pos; }
    }
    if (D.alive && D.dying < 0)
      for (const h of D.heads)
        if (h.alive) {
          const dd = h.pos.distanceTo(P.pos);
          if (dd < best) { best = dd; tgt = h.pos; }
        }
    this.push(w.time, tgt);
    while (this.len > 2 && this.at(1).t < w.time - o.delay) {
      this.head = (this.head + 1) % HIST;
      this.len--;
    }
    const seenE = this.at(0), seen = seenE.has ? seenE.p : null;
    let sx = 0, sy = 0, fire = false;
    const dtp = Math.min(0.2, w.time - this.lt);
    this.lt = w.time;
    if (seen) {
      const dx = seen.x - P.pos.x, dy = seen.y - P.pos.y, dz = seen.z - P.pos.z, dist = Math.hypot(dx, dy, dz) || 1;
      let err = Math.atan2(-dx, -dz) - P.yaw;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      err += (this.rng.next() - 0.5) * o.noise;
      const pt = Math.asin(clamp(dy / dist, -1, 1)) + (this.rng.next() - 0.5) * o.noise;
      this.iy = clamp(this.iy + err * dtp, -0.4, 0.4);
      sx = clamp(-(err * 2.5 + this.iy * 2), -1, 1);
      sy = clamp(-(pt - P.pitch) * 2.5, -1, 1);
      if (dist < 110) sx = sx > 0 ? 1 : -1;
      fire = !!w.lock && this.rng.next() < o.fireRate;
      if (o.judge && w.lock) {
        let near = 0;
        for (const d of w.demons) if (d.pos.distanceTo(P.pos) < 420) near++;
        if (near >= 2 || D.alive) w.judge();
      }
    } else this.iy = 0;
    if (o.dodge && o.smartDodge) {
      for (const f of w.fires) {
        if (f.life <= 0) continue;
        rel.copy(f.pos).sub(P.pos);
        relV.copy(f.v).sub(P.vel);
        const closing = -rel.dot(relV) / (relV.lengthSq() || 1); // instant de plus courte distance
        if (closing < 0 || closing > 0.4) continue;
        const miss = rel.addScaledVector(relV, closing).length();
        if (miss < f.r + 9) {
          w.dodge();
          break;
        }
      }
    } else if (o.dodge)
      for (const f of w.fires)
        if (f.life > 0 && f.pos.distanceTo(P.pos) < 90) {
          w.dodge();
          break;
        }
    w.input.mx = sx * 0.85;
    w.input.my = sy * 0.85;
    w.input.fire = fire;
  }
}

export interface BotResult {
  outcome: 'won' | 'dead' | 'timeout';
  gameTime: number;
  score: number;
  hpMin: number;
  headsLeft: number;
  wave: number;
  phases: Record<string, number>;
}

/** Joue une partie entière sans rendu, à 60 images par seconde simulées. */
export function playGame(w: World, level: PilotLevel, opts: { maxGameTime?: number; pilotSeed?: number } = {}): BotResult {
  const pilot = new Pilot(w, level, opts.pilotSeed ?? 7), maxT = opts.maxGameTime ?? 900, frame = 1 / 60;
  w.start();
  w.events.length = 0;
  let hpMin = 100, acc = 0;
  const t0 = w.time, phases: Record<string, number> = {};
  while (w.state === 'play' && w.time - t0 < maxT) {
    acc += frame;
    if (acc >= pilot.period) {
      acc -= pilot.period;
      pilot.tick();
    }
    w.frame(frame);
    w.events.length = 0;
    hpMin = Math.min(hpMin, w.player.hp);
    const key = w.phase === 'boss' || w.phase === 'bossdying' ? 'dragon' : 'vague ' + w.wave;
    phases[key] = (phases[key] ?? 0) + frame;
  }
  return {
    outcome: w.state === 'won' ? 'won' : w.state === 'dead' ? 'dead' : 'timeout',
    gameTime: Math.round(w.time - t0), score: w.score, hpMin: Math.round(hpMin), headsLeft: w.headsLeft(), wave: w.wave,
    phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, Math.round(v)])),
  };
}
