// L'ange : formes simples de secours, remplacées par le modèle riggé dès qu'il est chargé ; pose procédurale.
import * as THREE from 'three';
import { DODGE_T } from '../sim/config';
import { clamp, lerp } from '../sim/math';
import type { World } from '../sim/world';
import { glow, toonMat } from './materials';
import { featherWing, loadModel, makeRigged, rot, skinGeo, type Bones } from './models';

export class AngelView {
  readonly root = new THREE.Group();
  private readonly bank = new THREE.Group();
  private readonly pose = new THREE.Group();
  private readonly wingR = new THREE.Group();
  private readonly wingL = new THREE.Group();
  private readonly fallback: THREE.Mesh[] = [];
  private B: Bones | null = null;

  constructor(scene: THREE.Scene) {
    const { root, bank, pose } = this;
    root.rotation.order = 'YXZ';
    root.add(bank);
    bank.add(pose);
    pose.rotation.x = -1.02;
    scene.add(root);
    const robeMat = new THREE.MeshStandardMaterial({ color: '#fff8ea', emissive: '#ffe6b0', emissiveIntensity: 0.5, roughness: 0.7 });
    const wingMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6dc', emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
    const goldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.4, 1) });
    const goldWing = new THREE.MeshStandardMaterial({ color: '#f2b632', emissive: '#f2a012', emissiveIntensity: 0.6, side: THREE.DoubleSide, roughness: 0.5 });
    const add = (m: THREE.Mesh, x: number, y: number, z: number, keep = false): THREE.Mesh => {
      m.position.set(x, y, z);
      pose.add(m);
      if (!keep) this.fallback.push(m);
      return m;
    };
    add(new THREE.Mesh(new THREE.ConeGeometry(1.7, 6.6, 14), robeMat), 0, -0.6, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 10), robeMat), 0, 1.9, 0).scale.set(1.15, 1, 0.9);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.78, 14, 10), new THREE.MeshStandardMaterial({ color: '#f3d7b6', emissive: '#6b4a2a', emissiveIntensity: 0.4 })), 0, 3.55, 0);
    add(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.11, 8, 28), goldMat), 0, 4.75, 0.2, true).rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.16, 6, 20), goldMat), 0, 0.9, 0).rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.2, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 3) })), 1.9, 4.4, -0.3, true);
    const featherGeo = featherWing();
    for (const [g, sx] of [[this.wingR, 1], [this.wingL, -1]] as const) {
      const m = new THREE.Mesh(featherGeo, wingMat);
      m.scale.set(sx * 1.15, 1.15, 1);
      g.add(m);
      const m2 = new THREE.Mesh(featherGeo, wingMat);
      m2.scale.set(sx * 0.8, 0.75, 1);
      m2.position.set(0, -1.6, -0.15);
      g.add(m2);
      const gd = new THREE.Mesh(featherGeo, goldWing);
      gd.scale.set(sx * 1.34, 1.32, 1);
      gd.position.set(0, -0.1, -0.08);
      g.add(gd);
      g.position.set(sx * 0.5, 2.3, 0.85);
      pose.add(g);
    }
    add(new THREE.Mesh(new THREE.SphereGeometry(0.84, 12, 8), new THREE.MeshStandardMaterial({ color: '#f3cf4a', emissive: '#a8780c', emissiveIntensity: 0.5 })), 0, 3.78, 0.2);
    root.add(glow(0xffd98a, 30, 0.18));
  }

  /** Modèle 3D ; les formes simples restent en secours si le fichier ne charge pas. */
  async load(): Promise<void> {
    try {
      const { d, tex } = await loadModel('angel.json');
      const rg = makeRigged(
        skinGeo(d),
        d.bones ?? [],
        toonMat(tex, 0.3),
      );
      this.B = rg.B;
      const m = rg.mesh;
      m.scale.setScalar(8.2);
      m.rotation.y = Math.PI;
      m.position.y = 0.2;
      this.pose.add(m);
      for (const p of this.fallback) this.pose.remove(p);
      this.wingR.position.z = this.wingL.position.z = 1.05;
    } catch (e) {
      console.warn('modèle ange indisponible', e);
    }
  }

  private poseBones(t: number, c: number, bo: number, dodge: boolean): void {
    const B = this.B;
    if (!B) return;
    const fl = Math.sin(t * 1.6), kick = Math.sin(t * (2.4 + bo * 2.6));
    const ux = lerp(0.35 + fl * 0.08, -2.55, c) + (dodge ? -0.8 : 0), uz = lerp(0.18 + bo * 0.1, 0.08, c) + (dodge ? 0.5 : 0);
    rot(B['upperarm.l'], ux, 0, uz);
    rot(B['upperarm.r'], ux + (c ? 0 : Math.sin(t * 1.6 + 1) * 0.06), 0, -uz);
    rot(B['forearm.l'], lerp(-0.35, -0.08, c), 0, 0);
    rot(B['forearm.r'], lerp(-0.35, -0.08, c), 0, 0);
    const th = dodge ? -0.7 : 0.12 + bo * 0.08, sh = dodge ? 1.3 : 0.35 + bo * 0.1;
    rot(B['thigh.l'], th + kick * 0.12, 0, 0.02);
    rot(B['thigh.r'], th - kick * 0.12, 0, -0.02);
    rot(B['shin.l'], sh + Math.max(0, kick) * 0.35, 0, 0);
    rot(B['shin.r'], sh + Math.max(0, -kick) * 0.35, 0, 0);
    rot(B['foot.l'], 0.5, 0, 0);
    rot(B['foot.r'], 0.5, 0, 0);
    rot(B['head'], -0.45, 0, 0);
    rot(B['neck'], -0.2, 0, 0);
    rot(B['spine'], -0.05 + Math.sin(t * 1.6) * 0.03, 0, 0);
  }

  sync(w: World): void {
    const P = w.player, t = w.time;
    this.root.position.copy(P.pos);
    this.root.rotation.set(P.pitch, P.yaw, 0);
    const dodge = P.dodgeT > 0;
    this.poseBones(t, Math.min(1, P.castT * 1.6), clamp((P.speed - 112) / 83, 0, 1), dodge);
    this.bank.rotation.z = P.roll - (dodge ? P.dodgeDir * (1 - P.dodgeT / DODGE_T) * Math.PI * 2 : 0);
    const flap = Math.sin(t * (P.boost ? 11 : 6.5)) * 0.42 + 0.12;
    this.wingR.rotation.y = -flap;
    this.wingL.rotation.y = flap;
    this.root.visible = !(w.state === 'dead' && P.grounded);
  }
}
