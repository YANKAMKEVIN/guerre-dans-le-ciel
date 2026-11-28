import { describe, expect, it } from 'vitest';
import {
  LEGACY_KEYS, MemoryStorage, SAVE_KEY, SAVE_VERSION, SaveStore, defaultSave, loadSave, safeStorage, sanitize, type StorageLike,
} from '../../src/save/save';

const legacy = (o: Record<string, string>): MemoryStorage => {
  const m = new MemoryStorage();
  for (const [k, v] of Object.entries(o)) m.setItem(k, v);
  return m;
};
/** stockage qui refuse tout (navigation privée stricte, quota dépassé) */
class Broken implements StorageLike {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

describe('sauvegarde versionnée', () => {
  it('valeurs par défaut sans rien de stocké', () => {
    expect(loadSave(new MemoryStorage())).toEqual(defaultSave());
  });
  it('migre les anciennes clés de la version monolithique', () => {
    const s = legacy({
      'gdc-vol': '{"music":0.3,"sfx":0.5}',
      'gdc-set': '{"sens":1.25,"invY":true}',
      'gdc-diff': '2',
      'gdc-won': '{"0":1,"2":1}',
      'gdc-best': '{"1":43210,"2":51000}',
    });
    const d = loadSave(s);
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.settings).toEqual({ music: 0.3, sfx: 0.5, sens: 1.25, invY: true, diff: 2 });
    expect(d.records).toEqual({ best: [0, 43210, 51000], won: [true, false, true] });
    // les anciennes clés restent en place (retour possible à l'ancienne version)
    for (const k of LEGACY_KEYS) expect(s.getItem(k)).not.toBeNull();
  });
  it('migre partiellement : une ancienne clé corrompue n’empêche pas les autres', () => {
    const d = loadSave(legacy({ 'gdc-vol': '{oups', 'gdc-best': '{"0":1200}', 'gdc-diff': 'abc' }));
    expect(d.settings.music).toBe(0.6);
    expect(d.settings.diff).toBe(1);
    expect(d.records.best[0]).toBe(1200);
  });
  it('JSON corrompu : mis de côté, puis repli sur les anciennes clés', () => {
    const s = legacy({ [SAVE_KEY]: '{"version":1,"settings":', 'gdc-diff': '0' });
    const d = loadSave(s);
    expect(d.settings.diff).toBe(0);
    expect(s.getItem(SAVE_KEY + '-corrupt')).toBe('{"version":1,"settings":');
  });
  it('JSON valide mais absurde : valeurs bornées et types réparés', () => {
    const d = sanitize({ version: 1, settings: { music: 7, sfx: -1, sens: 'x', invY: 'oui', diff: 1.5 }, records: { best: [-5, 'NaN', 1e12], won: [1, true] } });
    expect(d.settings).toEqual({ music: 1, sfx: 0, sens: 1, invY: false, diff: 1 });
    expect(d.records).toEqual({ best: [0, 0, 1e9], won: [false, true, false] });
    expect(sanitize(null)).toEqual(defaultSave());
    expect(sanitize([1, 2])).toEqual(defaultSave());
  });
  it('une version future est lue au mieux', () => {
    const s = legacy({ [SAVE_KEY]: JSON.stringify({ version: 99, settings: { music: 0.2 }, autre: true }) });
    expect(loadSave(s).settings.music).toBe(0.2);
  });
  it('stockage indisponible : repli en mémoire, le jeu continue', () => {
    expect(safeStorage(() => new Broken())).toBeInstanceOf(MemoryStorage);
    expect(safeStorage(() => undefined)).toBeInstanceOf(MemoryStorage);
    expect(safeStorage(() => {
      throw new Error('accès refusé');
    })).toBeInstanceOf(MemoryStorage);
    expect(loadSave(new Broken())).toEqual(defaultSave());
    const st = new SaveStore(new Broken());
    expect(() => st.recordScore(1, 500)).not.toThrow();
    expect(st.data.records.best[1]).toBe(500);
  });
  it('aller-retour : records et réglages relus à la session suivante', () => {
    const m = new MemoryStorage();
    const a = new SaveStore(m);
    expect(a.recordScore(2, 1000)).toEqual({ prev: 0, record: true });
    expect(a.recordScore(2, 900)).toEqual({ prev: 1000, record: false });
    a.markWon(2);
    a.update((d) => (d.settings.sens = 0.5));
    const b = new SaveStore(m);
    expect(b.data.records.best[2]).toBe(1000);
    expect(b.data.records.won).toEqual([false, false, true]);
    expect(b.data.settings.sens).toBe(0.5);
    expect(JSON.parse(m.getItem(SAVE_KEY) as string).version).toBe(SAVE_VERSION);
  });
  it('bornes appliquées aussi aux écritures', () => {
    const a = new SaveStore(new MemoryStorage());
    a.update((d) => (d.settings.sens = 9));
    expect(a.data.settings.sens).toBe(1.5);
  });
});
