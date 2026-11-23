import { expect, test } from "@playwright/test";
import { signedDistance, toLocal } from "../src/portals/math.js";
import { expectCleanPage, openDebugMenu, startDevGame } from "./support/devGame.js";

// Tests de fumée des portails, indépendants de la carte : ni nom ni coordonnée des démos.
// Ils supposent seulement quelques mètres de sol plat et dégagé autour du point de départ.

test.beforeEach(({ page }) => startDevGame(page));
test.afterEach(({ page }) => expectCleanPage(page));

// Paire translative créée au départ : l’entrée fait face au joueur 2 m devant lui. La sortie, à 4 m sur sa
// gauche, regarde dans la même direction que lui (yaw_B = yaw_A − π), à l’échelle `scale`.
// Renvoie les deux portails et l’état du joueur avant leur création.
function createPairAhead(page, scale = 1) {
  return page.evaluate((scale) => {
    const dev = window.gowDev;
    const system = dev.portalSystem;
    const player = dev.state().player;
    const { x, y, z, yaw } = player;
    const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const a = system.createPortal({
      name: "test-entrée", origin: { x: x + 2 * forward.x, y, z: z + 2 * forward.z }, yaw: yaw + Math.PI,
      width: 2.4, height: 3, sides: "both",
    });
    const b = system.createPortal({
      name: "test-sortie", origin: { x: x - 4 * right.x - forward.x, y, z: z - 4 * right.z - forward.z }, yaw,
      width: 2.4 * scale, height: 3 * scale, sides: "both",
    });
    system.link(a, b);
    return { entry: dev.portal("test-entrée"), exit: dev.portal("test-sortie"), player };
  }, scale);
}

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
    const { entry, exit, player: start } = await createPairAhead(page, scale);
    // Décalé de `offset` sur sa droite, le joueur garde ce décalage latéral à la sortie.
    await page.evaluate(({ x, y, z, yaw, offset }) => {
      window.gowDev.teleportPlayer({ x: x + offset * Math.cos(yaw), y, z: z - offset * Math.sin(yaw), yaw });
    }, { ...start, offset });
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
    expect(Math.abs(toLocal(exit, player).x - offset * scale)).toBeLessThan(0.1 * scale);
    expect(Math.cos(player.yaw - exit.yaw)).toBeGreaterThan(0.998);
    expect(player.scale).toBe(scale);
    expect(player.capsuleHeight).toBeCloseTo(start.capsuleHeight * scale, 3);

    // Sur une machine lente, l’image du franchissement peut précéder le contact avec le sol :
    // on attend que le joueur reprenne appui, sans être tombé ni réapparu au départ.
    await page.waitForFunction(() => window.gowDev.state().player.grounded);
    const settled = await page.evaluate(() => window.gowDev.state().player);
    expect(settled.scale).toBe(scale);
    expect(Math.abs(settled.y - exit.origin.y)).toBeLessThan(0.05 * scale);
    expect(signedDistance(exit, settled)).toBeGreaterThan(0);
  });
}

// Paire translative au départ (createPairAhead), caméra à la 1re personne.
async function firstPersonBeforePair(page) {
  const { entry, exit } = await createPairAhead(page);
  const menu = await openDebugMenu(page);
  await menu.getByRole("button", { name: "1re personne" }).click();
  await page.waitForFunction(() => {
    const { camera, player, firstPersonFit } = window.gowDev.state();
    return camera.firstPerson && Math.abs(camera.y - player.y - firstPersonFit.eyeHeight) < 0.02;
  });
  return { entry, exit, fit: await page.evaluate(() => window.gowDev.state().firstPersonFit) };
}

test("à la 1re personne, l’œil traverse une paire de portails sans entrer dans la garde du plan proche", async ({ page }) => {
  const { entry, exit, fit } = await firstPersonBeforePair(page);

  // Relevé de la caméra à chaque image, jusqu’à 20 images après la traversée. L’horloge manuelle
  // impose des images de 1/60 s : un rendu lent (SwiftShader) n’espace pas les relevés.
  const frames = await page.evaluate(() => {
    const dev = window.gowDev;
    const clock = dev.manualClock();
    try {
      const frames = [];
      let after = -1;
      dev.setControls({ forward: 1 });
      for (let i = 0; i < 600; i++) {
        const { camera, traversals } = dev.state();
        frames.push({ x: camera.x, y: camera.y, z: camera.z, firstPerson: camera.firstPerson });
        if (after < 0 && traversals.length) after = 0;
        if (after >= 0 && ++after > 20) break;
        clock.step(1000 / 60);
      }
      dev.setControls(null);
      return frames;
    } finally {
      clock.release();
    }
  });
  expect(frames.every(({ firstPerson }) => firstPerson)).toBe(true);
  // Garde ε = 2 × MIN_NEAR : en face d’une ouverture, l’œil ne s’approche jamais assez de son plan pour
  // que le plan proche la coupe, et ne passe jamais derrière.
  const facing = (portal, frame) => Math.abs(toLocal(portal, frame).x) < portal.width / 2;
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
  expect(Math.hypot(last.x - player.x, last.z - player.z)).toBeLessThan(fit.eyeForward + 0.2);

  // Arrêté avec l’œil à 4 mm de l’entrée, sans l’avoir franchie : la garde le repousse devant le plan.
  const eye = await page.evaluate(async ({ entry, fit }) => {
    const dev = window.gowDev;
    const back = 0.004 + fit.eyeForward;
    dev.teleportPlayer({
      x: entry.origin.x + back * Math.sin(entry.yaw), y: entry.origin.y, z: entry.origin.z + back * Math.cos(entry.yaw),
      yaw: entry.yaw + Math.PI,
    });
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    return dev.state().camera;
  }, { entry, fit });
  expect(eye.warped).toBe(false);
  expect(signedDistance(entry, eye)).toBeGreaterThan(0.0099);
});

test("à la 1re personne, une traversée au ralenti garde l’œil à hauteur constante", async ({ page }) => {
  const { fit } = await firstPersonBeforePair(page);
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
  for (const height of heights) expect(height).toBeCloseTo(fit.eyeHeight, 3);
});
