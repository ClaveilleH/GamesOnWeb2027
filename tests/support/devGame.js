import { expect } from "@playwright/test";

// Gabarit commun des tests qui pilotent le jeu par `window.gowDev` (docs/PORTALS.md § 10.3).

// Ouvre le jeu avec le hook de dev, ferme le menu et attend que le joueur soit posé.
export async function startDevGame(page) {
  await page.goto("/?dev");
  await page.getByRole("button", { name: "Jouer", exact: true }).click();
  await page.waitForFunction(() => window.gowDev?.state().player.grounded);
}

// Ni erreur de page, ni erreur console, ni avertissement de Babylon.
export async function expectCleanPage(page) {
  expect((await page.pageErrors()).map((error) => error.message)).toEqual([]);
  const messages = await page.consoleMessages();
  expect(messages.filter((m) => m.type() === "error" || (m.type() === "warning" && /BJS|Babylon/i.test(m.text())))
    .map((m) => m.text())).toEqual([]);
}
