// Accès de contrôle pour les tests de bout en bout (window.__dbg). Ne change rien au jeu.
import type { World } from './sim/world';
import type { GameRenderer } from './render/scene';
import type { AudioEngine } from './audio/engine';
import type { Screens } from './ui/screens';
import type { Hud } from './ui/hud';
import type { DiffIndex } from './sim/config';
import { fmtN, killWord, multiWord as multWordSafe, rankOf } from './sim/score';

export interface DebugApi {
  world: World;
  readonly state: string;
  readonly phase: string;
  readonly paused: boolean;
  readonly score: number;
  readonly wave: number;
  input(x: number, y: number, fire: boolean): void;
  judge(): void;
  dodge(): void;
  hurt(d: number): void;
  win(): void;
  boss(): void;
  setDiff(i: DiffIndex): void;
  fast(): void;
  quality(): { level: number; frameMs: number; dpr: number; clouds: number };
  renderInfo(): { calls: number; triangles: number };
  killWord: typeof killWord;
  multiWord: typeof multWordSafe;
  rankOf: typeof rankOf;
  fmtN: typeof fmtN;
}

declare global {
  interface Window {
    __dbg: DebugApi;
  }
}

export function installDebug(o: { world: World; gfx: GameRenderer; audio: AudioEngine; screens: Screens; hud: Hud }): void {
  const { world: w, gfx, screens } = o;
  window.__dbg = {
    world: w,
    get state() { return w.state; },
    get phase() { return w.phase; },
    get paused() { return w.paused; },
    get score() { return w.score; },
    get wave() { return w.wave; },
    input(x, y, fire) {
      w.input.mx = x;
      w.input.my = y;
      w.input.fire = fire;
    },
    judge: () => w.judge(),
    dodge: () => w.dodge(),
    hurt: (d) => w.damagePlayer(d),
    win: () => w.win(),
    boss: () => w.skipToBoss(),
    setDiff: (i) => screens.setDiff(i),
    fast: () => gfx.fast(),
    quality: () => ({ level: gfx.quality.level, frameMs: gfx.quality.frameMs, dpr: gfx.renderer.getPixelRatio(), clouds: gfx.cloudPass.scale }),
    renderInfo: () => ({ calls: gfx.renderer.info.render.calls, triangles: gfx.renderer.info.render.triangles }),
    killWord, multiWord: multWordSafe, rankOf, fmtN,
  };
}
