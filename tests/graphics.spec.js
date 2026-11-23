import { expect, test } from "@playwright/test";
import { createSlowFrameMonitor, graphicsHelp, isSoftwareRenderer } from "../src/platform/graphics.js";

test("seuls les noms de moteurs logiciels reconnus déclenchent l’avertissement", () => {
  for (const renderer of ["ANGLE (Google, Vulkan 1.3 (SwiftShader Device (Subzero)))",
    "llvmpipe (LLVM 19.1.7, 256 bits)", "Microsoft Basic Render Driver Direct3D11"]) {
    expect(isSoftwareRenderer(renderer)).toBe(true);
  }
  for (const renderer of ["ANGLE (Intel, Intel UHD Graphics)", "Apple GPU", "Mesa Intel(R) Xe Graphics",
    "Mozilla", "WebKit WebGL", "Unknown renderer", null]) {
    expect(isSoftwareRenderer(renderer)).toBe(false);
  }
});

test("l’aide tient compte du navigateur et des variantes mobiles", () => {
  expect(graphicsHelp("Gecko/20100101 Firefox/160.0")).toContain("paramètres de Firefox");
  expect(graphicsHelp("Chrome/157.0 Safari/537.36 Edg/157.0")).toContain("edge://settings/system");
  expect(graphicsHelp("Chromium/157.0 Safari/537.36")).toContain("recherchez « accélération »");
  expect(graphicsHelp("Macintosh Version/19.0 Safari/605.1.15")).toContain("macOS");
  expect(graphicsHelp("Macintosh Version/19.0 Safari/605.1.15", 5)).toContain("tablette");
  expect(graphicsHelp("Android Mobile Firefox/160.0")).toContain("mobile");
  expect(graphicsHelp("")).toContain("si elle est proposée");
});

test("seul un ralentissement continu déclenche l’aide, une seule fois", () => {
  const monitor = createSlowFrameMonitor({ minFps: 30, duration: 1 });
  const run = (fps, frames) => Array.from({ length: frames }, () => monitor.sample(fps, 0.1)).some(Boolean);
  expect(run(20, 9)).toBe(false);
  // Une image fluide remet le compte à zéro.
  expect(run(60, 1)).toBe(false);
  expect(run(20, 9)).toBe(false);
  monitor.reset();
  expect(run(20, 9)).toBe(false);
  // Un onglet resté caché (gros écart) ne compte que pour 0,25 s.
  monitor.reset();
  expect(monitor.sample(20, 30)).toBe(false);
  expect(run(20, 8)).toBe(true);
  expect(run(20, 20)).toBe(false);
});

// Nom de GPU renvoyé pour RENDERER et UNMASKED_RENDERER_WEBGL.
function spoofRenderer(page, renderer) {
  return page.addInitScript((renderer) => {
    for (const context of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const getParameter = context.prototype.getParameter;
      context.prototype.getParameter = function (parameter) {
        if (parameter === this.RENDERER || parameter === 0x9246) return renderer;
        return getParameter.call(this, parameter);
      };
    }
  }, renderer);
}

test("un GPU annoncé n’affiche l’aide que si le jeu rame, avec le réglage de Firefox", async ({ page }) => {
  // Valeur observée sur Firefox.
  await spoofRenderer(page, "Intel(R) HD Graphics, or similar");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (X11; Linux x86_64; rv:160.0) Gecko/20100101 Firefox/160.0" });
    // Firefox peut ignorer `failIfMajorPerformanceCaveat` : seul le ralentissement le trahit.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
      return getContext.call(this, type, options && { ...options, failIfMajorPerformanceCaveat: false });
    };
  });
  await page.goto("/");
  const menu = page.getByRole("dialog");
  const warning = menu.locator("#graphics-warning");
  await expect(menu.getByRole("button", { name: "Jouer" })).toBeVisible();
  await expect(warning).toBeHidden();
  await menu.getByRole("button", { name: "Jouer" }).click();
  await expect(menu).toBeHidden();
  // Images de 50 ms : environ 20 i/s, sous le seuil de 30.
  await page.evaluate(() => {
    const requestFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => requestFrame((time) => {
      const end = performance.now() + 50;
      while (performance.now() < end);
      callback(time);
    });
  });
  await expect(page.locator("#graphics-notice")).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await expect(warning.locator("summary")).toHaveText("Le jeu ralentit. Vérifier l’accélération graphique");
  await warning.locator("summary").click();
  await expect(warning.getByText(/Dans les paramètres de Firefox/)).toBeVisible();
});

test("SwiftShader affiche l’aide dans le menu et permet de jouer", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("dialog");
  const warning = menu.locator("#graphics-warning");
  await warning.locator("summary").click();
  await expect(warning.locator("p")).toBeVisible();
  await menu.getByRole("button", { name: "Jouer" }).click();
  await expect(warning).toBeHidden();
});

test("un renderer masqué reste détecté par failIfMajorPerformanceCaveat", async ({ page }) => {
  await spoofRenderer(page, "ANGLE (Intel, Intel UHD Graphics)");
  await page.addInitScript(() => {
    // Chromium headless accepte l’option même sur SwiftShader : on imite le refus d’un navigateur
    // qui rend en logiciel, avec un nom de GPU masqué.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
      if (options?.failIfMajorPerformanceCaveat) return null;
      return getContext.call(this, type, options);
    };
  });
  await page.goto("/");
  await expect(page.getByRole("dialog").locator("#graphics-warning summary")).toHaveText(/rendu logiciel/);
});

test("WebGL indisponible affiche directement l’aide au démarrage", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...options) {
      if (type.includes("webgl")) return null;
      return getContext.call(this, type, ...options);
    };
  });
  await page.goto("/");
  await expect(page.locator("#status-message")).toContainText("WebGL est indisponible");
  await expect(page.locator("#status #graphics-warning p")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});
