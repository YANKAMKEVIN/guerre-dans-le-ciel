// Le monde du jeu : état complet d'une partie, avancé à pas fixe. Aucune dépendance au DOM, au rendu ni à l'audio :
// la simulation émet des événements (éclats, sons, mots d'impact…) que les autres couches consomment.
import { Vector3 } from 'three';
import {
  BOLT_POOL, COMBO_T, DEATH_PANEL, DEATH_PANEL_REDUCED, DODGE_COOL, DODGE_T, FIRE_POOL, FIXED_DT, HEAD_HP, J_COOL,
  LOCK_RANGE, LOW_HP, MAX_FRAME_DT, ROMAN, WAVES, diffOf, type DiffIndex, type Difficulty,
} from './config';
import { clamp, damp, lerp } from './math';
import { Rng } from './rng';
import { fmtN, killWord, multOf, tierOf, type WordClass } from './score';
import { Terrain } from './terrain';
import type {
  Bolt, Demon, Dragon, Fire, GameEvent, GameState, Head, InputState, Judgement, LockTarget, Phase, Player, Pos3, RunStats,
  Settings, SfxName,
} from './types';
import { updatePlayer } from './player';
import { headOpen, updateBolts, updateFires, updateJudgement } from './combat';
import { spawnDemons, updateDemons } from './demons';
import { makeDragon, spawnDragon, updateDragon } from './dragon';

export interface WorldOptions {
  seed?: number;
  diff?: DiffIndex;
  terrain?: Terrain;
  /** préférence « réduire les animations » : pas de ralenti à la mort ni de secousses */
  reduced?: boolean;
}

export class World {
  readonly rng: Rng;
  readonly terrain: Terrain;
  readonly reduced: boolean;
  settings: Settings = { sens: 1, invY: false };
  diff: DiffIndex;

  state: GameState = 'menu';
  phase: Phase = 'idle';
  paused = false;
  time = 0;
  score = 0;
  wave = 0;
  pending: { t: number; n: number } | null = null;
  reinf = 0;
  combo = 0;
  comboT = 0;
  /** arrêt sur image après un coup marquant */
  stopT = 0;
  mood = 0;
  moodTarget = 0;
  shake = 0;
  hurt = 0;
  /** temps réel écoulé depuis la chute de l'ange */
  deadT = 0;
  banner = { title: '', sub: '', t: 0 };
  readonly run: RunStats = { t0: 0, maxCombo: 0, kills: 0, hurt: 0 };
  readonly tuto: { done: Record<string, boolean> } = { done: {} };

  readonly player: Player = {
    pos: new Vector3(0, 320, 0), vel: new Vector3(), fwd: new Vector3(0, 0, -1), yaw: 0, pitch: 0, roll: 0, speed: 110, hp: 100,
    sinceHit: 9, fireT: 0, jCool: 0, dodgeT: 0, dodgeCool: 0, dodgeDir: 1, castT: 0, regenFrom: 100, boost: false, grounded: false,
  };
  readonly demons: Demon[] = [];
  readonly bolts: Bolt[] = [];
  readonly fires: Fire[] = [];
  readonly dragon: Dragon = makeDragon();
  readonly J: Judgement = { pos: new Vector3(), v: new Vector3(), life: 0, on: false };
  lock: LockTarget | null = null;
  private readonly lockObj: LockTarget = { pos: new Vector3(), vel: new Vector3(), ref: null as unknown as Demon, boss: false };
  readonly input: InputState = { mx: 0, my: 0, kx: 0, ky: 0, fire: false, boost: false };
  /** événements du pas en cours ; vidés par la boucle après distribution */
  readonly events: GameEvent[] = [];
  private acc = 0;
  private nextId = 1;
  private readonly tmp = new Vector3();

