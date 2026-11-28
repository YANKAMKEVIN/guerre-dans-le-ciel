// Nuages volumétriques : champ de densité parcouru par rayons à demi-résolution, ombré en tons peints.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { clamp, lerp } from '../sim/math';

function makeCloudTextures(): [THREE.DataTexture, THREE.Data3DTexture] {
  const h = (i: number, j: number, k: number, s: number): number => {
    const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + s * 19.19) * 43758.5453;
    return v - Math.floor(v);
  };
  const N = 256, cov = new Uint8Array(N * N * 2), md = (k: number, P: number): number => ((k % P) + P) % P;
  const tn = (x: number, y: number, P: number, sd: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(
      lerp(h(md(xi, P), md(yi, P), 0, sd), h(md(xi + 1, P), md(yi, P), 0, sd), u),
      lerp(h(md(xi, P), md(yi + 1, P), 0, sd), h(md(xi + 1, P), md(yi + 1, P), 0, sd), u),
      v,
    );
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let a = 0, amp = 0.5, tot = 0;
      for (let o = 0; o < 5; o++) {
        const P = 5 << o;
        a += amp * tn((x / N) * P, (y / N) * P, P, o);
        tot += amp;
        amp *= 0.5;
      }
      const g = 0.65 * tn((x / N) * 3, (y / N) * 3, 3, 9) + 0.35 * tn((x / N) * 6, (y / N) * 6, 6, 10);
      cov[(y * N + x) * 2] = (a / tot) * 255;
      cov[(y * N + x) * 2 + 1] = g * 255;
    }
  const ct = new THREE.DataTexture(cov, N, N, THREE.RGFormat);
  ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
  ct.magFilter = ct.minFilter = THREE.LinearFilter;
  ct.needsUpdate = true;
  const M = 48, w = new Uint8Array(M * M * M * 2);
  [4, 8].forEach((Cc, ch) => {
    for (let z = 0; z < M; z++)
      for (let y = 0; y < M; y++)
        for (let x = 0; x < M; x++) {
          const px = ((x + 0.5) / M) * Cc, py = ((y + 0.5) / M) * Cc, pz = ((z + 0.5) / M) * Cc;
          const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
          let f = 9;
          for (let a = -1; a <= 1; a++)
            for (let b = -1; b <= 1; b++)
              for (let c = -1; c <= 1; c++) {
                const i = cx + a, j = cy + b, k = cz + c, wi = md(i, Cc), wj = md(j, Cc), wk = md(k, Cc);
                const dx = i + h(wi, wj, wk, ch * 3 + 1) - px, dy = j + h(wi, wj, wk, ch * 3 + 2) - py, dz = k + h(wi, wj, wk, ch * 3 + 3) - pz;
                f = Math.min(f, dx * dx + dy * dy + dz * dz);
              }
          w[((z * M + y) * M + x) * 2 + ch] = clamp(1 - Math.sqrt(f) * 1.15, 0, 1) * 255;
        }
  });
  const nt = new THREE.Data3DTexture(w, M, M, M);
  nt.format = THREE.RGFormat;
  nt.wrapS = nt.wrapT = nt.wrapR = THREE.RepeatWrapping;
  nt.magFilter = nt.minFilter = THREE.LinearFilter;
  nt.unpackAlignment = 1;
  nt.needsUpdate = true;
  return [ct, nt];
}

export const sunDir = new THREE.Vector3(0.25, 0.3, -1).normalize();
/** couleurs des nuages, réglées par l'ambiance */
export const cloudColors = {
  uLit: { value: new THREE.Color(0) }, uMid: { value: new THREE.Color(0) }, uSh: { value: new THREE.Color(0) },
  uDeep: { value: new THREE.Color(0) }, uSunCol: { value: new THREE.Color(0) }, uFog: { value: new THREE.Color(0) },
};

const [covTex, noiseTex] = makeCloudTextures();
export function makeVolUniforms(camera: THREE.PerspectiveCamera) {
  return {
    tDepth: { value: null as THREE.Texture | null }, tCov: { value: covTex }, tNoise: { value: noiseTex },
    uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld },
    uNear: { value: camera.near }, uFar: { value: camera.far }, uTime: { value: 0 }, uBase: { value: -260 }, uThick: { value: 900 },
    uCovLo: { value: 0.42 }, uCovHi: { value: 0.6 }, ...cloudColors, uL: { value: sunDir }, uFogD: { value: 0.00021 },
  };
}
export type VolUniforms = ReturnType<typeof makeVolUniforms>;

