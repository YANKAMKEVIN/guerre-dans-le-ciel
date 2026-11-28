import { expect, test } from '@playwright/test';
import { dbg, expectRenderedScene, openGame, showOnlyCanvas, until } from './helpers';

test.describe('bureau', () => {
  test('chargement : menu, aucune erreur, scène 3D dessinée derrière le titre', async ({ page }) => {
    const errors = await openGame(page);
    await expect(page).toHaveTitle('Guerre dans le Ciel');
    await expect(page.locator('#title')).toHaveAttribute('aria-label', 'Guerre dans le Ciel');
    await expect(page.locator('#title .l')).toHaveCount(16);
    await expect(page.locator('#menu .diff [aria-checked="true"]')).toHaveText('Gardien');
    await expect(page.locator('#hud')).toBeHidden();
    // le rendu WebGL seul, sans l'image de titre : ni noir ni uni
    await showOnlyCanvas(page);
    await page.waitForTimeout(500);
    await expectRenderedScene(page);
    // DPR plafonné
    expect(await dbg<number>(page, 'D.quality().dpr')).toBeLessThanOrEqual(1.75);
    expect(errors).toEqual([]);
  });

  test('menu : difficulté et réglages mémorisés d’une visite à l’autre', async ({ page }) => {
    await openGame(page);
    await page.locator('#menu .diff [data-d="2"]').click();
    await expect(page.locator('#menu .diffInfo')).toContainText('Archange');
    await page.locator('#more summary').click();
    await expect(page.locator('#volM')).toBeVisible();
    await page.locator('#sens').fill('50');
    await page.locator('#invY').check();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gdc-save') ?? 'null'));
    expect(saved.version).toBe(1);
    expect(saved.settings).toMatchObject({ diff: 2, sens: 0.5, invY: true });
    await page.reload();
    await expect(page.locator('#play')).toBeEnabled({ timeout: 60_000 });
    await expect(page.locator('#menu .diff [aria-checked="true"]')).toHaveText('Archange');
    await expect(page.locator('#sens2')).toHaveValue('50');
    expect(await dbg<boolean>(page, 'W.settings.invY')).toBe(true);
  });

  test('migration : les records de l’ancienne version sont repris', async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('gdc-save')) return;
      localStorage.setItem('gdc-best', '{"1":43210}');
      localStorage.setItem('gdc-won', '{"1":1}');
      localStorage.setItem('gdc-diff', '1');
    });
    await openGame(page);
    await expect(page.locator('#best')).toContainText('43');
    await expect(page.locator('#menu .diff [data-d="1"]')).toHaveAttribute('data-won', '1');
  });

  test('sauvegarde corrompue : le jeu démarre quand même', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('gdc-save', '{pas du json'));
    const errors = await openGame(page);
    await expect(page.locator('#menu .diff [aria-checked="true"]')).toHaveText('Gardien');
    expect(errors).toEqual([]);
  });

  test('partie : vol au clavier, tir à la souris, pause, onglet caché', async ({ page }) => {
    await openGame(page);
    await page.locator('#play').click();
    await until(page, "D.state === 'play'");
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#art')).toHaveClass(/off/);
    await until(page, 'W.demons.length > 0');
    // virage à droite
    const yaw0 = await dbg<number>(page, 'W.player.yaw');
    await page.keyboard.down('KeyD');
    await until(page, `W.player.yaw < ${yaw0} - 0.3`);
    await page.keyboard.up('KeyD');
    // tir maintenu
    await page.mouse.move(480, 270);
    await page.mouse.down();
    await until(page, 'W.bolts.some((b) => b.life > 0)');
    await page.mouse.up();
    // pause au clavier : le temps de jeu s'arrête
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause')).toBeVisible();
    const t = await dbg<number>(page, 'W.time');
    await page.waitForTimeout(600);
    expect(await dbg<number>(page, 'W.time')).toBe(t);
    await expect(page.locator('#pauseKeys kbd').first()).toBeVisible();
    await page.locator('#resume').click();
    await expect(page.locator('#pause')).toBeHidden();
    await until(page, `W.time > ${t}`);
    // onglet caché : pause automatique
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#pause')).toBeVisible();
    expect(await dbg<boolean>(page, 'D.paused')).toBe(true);
    await expectRenderedScene(page);
  });

  test('Dragon : sept diadèmes et image de la bataille', async ({ page }) => {
    await openGame(page);
    await page.locator('#play').click();
    await until(page, "D.state === 'play'");
    await dbg(page, 'D.boss()');
    await until(page, "W.dragon.alive && W.phase === 'boss'");
    await expect(page.locator('#boss')).toBeVisible();
    await expect(page.locator('#crowns .crown')).toHaveCount(7);
    await expect(page.locator('#bossLabel')).toContainText('7 têtes');
    await expect(page.locator('#waveLabel')).toHaveText('Le Dragon');
    await showOnlyCanvas(page);
    await expectRenderedScene(page);
  });

  test('fin : défaite puis victoire, rangs et retour au menu', async ({ page }) => {
    await openGame(page);
    await page.locator('#play').click();
    await until(page, "D.state === 'play'");
    await dbg(page, 'D.hurt(999)');
    await expect(page.locator('#dead')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#deadRank')).toHaveClass(/in/, { timeout: 30_000 });
    await expect(page.locator('#deadRank')).toContainText('Ange');
    await expect(page.locator('#easier')).toHaveText('Essayer en Pèlerin');
    await page.locator('#deadMenu').click();
    await expect(page.locator('#menu')).toBeVisible();
    await page.locator('#play').click();
    await until(page, "D.state === 'play'");
    await dbg(page, 'D.win()');
    await expect(page.locator('#won')).toBeVisible();
    await expect(page.locator('#wonRank')).toHaveClass(/in/, { timeout: 30_000 });
    await expect(page.locator('#menu .diff [data-d="1"]')).toHaveAttribute('data-won', '1');
    await page.locator('#wonMenu').click();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#hud')).toBeHidden();
  });
});
