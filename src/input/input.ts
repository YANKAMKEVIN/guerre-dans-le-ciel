// Entrées : clavier, souris, joystick tactile et boutons ronds. Elles écrivent dans world.input et déclenchent des actions.
import type { InputState } from '../sim/types';

export interface InputActions {
  pause(): void;
  judge(): void;
  dodge(): void;
  toggleMute(): void;
  toggleMusic(): void;
  /** premier contact tactile : passer en mode tactile */
  touch(): void;
  /** n'importe quel appui : réveiller l'audio */
  gesture(): void;
}

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** rayon de course du joystick (px) */
export const JOY_RADIUS = 55;

/** Position normalisée du joystick à partir du déplacement du doigt (bornée au cercle). */
export function joystick(dx: number, dy: number, m = JOY_RADIUS): { x: number; y: number; dx: number; dy: number } {
  const l = Math.hypot(dx, dy);
  if (l > m) {
    dx *= m / l;
    dy *= m / l;
  }
  return { x: dx / m, y: dy / m, dx, dy };
}

export class Input {
  readonly keys: Record<string, boolean> = {};
  touchMode = false;
  private mouseFire = false;
  private touchFire = false;
  private touchBoost = false;
  private jid: number | null = null;
  private jx = 0;
  private jy = 0;

  constructor(private readonly stage: HTMLElement, private readonly state: InputState, private readonly act: InputActions) {
    addEventListener('keydown', (e) => this.keydown(e));
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.syncKeys();
    });
    stage.addEventListener('pointermove', (e) => {
      if (this.touchMode) return;
      this.aimMouse(e);
    });
    stage.addEventListener('pointerdown', (e) => this.pointerdown(e));
    addEventListener('pointerup', (e) => {
      if (!this.touchMode && e.button !== 2) this.mouseFire = false;
      this.syncFire();
    });
    stage.addEventListener('pointerleave', () => {
      if (this.touchMode) return;
      state.mx = 0;
      state.my = 0;
    });
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('pointerdown', () => act.gesture());
    this.setupJoystick();
  }

  private keydown(e: KeyboardEvent): void {
    this.keys[e.code] = true;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.code === 'KeyM') this.act.toggleMute();
    if (e.code === 'KeyN') this.act.toggleMusic();
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) this.act.pause();
    if (e.code === 'KeyE' && !e.repeat) this.act.dodge();
    if (e.code === 'KeyF' && !e.repeat) this.act.judge();
    this.syncKeys();
  }

  private syncKeys(): void {
    const k = this.keys, s = this.state;
    s.kx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    s.ky = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    s.boost = !!(k.ShiftLeft || k.ShiftRight) || this.touchBoost;
    this.syncFire();
  }
  private syncFire(): void {
    this.state.fire = this.mouseFire || this.touchFire || !!this.keys.Space;
  }
  /** à appeler quand la partie se met en pause ou s'arrête : plus de tir maintenu */
  releaseFire(): void {
    this.mouseFire = this.touchFire = false;
    this.syncFire();
  }

  private aimMouse(e: PointerEvent): void {
    const r = this.stage.getBoundingClientRect();
    this.state.mx = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.state.my = ((e.clientY - r.top) / r.height) * 2 - 1;
  }

  private pointerdown(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.act.touch();
      return;
    }
    if (this.touchMode) return;
    if (e.button === 2) {
      this.act.judge();
      return;
    }
    this.mouseFire = true;
    this.syncFire();
    this.aimMouse(e);
  }

  private setupJoystick(): void {
    const joy = document.getElementById('joy') as HTMLElement, knob = joy.firstElementChild as HTMLElement, s = this.state;
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || (e.target as Element).closest('#tbtns,.screen')) return;
      const r = this.stage.getBoundingClientRect();
      if (e.clientX - r.left > r.width * 0.55) return;
      this.jid = e.pointerId;
      this.jx = e.clientX;
      this.jy = e.clientY;
      joy.style.display = 'block';
      joy.style.left = this.jx - r.left + 'px';
      joy.style.top = this.jy - r.top + 'px';
      knob.style.transform = '';
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.jid) return;
      const j = joystick(e.clientX - this.jx, e.clientY - this.jy);
      knob.style.transform = 'translate(' + j.dx + 'px,' + j.dy + 'px)';
      s.mx = j.x;
      s.my = j.y;
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.jid) return;
      this.jid = null;
      joy.style.display = 'none';
      s.mx = 0;
      s.my = 0;
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    const hold = (id: string, on: () => void, off: () => void): void => {
      const el = document.getElementById(id) as HTMLElement;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        on();
      });
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    const noop = (): void => {};
    hold('tFire', () => ((this.touchFire = true), this.syncFire()), () => ((this.touchFire = false), this.syncFire()));
    hold('tB', () => ((this.touchBoost = true), this.syncKeys()), () => ((this.touchBoost = false), this.syncKeys()));
    hold('tJ', () => this.act.judge(), noop);
    hold('tE', () => this.act.dodge(), noop);
    hold('tP', () => this.act.pause(), noop);
  }
}
