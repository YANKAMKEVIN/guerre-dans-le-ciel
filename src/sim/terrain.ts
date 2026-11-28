// Relief : bruit procédural partout, et au centre la vallée peinte dont le relief est déduit des zones de l'image.
import { clamp, lerp, smooth01 } from './math';

export const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
}
export function fbm(x: number, y: number): number {
  let a = 0.5, s = 0;
  for (let i = 0; i < 4; i++) {
    s += a * vnoise(x, y);
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return s / 0.9375;
}

export const VS = 8000; // côté de la vallée peinte
export const GN = 256; // résolution de la grille de relief
/** Classes de sol lues dans l'image. */
export const Ground = { Water: 0, Rock: 1, Forest: 2, Meadow: 3, Field: 4, Village: 5, Sand: 6 } as const;
export type Ground = (typeof Ground)[keyof typeof Ground];

export interface ValleyGrid {
  h: Float32Array;
  c: Uint8Array;
}

/** Classe d'un pixel de la vallée peinte. */
export function classifyPixel(r: number, g: number, b: number): Ground {
  if (b > 140 && b > r + 55 && b > g + 5) return Ground.Water;
  if (r > 150 && r > g + 45 && b < 110) return Ground.Village;
  if (r > 205 && g > 205 && b > 195) return Ground.Village;
  if (r > 175 && g > 150 && b < 95 && r > g - 10) return Ground.Field;
  if (r > 185 && g > 165 && b > 110 && r > b + 45) return Ground.Sand;
  if (Math.abs(r - g) < 26 && Math.abs(g - b) < 34 && r > 105) return Ground.Rock;
  if (g > r + 18 && g < 125) return Ground.Forest;
  return Ground.Meadow;
}

/** Grille de relief à partir des pixels RGBA (GN×GN) de la vallée : fleuve creusé, rochers en relief, forêts légèrement bombées. */
export function buildValleyGrid(px: ArrayLike<number>): ValleyGrid {
  const n = GN * GN, C = new Uint8Array(n), D = new Float32Array(n), R = new Float32Array(n), F = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = classifyPixel(px[i * 4] ?? 0, px[i * 4 + 1] ?? 0, px[i * 4 + 2] ?? 0);
    C[i] = c;
    D[i] = c === Ground.Water ? 0 : 1e9;
    R[i] = c === Ground.Rock ? 1 : 0;
    F[i] = c === Ground.Forest ? 1 : 0;
  }
  // distance au fleuve (deux passes)
  for (let k = 0; k < 2; k++)
    for (let y = 0; y < GN; y++)
      for (let x = 0; x < GN; x++) {
        const yy = k ? GN - 1 - y : y, xx = k ? GN - 1 - x : x, i = yy * GN + xx, d = k ? -1 : 1;
        let v = D[i] as number;
        const tst = (ax: number, ay: number, cost: number): void => {
          if (ax >= 0 && ay >= 0 && ax < GN && ay < GN) v = Math.min(v, (D[ay * GN + ax] as number) + cost);
        };
        tst(xx - d, yy, 1);
        tst(xx, yy - d, 1);
        tst(xx - d, yy - d, 1.414);
        tst(xx + d, yy - d, 1.414);
        D[i] = v;
      }
  const blur = (A: Float32Array, r: number, pass: number): void => {
    const T = new Float32Array(n);
    for (let q = 0; q < pass; q++) {
      for (let y = 0; y < GN; y++)
        for (let x = 0; x < GN; x++) {
          let s = 0, c = 0;
          for (let k = -r; k <= r; k++) {
            const xx = x + k;
            if (xx >= 0 && xx < GN) { s += A[y * GN + xx] as number; c++; }
          }
          T[y * GN + x] = s / c;
        }
      for (let y = 0; y < GN; y++)
        for (let x = 0; x < GN; x++) {
          let s = 0, c = 0;
          for (let k = -r; k <= r; k++) {
            const yy = y + k;
            if (yy >= 0 && yy < GN) { s += T[yy * GN + x] as number; c++; }
          }
          A[y * GN + x] = s / c;
        }
    }
  };
  blur(R, 4, 2);
  blur(F, 2, 1);
  const H = new Float32Array(n), floor = -860;
  for (let i = 0; i < n; i++) {
    const d = Math.min(D[i] as number, 60);
    H[i] = floor + Math.pow(d / 60, 1.3) * 320 + (R[i] as number) * 420 + (F[i] as number) * 18 + (hash(i % GN, (i / GN) | 0) - 0.5) * 6;
  }
  blur(H, 2, 3);
  for (let i = 0; i < n; i++)
    if (C[i] === Ground.Water) H[i] = floor - 14;
    else if ((D[i] as number) < 2.5) H[i] = Math.max(floor - 6, Math.min(H[i] as number, floor + 8));
  return { h: H, c: C };
}

export const valleyEdge = (x: number, z: number): number => 1 - smooth01(0.9, 1.1, Math.max(Math.abs(x), Math.abs(z)) / (VS / 2));

export class Terrain {
  grid: ValleyGrid | null = null;
  /** Écart au lit du fleuve au dernier point demandé (0 : dans l'eau), lu par le rendu pour colorer le sol. */
  river = 0;

  heightProc(x: number, z: number): number {
    const h = fbm(x * 0.00042, z * 0.00042);
    this.river = Math.abs(fbm(x * 0.00016 + 31, z * 0.00016 + 17) - 0.5);
    const b = clamp((this.river - 0.012) / 0.1, 0, 1);
    return -900 + h * h * 1150 * b * b * (3 - 2 * b);
  }
  private mapH(g: ValleyGrid, x: number, z: number): number {
    const u = clamp((x / VS + 0.5) * GN - 0.5, 0, GN - 1.001), v = clamp((z / VS + 0.5) * GN - 0.5, 0, GN - 1.001);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, H = g.h;
    return lerp(
      lerp(H[j * GN + i] as number, H[j * GN + i + 1] as number, fu),
      lerp(H[(j + 1) * GN + i] as number, H[(j + 1) * GN + i + 1] as number, fu),
      fv,
    );
  }
  /** Classe de sol de la vallée peinte (prairie hors de la grille). */
  classAt(x: number, z: number): Ground {
    if (!this.grid) return Ground.Meadow;
    const i = clamp(Math.floor((x / VS + 0.5) * GN), 0, GN - 1), j = clamp(Math.floor((z / VS + 0.5) * GN), 0, GN - 1);
    return this.grid.c[j * GN + i] as Ground;
  }
  height(x: number, z: number): number {
    const p = this.heightProc(x, z), g = this.grid;
    if (!g) return p;
    const w = valleyEdge(x, z);
    if (w <= 0) return p;
    if (w > 0.5) this.river = this.classAt(x, z) === Ground.Water ? 0 : 0.1;
    return lerp(p, this.mapH(g, x, z), w);
  }
}
