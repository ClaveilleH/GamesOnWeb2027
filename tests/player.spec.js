import { expect, test } from "@playwright/test";
import { CAMERA, MAX_ACCUMULATED_TIME, PLAYER } from "../src/config.js";

const landing = { timeout: 15000 };
const play = (page) => page.getByRole("button", { name: "Jouer", exact: true });
const slot = (page, action, name = "principal") =>
  page.getByRole("button", { name: new RegExp(`^${action}, ${name},`) });

function position(hud) {
  return hud.evaluate(({ dataset }) => ({
    x: Number(dataset.x), y: Number(dataset.y), z: Number(dataset.z),
  }));
}

function cameraAngles(hud) {
  return hud.evaluate(({ dataset }) => ({
    yaw: Number(dataset.cameraYaw), pitch: Number(dataset.cameraPitch),
  }));
}

async function startOnGround(page) {
  await page.goto("/");
  await play(page).click();
  const hud = page.locator("#player-state");
  await expect(hud).toHaveAttribute("data-grounded", "true", landing);
  return hud;
}

async function hold(page, code, ms) {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

async function advancePast(page, hud, code, z) {
  await page.keyboard.down(code);
  try {
    await expect.poll(async () => (await position(hud)).z).toBeGreaterThan(z);
  } finally {
    await page.keyboard.up(code);
  }
}

async function refuseCapture(page) {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException("Capture refusée", "NotAllowedError"));
  });
}

async function startWithManualFrames(page) {
  await refuseCapture(page);
  await page.setViewportSize({ width: 320, height: 240 });
  await page.addInitScript(() => {
    let now = performance.now();
    let nextId = 0;
    const pending = new Map();
    performance.now = () => now;
    window.requestAnimationFrame = (callback) => {
      const id = ++nextId;
      pending.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => pending.delete(id);
    window.advanceRenderFrame = (milliseconds) => {
      now += milliseconds;
      for (const [id, callback] of [...pending]) {
        if (pending.delete(id)) callback(now);
      }
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector("#pause-menu").open, null, { polling: 20 });
  await play(page).evaluate((button) => button.click());
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) window.advanceRenderFrame(250);
  });
  const hud = page.locator("#player-state");
  await expect(hud).toHaveAttribute("data-grounded", "true");
  return hud;
}

test.afterEach(async ({ page }) => {
  expect((await page.pageErrors()).map((error) => error.message)).toEqual([]);
});

test("le build sert Havok en application/wasm et ouvre le menu d’accueil", async ({ page }) => {
  const wasm = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith(".wasm"));
  await page.goto("/");
  const response = await wasm;
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"].split(";")[0]).toBe("application/wasm");
  await expect(page.getByRole("dialog", { name: "Games on Web 2027" })).toBeVisible();
  await expect(play(page)).toBeFocused();
  await expect(page.locator("#player-state")).toBeHidden();
  await play(page).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("le personnage tombe après Jouer et se pose", async ({ page }) => {
  await page.goto("/");
  const hud = page.locator("#player-state");
  await expect(hud).toHaveAttribute("data-grounded", "false");
  const initial = await position(hud);
  await play(page).click();
  await expect(hud).toHaveAttribute("data-grounded", "true", landing);
  expect(initial.y - (await position(hud)).y).toBeGreaterThan(0.5);
  await expect(page.locator("#ground-state")).toHaveText("Au sol");
});

test("KeyW pendant une seconde déplace de plus d’un mètre même si la capture échoue", async ({ page }) => {
  await refuseCapture(page);
  const hud = await startOnGround(page);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.getByText("Cliquez pour contrôler la caméra")).toBeVisible();
  const start = await position(hud);
  const yaw = await hud.getAttribute("data-camera-yaw");
  await page.locator("#scene").dispatchEvent("mousemove", { movementX: 240, movementY: 90 });
  await hold(page, "KeyW", 1000);
  const end = await position(hud);
  await expect(hud).toHaveAttribute("data-camera-yaw", yaw);
  expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1);
});

