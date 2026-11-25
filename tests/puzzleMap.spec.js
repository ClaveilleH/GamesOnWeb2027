import { expect, test } from "@playwright/test";
import { expectCleanPage } from "./support/devGame.js";

// Carte casse-tête (`?map=casse-tete`, src/world/puzzleMap.js) : chaque mécanique des trois salles.

async function startPuzzle(page) {
  await page.goto("/?dev&map=casse-tete");
  await page.getByRole("button", { name: "Jouer", exact: true }).click();
  await page.waitForFunction(() => window.gowDev?.state().player.grounded);
}

const puzzle = (page) => page.evaluate(() => window.gowDev.puzzle());
const player = (page) => page.evaluate(() => window.gowDev.state().player);
const crate = (page, name) => page.evaluate((name) => window.gowDev.crate(name).state(), name);
const teleport = (page, feet) => page.evaluate((feet) => window.gowDev.teleportPlayer(feet), feet);
const placeCrate = (page, name, pose) => page.evaluate(([name, pose]) => window.gowDev.crate(name).place(pose), [name, pose]);
const controls = (page, value) => page.evaluate((value) => window.gowDev.setControls(value), value);

test.setTimeout(process.env.CI ? 120_000 : 60_000);

test("la carte casse-tête se charge au parvis, aiguillage sur la cellule", async ({ page }) => {
  await startPuzzle(page);
  const { x, z } = await player(page);
  expect([x, z]).toEqual([0, -40]);
  expect(await puzzle(page)).toMatchObject({ room: 0, finished: false, doors: [false], switchTarget: "X" });
  await expectCleanPage(page);
});

test("salle 1 : une caisse sur la plaque ouvre la porte", async ({ page }) => {
  await startPuzzle(page);
  await placeCrate(page, "caisse de la salle 1", { x: 3.5, y: 0.6, z: -20 });
  await expect.poll(() => puzzle(page)).toMatchObject({ doors: [true] });
  await teleport(page, { x: 0, y: 0.05, z: -18 });
  await controls(page, { forward: 1 });
  await expect.poll(async () => (await player(page)).z, { timeout: 10_000 }).toBeGreaterThan(-14);
  await controls(page, null);
  expect((await puzzle(page)).room).toBe(2);
});

test("salle 2 : la petite caisse poussée dans g ressort de G à l’échelle 1", async ({ page }) => {
  await startPuzzle(page);
  await teleport(page, { x: 4, y: 0.05, z: -14 });
  await controls(page, { forward: 1 });
  await expect.poll(async () => (await crate(page, "caisse de la salle 2")).scale, { timeout: 10_000 }).toBe(1);
  await controls(page, null);
  const { x, z } = await crate(page, "caisse de la salle 2");
  expect(x).toBeCloseTo(-4, 0);
  expect(z).toBeGreaterThan(-9);
  // Le rappel rend la caisse à sa taille de départ.
  await placeCrate(page, "caisse de la salle 2", { x: 4, y: 0.25, z: -11.6, scale: 0.5 });
  expect((await crate(page, "caisse de la salle 2")).scale).toBe(0.5);
});

test("salle 3 : la plaque aiguille E3 vers la tour, puis l’arrivée termine la carte", async ({ page }) => {
  await startPuzzle(page);
  await placeCrate(page, "caisse de la salle 3", { x: 4, y: 0.6, z: 7.5 });
  await expect.poll(() => puzzle(page)).toMatchObject({ switchTarget: "Y" });
  await teleport(page, { x: -4, y: 0.05, z: 6 });
  await controls(page, { forward: 1 });
  await expect.poll(async () => (await player(page)).z, { timeout: 15_000 }).toBeGreaterThan(29);
  await controls(page, null);
  expect((await player(page)).y).toBeGreaterThan(4);
  expect(await puzzle(page)).toMatchObject({ room: 4, finished: true });
  await expect(page.locator("#puzzle-banner")).toContainText("Casse-tête résolu");
  await expectCleanPage(page);
});
