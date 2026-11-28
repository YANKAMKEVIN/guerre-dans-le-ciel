// Pause automatique quand l'onglet est caché (changement d'onglet, téléphone verrouillé).
export interface VisibilityTarget {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
}
export function pauseWhenHidden(doc: VisibilityTarget, pause: () => void): void {
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) pause();
  });
}
