import { describe, expect, it } from 'vitest';
import { GN, Ground, Terrain, VS, buildValleyGrid, classifyPixel, valleyEdge } from '../../src/sim/terrain';

describe('vallée peinte', () => {
  it('classe les couleurs de l’image', () => {
    expect(classifyPixel(40, 120, 220)).toBe(Ground.Water);
    expect(classifyPixel(200, 120, 80)).toBe(Ground.Village);
    expect(classifyPixel(230, 230, 220)).toBe(Ground.Village);
    expect(classifyPixel(200, 180, 60)).toBe(Ground.Field);
    expect(classifyPixel(140, 140, 135)).toBe(Ground.Rock);
    expect(classifyPixel(40, 100, 40)).toBe(Ground.Forest);
    expect(classifyPixel(120, 170, 80)).toBe(Ground.Meadow);
  });
  it('creuse le fleuve et soulève les rochers', () => {
    // image synthétique : fleuve vertical au milieu, rochers à droite, prairie à gauche
    const px = new Uint8Array(GN * GN * 4);
    for (let y = 0; y < GN; y++)
      for (let x = 0; x < GN; x++) {
        const i = (y * GN + x) * 4, c = Math.abs(x - 128) < 4 ? [40, 120, 220] : x > 200 ? [140, 140, 135] : [120, 170, 80];
        px.set([c[0] as number, c[1] as number, c[2] as number, 255], i);
      }
    const g = buildValleyGrid(px);
    expect(g.c[128 * GN + 128]).toBe(Ground.Water);
    const river = g.h[128 * GN + 128] as number, meadow = g.h[128 * GN + 60] as number, rock = g.h[128 * GN + 240] as number;
    expect(river).toBeCloseTo(-874, 0);
    expect(meadow).toBeGreaterThan(river + 100);
    expect(rock).toBeGreaterThan(meadow + 200);
    const T = new Terrain();
    T.grid = g;
    expect(T.classAt(0, 0)).toBe(Ground.Water);
    expect(T.height(0, 0)).toBeLessThan(T.height(-VS / 4, 0));
    expect(T.river).toBe(0.1); // lu après la dernière hauteur (prairie)
    T.height(0, 0);
    expect(T.river).toBe(0);
  });
  it('raccorde la vallée au relief procédural sur ses bords', () => {
    expect(valleyEdge(0, 0)).toBe(1);
    expect(valleyEdge(VS, 0)).toBe(0);
    const T = new Terrain(), proc = T.heightProc(9000, 9000);
    T.grid = buildValleyGrid(new Uint8Array(GN * GN * 4));
    expect(T.height(9000, 9000)).toBe(proc);
  });
  it('relief procédural continu et borné', () => {
    const T = new Terrain();
    let prev = T.height(0, 0);
    for (let x = 10; x < 4000; x += 10) {
      const h = T.height(x, 300);
      expect(Math.abs(h - prev)).toBeLessThan(40);
      expect(h).toBeGreaterThanOrEqual(-900);
      expect(h).toBeLessThan(400);
      prev = h;
    }
  });
});