test("la marche rattrape les images lentes et plafonne une interruption d’une seconde", async ({ page }) => {
  await refuseCapture(page);
  await page.clock.install({ time: new Date("2027-01-01T12:00:00Z") });
  const hud = await startOnGround(page);
  await page.clock.pauseAt(new Date("2027-01-01T12:01:00Z"));
  await page.keyboard.down("KeyW");
  await page.clock.runFor(400);
  const start = await position(hud);
  for (let i = 0; i < 5; i++) await page.clock.fastForward(100);
  const walking = await position(hud);
  await page.clock.fastForward(1000);
  await page.keyboard.up("KeyW");
  const end = await position(hud);
  expect(walking.z - start.z).toBeCloseTo(PLAYER.walkSpeed * 0.5, 2);
  expect(end.z - walking.z).toBeCloseTo(PLAYER.walkSpeed * MAX_ACCUMULATED_TIME, 2);
});

test("à 144 Hz, chaque image avance régulièrement entre les pas physiques", async ({ page }) => {
  const hud = await startWithManualFrames(page);
  await page.keyboard.down("KeyW");
  const samples = await hud.evaluate(({ dataset }) => {
    const dt = 1000 / 144;
    for (let i = 0; i < 72; i++) window.advanceRenderFrame(dt);
    const frames = [];
    for (let i = 0; i <= 144; i++) {
      window.advanceRenderFrame(dt);
      frames.push({ rendered: Number(dataset.renderZ), simulated: Number(dataset.z) });
    }
    return frames;
  });
  await page.keyboard.up("KeyW");
  const increments = samples.slice(1).map((frame, i) => frame.rendered - samples[i].rendered);
  const mean = increments.reduce((sum, value) => sum + value, 0) / increments.length;
  const variance = increments.reduce((sum, value) => sum + (value - mean) ** 2, 0) / increments.length;
  expect(samples.some((frame, i) => i > 0 && frame.simulated === samples[i - 1].simulated)).toBe(true);
  expect(Math.min(...increments)).toBeGreaterThan(0);
  expect(mean).toBeCloseTo(PLAYER.walkSpeed / 144, 4);
  expect(Math.sqrt(variance)).toBeLessThan(0.0001);
});

test("la reprise et la réapparition présentent immédiatement la pose courante", async ({ page }) => {
  const hud = await startWithManualFrames(page);
  const pose = () => hud.evaluate(({ dataset }) => ({
    simulated: [Number(dataset.x), Number(dataset.y), Number(dataset.z)],
    rendered: [Number(dataset.renderX), Number(dataset.renderY), Number(dataset.renderZ)],
    yaw: Number(dataset.renderYaw),
  }));
  const frame = (ms) => page.evaluate((ms) => window.advanceRenderFrame(ms), ms);
  await page.keyboard.down("KeyD");
  await frame(250);
  await frame(250);
  const walking = await pose();
  expect(walking.simulated[0] - walking.rendered[0]).toBeGreaterThan(0.04);
  expect(walking.yaw).toBeGreaterThan(1);

  await page.keyboard.press("Escape");
  await page.keyboard.up("KeyD");
  await frame(2000);
  await page.keyboard.press("Escape");
  await frame(2);
  const resumed = await pose();
  expect(resumed.simulated).toEqual(walking.simulated);
  for (let i = 0; i < 3; i++) expect(resumed.rendered[i]).toBeCloseTo(resumed.simulated[i], 2);

  await page.keyboard.press("KeyR");
  await frame(16);
  const respawned = await pose();
  expect(respawned.simulated[1] - resumed.simulated[1]).toBeGreaterThan(2);
  expect(respawned.yaw).toBe(0);
  for (let i = 0; i < 3; i++) expect(respawned.rendered[i]).toBeCloseTo(respawned.simulated[i], 2);
});

test("Espace déclenche un saut suivi d’un atterrissage", async ({ page }) => {
  const hud = await startOnGround(page);
  const flight = await hud.evaluateHandle((hud) => {
    const contact = hud.querySelector("#ground-state");
    const startY = Number(hud.dataset.y);
    const sample = { startY, maxY: startY, airborne: false, landed: false };
    const observer = new MutationObserver(() => {
      const y = Number(hud.dataset.y);
      sample.maxY = Math.max(sample.maxY, y);
      if (y > startY && hud.dataset.grounded === "false" && contact.textContent === "En l’air") {
        sample.airborne = true;
      }
      if (sample.airborne && hud.dataset.grounded === "true" && contact.textContent === "Au sol") {
        sample.landed = true;
        observer.disconnect();
      }
    });
    observer.observe(hud, { attributes: true, attributeFilter: ["data-grounded", "data-y"] });
    return sample;
  });
  await page.keyboard.press("Space");
  await page.waitForFunction((sample) => sample.landed, flight, landing);
  const { startY, maxY } = await flight.jsonValue();
  await flight.dispose();
  expect(maxY - startY).toBeGreaterThan(0.25);
});

