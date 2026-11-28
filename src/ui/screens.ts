// Écrans : titre, pause, défaite, victoire ; difficulté, réglages mémorisés, décompte de fin, invitation à tourner le téléphone.
import { DIFF, type DiffIndex } from '../sim/config';
import { clamp } from '../sim/math';
import { RANKS, fmtN, fmtT, rankNext, rankOf } from '../sim/score';
import type { World } from '../sim/world';
import type { AudioEngine } from '../audio/engine';
import type { SaveStore } from '../save/save';
import { $ } from './dom';

export interface ScreenHooks {
  /** une partie commence (ou recommence) */
  onStart(): void;
  /** la pause change : couper ou relancer l'audio, relâcher le tir */
  onPause(paused: boolean): void;
}

interface EndState {
  k: 'dead' | 'won';
  score: number;
  t: number;
  step: number;
  rows: Element[];
  done: boolean;
}

export class Screens {
  private end: EndState | null = null;
  private deadShown = true;

  constructor(
    private readonly w: World,
    private readonly save: SaveStore,
    private readonly audio: AudioEngine,
    private readonly hooks: ScreenHooks,
    private readonly reduced: boolean,
  ) {
    const S = save.data.settings;
    w.diff = S.diff;
    w.settings.sens = S.sens;
    w.settings.invY = S.invY;
    audio.vol.music = S.music;
    audio.vol.sfx = S.sfx;
    $('play').onclick = $('retry').onclick = $('again').onclick = () => this.start();
    document.querySelectorAll<HTMLButtonElement>('.diff button').forEach((b) => (b.onclick = () => this.setDiff(Number(b.dataset.d) as DiffIndex)));
    $('pauseMenu').onclick = $('deadMenu').onclick = $('wonMenu').onclick = () => this.toMenu();
    $('easier').onclick = () => {
      this.setDiff((w.diff - 1) as DiffIndex);
      this.start();
    };
    $('resume').onclick = () => this.togglePause(false);
    $('restart').onclick = () => {
      this.togglePause(false);
      this.start();
    };
    this.setupSettings();
    this.setupTitle();
    this.setupFullscreen();
    this.setupRotate();
    $('pauseKeys').innerHTML = $('cmds').innerHTML; // rappel des commandes dans la pause
    if (matchMedia('(pointer:coarse)').matches) document.body.classList.add('coarse');
    this.setDiff(w.diff);
  }

  /* ---------- réglages ---------- */
  private setupSettings(): void {
    const A = this.audio, w = this.w;
    const vol = (id: string, k: 'music' | 'sfx', preview: boolean): void => {
      const el = $<HTMLInputElement>(id);
      el.value = String(Math.round(A.vol[k] * 100));
      el.oninput = () => {
        A.vol[k] = Number(el.value) / 100;
        A.setVolumes();
        this.save.update((d) => (d.settings[k] = A.vol[k]));
        if (preview && A.au) A.play('shoot');
      };
    };
    vol('volM', 'music', false);
    vol('volS', 'sfx', true);
    vol('volM2', 'music', false);
    vol('volS2', 'sfx', false);
    document.querySelectorAll<HTMLInputElement>('.sens').forEach(
      (e) => (e.oninput = () => {
        w.settings.sens = Number(e.value) / 100;
        this.syncSettings();
      }),
    );
    document.querySelectorAll<HTMLInputElement>('.invY').forEach(
      (e) => (e.onchange = () => {
        w.settings.invY = e.checked;
        this.syncSettings();
      }),
    );
    this.syncSettings();
  }
  /** réglages de pilotage : appliqués au vol, recopiés dans les deux panneaux, mémorisés */
  syncSettings(): void {
    const S = this.w.settings;
    document.querySelectorAll<HTMLInputElement>('.sens').forEach((e) => (e.value = String(Math.round(S.sens * 100))));
    document.querySelectorAll<HTMLInputElement>('.invY').forEach((e) => (e.checked = S.invY));
    this.save.update((d) => {
      d.settings.sens = S.sens;
      d.settings.invY = S.invY;
    });
  }

  private setupTitle(): void {
    // titre découpé en lettres pour l'apparition (le texte complet reste lu d'un bloc par les lecteurs d'écran)
    const h = $('title'), txt = h.textContent ?? '';
    let i = 0;
    h.setAttribute('aria-label', txt);
    h.innerHTML = txt
      .split(' ')
      .map((wd) => '<span class="w" aria-hidden="true">' + [...wd].map((c) => '<span class="l" style="--i:' + i++ + '">' + c + '</span>').join('') + '</span>')
      .join(' ');
    setTimeout(() => $('menu').classList.remove('intro'), 4200);
  }

  private setupFullscreen(): void {
    // plein écran : le bouton n'apparaît que si le navigateur le permet
    const root = document.documentElement, btns = document.querySelectorAll<HTMLButtonElement>('.fs');
    const can = !!(document.fullscreenEnabled && root.requestFullscreen);
    const label = (): void =>
      btns.forEach((b) => {
        b.hidden = !can;
        b.textContent = document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran';
      });
    btns.forEach(
      (b) => (b.onclick = () => {
        const q = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen();
        if (q && q.catch) q.catch(() => {});
      }),
    );
    document.addEventListener('fullscreenchange', label);
    label();
  }

  private setupRotate(): void {
    // téléphone tenu en portrait : on invite à le tourner (la partie se met en pause) ; « Continuer ainsi » referme l'invitation pour de bon
    const mq = matchMedia('(orientation:portrait) and (pointer:coarse)');
    let skip = false;
    const upd = (): void => {
      const on = mq.matches && !skip;
      $('rotate').hidden = !on;
      if (on) this.togglePause(true);
    };
    mq.addEventListener('change', upd);
    $('rotateSkip').onclick = () => {
      skip = true;
      upd();
    };
    upd();
  }

