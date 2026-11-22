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

test("l’horloge manuelle avance la caisse d’un pas puis interpole son visuel", async ({ page }) => {
  const sample = await page.evaluate(() => {
    const dev = window.gowDev;
    const crate = dev.crate("caisse de l’arche");
    crate.place({ x: 0, y: 8, z: 0, yaw: 0.4 });
    crate.push({ x: 6, y: 0, z: 0 });
    const original = performance.now;
    const clock = dev.manualClock();
    try {
      const positions = [crate.state().x];
      for (let i = 0; i < 6; i++) {
        clock.step();
        positions.push(crate.state().x);
      }
      const previous = crate.visual().x;
      clock.step(1000 / 120);
      return { positions, previous, body: crate.state(), visual: crate.visual(), fps: dev.state().fps };
    } finally {
      clock.release();
      if (performance.now !== original) throw new Error("L’horloge réelle doit reprendre.");
    }
  });
  for (let i = 1; i < sample.positions.length; i++) {
    expect(sample.positions[i] - sample.positions[i - 1]).toBeCloseTo(6 / 60, 3);
  }
  expect(sample.previous).toBeCloseTo(sample.positions.at(-2), 5);
  expect(sample.body.x).toBe(sample.positions.at(-1));
  expect(sample.visual.x).toBeCloseTo((sample.previous + sample.body.x) / 2, 5);
  expect(sample.visual.yaw).toBeCloseTo(0.4, 5);
  expect(sample.visual.ghost).toBe(false);
  expect(sample.fps).toBeCloseTo(7 / (6 / 60 + 1 / 120), 5);
  await expect.poll(() => page.evaluate(() => window.gowDev.crate("caisse de l’arche").state().x))
    .toBeGreaterThan(sample.body.x);
});

