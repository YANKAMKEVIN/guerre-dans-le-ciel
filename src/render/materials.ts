// Ombrage dessin animé : aplats (dégradé à 5 paliers) et contour noir par coque inversée.
import * as THREE from 'three';

export const grad = new THREE.DataTexture(new Uint8Array([105, 105, 190, 255, 255]), 5, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

export const toonMat = (t: THREE.Texture, glowAmt: number): THREE.MeshToonMaterial =>
  new THREE.MeshToonMaterial({ map: t, gradientMap: grad, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: glowAmt });

const OUTLINE_FRAG = 'void main(){gl_FragColor=vec4(.10,.04,.11,1.);}';
/** contour des maillages riggés : la coque suit le squelette */
export const skinOutlineMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { uW: { value: 0.0042 } },
  vertexShader:
    '#include <common>\n#include <skinning_pars_vertex>\nuniform float uW;void main(){\n#include <skinbase_vertex>\n#include <beginnormal_vertex>\n#include <skinnormal_vertex>\n#include <begin_vertex>\n#include <skinning_vertex>\ntransformed+=normalize(objectNormal)*uW;gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.);}',
  fragmentShader: OUTLINE_FRAG,
});

export const C = (h: THREE.ColorRepresentation): THREE.Color => new THREE.Color(h);

/** texture douce (halo) partagée par les particules et les lueurs */
export const soft: THREE.Texture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

export const glow = (color: THREE.ColorRepresentation, size: number, op: number): THREE.Sprite => {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: soft, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op, fog: false }),
  );
  s.scale.setScalar(size);
  return s;
};
