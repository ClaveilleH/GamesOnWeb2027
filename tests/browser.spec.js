import { expect, test } from "@playwright/test";
import { createPlatform, detectBrowser } from "../src/platform/browser.js";

const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:160.0) Gecko/20100101 Firefox/160.0";
const chromium = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36";
const safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";

test("détecte Firefox, et traite tout autre navigateur comme Chromium", () => {
  expect(detectBrowser(firefox, "")).toBe("firefox");
  expect(detectBrowser(chromium, "")).toBe("chromium");
  expect(detectBrowser(safari, "")).toBe("chromium");
  expect(detectBrowser("", "")).toBe("chromium");
});

test("?browser= force un profil connu et ignore les autres valeurs", () => {
  expect(detectBrowser(chromium, "?browser=firefox")).toBe("firefox");
  expect(detectBrowser(firefox, "?browser=chromium")).toBe("chromium");
  expect(detectBrowser(firefox, "?browser=opera")).toBe("firefox");
});

test("les profils exposent les mêmes options et un nom inconnu retombe sur Chromium", () => {
  const options = (platform) => Object.keys(platform).sort();
  expect(options(createPlatform("firefox"))).toEqual(options(createPlatform("chromium")));
  expect(createPlatform("inconnu").name).toBe("chromium");
  expect(Object.isFrozen(createPlatform("firefox"))).toBe(true);
});
