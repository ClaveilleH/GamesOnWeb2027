import { expect, test } from "@playwright/test";
import { debugPanel as panel, expectCleanPage, openDebugMenu, startDevGame } from "./support/devGame.js";
import { emulatePointerLock } from "./support/pointerLock.js";

const player = (page) => page.evaluate(() => window.gowDev.state().player);

async function holdUntil(page, code, until) {
  await page.keyboard.down(code);
  try {
    await expect.poll(async () => until(await player(page)), { timeout: 10000 }).toBe(true);
  } finally {
    await page.keyboard.up(code);
  }
}

test.afterEach(async ({ page }) => {
  await expectCleanPage(page);
});

test("Ctrl+D ouvre et ferme le menu debug sans ouvrir la pause", async ({ page }) => {
  await startDevGame(page);
  await expect(panel(page)).toBeHidden();
  await page.keyboard.press("Control+KeyD");
  await expect(panel(page)).toBeVisible();
  await expect(page.locator("#pause-menu")).not.toHaveAttribute("open");
  // « Déplacement » est replié par défaut : on l'ouvre pour lire l'état du mode.
  // Tab libère d’abord la souris : capturée, elle enverrait le clic à la scène.
  await page.keyboard.press("Tab");
  await panel(page).getByText("Déplacement", { exact: true }).click();
  await expect(panel(page).getByRole("button", { name: "Marche" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page).locator(".debug-position")).toContainText("z -10");
  await page.keyboard.press("Control+KeyD");
  await expect(panel(page)).toBeHidden();
});

test("la souris libérée (Tab), un Alt+Tab (blur) n’ouvre pas la pause", async ({ page }) => {
  await emulatePointerLock(page);
  await startDevGame(page);
  await page.locator("#scene").click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe("scene");
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  // Alt+Tab retire le focus de la fenêtre : la souris étant déjà libre, aucune pause.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(150);
  await expect(page.locator("#pause-menu")).not.toHaveAttribute("open");
});

test("Tab libère la souris sans pause, un clic sur la scène la reprend", async ({ page }) => {
  await emulatePointerLock(page);
  await startDevGame(page);
  await page.locator("#scene").click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe("scene");
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.locator("#pause-menu")).not.toHaveAttribute("open");
  // Une touche de jeu ne reprend pas la souris tant qu’elle est libérée.
  await page.keyboard.press("KeyW");
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe("scene");
});

test("le vol monte sans gravité et bute sur un mur, le noclip le traverse", async ({ page }) => {
  await startDevGame(page);
  await openDebugMenu(page);
  await panel(page).getByRole("button", { name: "Vol", exact: true }).click();
  const start = await player(page);
  await holdUntil(page, "Space", ({ y }) => y > start.y + 1.5);
  const hovering = await player(page);
  await page.waitForTimeout(400);
  expect((await player(page)).y).toBeGreaterThan(hovering.y - 0.05);
  expect((await player(page)).grounded).toBe(false);
  await holdUntil(page, "KeyC", ({ y }) => y < hovering.y - 1);

  // Le mur « PENTES » occupe z ∈ [5,15 ; 5,65] pour x ∈ [−12,8 ; −2,8].
  await page.evaluate(() => window.gowDev.teleportPlayer({ x: -7.8, y: 0.5, z: 3, yaw: 0 }));
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1500);
  await page.keyboard.up("KeyW");
  expect((await player(page)).z).toBeLessThan(5.2);

  await panel(page).getByRole("button", { name: "Noclip" }).click();
  await holdUntil(page, "KeyW", ({ z }) => z > 6.5);
  await panel(page).getByRole("button", { name: "Marche" }).click();
  await page.waitForFunction(() => window.gowDev.state().player.grounded);
});

test("l’échelle garde les pieds au sol et la téléportation mène au tunnel d’échelle", async ({ page }) => {
  await startDevGame(page);
  await openDebugMenu(page);
  await panel(page).getByRole("button", { name: "×0,5" }).click();
  await expect.poll(async () => (await player(page)).scale).toBe(0.5);
  await page.waitForFunction(() => window.gowDev.state().player.grounded);
  await panel(page).getByRole("button", { name: "×2" }).click();
  await page.waitForFunction(() => window.gowDev.state().player.grounded && window.gowDev.state().player.scale === 2);
  expect((await player(page)).y).toBeGreaterThan(-0.05);
  await expect(panel(page).getByRole("button", { name: "×2" })).toHaveAttribute("aria-pressed", "true");

  await panel(page).getByRole("button", { name: "Tunnel d’échelle P1" }).click();
  await page.waitForFunction(() => window.gowDev.state().player.grounded);
  const { x, z } = await player(page);
  expect(Math.hypot(x + 43, z - 31.5)).toBeLessThan(0.2);
});

test("la caméra 1re personne se place à l’œil mesuré sur le modèle, suit l’échelle et revient à l’épaule", async ({ page }) => {
  await startDevGame(page);
  await openDebugMenu(page);
  const view = (name) => panel(page).getByRole("button", { name });
  await expect(view("3e personne")).toHaveAttribute("aria-pressed", "true");
  const state = () => page.evaluate(() => window.gowDev.state());
  const { firstPersonFit: fit } = await state();
  // Des yeux sous le sommet du crâne, au-dessus de la coupe du cou, devant l’axe du corps.
  expect(fit.headCutHeight).toBeGreaterThan(0.6 * 1.92);
  expect(fit.eyeHeight).toBeGreaterThan(fit.headCutHeight);
  expect(fit.eyeHeight).toBeLessThan(1.92);
  expect(fit.eyeForward).toBeGreaterThan(0);
  // Œil devant l’axe du corps, dans la direction du regard, à l’échelle du joueur.
  const eyeAt = async (scale) => {
    await expect.poll(async () => {
      const { camera, player } = await state();
      const forward = fit.eyeForward * scale;
      return camera.firstPerson
        && Math.hypot(camera.x - player.x - forward * Math.sin(camera.yaw), camera.z - player.z - forward * Math.cos(camera.yaw)) < 0.02
        && Math.abs(camera.y - player.y - fit.eyeHeight * scale) < 0.02;
    }).toBe(true);
  };

  await view("1re personne").click();
  await expect(view("1re personne")).toHaveAttribute("aria-pressed", "true");
  await eyeAt(1);
  // Le tangage s’ouvre au-delà des limites de l’épaule.
  await page.evaluate(() => window.gowDev.look(0, 2000));
  expect((await state()).camera.pitch).toBeGreaterThan(1.4);

  await panel(page).getByRole("button", { name: "×0,5" }).click();
  await page.waitForFunction(() => window.gowDev.state().player.grounded && window.gowDev.state().player.scale === 0.5);
  await eyeAt(0.5);

  await view("3e personne").click();
  await expect(view("3e personne")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => {
    const { camera, player } = await state();
    return !camera.firstPerson && camera.pitch <= 1.16 && Math.hypot(camera.x - player.x, camera.z - player.z) > 0.5;
  }).toBe(true);
});
