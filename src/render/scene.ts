// Rendu three.js : moteur WebGL, post-traitement (nuages, halo), caméra de poursuite, et synchronisation avec la simulation.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, damp, lerp, smooth01 } from '../sim/math';
import type { GameEvent } from '../sim/types';
import type { World } from '../sim/world';
import { CloudPass, makeVolUniforms } from './clouds';
import { Sky } from './sky';
import { Land } from './land';
import { Particles, Projectiles } from './effects';
import { AngelView } from './angel';
import { DemonsView } from './demons';
import { DragonView } from './dragon';
import { QualityController, DESKTOP_LEVELS, TOUCH_LEVELS, cappedDpr } from './quality';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 1, 24000);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly cloudPass: CloudPass;
  readonly sky: Sky;
  readonly land: Land;
  readonly particles: Particles;
  readonly quality = new QualityController();
  private readonly projectiles: Projectiles;
  readonly angel: AngelView;
  readonly demons: DemonsView;
  readonly dragon: DragonView;
  private readonly vol: ReturnType<typeof makeVolUniforms>;
  private readonly camPos = new THREE.Vector3(0, 270, 30);
  private camIn = 0;
  private readonly tmp = new THREE.Vector3();
  width = 1;
  height = 1;
  /** vue de contrôle pour les tests : caméra placée à côté de l'ange */
  camView: THREE.Vector3 | null = null;

  constructor(canvas: HTMLCanvasElement, private readonly w: World, private readonly reduced: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(cappedDpr(devicePixelRatio, this.quality.current.dpr));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
    this.composer = new EffectComposer(this.renderer, sceneRT);
    const c2 = this.composer.renderTarget2;
    if (!c2.depthTexture || c2.depthTexture === sceneRT.depthTexture) c2.depthTexture = new THREE.DepthTexture(1, 1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.75, 1.3);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.vol = makeVolUniforms(this.camera);
    this.cloudPass = new CloudPass(this.vol);
    this.composer.insertPass(this.cloudPass, 1);
    this.cloudPass.scale = this.quality.current.clouds;

    this.land = new Land(this.scene, w.terrain, this.vol);
    this.sky = new Sky(this.scene, { land: [this.land.terrainMat.color, this.land.crownMat.color, this.land.roofMat.color], bloom: this.bloom });
    this.particles = new Particles(this.scene);
    this.projectiles = new Projectiles(this.scene, w, this.particles);
    this.angel = new AngelView(this.scene);
    this.demons = new DemonsView(this.scene);
    this.dragon = new DragonView(this.scene, w, this.demons.wingMat);
  }

  /** Chargement des modèles et de la vallée ; `done` est appelé à chaque élément prêt (réussi ou non). */
  loadAssets(done: () => void): void {
    const tasks: Promise<unknown>[] = [this.land.loadValley(), this.angel.load(), this.demons.load().then(() => this.demons.prewarm(12)), this.dragon.load()];
    for (const t of tasks) void t.finally(done);
  }

  /** Écran tactile : qualité de départ allégée (DPR 1,3, nuages 0,34), comme la version d'origine. */
  useTouchQuality(): void {
    this.quality.setLevels(TOUCH_LEVELS);
    this.applyQuality();
  }
  useDesktopQuality(): void {
    this.quality.setLevels(DESKTOP_LEVELS);
    this.applyQuality();
  }
  applyQuality(): void {
    const q = this.quality.current;
    this.renderer.setPixelRatio(cappedDpr(devicePixelRatio, q.dpr));
    this.cloudPass.setScale(q.clouds);
    this.resize(this.width, this.height);
  }

  resize(W: number, H: number): void {
    this.width = Math.max(1, W);
    this.height = Math.max(1, H);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  handle(e: GameEvent): void {
    switch (e.type) {
      case 'burst':
        this.particles.burst(e.x, e.y, e.z, e.r, e.g, e.b, e.n, e.speed, e.life);
        break;
      case 'ring':
        this.projectiles.startRing(e.x, e.y, e.z);
        break;
      case 'demonSpawn':
        this.demons.spawn(e.demon);
        break;
      case 'demonRemove':
        this.demons.remove(e.demon);
        break;
      case 'start':
        // depuis le menu : la caméra part de loin et rejoint l'ange pendant que l'image se fond
        if (e.fromMenu && !this.reduced) {
          const P = this.w.player;
          this.camPos.copy(P.pos).addScaledVector(P.fwd, -260);
          this.camPos.y += 130;
          this.camIn = 2;
        }
        break;
    }
  }

  /** Une image : `dt` = temps de jeu écoulé, `real` = temps réel. */
  render(dt: number, real: number): void {
    const w = this.w, P = w.player, cam = this.camera;
    if (w.state === 'dead' && !this.reduced && this.angel.root.visible && Math.random() < 0.6) this.particles.burst(P.pos.x, P.pos.y, P.pos.z, 7, 6.2, 4.2, 2, 26, 1.8); // plumes de lumière
    this.sky.apply(w.mood);
    this.angel.sync(w);
    this.demons.sync(w);
    this.dragon.sync(w, cam);
    this.projectiles.sync(w, dt, cam);
    this.particles.update(dt);
    // caméra de poursuite ; à la mort de l'ange elle s'éloigne et s'élève
    const pull = w.state === 'dead' && !this.reduced ? smooth01(0, 2.6, w.deadT) : 0;
    this.tmp.copy(P.pos).addScaledVector(P.fwd, -30 - pull * 95);
    this.tmp.y += 13 + pull * 38;
    this.camIn = Math.max(0, this.camIn - dt);
    this.camPos.lerp(this.tmp, damp(this.camIn > 0 ? lerp(6, 1.5, this.camIn / 2) : 6, w.state === 'dead' ? Math.min(0.05, real) : dt));
    cam.position.copy(this.camPos);
    if (w.shake > 0) {
      cam.position.x += rand(-1, 1) * w.shake * 3;
      cam.position.y += rand(-1, 1) * w.shake * 3;
    }
    this.tmp.copy(P.pos).addScaledVector(P.fwd, 40);
    cam.lookAt(this.tmp);
    cam.rotateZ(P.roll * 0.5);
    const fov = lerp(62, 76, clamp((P.speed - 112) / 83, 0, 1));
    if (Math.abs(fov - cam.fov) > 0.05) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (this.camView) {
      cam.position.copy(P.pos).add(this.camView);
      cam.lookAt(P.pos);
    }
    this.vol.uTime.value = w.time;
    this.sky.follow(cam.position);
    this.land.updateTerrain(P.pos);
    this.land.updateVeg(P.pos);
    this.composer.render();
  }

  /** Mesure d'image pour la qualité automatique ; `ms` = intervalle entre deux images. */
  sampleFrame(ms: number, real: number, elapsed: number): void {
    if (this.quality.sample(ms, real, elapsed)) this.applyQuality();
  }

  /** Mode rapide pour les tests en rendu logiciel : sans nuages volumétriques ni végétation. */
  fast(): void {
    this.cloudPass.enabled = false;
    for (const m of [this.land.roundT, this.land.roundF, this.land.cypT, this.land.walls, this.land.roofs]) m.visible = false;
  }
}
