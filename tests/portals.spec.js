import { expect, test } from "@playwright/test";
import { CAMERA } from "../src/config.js";
import { signedDistance } from "../src/portals/math.js";

async function place(page, pose) {
  await page.evaluate((pose) => window.gowDev.teleportPlayer(pose), pose);
  await page.waitForFunction(() => window.gowDev.state().player.grounded);
}

async function openingPixel(page) {
  return page.evaluate(() => {
    const { origin, yaw } = window.gowDev.portal("A");
    const p = window.gowDev.project({
      x: origin.x - 0.85 * Math.cos(yaw), y: origin.y + 0.25, z: origin.z + 0.85 * Math.sin(yaw),
    });
    return window.gowDev.samplePixel(p.x, p.y);
  });
}

function expectColor(actual, expected, tolerance) {
  expect(actual[3]).toBe(255);
  for (let i = 0; i < 3; i++) expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?dev");
  await page.getByRole("button", { name: "Jouer", exact: true }).click();
  await page.waitForFunction(() => window.gowDev?.state().player.grounded);
});

test.afterEach(async ({ page }) => {
  expect((await page.pageErrors()).map((error) => error.message)).toEqual([]);
  const messages = await page.consoleMessages();
  expect(messages.filter((m) => m.type() === "error" || (m.type() === "warning" && /BJS|Babylon/i.test(m.text())))
    .map((m) => m.text())).toEqual([]);
});

test("l’arche montre l’esplanade de sable", async ({ page }) => {
  await place(page, { x: 0, y: 0, z: 27, yaw: 0 });
  const view = await page.evaluate(() => window.gowDev.state().portals);
  expect(view.passes).toBeGreaterThanOrEqual(2);
  expect(view.depth).toBeGreaterThanOrEqual(1);
  const sand = await openingPixel(page);
  expectColor(sand, [216, 185, 138], 18);
  const grid = await page.evaluate(() => {
    const p = window.gowDev.project({ x: -3.75, y: 0, z: 33.25 });
    return window.gowDev.samplePixel(p.x, p.y);
  });
  expect(sand[0] - grid[0]).toBeGreaterThan(75);
  await page.evaluate(() => window.gowDev.setMaxDepth(0));
  expectColor(await openingPixel(page), [159, 184, 173], 1);
  expect(await page.evaluate(() => window.gowDev.state().portals))
    .toMatchObject({ depth: 0, passes: 1, fallbacks: 1 });

  await page.evaluate(() => window.gowDev.setMaxDepth(4));
  await place(page, { x: 0, y: 0, z: 35, yaw: Math.PI });
  expectColor(await openingPixel(page), [216, 185, 138], 18);
  await place(page, { x: 0, y: 0, z: 42, yaw: 0 });
  expect(await page.evaluate(() => window.gowDev.state().portals.passes)).toBe(1);
});

test("le benchmark mesure le rendu devant l’arche puis la boucle reprend", async ({ page }) => {
  await place(page, { x: 0, y: 0, z: 27, yaw: 0 });
  const { frames, cpuMs, frameMs, passes, drawCalls, renderWidth, renderHeight } =
    await page.evaluate(() => window.gowDev.benchmark({ frames: 20, warmup: 2 }));
  expect(frames).toBe(20);
  for (const value of [cpuMs.mean, cpuMs.p95, cpuMs.max, frameMs.mean, frameMs.p95, frameMs.max,
    passes.mean, passes.max, drawCalls.mean, drawCalls.max, renderWidth, renderHeight]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  }
  for (const key of ["mean", "p95", "max"]) expect(frameMs[key]).toBeGreaterThanOrEqual(cpuMs[key]);
  expect(passes.max).toBeGreaterThanOrEqual(2);

  await page.evaluate(() => window.gowDev.teleportPlayer({ x: 0, y: 0, z: 42, yaw: 0 }));
  await expect.poll(() => page.evaluate(() => window.gowDev.state().portals.passes)).toBe(1);
});

