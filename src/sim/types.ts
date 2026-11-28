// Types de la simulation. Les positions sont des Vector3 de three (calcul pur, aucun objet de rendu).
import type { Quaternion, Vector3 } from 'three';
import type { WordClass } from './score';

export type GameState = 'menu' | 'play' | 'dead' | 'won';
export type Phase = 'idle' | 'fight' | 'bossintro' | 'boss' | 'bossdying';

export interface Player {
  pos: Vector3;
  vel: Vector3;
  fwd: Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  hp: number;
  sinceHit: number;
  fireT: number;
  jCool: number;
  dodgeT: number;
  dodgeCool: number;
  dodgeDir: number;
  /** bras tendus après un tir (pose de l'ange) */
  castT: number;
  /** Lumière au début de la régénération en cours */
  regenFrom: number;
  boost: boolean;
  grounded: boolean;
}

export interface Demon {
  id: number;
  alive: boolean;
  pos: Vector3;
  v: Vector3;
  hp: number;
  orbit: number;
  orbS: number;
  rad: number;
  h: number;
  cool: number;
  ph: number;
  throwT: number;
  flash: number;
  wordT: number;
}

export interface Bolt {
  pos: Vector3;
  v: Vector3;
  life: number;
  ref: Demon | Head | null;
  tgt: Vector3 | null;
}

export interface Fire {
  pos: Vector3;
  v: Vector3;
  life: number;
  r: number;
  dmg: number;
}

export interface NeckSeg {
  pos: Vector3;
  r: number;
}
export interface Head {
  k: number;
  alive: boolean;
  pos: Vector3;
  quat: Quaternion;
  hp: number;
  cool: number;
  flash: number;
  wordT: number;
  phase: number;
  lunge: number;
  snap: boolean;
  neck: NeckSeg[];
}
export interface BodySeg {
  pos: Vector3;
  r: number;
  visible: boolean;
}
export interface Dragon {
  /** position du poitrail (le « head » de la version d'origine) */
  pos: Vector3;
  v: Vector3;
  visible: boolean;
  headVisible: boolean;
  alive: boolean;
  hp: number;
  max: number;
  ang: number;
  dying: number;
  dieT: number;
  flash: number;
  wordT: number;
  ringT: number;
  segs: BodySeg[];
  heads: Head[];
}

export interface Judgement {
  pos: Vector3;
  v: Vector3;
  life: number;
  on: boolean;
}

export interface LockTarget {
  pos: Vector3;
  vel: Vector3;
  ref: Demon | Head;
  boss: boolean;
}

/** Commandes lues par la simulation à chaque pas. */
export interface InputState {
  /** souris ou joystick, de -1 à 1 */
  mx: number;
  my: number;
  /** clavier : -1, 0 ou 1 */
  kx: number;
  ky: number;
  fire: boolean;
  boost: boolean;
}

export interface Settings {
  sens: number;
  invY: boolean;
}

export type SfxName =
  | 'shoot' | 'hit' | 'boom' | 'roar' | 'hurt' | 'fire' | 'whoosh' | 'judge' | 'judgeBoom' | 'wave' | 'win' | 'lose' | 'ringFire' | 'tier';

export interface Pos3 {
  x: number;
  y: number;
  z: number;
}
/** Événements émis par la simulation, consommés par le rendu, l'audio et l'interface. */
export type GameEvent =
  | ({ type: 'burst'; r: number; g: number; b: number; n: number; speed: number; life: number } & Pos3)
  | { type: 'sfx'; name: SfxName; at: Pos3 | null; arg: number }
  | ({ type: 'word'; text: string; cls: WordClass } & Pos3)
  | ({ type: 'ring' } & Pos3)
  | { type: 'demonSpawn'; demon: Demon }
  | { type: 'demonRemove'; demon: Demon }
  | { type: 'hint'; key: 'diadem' }
  | { type: 'start'; fromMenu: boolean }
  | { type: 'end'; won: boolean }
  | { type: 'menu' };

export interface RunStats {
  t0: number;
  maxCombo: number;
  kills: number;
  hurt: number;
}
