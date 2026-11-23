import { expect } from "@playwright/test";

// Gabarit commun des tests qui pilotent le jeu par `window.gowDev` (docs/PORTALS.md § 10.3).

// Ouvre le jeu avec le hook de dev, ferme le menu et attend que le joueur soit posé.
// L’appui est reconnu quelques centimètres avant le repos : la capsule descend encore de ~3 cm
// en 3 pas. Les tests qui prennent sa hauteur comme niveau du sol attendent donc qu’elle se fige
// 100 ms (au moins 6 pas physiques), quel que soit le nombre de pas par image.
export async function startDevGame(page) {
  await page.goto("/?dev");
  await page.getByRole("button", { name: "Jouer", exact: true }).click();
  await page.waitForFunction(() => window.gowDev?.state().player.grounded);
  await page.evaluate(async () => {
    let previous = NaN;
    let since = 0;
    for (const end = performance.now() + 10000; performance.now() < end;) {
      await new Promise(requestAnimationFrame);
      const { grounded, y } = window.gowDev.state().player;
      const now = performance.now();
      if (!grounded || !(Math.abs(y - previous) < 1e-4)) {
        previous = y;
        since = now;
      } else if (now - since >= 100) {
        return;
      }
    }
    throw new Error("Le joueur ne se pose pas.");
  });
}

// Ni erreur de page, ni erreur console, ni avertissement de Babylon.
export async function expectCleanPage(page) {
  expect((await page.pageErrors()).map((error) => error.message)).toEqual([]);
  const messages = await page.consoleMessages();
  expect(messages.filter((m) => m.type() === "error" || (m.type() === "warning" && /BJS|Babylon/i.test(m.text())))
    .map((m) => m.text())).toEqual([]);
}

export const debugPanel = (page) => page.getByRole("complementary", { name: "Menu debug" });

// Ouvre le menu debug et libère la souris : capturée, elle enverrait les clics à la scène.
// Les catégories sont des accordéons (certaines repliées par défaut) : on les déplie toutes.
export async function openDebugMenu(page) {
  await page.keyboard.press("Control+KeyD");
  await page.keyboard.press("Tab");
  await page.evaluate(() => {
    for (const details of document.querySelectorAll("#debug-menu details")) details.open = true;
  });
  return debugPanel(page);
}