test("le repli et la profondeur maximale sont réglables", async ({ page }) => {
  // En regardant le long de la droite B-A, on retrouve A à chaque translation.
  const yaw = Math.atan2(30, 63);
  await place(page, { x: -4 * Math.sin(yaw), y: 0, z: 31 - 4 * Math.cos(yaw), yaw });
  for (const depth of [1, 5]) {
    await page.evaluate((n) => window.gowDev.setMaxDepth(n), depth);
    await expect.poll(() => page.evaluate(() => window.gowDev.state().portals))
      .toMatchObject({ maxDepth: depth, depth, passes: depth + 1, fallbacks: 1 });
  }
});

test("F3 affiche les statistiques des portails", async ({ page }) => {
  // Depuis ce recul, le pavillon est hors du champ de l’arche.
  await place(page, { x: 0, y: 0, z: 22, yaw: 0 });
  const hud = page.locator("#player-state");
  await page.keyboard.press("F3");
  await expect(hud).toBeVisible();
  await expect(hud).toContainText(/Portails : profondeur 1\/4 · 2 passes · \d+ i\/s/);
  await expect(hud).toHaveAttribute("data-portal-depth", "1");
  await expect(hud).toHaveAttribute("data-portal-passes", "2");
  await expect(hud).toHaveAttribute("data-fps", /^\d+$/);
  await expect(hud).toHaveAttribute("data-scale", "1");
});

function relativeToPortal(point, portal) {
  const { origin, yaw } = portal;
  const x = point.x - origin.x;
  const z = point.z - origin.z;
  return {
    distance: signedDistance(portal, point),
    lateral: x * Math.cos(yaw) - z * Math.sin(yaw),
  };
}

async function walkFrames(page, phases) {
  return page.evaluate(async (phases) => {
    const dev = window.gowDev;
    const nextFrame = () => new Promise(requestAnimationFrame);
    await nextFrame();
    // La première image sature l’accumulateur au repos. Chaque échantillon suivant avance de trois pas fixes.
    let now = Math.ceil(performance.now()) + 1000;
    performance.now = () => now;
    await nextFrame();
    const samples = [dev.state()];
    try {
      for (const [forward, count] of phases) {
        dev.setControls({ forward });
        for (let i = 0; i < count; i++) {
          now += 50;
          await nextFrame();
          samples.push(dev.state());
        }
      }
    } finally {
      dev.setControls(null);
      delete performance.now;
    }
    return samples;
  }, phases);
}

test("le joueur traverse l'arche et arrive sur l'esplanade", async ({ page }) => {
  await place(page, { x: 0.4, y: 0, z: 28.5, yaw: 0 });
  await page.evaluate(() => window.gowDev.setControls({ forward: 1 }));
  const arrival = await page.waitForFunction(() => {
    const dev = window.gowDev;
    const state = dev.state();
    if (!state.traversals.length) return false;
    dev.setControls(null);
    return { ...state, exit: dev.portal("B") };
  });
  const { player, traversals, exit } = await arrival.jsonValue();
  const { distance, lateral } = relativeToPortal(player, exit);
  expect(distance).toBeGreaterThan(0);
  expect(Math.abs(lateral - 0.4)).toBeLessThan(0.15);
  expect(Math.abs(player.y - exit.origin.y)).toBeLessThan(0.05);
  expect(Math.abs(player.yaw)).toBeLessThan(0.1);
  expect(player).toMatchObject({ scale: 1, grounded: true, capsuleHeight: 1.92 });
  expect(traversals).toEqual([{ traveler: "joueur", portal: "A", frame: expect.any(Number) }]);
});

