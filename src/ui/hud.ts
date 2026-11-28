// Interface en jeu : Lumière, score et combo, recharges, verrou, mots d'impact, flèches hors champ, diadèmes du Dragon.
import { Vector3, type Camera } from 'three';
import { COMBO_T, DODGE_COOL, J_COOL } from '../sim/config';
import { crownDamage } from '../sim/dragon';
import { clamp } from '../sim/math';
import { fmtN } from '../sim/score';
import type { World } from '../sim/world';
import { headOpen } from '../sim/combat';
import { $, setStyle, setText } from './dom';

const FARC_D = 340;
const tmp = new Vector3(), tmp2 = new Vector3();

interface Word {
  el: HTMLElement;
  pos: Vector3;
  t0: number;
  on: boolean;
  dx: number;
  dy: number;
}

/** recharge d'une compétence : anneau (--p), état prêt, éclat à l'instant où elle redevient disponible */
export function cdUi(el: HTMLElement, p: number, ready: boolean): void {
  setStyle(el, '--p', p.toFixed(3));
  const was = el.classList.contains('ready');
  if (ready !== was) {
    el.classList.toggle('ready', ready);
    el.classList.toggle('flash', ready);
  }
}

export class Hud {
  private readonly words: Word[] = [];
  private readonly arrows: HTMLElement[] = [];
  private readonly farcs: HTMLElement[] = [];
  private readonly threatD = new Float32Array(16);
  private readonly threatX = new Float32Array(16);
  private readonly threatY = new Float32Array(16);
  private readonly order: number[] = [];
  private readonly crowns: SVGSVGElement[] = [];
  private readonly el = {
    hp: $('hp'), hpBar: $('hpBar'), hpGain: $('hpGain'), danger: $('danger'), score: $('score'), combo: $('combo'), comboBar: $('comboBar'),
    lock: $('lock'), cross: $('cross'), hurt: $('hurt'), boss: $('boss'), bossLabel: $('bossLabel'), waveLabel: $('waveLabel'), banner: $('banner'),
    bTitle: $('bTitle'), bSub: $('bSub'), tJ: $('tJ'), tE: $('tE'), skJ: $('skJ'), skE: $('skE'),
  };
  W = 1;
  H = 1;
  private edgeX = 0;
  private edgeY = 0;

