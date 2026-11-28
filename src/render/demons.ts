// Démons : visuels réutilisés d'une vague à l'autre (aucune création pendant le combat une fois la réserve remplie).
import * as THREE from 'three';
import { lerp } from '../sim/math';
import type { Demon } from '../sim/types';
import type { World } from '../sim/world';
import { glow, toonMat } from './materials';
import { batWing, loadModel, makeRigged, rot, skinGeo, type BoneDef, type Bones } from './models';

interface DemonVisual {
  g: THREE.Group;
  wl: THREE.Group;
  wr: THREE.Group;
  mat: THREE.MeshToonMaterial | null;
  B: Bones | null;
}

export class DemonsView {
  private model: { geo: THREE.BufferGeometry; tex: THREE.Texture; bones: BoneDef[] } | null = null;
  private readonly free: DemonVisual[] = [];
  private readonly liveD: Demon[] = [];
  private readonly liveV: DemonVisual[] = [];
  private readonly demonMat = new THREE.MeshStandardMaterial({ color: '#170b10', emissive: '#4a0703', emissiveIntensity: 0.7, roughness: 0.6 });
  readonly wingMat = new THREE.MeshStandardMaterial({ color: '#6a2420', emissive: '#5a0a05', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  private readonly eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 1, 0.2) });
  private readonly batGeo = batWing();

  constructor(private readonly scene: THREE.Scene) {}

  async load(): Promise<void> {
    try {
      const { d, tex } = await loadModel('demon.json');
      this.model = { geo: skinGeo(d), tex, bones: d.bones ?? [] };
    } catch (e) {
      console.warn('modèle démon indisponible', e);
    }
  }

  private make(): DemonVisual {
    const g = new THREE.Group(), dm = this.demonMat;
    let mat: THREE.MeshToonMaterial | null = null, B: Bones | null = null;
    const wl = new THREE.Group(), wr = new THREE.Group();
    for (const [w, s] of [[wr, 1], [wl, -1]] as const) {
      const m = new THREE.Mesh(this.batGeo, this.wingMat);
      m.scale.set(s, 1, 1);
      w.add(m);
      w.position.set(s * 0.8, 2.2, -0.5);
      g.add(w);
    }
    if (this.model) {
      mat = toonMat(this.model.tex, 0.45);
      const rg = makeRigged(this.model.geo, this.model.bones, mat);
      B = rg.B;
      rg.mesh.scale.setScalar(8.6);
      rg.mesh.position.y = 1.2;
      g.add(rg.mesh);
      wl.position.set(-0.7, 3.6, -0.9);
      wr.position.set(0.7, 3.6, -0.9);
      wl.scale.setScalar(1.25);
      wr.scale.setScalar(1.25);
    } else {
      // formes simples de secours
      const b = new THREE.Mesh(new THREE.ConeGeometry(1.7, 6, 8), dm);
      b.rotation.x = Math.PI;
      g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), dm);
      h.position.y = 3.7;
      g.add(h);
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 6), dm);
        horn.position.set(s * 0.8, 5, 0);
        horn.rotation.z = -s * 0.5;
        g.add(horn);
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 6), this.eyeMat);
        e.position.set(s * 0.45, 3.85, 1.05);
        g.add(e);
      }
    }
    g.add(glow(0xff2a10, 30, 0.5));
    g.scale.setScalar(2.3);
    return { g, wl, wr, mat, B };
  }

  spawn(d: Demon): void {
    const v = this.free.pop() ?? this.make();
    v.g.position.copy(d.pos);
    this.scene.add(v.g);
    this.liveD.push(d);
    this.liveV.push(v);
  }
  remove(d: Demon): void {
    const i = this.liveD.indexOf(d), v = this.liveV[i];
    if (i < 0 || !v) return;
    this.scene.remove(v.g);
    this.liveD.splice(i, 1);
    this.liveV.splice(i, 1);
    this.free.push(v);
  }
  /** Prépare des visuels à l'avance (au chargement), pour ne rien créer en plein combat. */
  prewarm(n: number): void {
    while (this.free.length < n) this.free.push(this.make());
  }

  sync(w: World): void {
    const t0 = w.time, P = w.player.pos;
    for (let i = 0; i < this.liveD.length; i++) {
      const d = this.liveD[i] as Demon, v = this.liveV[i] as DemonVisual;
      v.g.position.copy(d.pos);
      v.g.lookAt(P);
      if (v.mat) v.mat.emissiveIntensity = 0.45 + d.flash * 2.4;
      v.g.scale.setScalar(2.3 * (1 + d.flash * 0.08));
      const fl = Math.sin(t0 * 8 + d.ph) * 0.5;
      v.wr.rotation.y = -fl;
      v.wl.rotation.y = fl;
      const B = v.B;
      if (!B) continue;
      const t = t0 + d.ph, th = Math.sin(Math.min(1, d.throwT) * Math.PI);
      const ux = -0.35 + Math.sin(t * 1.7) * 0.18 - th * 1.25, uz = 0.42 + Math.sin(t * 2.4) * 0.15;
      rot(B['upperarm.l'], ux, 0, uz);
      rot(B['upperarm.r'], -0.35 + Math.sin(t * 1.7 + 1.3) * 0.18, 0, -uz);
      rot(B['forearm.l'], lerp(-1.0 + Math.sin(t * 2.2) * 0.2, -0.15, th), 0, 0);
      rot(B['forearm.r'], -1.0 + Math.sin(t * 2.2 + 1) * 0.2, 0, 0);
      rot(B['thigh.l'], 0.15 + Math.sin(t * 1.9) * 0.25, 0, 0);
      rot(B['thigh.r'], 0.1 + Math.sin(t * 1.9 + 2) * 0.25, 0, 0);
      rot(B['shin.l'], 0.6 + Math.sin(t * 1.9 + 0.6) * 0.25, 0, 0);
      rot(B['shin.r'], 0.6 + Math.sin(t * 1.9 + 2.6) * 0.25, 0, 0);
      rot(B['head'], Math.sin(t * 1.1) * 0.1, Math.sin(t * 0.8) * 0.3, 0);
      rot(B['spine'], 0.08 + th * 0.15, 0, 0);
    }
  }
}
