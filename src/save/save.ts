// Sauvegarde des réglages et des records : une seule clé versionnée, migrée depuis les anciennes clés
// (gdc-vol, gdc-set, gdc-diff, gdc-won, gdc-best), robuste au JSON corrompu et au stockage indisponible.
import type { DiffIndex } from '../sim/config';

export const SAVE_KEY = 'gdc-save';
export const SAVE_VERSION = 1;
export const LEGACY_KEYS = ['gdc-vol', 'gdc-set', 'gdc-diff', 'gdc-won', 'gdc-best'] as const;

export interface SaveData {
  version: typeof SAVE_VERSION;
  settings: { music: number; sfx: number; sens: number; invY: boolean; diff: DiffIndex };
  records: { best: [number, number, number]; won: [boolean, boolean, boolean] };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const defaultSave = (): SaveData => ({
  version: SAVE_VERSION,
  settings: { music: 0.6, sfx: 0.85, sens: 1, invY: false, diff: 1 },
  records: { best: [0, 0, 0], won: [false, false, false] },
});

/** Stockage en mémoire : repli quand localStorage est absent ou refuse l'accès (navigation privée, quota, iframe). */
export class MemoryStorage implements StorageLike {
  private readonly m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

/** localStorage si on peut y lire et écrire, sinon la mémoire. */
export function safeStorage(get: () => StorageLike | undefined = () => globalThis.localStorage): StorageLike {
  try {
    const s = get();
    if (!s) return new MemoryStorage();
    const probe = '__gdc_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return new MemoryStorage();
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, def: number, lo: number, hi: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const diffOf = (v: unknown, def: DiffIndex): DiffIndex => {
  const n = num(v, def, 0, 2);
  return (Number.isInteger(n) ? n : def) as DiffIndex;
};
const parse = (raw: string | null): unknown => {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};
const read = (store: StorageLike, k: string): string | null => {
  try {
    return store.getItem(k);
  } catch {
    return null;
  }
};

/** Normalise n'importe quelle valeur en sauvegarde valide (valeurs bornées, champs manquants remplis). */
export function sanitize(v: unknown): SaveData {
  const d = defaultSave();
  if (!isObj(v)) return d;
  const s = isObj(v.settings) ? v.settings : {}, r = isObj(v.records) ? v.records : {};
  const best = Array.isArray(r.best) ? r.best : [], won = Array.isArray(r.won) ? r.won : [];
  return {
    version: SAVE_VERSION,
    settings: {
      music: num(s.music, d.settings.music, 0, 1),
      sfx: num(s.sfx, d.settings.sfx, 0, 1),
      sens: num(s.sens, d.settings.sens, 0.5, 1.5),
      invY: s.invY === true,
      diff: diffOf(s.diff, d.settings.diff),
    },
    records: {
      best: [0, 1, 2].map((i) => Math.round(num(best[i], 0, 0, 1e9))) as [number, number, number],
      won: [0, 1, 2].map((i) => won[i] === true) as [boolean, boolean, boolean],
    },
  };
}

/** Version 0 : les cinq clés séparées de la version monolithique. */
export function fromLegacy(store: StorageLike): SaveData | null {
  const raw = LEGACY_KEYS.map((k) => read(store, k));
  if (raw.every((x) => x === null)) return null;
  const [vol, set, diff, won, best] = raw.map(parse);
  const d = defaultSave();
  const V = isObj(vol) ? vol : {}, S = isObj(set) ? set : {}, W = isObj(won) ? won : {}, B = isObj(best) ? best : {};
  return sanitize({
    settings: {
      music: V.music ?? d.settings.music,
      sfx: V.sfx ?? d.settings.sfx,
      // l'ancienne version ramenait une sensibilité nulle ou absente à 1
      sens: Number(S.sens) || 1,
      invY: !!S.invY,
      diff: diff ?? raw[2] ?? 1,
    },
    records: {
      best: [0, 1, 2].map((i) => B[i] ?? 0),
      won: [0, 1, 2].map((i) => !!W[i]),
    },
  });
}

/** Lit la sauvegarde. Une sauvegarde illisible est mise de côté (clé « gdc-save-corrupt ») et remplacée par les anciennes clés ou les valeurs par défaut. */
export function loadSave(store: StorageLike): SaveData {
  const raw = read(store, SAVE_KEY);
  if (raw !== null) {
    const v = parse(raw);
    if (isObj(v) && typeof v.version === 'number') return migrate(v);
    try {
      store.setItem(SAVE_KEY + '-corrupt', raw);
    } catch {
      /* stockage plein ou indisponible : on garde au moins la partie en cours */
    }
  }
  return fromLegacy(store) ?? defaultSave();
}

/** Migration selon le numéro de version. Une version future inconnue est lue au mieux, sans rien perdre de ce qu'on comprend. */
export function migrate(v: Record<string, unknown>): SaveData {
  // version 1 : format actuel. Les futures versions ajouteront ici leurs conversions successives.
  return sanitize(v);
}

export function writeSave(store: StorageLike, data: SaveData): boolean {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Sauvegarde vivante : lecture au démarrage, écriture à chaque changement. */
export class SaveStore {
  readonly data: SaveData;
  constructor(private readonly store: StorageLike = safeStorage()) {
    this.data = loadSave(store);
    writeSave(store, this.data);
  }
  update(fn: (d: SaveData) => void): void {
    fn(this.data);
    Object.assign(this.data, sanitize(this.data));
    writeSave(this.store, this.data);
  }
  /** Enregistre un score ; renvoie l'ancien record et s'il est battu. */
  recordScore(diff: DiffIndex, score: number): { prev: number; record: boolean } {
    const prev = this.data.records.best[diff];
    const record = score > prev;
    if (record) this.update((d) => (d.records.best[diff] = score));
    return { prev, record };
  }
  markWon(diff: DiffIndex): void {
    this.update((d) => (d.records.won[diff] = true));
  }
}
