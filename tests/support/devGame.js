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

// Pilote le rendu image par image avec `gowDev.manualClock()`, puis rend la main à la boucle
// du moteur en rétablissant les commandes et la visibilité du joueur.
export async function withClock(page, run) {
  const clock = await page.evaluateHandle(() => window.gowDev.manualClock());
  try {
    return await run(clock);
  } finally {
    await clock.evaluate((clock) => {
      clock.release();
      window.gowDev.setControls(null);
      window.gowDev.setPlayerVisible(true);
    });
    await clock.dispose();
  }
}
