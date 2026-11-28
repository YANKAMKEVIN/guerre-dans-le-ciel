// Petits outils numériques partagés par la simulation, le rendu et l'interface.
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth01 = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Zone morte du joystick et de la souris : rien sous 7 %, puis réponse un peu plus vive. */
export const deadZone = (v: number): number => {
  const a = Math.abs(v);
  return a < 0.07 ? 0 : Math.sign(v) * Math.min(1, (a - 0.07) * 1.5);
};
/** Facteur de lissage exponentiel indépendant du pas de temps. */
export const damp = (k: number, dt: number): number => 1 - Math.exp(-dt * k);