test("une téléportation directe reprend la distance cible du voile dès le prochain rendu", async ({ page }) => {
  const ends = await page.evaluate(() => {
    const dev = window.gowDev;
    const clock = dev.manualClock();
    const pose = { x: -35.2, y: 0, z: 6.6, yaw: Math.PI / 2 };
    function renderEnd() {
      clock.step(0);
      return dev.state().portals.haze.find(({ portal }) => portal === "E").end;
    }
    try {
      dev.setMaxDepth(4);
      dev.teleportPlayer(pose);
      const initial = renderEnd();
      dev.setMaxDepth(2);
      const retained = renderEnd();
      dev.teleportPlayer(pose);
      return { initial, retained, reset: renderEnd() };
    } finally {
      clock.release();
    }
  });
  expect(ends.retained).toBe(ends.initial);
  // Deux répétitions de 6 m séparent les replis. À dt nul, seul le reset explique le saut.
  expect(ends.initial - ends.reset).toBeCloseTo(12, 4);
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

test("le ciel couvre le canevas au départ avec le dégradé attendu et laisse le relief devant", async ({ page }) => {
  const sample = await page.evaluate(async () => {
    const dev = window.gowDev;
    const canvas = document.querySelector("#scene");
    const { width } = canvas.getBoundingClientRect();
    const topLeft = await dev.samplePixel(width * 0.08, 16);
    const topMid = await dev.samplePixel(width * 0.5, 16);
    const topSun = await dev.samplePixel(width * 0.7, 16);
    // Point sur le relief lointain proche (rayon 95 m) à droite de la zone d’entraînement.
    const ridgePos = dev.project({ x: 35, y: 1.5, z: 88 });
    const ridge = await dev.samplePixel(ridgePos.x, ridgePos.y);
    const scene = dev.portalSystem.camera.getScene();
    const engine = scene.getEngine();
    const alphaCheck = await new Promise((resolve) => {
      scene.onAfterRenderObservable.addOnce(async () => {
        const w = engine.getRenderWidth();
        const h = engine.getRenderHeight();
        const rgba = await engine.readPixels(0, 0, w, h);
        let transparent = 0;
        for (let i = 3; i < rgba.length; i += 4) {
          if (rgba[i] < 255) transparent++;
        }
        resolve({ transparent, total: w * h });
      });
    });
    return { topLeft, topMid, topSun, ridge, alphaCheck };
  });

  expect(sample.alphaCheck.transparent).toBe(0);
  expectColor(sample.topSun, [225, 223, 189], 20);
  expectColor(sample.topMid, [205, 212, 185], 25);
  expectColor(sample.topLeft, [160, 184, 171], 25);
  // La lueur solaire à droite est nettement plus chaude et claire que le bord gauche.
  expect(sample.topSun[0] - sample.topLeft[0]).toBeGreaterThan(30);
  // Le relief lointain (#72918a / #91aaa0) reste dessiné devant le ciel.
  expect(sample.ridge[3]).toBe(255);
  expect(sample.topSun[0] - sample.ridge[0]).toBeGreaterThan(50);
});

test("caméra passée derrière un portail : le ciel et le relief restent visibles malgré un repli lointain", async ({ page }) => {
  // Joueur sur le panneau de la zone 2, dos au tunnel : la caméra franchit A2 et se retrouve derrière B2.
  // Au bout de la chaîne des arches A ↔ B, loin dans le champ, la récursion se termine sur un repli.
  await place(page, { x: 26.5, y: 0, z: 2.3, yaw: -Math.PI / 2 });
  const view = await page.evaluate(async () => {
    const dev = window.gowDev;
    const { camera, portals } = dev.state();
    const { width } = document.querySelector("#scene").getBoundingClientRect();
    // Haut du ciel à gauche, au centre et à droite, puis l’horizon à droite (relief lointain).
    const points = [[40, 16], [width / 2, 16], [width - 40, 16], [width - 40, 150]];
    const samples = [];
    for (const [x, y] of points) samples.push(await dev.samplePixel(x, y));
    return { camera, portals, samples };
  });
  expect(view.camera.warped).toBe(true);
  expect(view.portals.fallbacks).toBeGreaterThan(0);
  // Avant le correctif, tout le sous-arbre était voilé : ciel et relief prenaient exactement fallbackColor
  // (#9fb8ad). Seuls les derniers niveaux de récursion sont voilés (hazeLevels) : la vue de premier niveau,
  // qui couvre tout l’écran, garde son dégradé (proche de l’horizon dans cette direction) et son relief.
  const diffs = view.samples.map((c) => Math.max(Math.abs(c[0] - 159), Math.abs(c[1] - 184), Math.abs(c[2] - 173)));
  for (const diff of diffs) expect(diff).toBeGreaterThan(2);
  expect(Math.max(...diffs)).toBeGreaterThan(10);
});

test("caméra passée derrière un portail : la piste ne recouvre pas le pied des plots de saut", async ({ page }) => {
  // Même vue : la caméra est derrière B2 et voit la zone d’entraînement à travers le portail.
  await place(page, { x: 26.5, y: 0, z: 2.3, yaw: -Math.PI / 2 });
  const view = await page.evaluate(async () => {
    const dev = window.gowDev;
    const a2 = dev.portal("A2");
    const b2 = dev.portal("B2");
    // Bas de la face est du plot de saut de 1,35 m (centre x = 7,2, z = 1,3), ramené dans l’espace de la caméra.
    const foot = { x: 8.28 + b2.origin.x - a2.origin.x, y: 0.2 + b2.origin.y - a2.origin.y, z: 1.3 };
    const p = dev.project(foot);
    return { warped: dev.state().camera.warped, pixel: await dev.samplePixel(p.x, p.y) };
  });
  expect(view.warped).toBe(true);
  // Le plot est ocre (#ba8664) ; la piste, bleu-vert. Avec un zOffset proportionnel à la pente, la projection
  // oblique avançait la piste de plusieurs mètres et elle recouvrait le pied du plot.
  expect(view.pixel[0]).toBeGreaterThan(view.pixel[1] + 15);
});

test("le ciel vu à travers une ouverture voilée prend la couleur de repli", async ({ page }) => {
  const yaw = Math.atan2(30, 63);
  const pose = { x: -4 * Math.sin(yaw), y: 0, z: 31 - 4 * Math.cos(yaw), yaw };
  const effectsBefore = await page.evaluate(() => window.gowDev.state().effects);

  await page.evaluate(() => window.gowDev.setMaxDepth(1));
  await place(page, pose);
  await expect.poll(() => page.evaluate(() => window.gowDev.state().portals))
    .toMatchObject({ maxDepth: 1, depth: 1, passes: 2, fallbacks: 1 });

  const veiled = await page.evaluate(async () => {
    const dev = window.gowDev;
    const a = dev.portal("A");
    const inside = dev.project({ x: a.origin.x, y: a.origin.y + 2.8, z: a.origin.z });
    return {
      portalSky: await dev.samplePixel(inside.x, inside.y),
      rootSky: await dev.samplePixel(inside.x, 16),
      haze: dev.state().portals.haze,
    };
  });
  // Dans la passe voilée de l’arche A, le ciel prend exactement fallbackColor (#9fb8ad).
  expectColor(veiled.portalSky, [159, 184, 173], 3);
  expect(veiled.rootSky[3]).toBe(255);
  // Le ciel de la passe racine reste sur le dégradé lumineux, loin de fallbackColor.
  const rootDiff = Math.max(
    Math.abs(veiled.rootSky[0] - 159),
    Math.abs(veiled.rootSky[1] - 184),
    Math.abs(veiled.rootSky[2] - 173),
  );
  expect(rootDiff).toBeGreaterThan(30);

  // Sans repli (vue droite devant l’arche A à profondeur 4), le ciel vu dans le portail garde son dégradé.
  await page.evaluate(() => window.gowDev.setMaxDepth(4));
  await place(page, { x: 0, y: 0, z: 27, yaw: 0 });
  const unveiled = await page.evaluate(async () => {
    const dev = window.gowDev;
    const a = dev.portal("A");
    const inside = dev.project({ x: a.origin.x, y: a.origin.y + 2.8, z: a.origin.z });
    return {
      portals: dev.state().portals,
      effects: dev.state().effects,
      portalSky: await dev.samplePixel(inside.x, inside.y),
      rootSky: await dev.samplePixel(inside.x, 16),
    };
  });
  expect(unveiled.portals.fallbacks).toBe(0);
  expect(unveiled.portalSky[3]).toBe(255);
  const unveiledDiff = Math.max(
    Math.abs(unveiled.portalSky[0] - 159),
    Math.abs(unveiled.portalSky[1] - 184),
    Math.abs(unveiled.portalSky[2] - 173),
  );
  expect(unveiledDiff).toBeGreaterThan(25);
  expect(unveiled.effects).toBe(effectsBefore);
});

test("link() avertit une fois sur un lien tourné au soleil et reste muet si translatif, autorisé ou sans soleil à ombres", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });

  // Les liens translatifs des démos ne doivent émettre aucun avertissement au chargement.
  const startupWarnings = (await page.consoleMessages())
    .filter((m) => m.type() === "warning" && m.text().startsWith("Portails :"));
  expect(startupWarnings).toEqual([]);

  const result = await page.evaluate(() => {
    const dev = window.gowDev;
    const portals = dev.portalSystem;
    const scene = portals.camera.getScene();
    const initialCount = portals.portals.length;
    const created = [];
    function make(name, x, yaw, scale = 1) {
      const portal = portals.createPortal({
        name, origin: { x, y: 0, z: -46 }, yaw, width: 1.6 * scale, height: 2.4 * scale, sides: "both",
      });
      created.push(portal);
      return portal;
    }

    const originalWarn = console.warn;
    const captured = [];
    console.warn = (...args) => {
      captured.push(args.join(" "));
      originalWarn.apply(console, args);
    };

    const clock = dev.manualClock();
    try {
      // 1) Liens translatifs (exact et dans la tolérance 1e-6, avec échelle) : aucun avertissement.
      const t1 = make("test-T1", 10, 0.3);
      const t2 = make("test-T2", 14, 0.3 - Math.PI);
      const t3 = make("test-T3", 18, 0.3 + Math.PI + 5e-7, 0.5);
      portals.link(t1, t2);
      const translativeLinked = t1.target === t2 && t2.target === t1;
      portals.link(t1, t3);
      const translativeScaled = t1.target === t3 && t1.warp.scale === 0.5;
      const afterTranslative = captured.length;

      // 2) Lien tourné : créé, mais un seul avertissement même relié deux fois, inversé ou délié puis relié.
      const r1 = make("test-R1", 22, 0);
      const r2 = make("test-R2", 26, Math.PI / 2);
      portals.link(r1, r2);
      const rotatedLinked = r1.target === r2 && r2.target === r1 && Math.abs(r1.warp.rotationY + Math.PI / 2) < 1e-9;
      const afterFirstRotated = captured.length;
      portals.link(r1, r2);
      portals.link(r2, r1);
      portals.unlink(r1);
      const unlinkedState = r1.target === null && r2.target === null && r1.warp === null && r2.warp === null;
      portals.link(r1, r2);
      const afterRepeatedRotated = captured.length;

      // 3) Lien tourné assumé avec allowRotation : aucun avertissement.
      const a1 = make("test-A1", 30, 0);
      const a2 = make("test-A2", 34, 0);
      portals.link(a1, a2, { allowRotation: true });
      const allowedLinked = a1.target === a2 && Math.abs(a1.warp.rotationY - Math.PI) < 1e-9;
      const afterAllowed = captured.length;

      // 4) Lien tourné sans lumière directionnelle à ombres (y compris avec une directionnelle sans générateur) : aucun avertissement.
      const s1 = make("test-S1", 38, 0);
      const s2 = make("test-S2", 42, Math.PI / 3);
      const sun = scene.getLightByName("soleil");
      const shadowless = sun.clone("soleil sans ombre");
      scene.removeLight(sun);
      let noSunLinked = false;
      try {
        portals.link(s1, s2);
        noSunLinked = s1.target === s2 && s2.target === s1 && shadowless.getShadowGenerators() === null;
      } finally {
        shadowless?.dispose();
        scene.addLight(sun);
      }
      const afterNoSun = captured.length;

      // Nettoyage explicite : unlink puis removePortal sur tous les portails de test.
      for (const portal of created) portals.unlink(portal);
      for (const portal of created) portals.removePortal(portal);
      return {
        initialCount,
        finalCount: portals.portals.length,
        translativeLinked,
        translativeScaled,
        rotatedLinked,
        unlinkedState,
        allowedLinked,
        noSunLinked,
        counts: { afterTranslative, afterFirstRotated, afterRepeatedRotated, afterAllowed, afterNoSun },
        captured,
      };
    } finally {
      console.warn = originalWarn;
      for (const portal of created) portals.removePortal(portal);
      clock.release();
    }
  });

  expect(result.translativeLinked).toBe(true);
  expect(result.translativeScaled).toBe(true);
  expect(result.rotatedLinked).toBe(true);
  expect(result.unlinkedState).toBe(true);
  expect(result.allowedLinked).toBe(true);
  expect(result.noSunLinked).toBe(true);
  expect(result.finalCount).toBe(result.initialCount);
  expect(result.counts).toEqual({
    afterTranslative: 0,
    afterFirstRotated: 1,
    afterRepeatedRotated: 1,
    afterAllowed: 1,
    afterNoSun: 1,
  });
  expect(result.captured).toHaveLength(1);
  expect(result.captured[0]).toContain("test-R1");
  expect(result.captured[0]).toContain("test-R2");
  expect(result.captured[0]).toContain("yaw_B = yaw_A − π");
  expect(result.captured[0]).toContain("allowRotation: true");
  expect(result.captured[0]).not.toMatch(/BJS|Babylon/i);
  expect(warnings).toEqual(result.captured);
});