  /* ---------- difficulté et record ---------- */
  setDiff(i: DiffIndex): void {
    this.w.diff = i;
    this.save.update((d) => (d.settings.diff = i));
    const won = this.save.data.records.won;
    document.querySelectorAll<HTMLButtonElement>('.diff button').forEach((b) => {
      const d = Number(b.dataset.d);
      b.setAttribute('aria-checked', String(d === i));
      if (won[d]) {
        b.dataset.won = '1';
        b.title = (DIFF[d]?.n ?? '') + ' : déjà vaincue';
      }
    });
    const df = this.w.df;
    document.querySelectorAll('.diffInfo').forEach((e) => (e.innerHTML = '<b>' + df.n + '</b> : ' + df.info));
    this.showBest();
    // sur l'écran de défaite : proposer la difficulté juste en dessous
    const e = $('easier');
    e.hidden = i === 0;
    if (i > 0) e.textContent = 'Essayer en ' + (DIFF[i - 1]?.n ?? '');
  }
  showBest(): void {
    const b = this.save.data.records.best[this.w.diff];
    $('best').textContent = b ? 'Record ' + this.w.df.n + ' : ' + b.toLocaleString('fr-FR') : '';
  }

  /* ---------- déroulement ---------- */
  start(): void {
    this.hooks.onStart();
    this.w.start();
    this.deadShown = true;
    $('menu').hidden = $('dead').hidden = $('won').hidden = true;
    $('hud').hidden = false;
    $('cross').hidden = false;
  }
  toMenu(): void {
    if (this.w.paused) this.togglePause(false);
    this.w.toMenu();
    for (const id of ['hud', 'cross', 'lock', 'dead', 'won', 'pause']) $(id).hidden = true;
    $('menu').hidden = false;
    this.showBest();
  }
  togglePause(force?: boolean): void {
    const w = this.w;
    if (w.state !== 'play') return;
    w.setPaused(force !== undefined ? force : !w.paused);
    $('pause').hidden = !w.paused;
    if (w.paused) {
      $<HTMLInputElement>('volM2').value = String(Math.round(this.audio.vol.music * 100));
      $<HTMLInputElement>('volS2').value = String(Math.round(this.audio.vol.sfx * 100));
    }
    this.hooks.onPause(w.paused);
  }

  /** fin de partie : record, statistiques, rang ; le panneau de défaite attend la chute de l'ange */
  onEnd(won: boolean): void {
    const w = this.w, k = won ? 'won' : 'dead';
    $('lock').hidden = true;
    $('cross').hidden = true;
    if (won) this.save.markWon(w.diff);
    const t = w.time - w.run.t0, { prev, record } = this.save.recordScore(w.diff, w.score);
    $(k + 'Score').innerHTML = 'Score <span class="num">0</span>' + (record ? '<span class="seal">Record</span>' : '');
    $(k + 'Stats').innerHTML =
      '<b>Difficulté</b><span>' + w.df.n + '</span><b>Durée</b><span>' + fmtT(t) + '</span><b>Combo max</b><span>×' + w.run.maxCombo +
      '</span><b>Démons terrassés</b><span>' + w.run.kills + '</span>' +
      (won ? '' : '<b>Têtes abattues</b><span>' + (w.dragon.heads.length - w.headsLeft()) + ' / 7</span>') +
      '<b>Record</b><span>' + (record ? 'nouveau record !' : fmtN(Math.max(prev, w.score))) + '</span>';
    const r = rankOf(won, w.score, w.run.hurt), rk = $(k + 'Rank');
    rk.className = 'rank';
    rk.innerHTML = '<span>Rang</span><b>' + RANKS[r] + '</b><small>' + rankNext(r) + '</small>';
    this.end = { k, score: w.score, t: -1, step: -1, rows: [...$(k + 'Stats').children], done: false };
    if (won) {
      this.setDiff(w.diff);
      $('won').hidden = false;
    } else this.deadShown = false;
    this.showBest();
  }

  /** chaque image (temps réel) : panneau de défaite après la chute, décompte du score */
  update(real: number): void {
    const w = this.w;
    if (!this.deadShown && w.state === 'dead' && w.deadT >= w.deathPanelDelay) {
      this.deadShown = true;
      $('dead').classList.add('fade');
      $('dead').hidden = false;
    }
    $('art').classList.toggle('off', w.state !== 'menu');
    this.updateEnd(real);
  }

  // décompte : le score défile, les lignes se révèlent une à une avec un tintement, puis le rang et le sceau du record
  private updateEnd(real: number): void {
    const E = this.end;
    if (!E || E.done || $(E.k).hidden) return;
    if (E.t < 0) E.t = 0;
    else E.t += real;
    if (this.reduced) E.t = 99;
    const num = $(E.k + 'Score').querySelector('.num') as HTMLElement, u = clamp(E.t / 1.1, 0, 1);
    num.textContent = fmtN(E.score * (1 - Math.pow(1 - u, 3)));
    const n = E.rows.length / 2, step = Math.min(n, Math.floor((E.t - 0.7) / 0.17));
    while (E.step < step) {
      E.step++;
      if (E.step < n) {
        E.rows[E.step * 2]?.classList.add('in');
        E.rows[E.step * 2 + 1]?.classList.add('in');
        if (!this.reduced) this.audio.play('tick', null, E.step);
      }
    }
    if (E.t > 0.7 + n * 0.17 + 0.3) {
      E.done = true;
      $(E.k + 'Rank').classList.add('in');
      const seal = $(E.k + 'Score').querySelector('.seal');
      if (seal) seal.classList.add('in');
      if (!this.reduced) this.audio.play('rank', null, seal ? 1 : 0);
    }
  }
}
