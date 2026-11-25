import { expect, test } from "@playwright/test";
import { expectCleanPage } from "./support/devGame.js";

// Map « direction artistique » (`?map=direction-artistique`, src/world/art/) : une salle par direction.

test.setTimeout(process.env.CI ? 120_000 : 60_000);

test("chaque salle de direction artistique s'active quand le joueur y entre, sans erreur", async ({ page }) => {
  await page.goto("/?dev&map=direction-artistique");
  await page.getByRole("button", { name: "Jouer", exact: true }).click();
  await page.waitForFunction(() => window.gowDev?.state().player.grounded);
  const count = await page.evaluate(() => window.gowDev.map().count);
  expect(count).toBeGreaterThan(0);
  for (let room = 0; room < count; room++) {
    await page.evaluate((x) => window.gowDev.teleportPlayer({ x, y: 0.05, z: -3.5 }), room * 30);
    await expect.poll(() => page.evaluate(() => window.gowDev.map().room)).toBe(room);
  }
  await expectCleanPage(page);
});
