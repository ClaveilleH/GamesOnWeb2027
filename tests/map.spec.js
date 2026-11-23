import { expect, test } from "@playwright/test";
import { expectCleanPage, startDevGame } from "./support/devGame.js";

// Marche droit devant pendant `seconds` sur l'horloge manuelle : le trajet ne dépend pas de la vitesse du rendu.
function walkForward(page, seconds) {
  return page.evaluate((frames) => {
    const dev = window.gowDev;
    const clock = dev.manualClock();
    try {
      dev.setControls({ forward: 1 });
      for (let i = 0; i < frames; i++) clock.step(1000 / 60);
      dev.setControls(null);
      return dev.state().player;
    } finally {
      clock.release();
    }
  }, Math.round(seconds * 60));
}

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

test("on entre dans la salle d’arcade par la porte de la façade", async ({ page }) => {
  await startDevGame(page, "&map=arcade");
  const player = await walkForward(page, 3);
  // Le mur de la salle va de x = −5,5 à −5,25 : le joueur est dedans, au sol, arrêté par l'îlot de bornes.
  expect(player.x).toBeGreaterThan(-5);
  expect(player.x).toBeLessThan(-1);
  expect(player.z).toBeCloseTo(1.4, 1);
  expect(player.grounded).toBe(true);
  expect(player.y).toBeLessThan(0.3);
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
