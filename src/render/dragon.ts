// Le Dragon : segments du corps et des cous dessinés en instances (critique performances), sept têtes riggées (mâchoire).
import * as THREE from 'three';
import { clamp } from '../sim/math';
import type { World } from '../sim/world';
import { grad, glow, skinOutlineMat, toonMat } from './materials';
import { baseGeo, batInnerWing, batOuterWing, loadModel } from './models';

interface HeadVisual {
  g: THREE.Group;
  fb: THREE.Group;
  crown: THREE.Group;
  mouth: THREE.Sprite;
  neck: THREE.Group[];
  mat: THREE.MeshToonMaterial | null;
  model: THREE.SkinnedMesh | null;
  jaw: THREE.Bone | null;
  outline: THREE.SkinnedMesh | null;
}

const ZM = new THREE.Matrix4().makeScale(0, 0, 0);

export class DragonView {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly segs: THREE.Group[] = [];
  private readonly heads: HeadVisual[] = [];
  private readonly wings: [THREE.Group, number, THREE.Group][] = [];
  readonly scaleMat = new THREE.MeshToonMaterial({ color: '#c4161c', gradientMap: grad, emissive: '#4a0606', emissiveIntensity: 0.8 });
  private readonly spikeMat = new THREE.MeshToonMaterial({ color: '#3a2030', gradientMap: grad, emissive: '#1a0a14' });
  private readonly inst: { im: THREE.InstancedMesh; list: [THREE.Group, THREE.Mesh][] }[];
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, w: World, wingMat: THREE.Material) {
    const D = w.dragon, scaleMat = this.scaleMat, spikeMat = this.spikeMat;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), scaleMat);
    chest.scale.set(22, 19, 27);
    this.body.add(chest, glow(0xff5a10, 10, 0));
    this.root.add(this.body);
    const sg = new THREE.SphereGeometry(1, 12, 10), cg = new THREE.ConeGeometry(0.28, 1.3, 5);
    const ball = (r: number, sz: number, spike: number, spikeY: number): THREE.Group => {
      const g = new THREE.Group(), m = new THREE.Mesh(sg, scaleMat);
      m.scale.set(r, r, r * sz);
      const sp = new THREE.Mesh(cg, spikeMat);
      sp.scale.setScalar(spike);
      sp.position.y = spikeY;
      g.add(m, sp);
      this.root.add(g);
      return g;
    };
    for (const s of D.segs) this.segs.push(ball(s.r, 1.35, s.r, s.r * 1.1));
    const inner = batInnerWing(), outer = batOuterWing();
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(), m = new THREE.Mesh(inner, wingMat);
      m.rotation.x = Math.PI / 2;
      m.scale.set(s * 13, 13, 1);
      piv.add(m);
      const op = new THREE.Group();
      op.position.set(s * 65, 0, 0);
      const mo = new THREE.Mesh(outer, wingMat);
      mo.rotation.x = Math.PI / 2;
      mo.scale.set(s * 13, 13, 1);
      op.add(mo);
      piv.add(op);
      piv.position.set(s * 10, 6, 0);
      (this.segs[3] as THREE.Group).add(piv);
      this.wings.push([piv, s, op]);
    }
    // sept têtes, chacune sur son cou, avec son diadème (Apocalypse 12:3)
    const crownMat = new THREE.MeshToonMaterial({ color: '#f2c443', gradientMap: grad, emissive: '#a86a00', emissiveIntensity: 0.7 });
    const crownRing = new THREE.TorusGeometry(6, 1.2, 6, 24), crownSpike = new THREE.ConeGeometry(1.1, 4.5, 5);
    for (const h of D.heads) {
      const g = new THREE.Group(), fb = new THREE.Group();
      const sk = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), scaleMat);
      sk.scale.set(9, 8, 13);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 14), scaleMat);
      sn.position.set(0, -1, 14);
      fb.add(sk, sn);
      g.add(fb);
      const crown = new THREE.Group(), cr = new THREE.Mesh(crownRing, crownMat);
      cr.rotation.x = Math.PI / 2;
      crown.add(cr);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 6.283, sp = new THREE.Mesh(crownSpike, crownMat);
        sp.position.set(Math.cos(a) * 6, 2.6, Math.sin(a) * 6);
        crown.add(sp);
      }
      crown.position.set(0, 13, -1);
      g.add(crown);
      const mouth = glow(0xff5a10, 60, 0);
      mouth.position.set(0, -2, 22);
      g.add(mouth);
      const neck = h.neck.map((n) => ball(n.r, 1.3, n.r * 0.9, n.r));
      this.root.add(g);
      this.heads.push({ g, fb, crown, mouth, neck, mat: null, model: null, jaw: null, outline: null });
    }
    this.root.visible = false;
    scene.add(this.root);
    // segments du corps et des cous en instances
    const groups = [...this.segs, ...this.heads.flatMap((h) => h.neck)];
    const sphs: [THREE.Group, THREE.Mesh][] = [], spks: [THREE.Group, THREE.Mesh][] = [];
    for (const g of groups) {
      const [a, b] = g.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
      if (a) { a.visible = false; sphs.push([g, a]); }
      if (b) { b.visible = false; spks.push([g, b]); }
    }
    const mk = (list: [THREE.Group, THREE.Mesh][], mat: THREE.Material) => {
      const im = new THREE.InstancedMesh((list[0] as [THREE.Group, THREE.Mesh])[1].geometry, mat, list.length);
      im.frustumCulled = false;
      scene.add(im);
      return { im, list };
    };
    this.inst = [mk(sphs, scaleMat), mk(spks, spikeMat)];
  }

  /** Tête 3D du Dragon (mâchoire à deux os) ; la tête en formes simples reste en secours. */
  async load(): Promise<void> {
    try {
      const { d, tex } = await loadModel('dragon.json');
      const geo = baseGeo(d);
      const pa = (geo.attributes.position as THREE.BufferAttribute).array, nv = pa.length / 3, si = new Uint8Array(nv * 4), sw = new Uint8Array(nv * 4);
      const sm = (a: number, b: number, v: number): number => {
        const q = Math.min(1, Math.max(0, (v - a) / (b - a)));
        return q * q * (3 - 2 * q);
      };
      // poids de la mâchoire selon la position sous la ligne de la bouche
      for (let i = 0; i < nv; i++) {
        const y = pa[i * 3 + 1] as number, z = pa[i * 3 + 2] as number, wb = Math.round(sm(0.05, 0.11, z) * sm(-0.055, -0.09, y) * 255);
        si[i * 4 + 1] = 1;
        sw[i * 4] = 255 - wb;
        sw[i * 4 + 1] = wb;
      }
      geo.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(sw, 4, true));
      for (const h of this.heads) {
        const hm = toonMat(tex, 0.4), skull = new THREE.Bone(), jaw = new THREE.Bone();
        jaw.position.set(0, -0.09, 0.07);
        skull.add(jaw);
        const m = new THREE.SkinnedMesh(geo, hm);
        m.add(skull);
        const sk = new THREE.Skeleton([skull, jaw]);
        m.bind(sk);
        const ol = new THREE.SkinnedMesh(geo, skinOutlineMat);
        m.add(ol);
        ol.bind(sk, m.bindMatrix.clone());
        m.frustumCulled = ol.frustumCulled = false;
        m.scale.setScalar(40);
        m.rotation.x = 0.6;
        m.position.set(0, 8.5, -3.6);
        Object.assign(h, { mat: hm, jaw, outline: ol, model: m });
        h.g.remove(h.fb);
        h.g.add(m);
        h.mouth.position.set(0, -1, 18);
        h.crown.position.set(0, 25, -9);
        h.crown.scale.setScalar(1.5);
      }
    } catch (e) {
      console.warn('modèle dragon indisponible', e);
    }
  }

  sync(w: World, camera: THREE.Camera): void {
    const D = w.dragon, t = w.time;
    this.root.visible = D.visible;
    for (const { im } of this.inst) im.visible = D.visible;
    if (!D.visible) return;
    this.scaleMat.emissiveIntensity = 0.8 + D.flash * 2;
    this.body.visible = D.headVisible;
    this.body.position.copy(D.pos);
    if (D.v.lengthSq() > 1) this.body.lookAt(this.tmp.copy(D.pos).add(D.v));
    let prev = D.pos;
    for (let i = 0; i < D.segs.length; i++) {
      const s = D.segs[i], g = this.segs[i];
      if (!s || !g) continue;
      g.visible = s.visible;
      g.position.copy(s.pos);
      g.lookAt(prev);
      prev = s.pos;
    }
    const ph = t * 2.4; // battement en deux temps : la pointe suit avec retard
    for (const [piv, s, outer] of this.wings) {
      piv.rotation.z = s * Math.sin(ph) * 0.6;
      piv.rotation.y = s * Math.cos(ph) * 0.12;
      outer.rotation.z = s * Math.sin(ph - 1.2) * 0.7;
    }
    for (let k = 0; k < D.heads.length; k++) {
      const h = D.heads[k], v = this.heads[k];
      if (!h || !v) continue;
      v.g.visible = h.alive;
      for (const n of v.neck) n.visible = h.alive;
      if (!h.alive) continue;
      v.g.position.copy(h.pos);
      v.g.quaternion.copy(h.quat);
      for (let i = 0; i < h.neck.length; i++) {
        const n = v.neck[i] as THREE.Group;
        n.position.copy((h.neck[i] as { pos: THREE.Vector3 }).pos);
        n.lookAt(i > 0 ? (h.neck[i - 1] as { pos: THREE.Vector3 }).pos : this.neckBase(w, k));
      }
      if (v.outline) v.outline.visible = h.pos.distanceTo(camera.position) < 520; // contour seulement de près
      if (v.mat) v.mat.emissiveIntensity = 0.4 + h.flash * 2.4;
      const charge = clamp(1 - h.cool, 0, 1), bite = Math.sin(Math.min(1, h.lunge) * Math.PI);
      if (v.model) v.model.rotation.x = 0.6 - bite * 0.28 + Math.sin(t * 2.1 + h.phase) * 0.05;
      if (v.jaw) v.jaw.rotation.x = -0.22 + Math.sin(t * 1.7 + h.phase) * 0.05 + charge * 0.3 + bite * 0.45; // la gueule s'ouvre en chargeant puis claque
      v.mouth.material.opacity = charge * 0.32;
    }
    this.root.updateMatrixWorld(true);
    for (const { im, list } of this.inst) {
      for (let i = 0; i < list.length; i++) {
        const [g, m] = list[i] as [THREE.Group, THREE.Mesh];
        im.setMatrixAt(i, g.visible ? m.matrixWorld : ZM);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /** point d'attache du cou sur le poitrail (le premier segment de cou le regarde) */
  private readonly base = new THREE.Vector3();
  private readonly f = new THREE.Vector3();
  private readonly r = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private neckBase(w: World, k: number): THREE.Vector3 {
    const D = w.dragon, f = this.f.copy(D.v);
    if (f.lengthSq() < 1) f.set(0, 0, 1);
    f.normalize();
    this.r.crossVectors(f, THREE.Object3D.DEFAULT_UP).normalize();
    this.u.crossVectors(this.r, f).normalize();
    return this.base.copy(D.pos).addScaledVector(f, 14).addScaledVector(this.u, 8).addScaledVector(this.r, (k - 3) * 3);
  }
}
