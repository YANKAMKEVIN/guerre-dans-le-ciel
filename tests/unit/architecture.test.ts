// Garde-fous d'architecture : simulation pure, modules courts, pas de CDN.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const srcFiles = walk(join(root, 'src')).filter((f) => f.endsWith('.ts'));

describe('architecture', () => {
  it('la simulation n’importe que des maths de three et ses propres modules', () => {
    for (const f of srcFiles.filter((f) => f.includes(`${join('src', 'sim')}`))) {
      const code = readFileSync(f, 'utf8');
      for (const m of code.matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/gm)) {
        const [, isType, names, from] = m as unknown as [string, string | undefined, string, string];
        if (from.startsWith('./')) continue;
        expect(from, f).toBe('three');
        if (!isType) for (const n of names.split(',').map((s) => s.trim().replace(/^type\s+/, ''))) expect(['Vector3', 'Quaternion', 'Matrix4'], f).toContain(n);
      }
      expect(code, f).not.toMatch(/\b(document|window|localStorage|requestAnimationFrame)\b\s*[.(]/);
      expect(code, f).not.toMatch(/Math\.random/);
    }
  });
  it('aucun module de plus de 400 lignes', () => {
    for (const f of srcFiles) expect(readFileSync(f, 'utf8').split('\n').length, f).toBeLessThanOrEqual(400);
  });
  it('three vient du paquet npm épinglé, pas d’un CDN', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies.three).toMatch(/^\d+\.\d+\.\d+$/);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).not.toMatch(/cdn\.jsdelivr|unpkg|importmap|fonts\.googleapis/);
  });
});
