import { expect, test } from "@playwright/test";
import { expectCleanPage, startDevGame } from "./support/devGame.js";

const player = (page) => page.evaluate(() => window.gowDev.state().player);
const panel = (page) => page.getByRole("complementary", { name: "Menu debug" });

// Ouvre le menu et libère la souris : capturée, elle enverrait les clics à la scène.
async function openDebugMenu(page) {
  await page.keyboard.press("Control+KeyD");
  await page.keyboard.press("Tab");
}

// Pointer lock minimal : accordé sur geste, rendu par exitPointerLock.
async function emulatePointerLock(page) {
  await page.addInitScript(() => {
    let locked = null;
    Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
    const changed = () => document.dispatchEvent(new Event("pointerlockchange"));
    HTMLCanvasElement.prototype.requestPointerLock = async function () {
      if (!navigator.userActivation.isActive) throw new DOMException("Geste requis", "NotAllowedError");
      locked = this;
      changed();
    };
    document.exitPointerLock = () => {
      if (!locked) return;
      locked = null;
      changed();
    };
  });
}

async function hold(page, code, until) {
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
  await hold(page, "Space", ({ y }) => y > start.y + 1.5);
  const hovering = await player(page);
  await page.waitForTimeout(400);
  expect((await player(page)).y).toBeGreaterThan(hovering.y - 0.05);
  expect((await player(page)).grounded).toBe(false);
  await hold(page, "KeyC", ({ y }) => y < hovering.y - 1);

  // Le mur « PENTES » occupe z ∈ [5,15 ; 5,65] pour x ∈ [−12,8 ; −2,8].
  await page.evaluate(() => window.gowDev.teleportPlayer({ x: -7.8, y: 0.5, z: 3, yaw: 0 }));
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1500);
  await page.keyboard.up("KeyW");
  expect((await player(page)).z).toBeLessThan(5.2);

  await panel(page).getByRole("button", { name: "Noclip" }).click();
  await hold(page, "KeyW", ({ z }) => z > 6.5);
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
