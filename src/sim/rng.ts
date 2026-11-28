// Hasard à graine (mulberry32) : la même graine rejoue exactement la même partie.
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }
  get state(): number {
    return this.s;
  }
  /** Nombre dans [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Nombre dans [a, b). */
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
}