  constructor() {
    const words = $('words'), arrows = $('arrows');
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('div');
      el.className = 'hitword';
      el.hidden = true;
      words.appendChild(el);
      this.words.push({ el, pos: new Vector3(), t0: -9, on: false, dx: 0, dy: 0 });
    }
    for (let i = 0; i < 10; i++) {
      const a = document.createElement('div');
      a.className = 'arrow';
      a.hidden = true;
      arrows.appendChild(a);
      this.arrows.push(a);
    }
    for (let i = 0; i < 4; i++) {
      const a = document.createElement('div');
      a.className = 'farc';
      a.hidden = true;
      arrows.appendChild(a);
      this.farcs.push(a);
    }
    for (let i = 0; i < 7; i++) {
      const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      sv.setAttribute('viewBox', '0 0 28 22');
      sv.setAttribute('class', 'crown');
      sv.innerHTML = '<path d="M3 20H25L27 5 20 12 14 2 8 12 1 5Z"/><path class="c1" d="M14 2l-2 6 3 4-2 8"/><path class="c2" d="M8 12l2 3-2 5M20 12l-1.5 4 2 4"/>';
      $('crowns').appendChild(sv);
      this.crowns.push(sv);
    }
    for (let i = 0; i < 16; i++) this.order.push(i);
  }

  word(text: string, x: number, y: number, z: number, cls: string, now: number): void {
    const w = this.words.find((o) => !o.on) ?? (this.words[0] as Word);
    w.on = true;
    w.t0 = now;
    w.pos.set(x, y, z);
    w.el.textContent = text;
    w.el.className = 'hitword' + (cls ? ' ' + cls : '');
    w.el.hidden = false;
    w.dx = (Math.random() - 0.5) * 80;
    let stacked = 0;
    for (const o of this.words) if (o.on && now - o.t0 < 0.4) stacked++;
    w.dy = -(stacked - 1) * 30;
  }
  /** palier de multiplicateur : le chiffre grossit */
  bump(tier: number): void {
    const el = this.el.combo;
    setStyle(el, '--tier', String(tier));
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  clearWords(): void {
    for (const w of this.words) {
      w.on = false;
      w.el.hidden = true;
    }
  }

  /** bord d'écran : direction d'un point hors champ (faux s'il est visible) ; résultat dans edgeX/edgeY */
  private edge(p: Vector3, cam: Camera): boolean {
    tmp.copy(p).project(cam);
    let x = tmp.x, y = tmp.y;
    const behind = tmp.z > 1;
    if (behind) { x = -x; y = -y; }
    if (!behind && Math.abs(x) < 0.93 && Math.abs(y) < 0.9) return false;
    const m = Math.max(Math.abs(x) / 0.93, Math.abs(y) / 0.88, 0.001);
    this.edgeX = x / m;
    this.edgeY = y / m;
    return true;
  }
  private nArrows = 0;
  private mark(p: Vector3, boss: boolean, cam: Camera): void {
    if (this.nArrows >= this.arrows.length || !this.edge(p, cam)) return;
    const a = this.arrows[this.nArrows++] as HTMLElement, x = this.edgeX, y = this.edgeY;
    a.hidden = false;
    a.classList.toggle('boss', boss);
    setStyle(a, 'left', this.sx(x));
    setStyle(a, 'top', this.sy(y));
    setStyle(a, 'transform', 'translate(-50%,-50%) rotate(' + Math.atan2(-y, x).toFixed(3) + 'rad)');
  }
  private sx(x: number): string {
    return ((x * 0.5 + 0.5) * this.W).toFixed(1) + 'px';
  }
  private sy(y: number): string {
    return ((-y * 0.5 + 0.5) * this.H).toFixed(1) + 'px';
  }

  update(w: World, cam: Camera, touch: boolean): void {
    const E = this.el, P = w.player, play = w.state === 'play', t = w.time;
    setStyle(E.hp, 'width', P.hp.toFixed(2) + '%');
    const low = w.lowLight(), from = Math.min(P.regenFrom, P.hp), gainOn = play && P.hp - from > 0.2;
    E.hpBar.classList.toggle('low', low);
    E.danger.classList.toggle('on', low);
    E.hpGain.classList.toggle('on', gainOn);
    if (gainOn) {
      setStyle(E.hpGain, 'left', from.toFixed(2) + '%');
      setStyle(E.hpGain, 'width', (P.hp - from).toFixed(2) + '%');
    }
    setText(E.score, fmtN(w.score));
    const m = w.mult;
    setText(E.combo, w.combo >= 3 ? '×' + w.combo + (m > 1 ? '  ·  score ×' + m : '') : '');
    const comboOn = w.combo >= 3 && play;
    E.comboBar.classList.toggle('on', comboOn);
    if (comboOn) setStyle(E.comboBar.firstElementChild as HTMLElement, 'width', (clamp(w.comboT / COMBO_T, 0, 1) * 100).toFixed(1) + '%');
    if (w.combo < 5) setStyle(E.combo, '--tier', '0');
    const jp = 1 - P.jCool / J_COOL, jr = P.jCool <= 0 && !w.J.on, ep = 1 - P.dodgeCool / DODGE_COOL, er = P.dodgeCool <= 0;
    if (touch) {
      cdUi(E.tJ, jp, jr);
      cdUi(E.tE, ep, er);
    } else {
      cdUi(E.skJ, jp, jr);
      cdUi(E.skE, ep, er);
    }
    // bandeau, vague, Dragon
    E.banner.classList.toggle('on', w.banner.t > 0);
    setText(E.bTitle, w.banner.title);
    setText(E.bSub, w.banner.sub);
    setText(E.waveLabel, w.waveLabel());
    const D = w.dragon, bossOn = (play || w.state === 'dead') && D.visible;
    E.boss.hidden = !bossOn;
    if (bossOn) {
      const n = w.headsLeft(), max = w.headHp;
      setText(E.bossLabel, 'Le Dragon, le serpent ancien · ' + n + (n > 1 ? ' têtes' : ' tête'));
      for (let i = 0; i < D.heads.length; i++) {
        const h = D.heads[i], c = this.crowns[i]?.classList;
        if (!h || !c) continue;
        const dmg = crownDamage(h.hp, max);
        c.toggle('dead', !h.alive);
        c.toggle('d1', h.alive && dmg === 1);
        c.toggle('d2', h.alive && dmg === 2);
        c.toggle('open', D.dying < 0 && headOpen(h));
      }
    }
    // verrou : braise tant que le diadème protège la tête, or quand la gueule s'embrase
    const lk = E.lock, L = w.lock;
    let lockShown = false;
    if (L && play) {
      tmp.copy(L.pos).project(cam);
      if (tmp.z < 1 && Math.abs(tmp.x) < 1 && Math.abs(tmp.y) < 1) {
        lockShown = true;
        const open = L.boss && headOpen(L.ref as never);
        lk.classList.toggle('boss', L.boss && !open);
        lk.classList.toggle('open', open);
        setStyle(lk, 'left', this.sx(tmp.x));
        setStyle(lk, 'top', this.sy(tmp.y));
        setStyle(lk, 'transform', 'rotate(' + (45 + t * 60).toFixed(1) + 'deg) scale(' + (1 + Math.sin(t * 7) * 0.06).toFixed(3) + ')');
      }
    }
    lk.hidden = !lockShown;
    // mots d'impact
    for (const o of this.words) {
      if (!o.on) continue;
      const age = t - o.t0;
      if (age > 0.95 || age < 0) {
        o.on = false;
        o.el.hidden = true;
        continue;
      }
      tmp.copy(o.pos).project(cam);
      if (tmp.z > 1) {
        o.el.style.opacity = '0';
        continue;
      }
      const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.6 : 1.2 - Math.min(0.2, (age - 0.12) * 0.5);
      o.el.style.opacity = String(age < 0.6 ? 1 : 1 - (age - 0.6) / 0.35);
      o.el.style.transform = 'translate(' + ((tmp.x * 0.5 + 0.5) * this.W + o.dx) + 'px,' + ((-tmp.y * 0.5 + 0.5) * this.H - age * 70 + o.dy) + 'px) translate(-50%,-50%) scale(' + pop + ')';
    }
    setStyle(E.hurt, 'opacity', (w.hurt * 0.9).toFixed(3));
    tmp.copy(P.pos).addScaledVector(P.fwd, 420).project(cam);
    setStyle(E.cross, 'left', this.sx(tmp.x));
    setStyle(E.cross, 'top', this.sy(tmp.y));
    // flèches vers les ennemis hors champ ; le Dragon a la sienne, en fer de lance
    this.nArrows = 0;
    if (play) {
      for (const d of w.demons) this.mark(d.pos, false, cam);
      if (D.alive) this.mark(D.pos, true, cam);
    }
    for (let i = this.nArrows; i < this.arrows.length; i++) (this.arrows[i] as HTMLElement).hidden = true;
    // boules de feu proches qui foncent sur l'ange sans être à l'écran : arc orange, plus vif de près
    let nt = 0;
    if (play)
      for (const f of w.fires) {
        if (f.life <= 0 || nt >= this.threatD.length) continue;
        tmp2.copy(P.pos).sub(f.pos);
        const d = tmp2.length();
        if (d > FARC_D || tmp2.dot(f.v) <= 0 || !this.edge(f.pos, cam)) continue;
        this.threatD[nt] = d;
        this.threatX[nt] = this.edgeX;
        this.threatY[nt] = this.edgeY;
        nt++;
      }
    const ord = this.order;
    for (let i = 0; i < 16; i++) ord[i] = i;
    for (let i = 1; i < nt; i++)
      for (let j = i; j > 0 && (this.threatD[ord[j] as number] as number) < (this.threatD[ord[j - 1] as number] as number); j--) {
        const s = ord[j] as number;
        ord[j] = ord[j - 1] as number;
        ord[j - 1] = s;
      }
    for (let i = 0; i < this.farcs.length; i++) {
      const a = this.farcs[i] as HTMLElement;
      a.hidden = i >= nt;
      if (i >= nt) continue;
      const q = ord[i] as number, k = 1 - (this.threatD[q] as number) / FARC_D, x = this.threatX[q] as number, y = this.threatY[q] as number;
      setStyle(a, 'left', this.sx(x * 0.9));
      setStyle(a, 'top', this.sy(y * 0.9));
      setStyle(a, 'opacity', (0.3 + 0.7 * k).toFixed(2));
      setStyle(a, 'transform', 'rotate(' + Math.atan2(-y, x).toFixed(3) + 'rad) scale(' + (0.75 + 0.6 * k).toFixed(2) + ')');
    }
  }
}
