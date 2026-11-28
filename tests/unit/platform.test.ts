import { describe, expect, it } from 'vitest';
import { QualityController, DESKTOP_LEVELS, TOUCH_LEVELS, cappedDpr } from '../../src/render/quality';
import { pauseWhenHidden } from '../../src/ui/visibility';
import { joystick, JOY_RADIUS } from '../../src/input/input';
import { melodyAt, THEMES } from '../../src/audio/music';

describe('qualité automatique', () => {
  it('ne décide rien pendant le démarrage', () => {
    const q = new QualityController();
    for (let i = 0; i < 200; i++) q.sample(100, 0.016, 1);
    expect(q.level).toBe(0);
  });
  it('descend d’un cran après une lenteur durable, jamais plus bas que le dernier', () => {
    const q = new QualityController();
    let changes = 0;
    for (let i = 0; i < 2000; i++) if (q.sample(80, 0.08, 10 + i * 0.08)) changes++;
    expect(changes).toBe(DESKTOP_LEVELS.length - 1);
    expect(q.current).toEqual(DESKTOP_LEVELS[DESKTOP_LEVELS.length - 1]);
  });
  it('reste en haute qualité à 60 images par seconde', () => {
    const q = new QualityController();
    for (let i = 0; i < 2000; i++) q.sample(16.7, 0.0167, 10 + i * 0.0167);
    expect(q.level).toBe(0);
  });
  it('un à-coup isolé ne suffit pas', () => {
    const q = new QualityController();
    for (let i = 0; i < 600; i++) q.sample(i % 120 === 0 ? 250 : 16, 0.016, 10 + i * 0.016);
    expect(q.level).toBe(0);
  });
  it('DPR plafonné ; tactile plus sobre dès le départ', () => {
    expect(cappedDpr(3, 1.75)).toBe(1.75);
    expect(cappedDpr(1, 1.75)).toBe(1);
    expect(cappedDpr(undefined, 1.75)).toBe(1);
    expect(TOUCH_LEVELS[0]?.dpr).toBe(1.3);
    expect(TOUCH_LEVELS[0]?.clouds).toBe(0.34);
    const q = new QualityController();
    q.setLevels(TOUCH_LEVELS);
    expect(q.current.dpr).toBe(1.3);
  });
});

describe('pause quand l’onglet est caché', () => {
  it('met en pause seulement quand la page devient invisible', () => {
    let fn: () => void = () => {};
    const doc = { hidden: false, addEventListener: (_t: 'visibilitychange', f: () => void) => (fn = f) };
    let n = 0;
    pauseWhenHidden(doc, () => n++);
    fn();
    expect(n).toBe(0);
    doc.hidden = true;
    fn();
    expect(n).toBe(1);
  });
});

describe('joystick tactile', () => {
  it('normalise et borne la course au cercle', () => {
    expect(joystick(0, 0)).toEqual({ x: 0, y: 0, dx: 0, dy: 0 });
    const j = joystick(JOY_RADIUS * 3, 0);
    expect(j.x).toBeCloseTo(1);
    expect(j.dx).toBeCloseTo(JOY_RADIUS);
    const d = joystick(60, 80);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(joystick(11, 0).x).toBeCloseTo(0.2);
  });
});

describe('musique', () => {
  it('mélodie : une note aux temps forts de chaque mesure', () => {
    expect(melodyAt(THEMES.sky, 0, 0)).toBe(74);
    expect(melodyAt(THEMES.sky, 0, 8)).toBe(77);
    expect(melodyAt(THEMES.sky, 3, 8)).toBe(69);
    expect(melodyAt(THEMES.sky, 0, 3)).toBeNull();
  });
});