  constructor(opts: WorldOptions = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.terrain = opts.terrain ?? new Terrain();
    this.reduced = !!opts.reduced;
    this.diff = opts.diff ?? 1;
    for (let i = 0; i < BOLT_POOL; i++) this.bolts.push({ pos: new Vector3(), v: new Vector3(), life: 0, ref: null, tgt: null });
    for (let i = 0; i < FIRE_POOL; i++) this.fires.push({ pos: new Vector3(), v: new Vector3(), life: 0, r: 3, dmg: 10 });
  }

  get df(): Difficulty {
    return diffOf(this.diff);
  }
  get headHp(): number {
    return Math.round(HEAD_HP * this.df.hp);
  }
  get mult(): number {
    return multOf(this.combo);
  }
  get deathPanelDelay(): number {
    return this.reduced ? DEATH_PANEL_REDUCED : DEATH_PANEL;
  }
  lowLight(): boolean {
    return this.state === 'play' && this.player.hp > 0 && this.player.hp < LOW_HP;
  }
  headsLeft(): number {
    let n = 0;
    for (const h of this.dragon.heads) if (h.alive) n++;
    return n;
  }
  /** gueule embrasée : seul moment où le diadème ne protège plus la tête */
  static headOpen(h: Head): boolean {
    return headOpen(h);
  }
  waveLabel(): string {
    return this.wave >= 1 && this.wave <= 3 ? 'Vague ' + ROMAN[this.wave - 1] : this.wave > 3 ? 'Le Dragon' : 'Vague I';
  }

  /* ---------- événements ---------- */
  burst(p: Pos3, r: number, g: number, b: number, n: number, speed: number, life: number): void {
    this.events.push({ type: 'burst', x: p.x, y: p.y, z: p.z, r, g, b, n, speed, life });
  }
  sfx(name: SfxName, at: Pos3 | null = null, arg = 0): void {
    this.events.push({ type: 'sfx', name, at: at ? { x: at.x, y: at.y, z: at.z } : null, arg });
  }
  word(text: string, p: Pos3, cls: WordClass = ''): void {
    this.events.push({ type: 'word', text, cls, x: p.x, y: p.y, z: p.z });
  }
  setBanner(title: string, sub: string, d = 3.2): void {
    this.banner.title = title;
    this.banner.sub = sub;
    this.banner.t = d;
  }
  learn(k: string): void {
    this.tuto.done[k] = true;
  }

  /* ---------- boucle ---------- */
  /** Avance d'une image de durée réelle `real` (secondes). Renvoie le temps de jeu écoulé. */
  frame(real: number): number {
    real = clamp(real, 0, 1);
    let dt = Math.min(MAX_FRAME_DT, real);
    if (this.paused) dt = 0;
    if (this.stopT > 0) {
      this.stopT -= dt;
      dt *= 0.06;
    }
    if (this.state === 'dead') {
      this.deadT += real;
      if (!this.reduced) dt *= this.deadT < 1 ? 0.28 : lerp(0.28, 1, clamp(this.deadT - 1, 0, 1)); // une seconde de ralenti
    }
    this.acc += dt;
    while (this.acc >= FIXED_DT) {
      this.step(FIXED_DT);
      this.acc -= FIXED_DT;
    }
    return dt;
  }

