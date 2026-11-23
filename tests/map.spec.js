import { expect, test } from "@playwright/test";
import { expectCleanPage, startDevGame } from "./support/devGame.js";

test("?map=arcade remplace le terrain d’entraînement par la salle d’arcade", async ({ page }) => {
  await startDevGame(page, "&map=arcade");
  const { player } = await page.evaluate(() => window.gowDev.state());
  // Départ de la map, sur la chaussée face à la porte (Babylon inverse l'axe x du glTF).
  expect(player.x).toBeCloseTo(-11.5, 1);
  expect(player.z).toBeCloseTo(1.4, 1);
  expect(player.yaw).toBeCloseTo(Math.PI / 2, 2);
  // Démos de portails non chargées.
  expect(await page.evaluate(() => window.gowDev.portalSystem.portals.length)).toBe(0);
  await expectCleanPage(page);
});

test("une map introuvable laisse le terrain d’entraînement", async ({ page }) => {
  await startDevGame(page, "&map=/models/maps/absente.glb");
  const { player } = await page.evaluate(() => window.gowDev.state());
  expect(player.x).toBeCloseTo(0, 1);
  expect(player.z).toBeCloseTo(-10, 1);
  expect(await page.evaluate(() => window.gowDev.portalSystem.portals.length)).toBeGreaterThan(0);
  // Fichier absent vérifié avant le chargement : pas d'erreur Babylon sur la page renvoyée à sa place.
  await expectCleanPage(page);
});
