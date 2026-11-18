import { expect, test } from "@playwright/test";

test("Havok charge et détecte deux impacts après chaque lancer", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const wasm = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith(".wasm"));
  await page.goto("/");
  const response = await wasm;
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/wasm");

  const counter = page.locator("#bounces");
  const drop = page.getByRole("button", { name: "Relancer la balle" });
  await expect(drop).toBeEnabled();
  await expect.poll(async () => Number(await counter.innerText()), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await drop.click();
  await expect(counter).toHaveText("0");
  await expect.poll(async () => Number(await counter.innerText()), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});