  step(dt: number): void {
    this.time += dt;
    this.mood = lerp(this.mood, this.moodTarget, damp(0.7, dt));
    this.updateLock();
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    updatePlayer(this, dt);
    updateJudgement(this, dt);
    updateBolts(this, dt);
    updateFires(this, dt);
    updateDemons(this, dt);
    updateDragon(this, dt);
    const play = this.state === 'play';
    if (play && this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        const n = this.pending.n;
        this.pending = null;
        if (n > 0) spawnDemons(this, n);
        else if (n === 0) spawnDragon(this);
        else this.win();
      }
    } else if (play && this.phase === 'fight' && this.reinf > 0 && this.demons.length <= 2) {
      // renforts quand la première escouade faiblit
      spawnDemons(this, this.reinf);
      this.reinf = 0;
      this.setBanner('Renforts !', 'Une seconde escouade surgit des nuages.', 2.2);
      this.sfx('roar');
    } else if (play && this.phase === 'fight' && this.demons.length === 0) this.nextWave();
    if (this.banner.t > 0) this.banner.t = Math.max(0, this.banner.t - dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  /* ---------- verrouillage de cible ---------- */
  private lockValid(ref: Demon | Head): boolean {
    if ('id' in ref) return ref.alive;
    return ref.alive && this.dragon.alive && this.dragon.dying < 0;
  }
  private lockScore(pos: Vector3): number {
    const t = this.tmp.copy(pos).sub(this.player.pos), dist = t.length();
    if (dist > LOCK_RANGE) return -1;
    return t.normalize().dot(this.player.fwd);
  }
  updateLock(): void {
    if (this.state !== 'play') {
      this.lock = null;
      return;
    }
    if (this.lock && this.lockValid(this.lock.ref) && this.lockScore(this.lock.ref.pos) > 0.927) return;
    let best: Demon | Head | null = null, bd = 0.976, boss = false;
    for (const d of this.demons) {
      const s = this.lockScore(d.pos);
      if (s > bd) { bd = s; best = d; boss = false; }
    }
    if (this.dragon.alive && this.dragon.dying < 0)
      for (const h of this.dragon.heads)
        if (h.alive) {
          const s = this.lockScore(h.pos);
          if (s > bd) { bd = s; best = h; boss = true; }
        }
    if (!best) {
      this.lock = null;
      return;
    }
    const L = this.lockObj;
    L.ref = best;
    L.pos = best.pos;
    L.vel = boss ? this.dragon.v : (best as Demon).v;
    L.boss = boss;
    this.lock = L;
  }

  /* ---------- score ---------- */
  registerHit(): void {
    const m0 = this.mult;
    this.combo++;
    this.comboT = COMBO_T;
    this.run.maxCombo = Math.max(this.run.maxCombo, this.combo);
    if (this.mult > m0) this.sfx('tier', null, tierOf(this.combo)); // palier de multiplicateur
  }
  gain(pts: number, p: Pos3): void {
    this.score += pts;
    this.word('+' + fmtN(pts), p, 'pts');
  }
  killDemon(i: number, byJudge = false): void {
    const d = this.demons[i];
    if (!d) return;
    this.run.kills++;
    this.burst(d.pos, 7, 1.2, 0.3, 60, 120, 1.3);
    this.sfx('boom', d.pos);
    d.alive = false;
    this.demons.splice(i, 1);
    this.events.push({ type: 'demonRemove', demon: d });
    this.stopT = 0.07;
    const [w, c] = killWord(byJudge, this.phase === 'fight' && !this.demons.length && !this.reinf && !this.pending, this.rng.next());
    this.word(w, d.pos, c);
    this.gain(Math.round(100 * this.mult), d.pos);
  }
  newDemonId(): number {
    return this.nextId++;
  }

  /* ---------- actions du joueur ---------- */
  judge(): void {
    const P = this.player, J = this.J;
    if (this.state !== 'play' || P.jCool > 0 || J.on) return;
    this.learn('judge');
    P.jCool = J_COOL;
    J.on = true;
    J.life = 0;
    J.pos.copy(P.pos).addScaledVector(P.fwd, 12);
    const dir = this.tmp.copy(P.fwd);
    if (this.lock) dir.copy(this.lock.pos).sub(P.pos).normalize();
    J.v.copy(dir).multiplyScalar(430).addScaledVector(P.vel, 0.5);
    this.sfx('judge');
  }
  dodge(): void {
    const P = this.player;
    if (this.state !== 'play' || P.dodgeCool > 0) return;
    this.learn('dodge');
    P.dodgeT = DODGE_T;
    P.dodgeCool = DODGE_COOL;
    P.dodgeDir = this.input.kx < 0 || this.input.mx < -0.15 ? -1 : 1;
    this.sfx('whoosh');
  }
  damagePlayer(d: number): void {
    const P = this.player;
    if (this.state !== 'play' || P.dodgeT > 0) return;
    d *= this.df.dmg;
    this.run.hurt += d;
    P.hp -= d;
    P.sinceHit = 0;
    this.hurt = 1;
    this.shake = this.reduced ? 0 : 0.5;
    this.sfx('hurt');
    if (P.hp <= 0) {
      P.hp = 0;
      this.state = 'dead';
      this.deadT = 0;
      this.burst(P.pos, 5, 4, 2, 90, 90, 1.6);
      this.sfx('boom');
      this.sfx('lose');
      this.events.push({ type: 'end', won: false });
    }
  }
  win(): void {
    if (this.state !== 'play') return;
    this.state = 'won';
    this.moodTarget = 0;
    this.sfx('win');
    this.events.push({ type: 'end', won: true });
  }

  /* ---------- déroulement ---------- */
  setPaused(p: boolean): void {
    if (this.state !== 'play') return;
    this.paused = p;
    this.input.fire = false;
  }
  clearField(): void {
    for (const d of this.demons) {
      d.alive = false;
      this.events.push({ type: 'demonRemove', demon: d });
    }
    this.demons.length = 0;
    for (const f of this.fires) f.life = 0;
    for (const b of this.bolts) b.life = 0;
    this.dragon.alive = false;
    this.dragon.dying = -1;
    this.dragon.visible = false;
  }
  start(): void {
    const P = this.player, fromMenu = this.state === 'menu';
    this.deadT = 0;
    this.run.t0 = this.time;
    this.run.maxCombo = 0;
    this.run.kills = 0;
    this.run.hurt = 0;
    this.clearField();
    P.pos.set(0, 320, 0);
    P.yaw = 0;
    P.pitch = 0;
    P.hp = 100;
    P.sinceHit = 9;
    P.jCool = 0;
    P.dodgeT = 0;
    P.dodgeCool = 0;
    this.combo = 0;
    this.comboT = 0;
    this.lock = null;
    this.J.on = false;
    this.score = 0;
    this.wave = 0;
    this.moodTarget = 0;
    this.state = 'play';
    this.events.push({ type: 'start', fromMenu });
    this.nextWave();
  }
  toMenu(): void {
    this.paused = false;
    this.clearField();
    this.state = 'menu';
    this.phase = 'idle';
    this.pending = null;
    this.moodTarget = 0;
    this.lock = null;
    this.J.on = false;
    this.player.hp = 100;
    this.player.sinceHit = 9;
    this.input.fire = false;
    this.banner.t = 0;
    this.events.push({ type: 'menu' });
  }
  nextWave(): void {
    this.wave++;
    const w = WAVES[this.wave - 1];
    if (w) {
      const r = ROMAN[this.wave - 1] as string;
      this.setBanner('Vague ' + r, w.sub);
      this.pending = { t: 2.6, n: w.n };
      this.reinf = w.reinf;
      this.phase = 'fight';
      this.sfx('wave');
    } else {
      this.phase = 'bossintro';
      this.pending = { t: 5.5, n: 0 };
      this.moodTarget = 1;
      this.sfx('roar');
      this.setBanner('Un grand dragon rouge', '« …un grand dragon rouge, ayant sept têtes et dix cornes, et sur ses têtes sept diadèmes. » Apocalypse 12:3', 5.5);
    }
  }
  /** Raccourci de test : saute directement au Dragon. */
  skipToBoss(): void {
    for (const d of this.demons) {
      d.alive = false;
      this.events.push({ type: 'demonRemove', demon: d });
    }
    this.demons.length = 0;
    this.wave = 3;
    this.pending = null;
    this.nextWave();
    if (this.pending) (this.pending as { t: number }).t = 0.1;
  }
}