test("la caméra passe un portail sans le joueur", async ({ page }) => {
  const { a, b } = await page.evaluate(() => ({ a: window.gowDev.portal("A"), b: window.gowDev.portal("B") }));
  await place(page, { x: b.origin.x, y: b.origin.y, z: b.origin.z + 1, yaw: b.yaw });
  const frames = await walkFrames(page, [[1, 32]]);
  const first = frames[0];
  const last = frames.at(-1);
  expect(first.camera.warped).toBe(true);
  expect(relativeToPortal(first.camera, a).distance).toBeGreaterThan(3);
  expect(Math.abs(relativeToPortal(first.camera, a).lateral)).toBeLessThan(0.01);
  expect(relativeToPortal(first.player, b).distance).toBeCloseTo(1);
  expect(last.player.z - first.player.z).toBeGreaterThan(5);
  expect(last.camera.warped).toBe(false);
  expect(last.traversals).toEqual([]);

  // A et B sont liées par translation. Le mouvement de l’œil se mesure dans un même repère.
  function inEsplanade(camera) {
    return camera.warped ? { x: camera.x + b.origin.x - a.origin.x, y: camera.y + b.origin.y - a.origin.y,
      z: camera.z + b.origin.z - a.origin.z } : camera;
  }
  const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  let transitions = 0;
  for (let i = 1; i < frames.length; i++) {
    const before = frames[i - 1];
    const after = frames[i];
    const gap = relativeToPortal(after.camera, after.camera.warped ? a : b).distance;
    expect(gap).toBeGreaterThanOrEqual(0.01 - 1e-6);
    expect(after.camera.minZ).toBeCloseTo(Math.min(0.5 * gap, 0.04), 6);
    expect(distance(inEsplanade(before.camera), inEsplanade(after.camera)))
      .toBeLessThanOrEqual(distance(before.player, after.player) + 0.001);
    if (before.camera.warped !== after.camera.warped) transitions++;
  }
  expect(transitions).toBe(1);
});

test("la caméra reste devant A quand le joueur traverse puis revient en reculant", async ({ page }) => {
  const a = await page.evaluate(() => window.gowDev.portal("A"));
  await place(page, { x: a.origin.x, y: a.origin.y, z: a.origin.z - 1, yaw: 0 });
  const frames = await walkFrames(page, [[1, 15], [-1, 25]]);
  expect(frames.at(-1).traversals.map(({ portal }) => portal)).toEqual(["A", "B"]);
  for (let i = 1; i < frames.length; i++) {
    const { camera, traversals } = frames[i];
    expect(camera.warped).toBe(traversals.length === 1);
    expect(relativeToPortal(camera, a).distance).toBeGreaterThan(2);
    const before = frames[i - 1].camera;
    expect(Math.hypot(camera.x - before.x, camera.y - before.y, camera.z - before.z)).toBeLessThan(0.181);
  }
});

test("une caisse poussée traverse l'arche", async ({ page }) => {
  const name = "caisse de l’arche";
  await page.evaluate((name) => {
    const dev = window.gowDev;
    const { origin } = dev.portal("A");
    const crate = dev.crate(name);
    crate.place({ x: origin.x + 0.25, y: origin.y + 0.5, z: origin.z - 0.4, yaw: 0 });
    crate.push({ x: 0, y: 0, z: 6 });
  }, name);
  const arrival = await page.waitForFunction((name) => {
    const dev = window.gowDev;
    const traversals = dev.state().traversals;
    if (!traversals.length) return false;
    return { crate: dev.crate(name).state(), exit: dev.portal("B"), traversals };
  }, name);
  const { crate, exit, traversals } = await arrival.jsonValue();
  const { distance, lateral } = relativeToPortal(crate, exit);
  expect(distance).toBeGreaterThan(0);
  expect(Math.abs(lateral - 0.25)).toBeLessThan(0.1);
  expect(crate.scale).toBe(1);
  expect(Math.abs(crate.yaw)).toBeLessThan(0.1);
  expect(crate.velocity.z).toBeGreaterThan(1);
  expect(Math.abs(crate.velocity.x)).toBeLessThan(0.1);
  expect(traversals).toEqual([{ traveler: name, portal: "A", frame: expect.any(Number) }]);
});

test("l'objet à cheval a un fantôme", async ({ page }) => {
  await place(page, { x: 0, y: 0, z: 30.95, yaw: 0 });
  expect(await page.evaluate(() => window.gowDev.state().ghosts)).toBe(1);
  await place(page, { x: 0, y: 0, z: 34, yaw: Math.PI });
  expect(await page.evaluate(() => window.gowDev.state())).toMatchObject({ ghosts: 0, traversals: [] });
});

test("le joueur pousse la caisse à travers l'arche puis la rejoint", async ({ page }) => {
  await place(page, { x: 0, y: 0, z: 28.25, yaw: 0 });
  const name = "caisse de l’arche";
  await page.evaluate((name) => {
    window.gowDev.crate(name).place({ x: 0, y: 0.5, z: 29.55 });
    window.gowDev.setControls({ forward: 1 });
  }, name);
  const arrival = await page.waitForFunction((name) => {
    const dev = window.gowDev;
    const { traversals } = dev.state();
    if (!traversals.some((event) => event.traveler === "joueur")) return false;
    dev.setControls(null);
    return { traversals, crate: dev.crate(name).state(), exit: dev.portal("B") };
  }, name);
  const { traversals, crate, exit } = await arrival.jsonValue();
  expect(traversals.map(({ traveler, portal }) => [traveler, portal])).toEqual([[name, "A"], ["joueur", "A"]]);
  expect(relativeToPortal(crate, exit).distance).toBeGreaterThan(0);
});

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

