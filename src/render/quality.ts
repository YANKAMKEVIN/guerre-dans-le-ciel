// Qualité automatique : si les images ralentissent durablement, on descend d'un cran (nuages, puis définition).
// Pur et sans three : testé seul. Les crans ne remontent jamais en cours de session, pour éviter le pompage.

export interface QualityLevel {
  /** plafond du devicePixelRatio */
  dpr: number;
  /** résolution relative des nuages volumétriques */
  clouds: number;
}
/** Cran 0 : rendu d'origine. Cran 1 : nuages allégés (ce que faisait déjà la version d'origine). Puis définition réduite. */
export const DESKTOP_LEVELS: readonly QualityLevel[] = [
  { dpr: 1.75, clouds: 0.5 },
  { dpr: 1.75, clouds: 0.34 },
  { dpr: 1.25, clouds: 0.34 },
  { dpr: 1, clouds: 0.25 },
];
/** Écran tactile : on part directement du cran allégé de la version d'origine (DPR 1,3, nuages 0,34). */
export const TOUCH_LEVELS: readonly QualityLevel[] = [
  { dpr: 1.3, clouds: 0.34 },
  { dpr: 1.1, clouds: 0.3 },
  { dpr: 1, clouds: 0.25 },
];

export class QualityController {
  private ema = 16;
  private slowFor = 0;
  level = 0;
  constructor(
    private levels: readonly QualityLevel[] = DESKTOP_LEVELS,
    /** intervalle entre images trop long au-delà de (ms) : sous ~26 images par seconde */
    private readonly slowMs = 38,
    /** durée de lenteur avant de descendre (s) */
    private readonly patience = 1.5,
    /** pas de décision pendant le démarrage (s) */
    private readonly warmup = 4,
  ) {}
  get current(): QualityLevel {
    return this.levels[this.level] as QualityLevel;
  }
  get frameMs(): number {
    return this.ema;
  }
  setLevels(levels: readonly QualityLevel[]): void {
    this.levels = levels;
    this.level = Math.min(this.level, levels.length - 1);
  }
  /** Mesure d'une image ; `elapsed` = temps écoulé depuis le chargement (s). Renvoie vrai si le cran change. */
  sample(ms: number, dt: number, elapsed: number): boolean {
    this.ema += (Math.min(ms, 250) - this.ema) * 0.05;
    if (elapsed < this.warmup) return false;
    this.slowFor = this.ema > this.slowMs ? this.slowFor + dt : 0;
    if (this.slowFor >= this.patience && this.level < this.levels.length - 1) {
      this.level++;
      this.slowFor = 0;
      return true;
    }
    return false;
  }
}

/** DPR effectif : celui de l'écran, plafonné. */
export const cappedDpr = (deviceDpr: number | undefined, cap: number): number => Math.min(deviceDpr || 1, cap);
