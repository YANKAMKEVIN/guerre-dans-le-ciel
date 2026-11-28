// La terre sous l'ange : maillage qui suit le joueur, vallée peinte en texture, ombre des nuages, forêts, villages et temple.
import * as THREE from 'three';
import { Ground, GN, Terrain, VS, buildValleyGrid, hash, valleyEdge, vnoise } from '../sim/terrain';
import { C, grad } from './materials';
import { sunDir, type VolUniforms } from './clouds';
import { asset } from './models';

const TS = 13000, TN = 170, CELL = TS / TN;
const MAXR = 9000, MAXC = 3500, MAXH = 1600, VEG_NEAR = 1400;
const rand = (a: number, b: number): number => a + Math.random() * (b - a); // variété visuelle seulement

export class Land {
  readonly terrainMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
  readonly crownMat = new THREE.MeshToonMaterial({ gradientMap: grad });
  readonly roofMat = new THREE.MeshToonMaterial({ gradientMap: grad });
  readonly roundT = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.crownMat, MAXR);
  // au loin, les feuillus passent en icosaèdre simple (20 triangles au lieu de 80) : la brume et la distance gomment la différence
  readonly roundF = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), this.crownMat, MAXR);
  readonly cypT = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), this.crownMat, MAXC);
  readonly walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial({ color: '#f4ead8', gradientMap: grad }), MAXH);
  readonly roofs: THREE.InstancedMesh;
  readonly vegNear = VEG_NEAR;
  readonly temple = new THREE.Group();
  vcx = 1e9;
  vcz = 1e9;
  private tcx = 1e9;
  private tcz = 1e9;
  private readonly tGeo = new THREE.PlaneGeometry(TS, TS, TN, TN);
  private readonly tBase: Float32Array;
  private readonly valleyTex: THREE.Texture;
  private readonly valleyOn = { value: 0 };
  private readonly dummy = new THREE.Object3D();
  private readonly col = new THREE.Color();
  private readonly tc = new THREE.Color();
  private readonly greens = ['#3f9a2e', '#2f7f2a', '#55a832', '#1f6b2c', '#6cb43a'].map((h) => C(h));
  private readonly roofCols = ['#c8552f', '#b5462a', '#d86a3a', '#a8402c'].map((h) => C(h));
  private readonly cW = C('#1f86ea');
  private readonly cS = C('#d8cc8e');
  private readonly cG = C('#7fd62f');
  private readonly cF = C('#1f8436');
  private readonly cR = C('#a8a091');

  constructor(scene: THREE.Scene, private readonly T: Terrain, vol: VolUniforms) {
    const roofGeo = new THREE.ConeGeometry(0.78, 0.55, 4);
    roofGeo.rotateY(Math.PI / 4);
    this.roofs = new THREE.InstancedMesh(roofGeo, this.roofMat, MAXH);
    for (const m of [this.roundT, this.roundF, this.cypT, this.walls, this.roofs]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    const img = new Image();
    this.valleyTex = new THREE.Texture(img);
    this.valleyTex.colorSpace = THREE.SRGBColorSpace;
    this.valleyTex.anisotropy = 8;
    this.tGeo.rotateX(-Math.PI / 2);
    this.tGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((TN + 1) * (TN + 1) * 3), 3));
    this.tBase = (this.tGeo.attributes.position as THREE.BufferAttribute).array.slice() as Float32Array;
    const valleyTex = this.valleyTex, valleyOn = this.valleyOn;
    this.terrainMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        uValley: { value: valleyTex }, tCov: vol.tCov, uTime: vol.uTime, uCovLo: vol.uCovLo, uCovHi: vol.uCovHi, uBase: vol.uBase,
        uSunL: { value: sunDir }, uValleyOn: valleyOn, uVS: { value: VS },
      });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWxz;varying float vWy;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wq=modelMatrix*vec4(transformed,1.);vWxz=wq.xz;vWy=wq.y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWxz;varying float vWy;uniform sampler2D uValley,tCov;uniform float uVS,uValleyOn,uTime,uCovLo,uCovHi,uBase;uniform vec3 uSunL;')
        .replace('#include <color_fragment>', `#include <color_fragment>
    {float e=max(abs(vWxz.x),abs(vWxz.y))/(uVS*.5);float w=(1.-smoothstep(.9,1.1,e))*uValleyOn;
     if(w>0.){vec2 uv=vec2(vWxz.x/uVS+.5,1.-(vWxz.y/uVS+.5));vec3 tc=texture2D(uValley,clamp(uv,0.,1.)).rgb;diffuseColor.rgb=mix(diffuseColor.rgb,diffuse*tc*1.08,w);}}
    {vec3 L=normalize(uSunL);float k=max(uBase+320.-vWy,0.)/max(L.y,.1);vec2 sp=vWxz+L.xz*k; // ombre des nuages projetée sur le sol
     float cov=smoothstep(uCovLo,uCovHi+.06,texture2D(tCov,sp/9000.+vec2(uTime*.0005,uTime*.0002)).r);diffuseColor.rgb*=1.-.38*cov;}`);
    };
    const terrain = new THREE.Mesh(this.tGeo, this.terrainMat);
    terrain.frustumCulled = false;
    scene.add(terrain);
    this.buildTemple(scene);
    this.imgEl = img;
  }
  private imgEl: HTMLImageElement;

  /** Charge la vallée peinte ; le relief est recalculé depuis ses pixels. Résout toujours (échec : relief procédural). */
  loadValley(): Promise<void> {
    const img = this.imgEl;
    return new Promise((resolve) => {
      img.onload = () => {
        this.valleyTex.needsUpdate = true;
        this.valleyOn.value = 1;
        const cv = document.createElement('canvas');
        cv.width = cv.height = GN;
        const cx = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
        cx.drawImage(img, 0, 0, GN, GN);
        this.T.grid = buildValleyGrid(cx.getImageData(0, 0, GN, GN).data);
        this.tcx = this.tcz = this.vcx = this.vcz = 1e9;
        const tx = (0.84 - 0.5) * VS, tz = (0.225 - 0.5) * VS;
        this.temple.position.set(tx, this.T.height(tx, tz) + 4, tz);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = asset('valley.webp');
    });
  }

  private buildTemple(scene: THREE.Scene): void {
    // temple sur la colline la plus haute près du départ
    let best: [number, number] = [0, 0], by = -1e9;
    for (let x = -2200; x <= 2200; x += 80)
      for (let z = -2600; z <= 600; z += 80) {
        const y = this.T.height(x, z);
        if (this.T.river > 0.06 && y > by) { by = y; best = [x, z]; }
      }
    const g = this.temple, marble = new THREE.MeshToonMaterial({ color: '#fbf6ea', gradientMap: grad }), gold = new THREE.MeshToonMaterial({ color: '#e8b84a', gradientMap: grad });
    const add = (m: THREE.Mesh, x: number, y: number, z: number): void => {
      m.position.set(x, y, z);
      g.add(m);
    };
    add(new THREE.Mesh(new THREE.BoxGeometry(190, 26, 130), marble), 0, 6, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(210, 10, 150), marble), 0, -4, 0);
    const cg = new THREE.CylinderGeometry(6, 7, 80, 10);
    for (let i = 0; i < 7; i++) for (const zz of [-52, 52]) add(new THREE.Mesh(cg, marble), -84 + i * 28, 59, zz);
    for (const xx of [-84, 84]) for (const zz of [-18, 18]) add(new THREE.Mesh(cg, marble), xx, 59, zz);
    add(new THREE.Mesh(new THREE.BoxGeometry(196, 14, 136), marble), 0, 106, 0);
    const prism = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 200, 3, 1), gold);
    prism.rotation.z = Math.PI / 2;
    prism.scale.set(1, 1, 0.6);
    add(prism, 0, 136, 0);
    g.position.set(best[0], by + 4, best[1]);
    g.scale.setScalar(0.75);
    scene.add(g);
  }

  /** Recalcule le maillage du sol quand le joueur change de case (jamais à chaque image). */
  updateTerrain(p: THREE.Vector3): void {
    const gx = Math.round(p.x / CELL) * CELL, gz = Math.round(p.z / CELL) * CELL;
    if (gx === this.tcx && gz === this.tcz) return;
    this.tcx = gx;
    this.tcz = gz;
    const posA = this.tGeo.attributes.position as THREE.BufferAttribute, colA = this.tGeo.attributes.color as THREE.BufferAttribute;
    const pos = posA.array as Float32Array, col = colA.array as Float32Array, T = this.T, tc = this.tc, base = this.tBase;
    for (let i = 0; i < pos.length; i += 3) {
      const x = (base[i] as number) + gx, z = (base[i + 2] as number) + gz, y = T.height(x, z), t = (y + 900) / 830;
      if (T.river < 0.014) tc.copy(this.cW);
      else if (t < 0.012) tc.copy(this.cS);
      else if (t < 0.3) {
        tc.copy(this.cG);
        if (vnoise(x * 0.0035, z * 0.0035) > 0.56) tc.lerp(this.cF, 0.85);
      } else if (t < 0.55) tc.copy(this.cF).lerp(this.cR, ((t - 0.3) / 0.25) * 0.7);
      else tc.copy(this.cR);
      const j = 0.9 + hash(x * 0.01, z * 0.01) * 0.2;
      pos[i] = x;
      pos[i + 1] = y;
      pos[i + 2] = z;
      col[i] = tc.r * j;
      col[i + 1] = tc.g * j;
      col[i + 2] = tc.b * j;
    }
    posA.needsUpdate = true;
    colA.needsUpdate = true;
    this.tGeo.computeVertexNormals();
  }

  private place(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number, c?: THREE.Color): void {
    const d = this.dummy;
    d.position.set(x, y, z);
    d.rotation.set(0, ry, 0);
    d.scale.set(sx, sy, sz);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    if (c) m.setColorAt(i, c);
  }

  /** Forêts et villages autour du joueur, recalculés tous les 700 unités. */
  updateVeg(p: THREE.Vector3): void {
    const gx = Math.round(p.x / 700) * 700, gz = Math.round(p.z / 700) * 700;
    if (gx === this.vcx && gz === this.vcz) return;
    this.vcx = gx;
    this.vcz = gz;
    let nr = 0, nf = 0, nc = 0, nh = 0;
    const R = 3600, ST = 46, col = this.col, T = this.T;
    const tree = (px: number, y: number, pz: number, h1: number, near: boolean, cyp: boolean, r: number, rk: number, sk: number): void => {
      if (cyp) {
        const hh = r * rand(4, 5.5);
        this.place(this.cypT, nc++, px, y + hh * 0.5, pz, 0, r, hh, r, col);
      } else if (near) this.place(this.roundT, nr++, px, y + r * rk, pz, h1 * 6, r, r * sk, r, col);
      else this.place(this.roundF, nf++, px, y + r * rk, pz, h1 * 6, r, r * sk, r, col);
    };
    for (let x = gx - R; x < gx + R; x += ST)
      for (let z = gz - R; z < gz + R; z += ST) {
        const h1 = hash(x * 0.13, z * 0.17), h2 = hash(z * 0.11 + 3, x * 0.07), px = x + (h1 - 0.5) * ST, pz = z + (h2 - 0.5) * ST;
        const y = T.height(px, pz), rv = T.river, t = (y + 900) / 830;
        if (T.grid && valleyEdge(px, pz) > 0.5) {
          // dans la vallée peinte : arbres seulement dans les forêts peintes ; villages déjà peints, sans maisons 3D (critique visuelle)
          const c = T.classAt(px, pz);
          if (c === Ground.Village) continue;
          const pr = c === Ground.Forest ? 0.7 : 0;
          if (hash(px * 0.05, pz * 0.05) > pr) continue;
          const near = Math.hypot(px - gx, pz - gz) < VEG_NEAR;
          col.copy(this.greens[((h2 * 53) | 0) % 5] as THREE.Color).multiplyScalar(0.62 + h1 * 0.2);
          if (h1 < 0.15 && nc < MAXC) tree(px, y, pz, h1, near, true, rand(9, 13), 0, 0);
          else if (near ? nr < MAXR : nf < MAXR) tree(px, y, pz, h1, near, false, rand(11, 17), 0.6, 0.8);
          continue;
        }
        if (rv < 0.024 || t > 0.6) continue;
        const village = vnoise(px * 0.0011 + 7, pz * 0.0011 + 3);
        if (village > 0.78 && t < 0.14 && rv > 0.03) {
          if (nh < MAXH && h1 < 0.3) {
            const w = rand(26, 40), d = rand(22, 32), hh = rand(16, 26), a = h2 * 6.28;
            this.place(this.walls, nh, px, y + hh / 2, pz, a, w, hh, d);
            this.place(this.roofs, nh, px, y + hh + w * 0.27, pz, a, w * 1.25, w, d * 1.6, this.roofCols[((h1 * 97) | 0) % 4]);
            nh++;
          }
          continue;
        }
        const forest = vnoise(px * 0.0035, pz * 0.0035), dens = t < 0.3 ? (forest > 0.52 ? 0.85 : 0.05) : t < 0.45 ? 0.25 : 0.06;
        if (hash(px * 0.05, pz * 0.05) > dens) continue;
        const near = Math.hypot(px - gx, pz - gz) < VEG_NEAR;
        col.copy(this.greens[((h2 * 53) | 0) % 5] as THREE.Color).multiplyScalar(0.85 + h1 * 0.3);
        if (h1 < 0.18 && nc < MAXC) tree(px, y, pz, h1, near, true, rand(9, 14), 0, 0);
        else if (near ? nr < MAXR : nf < MAXR) tree(px, y, pz, h1, near, false, rand(18, 30), 0.75, 0.85);
      }
    this.roundT.count = nr;
    this.roundF.count = nf;
    this.cypT.count = nc;
    this.walls.count = nh;
    this.roofs.count = nh;
    for (const m of [this.roundT, this.roundF, this.cypT, this.walls, this.roofs]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