async function linkedDoors(page, from, to, scale) {
  const [entry, exit] = await page.evaluate(([from, to]) => [window.gowDev.portal(from), window.gowDev.portal(to)], [from, to]);
  expect(entry).toMatchObject({ target: to, scale, sides: "front" });
  expect(exit).toMatchObject({ target: from, scale: 1 / scale, sides: "front" });
  expect(angleDifference(exit.yaw + Math.PI, entry.yaw)).toBeCloseTo(0, 6);
  expect(exit.width / entry.width).toBeCloseTo(scale, 6);
  expect(exit.height / entry.height).toBeCloseTo(scale, 6);
  return { entry, exit };
}

function inFrontOf({ origin, yaw }, distance, lateral) {
  return {
    x: origin.x + distance * Math.sin(yaw) + lateral * Math.cos(yaw),
    y: origin.y,
    z: origin.z + distance * Math.cos(yaw) - lateral * Math.sin(yaw),
    yaw: angleDifference(yaw, Math.PI),
  };
}

async function walkThrough(page, from, to, initialScale = 1, finalScale = 1) {
  const { entry, exit } = await linkedDoors(page, from, to, finalScale / initialScale);
  const offset = 0.38 * initialScale;
  const pose = inFrontOf(entry, 0.85 * initialScale, offset);
  await place(page, pose);
  const frames = await walkFrames(page, [[1, 10], [0, 5]]);
  const first = frames[0];
  expect(first.player.scale).toBe(initialScale);
  const count = first.traversals.length;
  const last = frames.at(-1);
  expect(last.traversals.slice(count)).toEqual([{ traveler: "joueur", portal: from, frame: expect.any(Number) }]);
  const i = frames.findIndex((state) => state.traversals.length > count);
  for (const { player } of [frames[i], last]) {
    const { distance, lateral } = relativeToPortal(player, exit);
    expect(distance).toBeGreaterThan(0);
    // Les normales opposées inversent le signe de l’abscisse locale à la sortie.
    expect(Math.abs(lateral + offset * entry.scale)).toBeLessThan(0.04 * finalScale);
    expect(Math.abs(player.y - exit.origin.y)).toBeLessThan(0.05 * finalScale);
    expect(angleDifference(player.yaw, pose.yaw)).toBeCloseTo(0, 2);
    expect(player).toMatchObject({ scale: finalScale, grounded: true });
  }
  return { first, before: frames[i - 1].player, arrival: frames[i].player, last };
}

test("le couloir de 24 m relie les deux bouts de l’enveloppe de 7 m", async ({ page }) => {
  const inside = await walkThrough(page, "A2", "B2");
  expect(inside.last.player.y).toBeCloseTo(-20, 1);
  const outside = await walkThrough(page, "D", "C");
  expect(outside.last.player.y).toBeCloseTo(0, 1);
});

test("la porte est du pavillon ramène à l’ouest de la même pièce", async ({ page }) => {
  const { before, arrival } = await walkThrough(page, "E", "W");
  expect(Math.abs(arrival.x - before.x + 6)).toBeLessThan(0.19);
  expect(arrival.z).toBeCloseTo(before.z, 3);
  expect(arrival.y).toBeCloseTo(0, 1);
});

test("la cabine donne sur la grande salle souterraine", async ({ page }) => {
  const { last } = await walkThrough(page, "P", "Q");
  expect(last.player.y).toBeCloseTo(-20, 1);
  for (const y of [-10, -32]) {
    await place(page, { x: 30, y, z: -40 });
    const { player } = await page.evaluate(() => window.gowDev.state());
    expect(player.x).toBeCloseTo(0, 2);
    expect(player.z).toBeCloseTo(-10, 2);
    expect(player.y).toBeCloseTo(0, 1);
  }
});

