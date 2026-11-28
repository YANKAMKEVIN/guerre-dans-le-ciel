// Ciel, brume, lumières et ambiance : du ciel céleste (0) au ciel d'apocalypse (1) quand le Dragon arrive.
import * as THREE from 'three';
import { lerp } from '../sim/math';
import { C } from './materials';
import { cloudColors, sunDir } from './clouds';

const MOOD = {
  top: [C('#1552c4'), C('#12030a')], hor: [C('#cfe6ff'), C('#b02a17')], bot: [C('#a9cdf2'), C('#2a0706')],
  sun: [C('#fff4d6'), C('#ff3a12')], fog: [C('#a9cff5'), C('#4c110c')], light: [C('#fff3da'), C('#ff6a3a')],
  hemiS: [C('#9cc0ff'), C('#70221a')], hemiG: [C('#c7b2ee'), C('#5a1c18')], land: [C('#d6d6d6'), C('#e09a86')],
  cLit: [C('#fffaf0'), C('#d0705a')], cMid: [C('#dfe6fb'), C('#7c3a3a')], cSh: [C('#b0b6ee'), C('#4a2030')], cDeep: [C('#8a8ccf'), C('#2a1020')],
} as const;
type MoodKey = keyof typeof MOOD;

export interface MoodTargets {
  land: THREE.Color[];
  bloom: { strength: number };
}

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly sun = new THREE.DirectionalLight(0xffffff, 3.2);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.7);
  readonly fog = new THREE.FogExp2(0xffffff, 0.00021);
  readonly floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly u = {
    uTop: { value: C(0) }, uHor: { value: C(0) }, uBot: { value: C(0) }, uSun: { value: C(0) }, uSunDir: { value: sunDir },
  };
  private last = -1;

  constructor(scene: THREE.Scene, private readonly targets: MoodTargets) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(18000, 32, 20),
      new THREE.ShaderMaterial({
        uniforms: this.u, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec3 vDir;uniform vec3 uTop,uHor,uBot,uSun,uSunDir;
  void main(){vec3 d=normalize(vDir);float h=d.y;
    vec3 c=mix(uHor,uTop,pow(clamp(h,0.,1.),.5));
    c=mix(c,uBot,clamp(-h*4.,0.,1.));
    float s=max(dot(d,uSunDir),0.);
    vec3 rr=normalize(cross(uSunDir,vec3(0.,1.,0.)));vec3 uu=cross(rr,uSunDir);float a=atan(dot(d,uu),dot(d,rr));
    float rays=pow(s,7.)*(.5+.5*sin(a*17.))*(.6+.4*sin(a*5.+1.))*.3;
    c+=uSun*(pow(s,900.)*9.+pow(s,40.)*.6+pow(s,5.)*.2+rays);
    gl_FragColor=vec4(c,1.);}`,
      }),
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    scene.fog = this.fog;
    this.sun.position.copy(sunDir).multiplyScalar(100);
    scene.add(this.sun, this.hemi);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -906;
    scene.add(this.floor);
  }

  /** Applique l'ambiance m ∈ [0, 1] ; rien à faire si elle n'a pas bougé. */
  apply(m: number): void {
    if (Math.abs(m - this.last) < 1e-5) return;
    this.last = m;
    const L = (k: MoodKey, t: THREE.Color): THREE.Color => t.copy(MOOD[k][0]).lerp(MOOD[k][1], m);
    const u = this.u;
    L('top', u.uTop.value);
    L('hor', u.uHor.value);
    L('bot', u.uBot.value);
    L('sun', u.uSun.value);
    L('fog', this.fog.color);
    L('light', this.sun.color);
    L('cLit', cloudColors.uLit.value);
    L('cMid', cloudColors.uMid.value);
    L('cSh', cloudColors.uSh.value);
    L('cDeep', cloudColors.uDeep.value);
    cloudColors.uSunCol.value.copy(u.uSun.value);
    cloudColors.uFog.value.copy(this.fog.color);
    L('hemiS', this.hemi.color);
    L('hemiG', this.hemi.groundColor);
    const land = this.targets.land;
    if (land[0]) {
      L('land', land[0]);
      for (let i = 1; i < land.length; i++) (land[i] as THREE.Color).copy(land[0]);
    }
    this.floor.material.color.copy(this.fog.color).multiplyScalar(0.92);
    this.sun.intensity = lerp(2.7, 1.6, m);
    this.hemi.intensity = lerp(1.5, 1.6, m);
    this.targets.bloom.strength = lerp(0.45, 0.55, m);
  }

  follow(cam: THREE.Vector3): void {
    this.mesh.position.copy(cam);
  }
}
