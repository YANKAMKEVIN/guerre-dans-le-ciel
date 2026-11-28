// Invites contextuelles : une commande à la fois, au moment où elle sert, effacée dès le geste réussi.
import { Vector3 } from 'three';
import type { World } from '../sim/world';

export type HintKey = 'aim' | 'fire' | 'dodge' | 'judge';
export const HINT_TEXT: Record<HintKey, [string, string]> = {
  aim: ['<b>Souris</b> ou <b>ZQSD</b> : visez un démon', '<b>Joystick</b> : visez un démon'],
  fire: ['<b>Clic</b> ou <b>Espace</b> : frappez !', 'Maintenez <b>Frapper</b>'],
  dodge: ['<b>E</b> : esquivez !', '<b>Esquive</b> : évitez la boule de feu !'],
  judge: ['<b>F</b> ou <b>clic droit</b> : Jugement !', '<b>Jugement</b> : frappez le groupe !'],
};
export const DIADEM_HINT = 'Le diadème protège chaque tête : frappez quand sa gueule s’embrase.';
const tmp = new Vector3();

/** L'invite à afficher maintenant, ou null. Apprend « viser » dès qu'une cible est verrouillée. */
export function tutStep(w: World): HintKey | null {
  const d = w.tuto.done, P = w.player;
  if (!d.dodge && P.dodgeCool <= 0)
    for (const f of w.fires) {
      // une boule de feu approche
      if (f.life <= 0) continue;
      tmp.copy(P.pos).sub(f.pos);
      if (tmp.lengthSq() < 260 * 260 && tmp.dot(f.v) > 0) return 'dodge';
    }
  if (!d.judge && P.jCool <= 0 && !w.J.on && w.lock) {
    if (w.lock.boss || w.wave > 1) return 'judge';
    let n = 0;
    for (const o of w.demons) if (o.pos.distanceToSquared(w.lock.pos) < 200 * 200) n++;
    if (n >= 3) return 'judge'; // trois démons groupés
  }
  if (!d.aim) {
    if (w.lock) w.learn('aim');
    else if (w.demons.length) return 'aim';
  }
  if (!d.fire && w.lock) return 'fire';
  return null;
}

export class Hints {
  private hold: { html: string; until: number } | null = null;
  private shown = '';
  constructor(private readonly el: HTMLElement) {}
  holdHint(html: string, d: number, now: number): void {
    this.hold = { html, until: now + d };
  }
  reset(): void {
    this.hold = null;
  }
  update(w: World, touch: boolean): void {
    let k: HintKey | null = null, html = '';
    if (w.state === 'play') {
      k = tutStep(w);
      if (k !== 'dodge' && this.hold && w.time < this.hold.until) {
        k = null;
        html = this.hold.html;
      } else if (k) html = HINT_TEXT[k][touch ? 1 : 0];
    }
    if (html === this.shown) return;
    this.shown = html;
    if (html) this.el.innerHTML = html;
    this.el.classList.toggle('on', !!html);
    this.el.classList.toggle('urgent', k === 'dodge');
  }
}