function shoulderDistance({ camera, player }) {
  expect(camera.warped).toBe(false);
  return Math.hypot(camera.x - player.x, camera.y - player.y - CAMERA.shoulderHeight * player.scale, camera.z - player.z);
}

async function pushThrough(page, name, from, to, initialScale, finalScale) {
  const { entry, exit } = await linkedDoors(page, from, to, finalScale / initialScale);
  const initial = await page.evaluate((name) => window.gowDev.crate(name).state(), name);
  expectCrateScale(initial, initialScale);
  // Les deux caisses empruntent des côtés opposés du passage sans se heurter.
  const offset = 0.6 * initialScale;
  const pose = inFrontOf(entry, 0.45 * initialScale, offset);
  pose.y += initial.boxSize.y / 2;
  const count = await page.evaluate(({ name, pose, initialScale }) => {
    const dev = window.gowDev;
    const crate = dev.crate(name);
    crate.place(pose);
    const speed = 6 * initialScale;
    crate.push({ x: speed * Math.sin(pose.yaw), y: 0, z: speed * Math.cos(pose.yaw) });
    return dev.state().traversals.length;
  }, { name, pose, initialScale });
  const arrived = await page.waitForFunction(({ name, from, count }) => {
    const dev = window.gowDev;
    if (dev.state().traversals.slice(count).some((event) => event.traveler === name && event.portal === from)) {
      return dev.crate(name).state();
    }
  }, { name, from, count });
  const crate = await arrived.jsonValue();
  const { distance, lateral } = relativeToPortal(crate, exit);
  expect(distance).toBeGreaterThan(0);
  expect(Math.abs(lateral + offset * entry.scale)).toBeLessThan(0.06 * finalScale);
  expect(Math.abs(crate.y - crate.boxSize.y / 2 - exit.origin.y)).toBeLessThan(0.05 * finalScale);
  expect(Math.abs(angleDifference(crate.yaw, pose.yaw))).toBeLessThan(0.08);
  expectCrateScale(crate, finalScale);
}

function expectCrateScale(crate, scale) {
  expect(crate.scale).toBe(scale);
  for (const side of Object.values(crate.boxSize)) expect(side).toBeCloseTo(scale, 3);
  expect(crate.mass).toBeCloseTo(40 * scale ** 3, 3);
  expect(crate.gravityFactor).toBeCloseTo(scale, 3);
}

test("le passage au demi-format change le joueur, la caméra et les caisses", async ({ page }) => {
  const { first, arrival } = await walkThrough(page, "P1", "P2", 1, 0.5);
  expect(arrival.capsuleHeight).toBeCloseTo(0.96, 3);
  const normalDistance = shoulderDistance(first);
  expect(normalDistance).toBeCloseTo(CAMERA.distance, 1);
  // L’œil franchit le portail après le joueur. Dans le jardin, les deux sont de nouveau dans le même espace.
  const garden = (await walkFrames(page, [[1, 34], [0, 12]])).at(-1);
  expect(shoulderDistance(garden) / normalDistance).toBeCloseTo(0.5, 2);
  const back = await walkThrough(page, "P2", "P1", 0.5, 1);
  expect(back.arrival.capsuleHeight).toBeCloseTo(1.92, 3);
  await place(page, { x: -41.5, y: 0, z: 29 });
  await pushThrough(page, "caisse du tunnel", "P1", "P2", 1, 0.5);
  await pushThrough(page, "caisse du jardin", "P2", "P1", 0.5, 1);
});

test("la pièce cyclique se ferme sur le repli à profondeur deux", async ({ page }) => {
  const { entry, exit } = await linkedDoors(page, "E", "W", 1);
  const pose = inFrontOf(entry, 1, 0.65);
  await page.evaluate(() => window.gowDev.setMaxDepth(2));
  await place(page, pose);
  const { portals } = await page.evaluate(() => window.gowDev.state());
  expect(portals.depth).toBe(2);
  expect(portals.fallbacks).toBeGreaterThanOrEqual(1);
  const pixel = await page.evaluate((point) => {
    const { x, y } = window.gowDev.project(point);
    return window.gowDev.samplePixel(x, y);
  }, { x: entry.origin.x + 2 * (entry.origin.x - exit.origin.x), y: 2.1, z: pose.z });
  expectColor(pixel, [159, 184, 173], 2);
});