test("Échap fige le jeu, garde le focus dans le menu et reprend au clavier", async ({ page }) => {
  await refuseCapture(page);
  const hud = await startOnGround(page);
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  const resume = dialog.getByRole("button", { name: "Reprendre" });
  await expect(resume).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Réinitialiser les touches" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(resume).toBeFocused();
  const paused = await position(hud);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(320);
  expect(await position(hud)).toEqual(paused);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(180);
  expect(await position(hud)).toMatchObject({ x: paused.x, z: paused.z });
  await page.keyboard.up("KeyW");
  await advancePast(page, hud, "KeyW", paused.z + 0.3);
});

test("Avancer accepte I immédiatement, persiste après rechargement et revient à W après réinitialisation", async ({ page }) => {
  const hud = await startOnGround(page);
  await page.keyboard.press("Escape");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Disposition du clavier").selectOption("qwerty");
  await slot(page, "Avancer").click();
  await page.keyboard.press("KeyI");
  await expect(slot(page, "Avancer")).toHaveText("I");
  await expect(slot(page, "Avancer", "secondaire")).toHaveText("↑");
  await dialog.getByRole("button", { name: "Reprendre" }).click();
  const initial = await position(hud);
  await hold(page, "KeyW", 350);
  expect(await position(hud)).toMatchObject({ x: initial.x, z: initial.z });
  await advancePast(page, hud, "KeyI", initial.z + 0.6);
  await page.reload();
  await expect(slot(page, "Avancer")).toHaveText("I");
  await expect(page.getByLabel("Disposition du clavier")).toHaveValue("qwerty");
  await page.getByRole("button", { name: "Réinitialiser les touches" }).click();
  await expect(slot(page, "Avancer")).toHaveText("W");
  await page.reload();
  await expect(slot(page, "Avancer")).toHaveText("W");
});

test("la détection à la frappe actualise les libellés AZERTY et QWERTY, le choix manuel prime", async ({ page }) => {
  await refuseCapture(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "keyboard", { value: undefined });
    Object.defineProperty(navigator, "languages", { value: ["fr-BE"] });
  });
  await page.goto("/");
  const select = page.getByLabel("Disposition du clavier");
  const automatic = select.locator('option[value="auto"]');
  const probe = (key, modifiers = {}) => page.evaluate(([key, mods]) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", key, bubbles: true, ...mods }));
  }, [key, modifiers]);
  await expect(automatic).toContainText("AZERTY supposée");
  await probe("q", { ctrlKey: true });
  await expect(automatic).toContainText("supposée");
  await probe("a");
  await expect(automatic).toHaveText("Automatique (AZERTY détecté)");
  await expect(slot(page, "Avancer")).toHaveText("Z");
  await probe("q");
  await expect(automatic).toHaveText("Automatique (QWERTY détecté)");
  await expect(slot(page, "Avancer")).toHaveText("W");
  await select.selectOption("azerty");
  await probe("q");
  await expect(slot(page, "Avancer")).toHaveText("Z");
  await play(page).click();
  await expect(page.locator("#movement-keys")).toHaveText("ZQSD");
});

test("la carte système fournit les lettres et des préférences illisibles restaurent les défauts", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "keyboard", { value: { getLayoutMap: async () => new Map([["KeyQ", "q"], ["KeyW", "v"]]) } });
    if (localStorage.getItem("gow.bindings.v1") === null) {
      localStorage.setItem("gow.bindings.v1", "{");
      localStorage.setItem("gow.layout.v1", "illisible");
    }
  });
  await page.goto("/");
  await expect(page.getByLabel("Disposition du clavier")).toHaveValue("auto");
  await expect(page.getByRole("option", { name: "Automatique (QWERTY détecté)" })).toBeAttached();
  await expect(slot(page, "Avancer")).toHaveText("V");
  await expect(slot(page, "Avancer", "secondaire")).toHaveText("↑");
  await slot(page, "Sauter").click();
  await page.keyboard.press("KeyI");
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("gow.bindings.v1"));
    saved.forward[0] = "CodeInconnu";
    localStorage.setItem("gow.bindings.v1", JSON.stringify(saved));
  });
  await page.reload();
  await expect(slot(page, "Avancer")).toHaveText("V");
  await expect(slot(page, "Sauter")).toHaveText("Espace");
});

