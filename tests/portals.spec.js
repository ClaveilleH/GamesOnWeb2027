import { expect, test } from "@playwright/test";
import { signedDistance } from "../src/portals/math.js";
import { expectCleanPage, startDevGame } from "./support/devGame.js";

// Tests de fumée des portails, indépendants de la carte : ni nom ni coordonnée des démos.
// Ils supposent seulement quelques mètres de sol plat et dégagé autour du point de départ.

test.beforeEach(({ page }) => startDevGame(page));
test.afterEach(({ page }) => expectCleanPage(page));

test("chaque portail de la carte a un nom unique et un lien réciproque, F3 affiche leurs statistiques", async ({ page }) => {
  const portals = await page.evaluate(() =>
    window.gowDev.portalSystem.portals.map((portal) => ({ name: portal.name, linked: portal.target?.target === portal })));
  expect(portals.length).toBeGreaterThan(0);
  expect(new Set(portals.map(({ name }) => name)).size).toBe(portals.length);
  for (const { name, linked } of portals) expect(linked, name).toBe(true);

  const hud = page.locator("#player-state");
  await page.keyboard.press("F3");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText(/Portails : profondeur \d+\/\d+ · \d+ passes · \d+ i\/s/);
});

for (const scale of [1, 0.5]) {
  test(`le joueur voit à travers une paire de portails créée au départ et la traverse (échelle ${scale})`, async ({ page }) => {
    const offset = 0.3;
    const { entry, exit, capsuleHeight } = await page.evaluate(({ scale, offset }) => {
      const dev = window.gowDev;
      const system = dev.portalSystem;
      const { x, y, z, yaw, capsuleHeight } = dev.state().player;
      const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      // L’entrée fait face au joueur 2 m devant lui. La sortie, à 4 m sur sa gauche, regarde dans la même
      // direction que lui : le lien est translatif (yaw_B = yaw_A − π).
      const a = system.createPortal({
        name: "test-entrée", origin: { x: x + 2 * forward.x, y, z: z + 2 * forward.z }, yaw: yaw + Math.PI,
        width: 2.4, height: 3, sides: "both",
      });
      const b = system.createPortal({
        name: "test-sortie", origin: { x: x - 4 * right.x - forward.x, y, z: z - 4 * right.z - forward.z }, yaw,
        width: 2.4 * scale, height: 3 * scale, sides: "both",
      });
      system.link(a, b);
      dev.teleportPlayer({ x: x + offset * right.x, y, z: z + offset * right.z, yaw });
      return { entry: dev.portal("test-entrée"), exit: dev.portal("test-sortie"), capsuleHeight };
    }, { scale, offset });
    expect(entry).toMatchObject({ target: "test-sortie", scale });

    await page.waitForFunction(() => window.gowDev.state().player.grounded);
    // L’entrée est dans le champ : le rendu ajoute au moins une passe à travers elle.
    await expect.poll(() => page.evaluate(() => window.gowDev.state().portals.passes)).toBeGreaterThanOrEqual(2);

    await page.evaluate(() => window.gowDev.setControls({ forward: 1 }));
    const arrival = await page.waitForFunction(() => {
      const dev = window.gowDev;
      const state = dev.state();
      if (!state.traversals.length) return false;
      dev.setControls(null);
      return state;
    });
    const { player, traversals } = await arrival.jsonValue();
    expect(traversals).toEqual([{ traveler: "joueur", portal: "test-entrée", frame: expect.any(Number) }]);
    expect(signedDistance(exit, player)).toBeGreaterThan(0);
    // Le lien translatif conserve le décalage latéral, mis à l’échelle de la sortie.
    const lateral = (player.x - exit.origin.x) * Math.cos(exit.yaw) - (player.z - exit.origin.z) * Math.sin(exit.yaw);
    expect(Math.abs(lateral - offset * scale)).toBeLessThan(0.1 * scale);
    expect(Math.cos(player.yaw - exit.yaw)).toBeGreaterThan(0.998);
    expect(player.scale).toBe(scale);
    expect(player.capsuleHeight).toBeCloseTo(capsuleHeight * scale, 3);

    // Sur une machine lente, l’image du franchissement peut précéder le contact avec le sol :
    // on attend que le joueur reprenne appui, sans être tombé ni réapparu au départ.
    await page.waitForFunction(() => window.gowDev.state().player.grounded);
    const settled = await page.evaluate(() => window.gowDev.state().player);
    expect(settled.scale).toBe(scale);
    expect(Math.abs(settled.y - exit.origin.y)).toBeLessThan(0.05 * scale);
    expect(signedDistance(exit, settled)).toBeGreaterThan(0);
  });
}

