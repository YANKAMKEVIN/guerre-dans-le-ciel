// Modèles 3D : maillages encodés en base64 dans les .json, squelette ajusté au modèle, poids de peau précalculés.
import * as THREE from 'three';
import { skinOutlineMat } from './materials';

export interface BoneDef {
  name: string;
  parent: number;
  pos: [number, number, number];
}
export interface ModelJson {
  pos: string;
  uv: string;
  idx: string;
  tex: string;
  bones?: BoneDef[];
  skinIdx?: string;
  skinW?: string;
}
export type Bones = Record<string, THREE.Bone>;

const b64 = (s: string): Uint8Array => {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

export function baseGeo(d: ModelJson): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b64(d.pos).buffer), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b64(d.uv).buffer), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(b64(d.idx).buffer), 1));
  geo.computeVertexNormals();
  return geo;
}

export function skinGeo(d: ModelJson): THREE.BufferGeometry {
  const geo = baseGeo(d);
  geo.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(b64(d.skinIdx ?? ''), 4));
  geo.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(b64(d.skinW ?? ''), 4, true));
  return geo;
}

export function makeRigged(geo: THREE.BufferGeometry, boneDefs: BoneDef[], mat: THREE.Material): { mesh: THREE.SkinnedMesh; B: Bones } {
  const bones = boneDefs.map((b) => {
    const o = new THREE.Bone();
    o.name = b.name;
    return o;
  });
  boneDefs.forEach((b, i) => {
    const p = b.parent >= 0 ? (boneDefs[b.parent] as BoneDef).pos : [0, 0, 0];
    (bones[i] as THREE.Bone).position.set(b.pos[0] - (p[0] as number), b.pos[1] - (p[1] as number), b.pos[2] - (p[2] as number));
    if (b.parent >= 0) (bones[b.parent] as THREE.Bone).add(bones[i] as THREE.Bone);
  });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(bones[0] as THREE.Bone);
  const sk = new THREE.Skeleton(bones);
  mesh.bind(sk);
  const ol = new THREE.SkinnedMesh(geo, skinOutlineMat);
  ol.frustumCulled = mesh.frustumCulled = false;
  mesh.add(ol);
  ol.bind(sk, mesh.bindMatrix.clone());
  const B: Bones = {};
  bones.forEach((b) => (B[b.name] = b));
  return { mesh, B };
}

export const asset = (name: string): string => import.meta.env.BASE_URL + name;

export async function loadModel(name: string): Promise<{ d: ModelJson; tex: THREE.Texture }> {
  const d = (await (await fetch(asset(name))).json()) as ModelJson;
  const tex = await new THREE.TextureLoader().loadAsync(asset(d.tex));
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { d, tex };
}

/** rotation d'un os s'il existe */
export const rot = (b: THREE.Bone | undefined, x: number, y: number, z: number): void => {
  if (b) b.rotation.set(x, y, z);
};

/* ---------- formes d'ailes ---------- */
export function featherWing(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.6);
  s.bezierCurveTo(3, 3.8, 7, 4.4, 10.8, 2.2);
  s.quadraticCurveTo(9.3, 1.2, 8.7, -0.5);
  s.quadraticCurveTo(7.6, 0.2, 7, -1.5);
  s.quadraticCurveTo(6, -0.6, 5.2, -2.3);
  s.quadraticCurveTo(4.2, -1.4, 3.4, -2.9);
  s.quadraticCurveTo(2.4, -1.8, 1.6, -3);
  s.quadraticCurveTo(0.8, -1.6, 0, -1.8);
  s.closePath();
  return new THREE.ShapeGeometry(s, 10);
}
export function batWing(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.4);
  s.quadraticCurveTo(3, 3.6, 5, 3.2);
  s.lineTo(10, 2);
  s.quadraticCurveTo(8, 1, 7.6, -2.6);
  s.quadraticCurveTo(6.2, -0.6, 5, -3.6);
  s.quadraticCurveTo(3.8, -1, 2.4, -3.2);
  s.quadraticCurveTo(1.6, -1, 0, -1.4);
  s.closePath();
  return new THREE.ShapeGeometry(s, 6);
}
export function batInnerWing(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.4);
  s.quadraticCurveTo(3, 3.6, 5, 3.2);
  s.lineTo(5.1, -3.6);
  s.quadraticCurveTo(3.8, -1, 2.4, -3.2);
  s.quadraticCurveTo(1.6, -1, 0, -1.4);
  s.closePath();
  return new THREE.ShapeGeometry(s, 6);
}
export function batOuterWing(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.1, 3.2);
  s.lineTo(5, 2);
  s.quadraticCurveTo(3, 1, 2.6, -2.6);
  s.quadraticCurveTo(1.2, -0.6, -0.1, -3.6);
  s.closePath();
  return new THREE.ShapeGeometry(s, 6);
}
