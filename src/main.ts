// Point d'entrée : relie la simulation, le rendu, l'audio, les entrées et l'interface, puis lance la boucle.
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/spectral/400.css';
import '@fontsource/spectral/400-italic.css';
import '@fontsource/spectral/600.css';
import { World } from './sim/world';
import type { GameEvent } from './sim/types';
import { clamp } from './sim/math';
import { GameRenderer } from './render/scene';
import { AudioEngine } from './audio/engine';
import { Input } from './input/input';
import { Hud } from './ui/hud';
import { DIADEM_HINT, Hints } from './ui/hint';
import { Screens } from './ui/screens';
import { pauseWhenHidden } from './ui/visibility';
import { $ } from './ui/dom';
import { SaveStore } from './save/save';
import { installDebug } from './debug';

const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
const stage = $('stage');
const world = new World({ seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, reduced });
const save = new SaveStore();
const audio = new AudioEngine();
const gfx = new GameRenderer($<HTMLCanvasElement>('gl'), world, reduced);
const hud = new Hud();
const hints = new Hints($('hint'));

let input: Input | null = null;
const screens = new Screens(world, save, audio, {
  onStart: () => {
    audio.init();
    hints.reset();
  },
  onPause: (p) => {
    input?.releaseFire();
    if (p) audio.suspend();
    else audio.resume();
  },
}, reduced);

const persistVolumes = (): void => {
  audio.setVolumes();
};
input = new Input(stage, world.input, {
  pause: () => screens.togglePause(),
  judge: () => world.judge(),
  dodge: () => world.dodge(),
  toggleMute: () => {
    audio.muted = !audio.muted;
    persistVolumes();
  },
  toggleMusic: () => {
    audio.musicOn = !audio.musicOn;
    persistVolumes();
  },
  touch: () => enableTouch(),
  gesture: () => audio.init(),
});

/* ---------- commandes tactiles : joystick à gauche, boutons à droite ; qualité allégée ---------- */
function enableTouch(): void {
  if (!input || input.touchMode) return;
  input.touchMode = true;
  document.body.classList.add('touch');
  $('touch').hidden = false;
  gfx.useTouchQuality();
  resize();
}

pauseWhenHidden(document, () => screens.togglePause(true));

/* ---------- chargement : le bouton s'active quand les modèles et la vallée sont prêts (15 s au plus) ---------- */
const LOAD_TOTAL = 4;
let loaded = 0;
const ready = (): void => {
  const b = $<HTMLButtonElement>('play');
  b.disabled = false;
  b.textContent = 'Prendre son envol';
};
gfx.loadAssets(() => {
  loaded++;
  if (loaded >= LOAD_TOTAL) ready();
  else $('play').textContent = 'Préparation du ciel… ' + loaded + '/' + LOAD_TOTAL;
});
setTimeout(() => {
  if ($<HTMLButtonElement>('play').disabled) ready();
}, 15000);

function resize(): void {
  const W = stage.clientWidth || 1, H = stage.clientHeight || 1;
  gfx.resize(W, H);
  hud.W = W;
  hud.H = H;
}
addEventListener('resize', resize);
new ResizeObserver(resize).observe(stage);
resize();

function dispatch(e: GameEvent): void {
  switch (e.type) {
    case 'sfx':
      audio.play(e.name, e.at, e.arg, world.player.pos);
      if (e.name === 'tier') hud.bump(e.arg);
      break;
    case 'word':
      hud.word(e.text, e.x, e.y, e.z, e.cls, world.time);
      break;
    case 'hint':
      hints.holdHint(DIADEM_HINT, 9, world.time);
      break;
    case 'end':
      world.banner.t = 0;
      screens.onEnd(e.won);
      break;
    default:
      gfx.handle(e);
  }
}

/* ---------- boucle ---------- */
const t0 = performance.now();
let last = t0;
function frame(now: number): void {
  const real = clamp((now - last) / 1000, 0, 1);
  last = now;
  const dt = world.frame(real);
  const ev = world.events;
  for (let i = 0; i < ev.length; i++) dispatch(ev[i] as GameEvent);
  ev.length = 0;
  screens.update(real);
  gfx.render(dt, real);
  hud.update(world, gfx.camera, !!input?.touchMode);
  hints.update(world, !!input?.touchMode);
  audio.update(world);
  gfx.sampleFrame(real * 1000, real, (now - t0) / 1000);
  requestAnimationFrame(frame);
}
installDebug({ world, gfx, audio, screens, hud });
requestAnimationFrame(frame);
