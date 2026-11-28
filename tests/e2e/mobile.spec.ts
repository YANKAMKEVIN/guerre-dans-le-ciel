import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { dbg, expectRenderedScene, openGame, until } from './helpers';

/** Vrais événements tactiles (CDP) : le navigateur en déduit des pointerdown/pointermove de type « touch ». */
let cdp: CDPSession;
async function touch(_page: Page, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number; id: number }[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
}
const center = async (page: Page, sel: string): Promise<{ x: number; y: number }> => {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(sel + ' invisible');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test.describe('téléphone en paysage', () => {
  test('partie au doigt : joystick, Frapper, Jugement, pause', async ({ page }) => {
    const errors = await openGame(page);
    cdp = await page.context().newCDPSession(page);
    await expect(page.locator('#rotate')).toBeHidden();
    await page.locator('#play').tap();
    await until(page, "D.state === 'play'");
    // mode tactile : boutons ronds, définition plafonnée
    await expect(page.locator('body')).toHaveClass(/touch/);
    await expect(page.locator('#touch')).toBeVisible();
    await expect(page.locator('#tFire')).toBeVisible();
    expect(await dbg<number>(page, 'D.quality().dpr')).toBeLessThanOrEqual(1.3);
    await until(page, 'W.demons.length > 0');
    // joystick : le pouce glisse vers la droite, l'ange vire
    const yaw0 = await dbg<number>(page, 'W.player.yaw');
    await touch(page, 'touchStart', [{ x: 150, y: 250, id: 1 }]);
    await expect(page.locator('#joy')).toBeVisible();
    for (let x = 160; x <= 230; x += 10) await touch(page, 'touchMove', [{ x, y: 250, id: 1 }]);
    expect(await dbg<number>(page, 'W.input.mx')).toBeGreaterThan(0.9);
    await until(page, `W.player.yaw < ${yaw0} - 0.3`);
    await touch(page, 'touchEnd', []);
    await expect(page.locator('#joy')).toBeHidden();
    expect(await dbg<number>(page, 'W.input.mx')).toBe(0);
    // Frapper (maintenu), au même moment que le joystick
    const f = await center(page, '#tFire');
    await touch(page, 'touchStart', [{ ...f, id: 2 }]);
    await until(page, 'W.input.fire && W.bolts.some((b) => b.life > 0)');
    await touch(page, 'touchEnd', []);
    await until(page, '!W.input.fire');
    // Jugement : le bouton s'assombrit pendant la recharge
    await page.locator('#tJ').tap();
    await until(page, 'W.player.jCool > 0');
    await expect(page.locator('#tJ')).not.toHaveClass(/ready/);
    // Esquive
    await page.locator('#tE').tap();
    await until(page, 'W.player.dodgeCool > 0');
    // pause et reprise au doigt
    await page.locator('#tP').tap();
    await expect(page.locator('#pause')).toBeVisible();
    await expectRenderedScene(page);
    await page.locator('#resume').tap();
    await expect(page.locator('#pause')).toBeHidden();
    // fin de partie et retour au menu, toujours au doigt
    await dbg(page, 'D.hurt(999)');
    await expect(page.locator('#dead')).toBeVisible({ timeout: 30_000 });
    await page.locator('#deadMenu').tap();
    await expect(page.locator('#menu')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('tenu en portrait : invitation à tourner le téléphone, que l’on peut ignorer', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openGame(page);
    await expect(page.locator('#rotate')).toBeVisible();
    await page.setViewportSize({ width: 740, height: 360 });
    await expect(page.locator('#rotate')).toBeHidden();
    await page.setViewportSize({ width: 360, height: 740 });
    await expect(page.locator('#rotate')).toBeVisible();
    await page.locator('#rotateSkip').tap();
    await expect(page.locator('#rotate')).toBeHidden();
  });
});
