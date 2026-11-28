import { expect, type Page } from '@playwright/test';

/** Ouvre le jeu et attend la fin du chargement ; les erreurs de page sont collectées. */
export async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GPU stall|WebGL-/.test(m.text())) errors.push(m.text());
  });
  await page.goto('./');
  await expect(page.locator('#play')).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('#play')).toHaveText('Prendre son envol');
  return errors;
}

export const dbg = <T>(page: Page, fn: string): Promise<T> => page.evaluate(`(() => { const D = window.__dbg, W = D.world; return ${fn}; })()`) as Promise<T>;

/** Attend une condition sur l'état du jeu (expression évaluée dans la page, avec D = __dbg et W = le monde). */
export async function until(page: Page, fn: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction(`(() => { const D = window.__dbg, W = D.world; return ${fn}; })()`, null, { timeout, polling: 100 });
}

/** Statistiques d'une capture d'écran : luminance moyenne, écart-type et nombre de teintes distinctes (cases de 16). */
export async function imageStats(page: Page): Promise<{ mean: number; std: number; colors: number }> {
  const png = await page.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d') as CanvasRenderingContext2D;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, n = d.length / 4, seen = new Set<number>();
    let s = 0, s2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] as number, g = d[i + 1] as number, b = d[i + 2] as number, l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      s += l;
      s2 += l * l;
      seen.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
    }
    const mean = s / n;
    return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)), colors: seen.size };
  }, png.toString('base64'));
}

/** L'image n'est ni noire, ni blanche, ni unie : la scène 3D est bien dessinée. */
export async function expectRenderedScene(page: Page): Promise<void> {
  const st = await imageStats(page);
  expect(st.mean, 'luminance moyenne').toBeGreaterThan(25);
  expect(st.mean, 'luminance moyenne').toBeLessThan(240);
  expect(st.std, 'contraste').toBeGreaterThan(12);
  expect(st.colors, 'teintes distinctes').toBeGreaterThan(80);
}

/** Masque l'image de titre et les écrans pour ne voir que le rendu WebGL. */
export async function showOnlyCanvas(page: Page): Promise<void> {
  await page.addStyleTag({ content: '#art,.screen,#hud,#touch,#cross{visibility:hidden!important}' });
}
