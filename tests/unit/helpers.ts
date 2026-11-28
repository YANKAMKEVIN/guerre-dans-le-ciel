import { World, type WorldOptions } from '../../src/sim/world';
import type { GameEvent } from '../../src/sim/types';

/** Monde de test : partie lancée, événements collectés. */
export function playing(opts: WorldOptions = {}): { w: World; ev: GameEvent[] } {
  const w = new World({ seed: 42, ...opts });
  const ev: GameEvent[] = [];
  w.start();
  ev.push(...w.events);
  w.events.length = 0;
  return { w, ev };
}
/** Avance de `seconds` secondes réelles à 60 images par seconde, en collectant les événements. */
export function run(w: World, seconds: number, ev: GameEvent[] = [], each?: () => void): GameEvent[] {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    each?.();
    w.frame(1 / 60);
    ev.push(...w.events);
    w.events.length = 0;
  }
  return ev;
}
/** Place un démon juste devant l'ange. */
export function demonAhead(w: World, dist = 260) {
  const d = w.demons[0];
  if (!d) throw new Error('aucun démon');
  d.pos.copy(w.player.pos).addScaledVector(w.player.fwd, dist);
  d.v.set(0, 0, 0);
  return d;
}
