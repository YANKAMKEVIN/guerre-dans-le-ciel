// Compatibilité avec les anciennes critiques (tests/critiques/critiques.js) : elles lisaient les objets three
// de la version monolithique (d.g.position, f.m.visible…). Ces vues les traduisent vers les objets de la simulation.
import type { Vector3 } from 'three';
import type { World } from './sim/world';
import type { GameRenderer } from './render/scene';
import type { AudioEngine } from './audio/engine';
import { demonAlt } from './sim/demons';
import { SKY_CEIL } from './sim/config';

const cache = new WeakMap<object, object>();
function view<T extends object>(o: T, extra: (o: T) => Record<string, unknown>): T {
  let v = cache.get(o);
  if (!v) {
    const ex = extra(o);
    v = new Proxy(o, {
      get: (t, k) => (k in ex ? ex[k as string] : Reflect.get(t, k)),
      set: (t, k, val) => (k in ex ? true : Reflect.set(t, k, val)),
    });
    cache.set(o, v);
  }
  return v as T;
}
const node = (position: Vector3, visible: () => boolean, hide: () => void = () => {}) => ({
  position,
  scale: { setScalar: () => {} },
  get visible() { return visible(); },
  set visible(v: boolean) { if (!v) hide(); },
});

export function legacyDebug(w: World, gfx: GameRenderer, audio: AudioEngine): Record<string, unknown> {
  const demonView = (d: World['demons'][number]) => view(d, (o) => ({ g: node(o.pos, () => o.alive) }));
  const fireView = (f: World['fires'][number]) => view(f, (o) => ({ m: node(o.pos, () => o.life > 0, () => (o.life = 0)) }));
  const headView = (h: World['dragon']['heads'][number]) => view(h, (o) => ({ g: node(o.pos, () => o.alive) }));
  const dragon = view(w.dragon, (o) => ({ head: node(o.pos, () => o.headVisible), heads: o.heads.map(headView) }));
  return {
    SKY_CEIL,
    demonAlt: (x: number, z: number, y: number) => demonAlt(w, x, z, y),
    get P() { return w.player; },
    get demons() { return w.demons.map(demonView); },
    get fires() { return w.fires.map(fireView); },
    get dragon() { return dragon; },
    get dragonHeads() { return dragon.heads; },
    get lockT() { return w.lock; },
    get time() { return w.time; },
    get combo() { return w.combo; },
    get tuto() { return w.tuto; },
    get settings() { return w.settings; },
    get renderer() { return gfx.renderer; },
    get camera() { return gfx.camera; },
    get cloudPass() { return gfx.cloudPass; },
    get AU() { return audio.au; },
    get ac() { return audio.ac; },
    get angelU() { return null; },
    get veg() { return { near: gfx.land.roundT, far: gfx.land.roundF, R: gfx.land.vegNear, cx: gfx.land.vcx, cz: gfx.land.vcz }; },
    hit: () => w.registerHit(),
    gain: (n: number) => w.gain(n, w.player.pos),
  };
}
