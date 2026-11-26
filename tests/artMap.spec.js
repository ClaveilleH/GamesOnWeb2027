import { expect, test } from "@playwright/test";
import { expectCleanPage } from "./support/devGame.js";

// Map « direction artistique » (`?map=direction-artistique`, src/world/art/) : une salle par direction.

// Sous rendu logiciel, la première entrée dans une salle compile ses shaders : plusieurs secondes par salle.
test.setTimeout(process.env.CI ? 1_200_000 : 900_000);

test("chaque salle de direction artistique s'active quand le joueur y entre, sans erreur", async ({ page }) => {
  await page.goto("/?dev&map=direction-artistique");
  await page.getByRole("button", { name: "Jouer", exact: true }).click();
  await page.waitForFunction(() => window.gowDev?.state().player.grounded);
  const count = await page.evaluate(() => window.gowDev.map().count);
  expect(count).toBeGreaterThan(0);
  for (let room = 0; room < count; room++) {
    await page.evaluate((x) => window.gowDev.teleportPlayer({ x, y: 0.05, z: -3.5 }), room * 30);
    await expect.poll(() => page.evaluate(() => window.gowDev.map().room), { timeout: 30_000 }).toBe(room);
    // Les salles éloignées sont libérées : au plus la salle active et ses deux voisines restent construites.
    expect(await page.evaluate(() => window.gowDev.map().built)).toBeLessThanOrEqual(3);
  }
  // Retour à la première salle, libérée entre-temps : elle est reconstruite sans erreur.
  await page.evaluate(() => window.gowDev.teleportPlayer({ x: 0, y: 0.05, z: -3.5 }));
  await expect.poll(() => page.evaluate(() => window.gowDev.map().room), { timeout: 30_000 }).toBe(0);
  await expectCleanPage(page);
});

test("`&salle=N` fait démarrer dans la salle N", async ({ page }) => {
  await page.goto("/?dev&map=direction-artistique&salle=3");
  await page.getByRole("button", { name: "Jouer", exact: true }).click();
  await page.waitForFunction(() => window.gowDev?.state().player.grounded);
  await expect.poll(() => page.evaluate(() => window.gowDev.map().room), { timeout: 30_000 }).toBe(2);
  expect(await page.evaluate(() => window.gowDev.state().player.x)).toBeCloseTo(60, 0);
  await expectCleanPage(page);
});