// Paire translative au départ : entrée 2 m devant le joueur, sortie 4 m à sa gauche ; caméra à la 1re personne.
async function firstPersonBeforePair(page) {
  const pair = await page.evaluate(() => {
    const dev = window.gowDev;
    const system = dev.portalSystem;
    const { x, y, z, yaw } = dev.state().player;
    const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const a = system.createPortal({
      name: "test-entrée", origin: { x: x + 2 * forward.x, y, z: z + 2 * forward.z }, yaw: yaw + Math.PI,
      width: 2.4, height: 3, sides: "both",
    });
    const b = system.createPortal({
      name: "test-sortie", origin: { x: x - 4 * right.x - forward.x, y, z: z - 4 * right.z - forward.z }, yaw,
      width: 2.4, height: 3, sides: "both",
    });
    system.link(a, b);
    return { entry: dev.portal("test-entrée"), exit: dev.portal("test-sortie") };
  });
  await page.keyboard.press("Control+KeyD");
  await page.keyboard.press("Tab");
  await page.getByRole("complementary", { name: "Menu debug" }).getByRole("button", { name: "1re personne" }).click();
  await page.waitForFunction(() => {
    const { camera, player } = window.gowDev.state();
    return camera.firstPerson && Math.abs(camera.y - player.y - 1.72) < 0.02;
  });
  return pair;
}

test("à la 1re personne, l’œil traverse une paire de portails sans entrer dans la garde du plan proche", async ({ page }) => {
  const { entry, exit } = await firstPersonBeforePair(page);

  // Relevé de la caméra à chaque image, jusqu’à 20 images après la traversée.
  const frames = await page.evaluate(() => new Promise((resolve) => {
    const dev = window.gowDev;
    const frames = [];
    let after = -1;
    dev.setControls({ forward: 1 });
    (function sample() {
      const { camera, traversals } = dev.state();
      frames.push({ x: camera.x, y: camera.y, z: camera.z, firstPerson: camera.firstPerson });
      if (after < 0 && traversals.length) after = 0;
      if (after >= 0 && ++after > 20) {
        dev.setControls(null);
        resolve(frames);
      } else {
        requestAnimationFrame(sample);
      }
    })();
  }));
  expect(frames.every(({ firstPerson }) => firstPerson)).toBe(true);
  // Garde ε = 2 × MIN_NEAR : en face d’une ouverture, l’œil ne s’approche jamais assez de son plan pour
  // que le plan proche la coupe, et ne passe jamais derrière.
  const facing = (portal, { x, z }) =>
    Math.abs((x - portal.origin.x) * Math.cos(portal.yaw) - (z - portal.origin.z) * Math.sin(portal.yaw)) < portal.width / 2;
  let checked = 0;
  for (const frame of frames) {
    for (const portal of [entry, exit]) {
      if (!facing(portal, frame) || Math.abs(signedDistance(portal, frame)) > 1) continue;
      expect(signedDistance(portal, frame)).toBeGreaterThan(0.0099);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(10);
  const last = frames.at(-1);
  const { player } = await page.evaluate(() => window.gowDev.state());
  expect(facing(exit, last)).toBe(true);
  expect(signedDistance(exit, last)).toBeGreaterThan(0);
  expect(Math.hypot(last.x - player.x, last.z - player.z)).toBeLessThan(0.2);

  // Arrêté à 4 mm de l’entrée, sans l’avoir franchie : la garde repousse l’œil devant le plan.
  const eye = await page.evaluate(async (entry) => {
    const dev = window.gowDev;
    const gap = 0.004;
    dev.teleportPlayer({
      x: entry.origin.x + gap * Math.sin(entry.yaw), y: entry.origin.y, z: entry.origin.z + gap * Math.cos(entry.yaw),
      yaw: entry.yaw + Math.PI,
    });
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    return dev.state().camera;
  }, entry);
  expect(eye.warped).toBe(false);
  expect(signedDistance(entry, eye)).toBeGreaterThan(0.0099);
});

test("à la 1re personne, une traversée au ralenti garde l’œil à hauteur constante", async ({ page }) => {
  await firstPersonBeforePair(page);
  // 2 ms par image : chaque pas physique est interpolé sur ~8 images, et l’œil comme le centre
  // passent plusieurs images à moins de ε du plan, des deux côtés.
  const heights = await page.evaluate(() => {
    const dev = window.gowDev;
    const clock = dev.manualClock();
    try {
      dev.setControls({ forward: 1 });
      const heights = [];
      let after = -1;
      for (let i = 0; i < 4000 && after < 60; i++) {
        clock.step(2);
        const { camera, player, traversals } = dev.state();
        heights.push(camera.y - player.y);
        if (after >= 0 || traversals.length) after++;
      }
      dev.setControls(null);
      return after < 0 ? [] : heights;
    } finally {
      clock.release();
    }
  });
  expect(heights.length).toBeGreaterThan(60);
  for (const height of heights) expect(height).toBeCloseTo(1.72, 3);
});
