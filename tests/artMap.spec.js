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

test("le menu pause permet de choisir sa salle : numéro, nom, grille, précédente", async ({ page }) => {
  await page.goto("/?dev&map=direction-artistique&salle=5");
  await page.getByRole("button", { name: "Jouer", exact: true }).click();
  await page.waitForFunction(() => window.gowDev?.state().player.grounded);
  await expect.poll(() => page.evaluate(() => window.gowDev.map().room), { timeout: 30_000 }).toBe(4);
  const menu = page.locator("#pause-menu");
  const field = page.getByRole("textbox", { name: "Numéro ou nom de la salle" });
  const room = () => page.evaluate(() => window.gowDev.map().room);
  const openMenu = async () => {
    await page.keyboard.press("Escape");
    await expect(menu).toBeVisible();
  };

  // Numéro tapé puis Entrée : le menu se ferme, le joueur est dans la salle demandée.
  await openMenu();
  await field.fill("2");
  await field.press("Enter");
  await expect(menu).not.toBeVisible();
  await expect.poll(room, { timeout: 30_000 }).toBe(1);

  // Salle précédente : on revient en arrière.
  await openMenu();
  await page.getByRole("button", { name: "Salle précédente" }).click();
  await expect.poll(room, { timeout: 30_000 }).toBe(0);

  // Grille : un clic sur une salle y mène.
  await openMenu();
  await page.locator(".room-grid button").nth(3).click();
  await expect.poll(room, { timeout: 30_000 }).toBe(3);

  // Le filtre par nom ne garde que les salles correspondantes.
  await openMenu();
  const count = await page.locator(".room-grid li").count();
  await field.fill("noir");
  expect(await page.locator(".room-grid li:not([hidden])").count()).toBeLessThan(count);
  await expectCleanPage(page);
});