test("les conflits sont signalés, Échap annule la saisie, Suppr efface et F3 commande le HUD", async ({ page }) => {
  await refuseCapture(page);
  await page.goto("/");
  const jump = slot(page, "Sauter", "secondaire");
  const message = page.locator("#binding-message");
  await jump.click();
  await page.keyboard.press("F3");
  await expect(message).toContainText("réservé");
  await page.keyboard.press("Escape");
  await expect(jump).toHaveText("—");
  await jump.click();
  const announcement = await message.evaluateHandle((node) => {
    const result = { text: "" };
    const observer = new MutationObserver(() => {
      result.text = node.textContent;
      observer.disconnect();
    });
    observer.observe(node, { childList: true });
    return result;
  });
  await page.keyboard.press("ArrowUp");
  expect((await announcement.jsonValue()).text).toContain("retiré de « Avancer »");
  await announcement.dispose();
  await expect(jump).toHaveText("↑");
  await expect(slot(page, "Avancer", "secondaire")).toHaveText("—");
  await jump.click();
  await page.keyboard.press("Delete");
  await expect(jump).toHaveText("—");
  await play(page).click();
  const hud = page.locator("#player-state");
  await expect(hud).toBeHidden();
  await page.keyboard.press("F3");
  await expect(hud).toBeVisible();
  await page.keyboard.press("F3");
  await expect(hud).toBeHidden();
});

test("la capture ignore le recentrage puis applique les petits mouvements de souris", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.addInitScript(() => {
    let locked = null;
    Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
    HTMLCanvasElement.prototype.requestPointerLock = function () {
      locked = this;
      document.dispatchEvent(new Event("pointerlockchange"));
      document.dispatchEvent(new MouseEvent("mousemove", { movementX: -475, movementY: -132 }));
      document.dispatchEvent(new MouseEvent("mousemove", { movementX: 18, movementY: -12 }));
      return Promise.resolve();
    };
  });
  await page.goto("/");
  await expect(play(page)).toBeFocused();
  const hud = page.locator("#player-state");
  const initial = await cameraAngles(hud);
  await play(page).click();
  expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("scene");
  await page.waitForTimeout(150);
  await expect(hud).toHaveAttribute("data-grounded", "true", landing);
  expect(await cameraAngles(hud)).toEqual(initial);

  await page.evaluate(() => {
    for (const [movementX, movementY] of [[-475, -132], [15, 300], [20, 0], [20, 0]]) {
      document.dispatchEvent(new MouseEvent("mousemove", { movementX, movementY }));
    }
  });
  await expect.poll(() => cameraAngles(hud)).toEqual({
    yaw: Number((initial.yaw + 40 * CAMERA.sensitivity).toFixed(5)), pitch: initial.pitch,
  });
});

test("le blur bloque aussitôt la caméra même si le navigateur signale encore un pointer lock", async ({ page }) => {
  await page.addInitScript(() => {
    let locked = null;
    Object.defineProperty(document, "pointerLockElement", { configurable: true, get: () => locked });
    HTMLCanvasElement.prototype.requestPointerLock = function () {
      locked = this;
      document.dispatchEvent(new Event("pointerlockchange"));
      return Promise.resolve();
    };
    document.exitPointerLock = () => { document.documentElement.dataset.exitRequested = "true"; };
  });
  const hud = await startOnGround(page);
  const angles = () => cameraAngles(hud);
  const original = await angles();
  await page.locator("#scene").dispatchEvent("mousemove", { movementX: 110, movementY: 60 });
  await expect.poll(angles).not.toEqual(original);
  const rotated = await angles();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    for (let i = 0; i < 4; i++) document.dispatchEvent(new MouseEvent("mousemove", { movementX: 160, movementY: -50, bubbles: true }));
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.pointerLockElement?.id)).toBe("scene");
  await expect(page.locator("html")).toHaveAttribute("data-exit-requested", "true");
  await page.waitForTimeout(240);
  expect(await angles()).toEqual(rotated);
  await page.getByRole("button", { name: "Reprendre" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.evaluate(() => {
    Object.defineProperty(document, "pointerLockElement", { value: null });
    document.dispatchEvent(new Event("pointerlockchange"));
  });
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("masquer l’onglet met en pause et revenir le laisse en pause", async ({ page }) => {
  await refuseCapture(page);
  const hud = await startOnGround(page);
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => Number(await hud.getAttribute("data-speed"))).toBeGreaterThan(0.5);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  const paused = await position(hud);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(150);
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await position(hud)).toEqual(paused);
});
