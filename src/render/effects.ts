// Effets : particules en tampon circulaire, traits de lumière, boules de feu, orbe et onde du Jugement.
// Tout est préalloué : rien n'est créé pendant la partie.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { glow, soft } from './materials';

const PN = 1400;
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class Particles {
  readonly pos = new Float32Array(PN * 3).fill(-1e6);
  private readonly col = new Float32Array(PN * 3);
  private readonly vel = new Float32Array(PN * 3);
  private readonly base = new Float32Array(PN * 3);
  private readonly life = new Float32Array(PN);
  private readonly max = new Float32Array(PN);
  private next = 0;
  private readonly geo = new THREE.BufferGeometry();
  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const pts = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({ size: 22, map: soft, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }),
    );
    pts.frustumCulled = false;
    scene.add(pts);
  }
  burst(x: number, y: number, z: number, r: number, g: number, b: number, n: number, speed: number, life: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % PN;
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u), s = speed * rand(0.25, 1), j = i * 3;
      this.pos[j] = x;
      this.pos[j + 1] = y;
      this.pos[j + 2] = z;
      this.vel[j] = Math.cos(a) * q * s;
      this.vel[j + 1] = u * s;
      this.vel[j + 2] = Math.sin(a) * q * s;
      this.base[j] = r;
      this.base[j + 1] = g;
      this.base[j + 2] = b;
      this.life[i] = this.max[i] = life * rand(0.5, 1);
    }
  }
  /** une particule immobile (traînée d'une boule de feu) */
  ember(p: THREE.Vector3): void {
    const i = this.next, j = i * 3;
    this.next = (this.next + 1) % PN;
    this.pos[j] = p.x;
    this.pos[j + 1] = p.y;
    this.pos[j + 2] = p.z;
    this.vel[j] = this.vel[j + 1] = this.vel[j + 2] = 0;
    this.base[j] = 3;
    this.base[j + 1] = 0.6;
    this.base[j + 2] = 0.1;
    this.life[i] = this.max[i] = 0.45;
  }
  update(dt: number): void {
    const P = this.pos, V = this.vel, C = this.col, B = this.base;
    for (let i = 0; i < PN; i++) {
      if ((this.life[i] as number) <= 0) continue;
      this.life[i] = (this.life[i] as number) - dt;
      const j = i * 3;
      if ((this.life[i] as number) <= 0) {
        P[j + 1] = -1e6;
        C[j] = C[j + 1] = C[j + 2] = 0;
        continue;
      }
      P[j] = (P[j] as number) + (V[j] as number) * dt;
      P[j + 1] = (P[j + 1] as number) + (V[j + 1] as number) * dt;
      P[j + 2] = (P[j + 2] as number) + (V[j + 2] as number) * dt;
      const f = (this.life[i] as number) / (this.max[i] as number);
      C[j] = (B[j] as number) * f;
      C[j + 1] = (B[j + 1] as number) * f;
      C[j + 2] = (B[j + 2] as number) * f;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class Projectiles {
  private readonly bolts: THREE.Mesh[] = [];
  private readonly fires: THREE.Mesh[] = [];
  private readonly orb = new THREE.Group();
  private readonly ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private ringT = 1;
  private readonly dir = new THREE.Vector3();
  constructor(scene: THREE.Scene, w: World, private readonly fx: Particles) {
    const boltGeo = new THREE.CylinderGeometry(0.42, 0.42, 11, 6), boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 1.4), fog: false });
    for (let i = 0; i < w.bolts.length; i++) {
      const m = new THREE.Mesh(boltGeo, boltMat);
      m.visible = false;
      scene.add(m);
      this.bolts.push(m);
    }
    // assez chaud pour briller, sans brûler l'écran
    const fireGeo = new THREE.SphereGeometry(1, 10, 8), fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.75, 0.16), fog: false });
    for (let i = 0; i < w.fires.length; i++) {
      const m = new THREE.Mesh(fireGeo, fireMat);
      m.visible = false;
      scene.add(m);
      this.fires.push(m);
    }
    this.orb.add(new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 6, 2.5), fog: false })));
    this.orb.add(glow(0xffe08a, 70, 0.9));
    this.orb.visible = false;
    scene.add(this.orb);
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.05, 8, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.5, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.ring.visible = false;
    scene.add(this.ring);
  }
  startRing(x: number, y: number, z: number): void {
    this.ring.visible = true;
    this.ring.position.set(x, y, z);
    this.ringT = 0;
  }
  sync(w: World, dt: number, camera: THREE.Camera): void {
    for (let i = 0; i < w.bolts.length; i++) {
      const b = w.bolts[i], m = this.bolts[i];
      if (!b || !m) continue;
      m.visible = b.life > 0;
      if (!m.visible) continue;
      m.position.copy(b.pos);
      m.quaternion.setFromUnitVectors(UP, this.dir.copy(b.v).normalize());
    }
    for (let i = 0; i < w.fires.length; i++) {
      const f = w.fires[i], m = this.fires[i];
      if (!f || !m) continue;
      m.visible = f.life > 0;
      if (!m.visible) continue;
      m.position.copy(f.pos);
      m.scale.setScalar(f.r);
      if (dt > 0 && Math.random() < 0.5) this.fx.ember(f.pos);
    }
    this.orb.visible = w.J.on;
    if (w.J.on) {
      this.orb.position.copy(w.J.pos);
      if (dt > 0) this.fx.burst(w.J.pos.x, w.J.pos.y, w.J.pos.z, 5, 4, 1.5, 3, 25, 0.5);
    }
    if (this.ringT < 1 && this.ring.visible) {
      this.ringT += dt * 1.8;
      this.ring.scale.setScalar(10 + this.ringT * 150);
      this.ring.material.opacity = 1 - this.ringT;
      this.ring.quaternion.copy(camera.quaternion);
      if (this.ringT >= 1) this.ring.visible = false;
    }
  }
}