const quadVS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const VOL_FS = `
precision highp sampler3D;
varying vec2 vUv;uniform sampler2D tDepth,tCov;uniform sampler3D tNoise;uniform mat4 uInvProj,uCamWorld;
uniform float uNear,uFar,uTime,uBase,uThick,uCovLo,uCovHi,uFogD;uniform vec3 uLit,uMid,uSh,uDeep,uSunCol,uFog,uL;
float dens(vec3 p,out float hf){
  vec2 c=texture(tCov,p.xz/9000.+vec2(uTime*.0005,uTime*.0002)).rg;float cov=smoothstep(uCovLo,uCovHi,c.r);hf=0.;
  if(cov<.001)return -1.;
  float base=uBase+(c.g-.5)*260.,top=base+120.+cov*cov*uThick,h=(p.y-base)/(top-base);hf=h;
  if(h<0.||h>1.)return 0.;
  float shape=cov-pow(h,1.5)*.85-(1.-smoothstep(0.,.05,h))*.6;
  float n1=texture(tNoise,p/1500.+vec3(uTime*.004,0.,uTime*.002)).r,n2=texture(tNoise,p/420.+vec3(uTime*.009,0.,0.)).g;
  return clamp((shape-(1.-n1)*.38-(1.-n2)*.13)*5.,0.,1.);
}
void main(){
  float depth=texture(tDepth,vUv).r;
  vec4 vv=uInvProj*vec4(vUv*2.-1.,1.,1.);vec3 dv=normalize(vv.xyz/vv.w);
  vec3 rd=normalize((uCamWorld*vec4(dv,0.)).xyz),ro=uCamWorld[3].xyz;
  float tS=1e9;if(depth<.99999){float z=depth*2.-1.;tS=(2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear)))/(-dv.z);}
  float yLo=uBase-140.,yHi=uBase+260.+uThick,t0,t1;
  if(abs(rd.y)<1e-4){if(ro.y<yLo||ro.y>yHi){gl_FragColor=vec4(0.);return;}t0=0.;t1=18000.;}
  else{float ta=(yLo-ro.y)/rd.y,tb=(yHi-ro.y)/rd.y;t0=max(min(ta,tb),0.);t1=min(max(ta,tb),18000.);}
  t1=min(t1,tS);if(t1<=t0){gl_FragColor=vec4(0.);return;}
  float jit=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  vec3 L=normalize(uL);float back=pow(max(dot(rd,L),0.),5.);
  float t=t0+(20.+t0*.03)*jit,a=0.,tF=-1.;vec3 col=vec3(0.);
  for(int i=0;i<110;i++){
    if(t>t1||a>.97)break;
    float dt=20.+t*.03,hf;vec3 p=ro+rd*t;float d=dens(p,hf);
    if(d<0.){t+=dt*2.5;continue;}
    d*=smoothstep(40.,520.,t); // garde la vue dégagée quand l'ange traverse un nuage
    if(d>.002){
      if(tF<0.)tF=t;
      float hh,sum=max(dens(p+L*60.,hh),0.)*60.+max(dens(p+L*160.,hh),0.)*100.+max(dens(p+L*340.,hh),0.)*180.+max(dens(p+L*700.,hh),0.)*360.;
      float lt=exp(-sum*.012),occ=max(dens(p+vec3(0.,70.,0.),hh),0.)*.55+max(dens(p+vec3(0.,180.,0.),hh),0.)*.35;
      float x=clamp(lt*.8+hf*.3-occ*.75,0.,1.);
      vec3 c=mix(uDeep,uSh,smoothstep(.04,.22,x));c=mix(c,uMid,smoothstep(.3,.52,x));c=mix(c,uLit,smoothstep(.58,.82,x));
      c+=uSunCol*back*lt*.6;
      float dA=1.-exp(-d*dt*.04);col+=(1.-a)*dA*c;a+=(1.-a)*dA;
    }
    t+=dt;
  }
  if(a<.002){gl_FragColor=vec4(0.);return;}
  vec3 cn=col/a;float f=1.-exp(-pow(tF*uFogD,2.));cn=mix(cn,uFog,f*.9);
  float as=smoothstep(.05,.6,a);gl_FragColor=vec4(cn*as,as);
}`;

export class CloudPass extends Pass {
  scale = 0.5;
  w = 1;
  h = 1;
  private readonly rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private readonly mq: FullScreenQuad;
  private readonly cq: FullScreenQuad;
  private readonly compMat: THREE.ShaderMaterial;
  constructor(readonly u: VolUniforms) {
    super();
    const volMat = new THREE.ShaderMaterial({ uniforms: u, depthTest: false, depthWrite: false, vertexShader: quadVS, fragmentShader: VOL_FS });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tCloud: { value: null } }, depthTest: false, depthWrite: false, vertexShader: quadVS,
      fragmentShader: 'varying vec2 vUv;uniform sampler2D tDiffuse,tCloud;void main(){vec4 s=texture2D(tDiffuse,vUv);vec4 c=texture2D(tCloud,vUv);gl_FragColor=vec4(s.rgb*(1.-c.a)+c.rgb,s.a);}',
    });
    this.mq = new FullScreenQuad(volMat);
    this.cq = new FullScreenQuad(this.compMat);
  }
  override setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.rt.setSize(Math.max(1, Math.floor(w * this.scale)), Math.max(1, Math.floor(h * this.scale)));
  }
  setScale(s: number): void {
    if (s === this.scale) return;
    this.scale = s;
    this.setSize(this.w, this.h);
  }
  override render(r: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.u.tDepth.value = read.depthTexture;
    r.setRenderTarget(this.rt);
    this.mq.render(r);
    (this.compMat.uniforms.tDiffuse as THREE.IUniform).value = read.texture;
    (this.compMat.uniforms.tCloud as THREE.IUniform).value = this.rt.texture;
    r.setRenderTarget(this.renderToScreen ? null : write);
    this.cq.render(r);
  }
}
