import { expect, test } from "@playwright/test";

const dt = 1000 / 144;
const east = Math.PI / 2;

test.describe.configure({ timeout: 180_000 });

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

async function withClock(page, run) {
  const clock = await page.evaluateHandle(() => window.gowDev.manualClock());
  try {
    return await run(clock);
  } finally {
    await clock.evaluate((clock) => {
      clock.release();
      window.gowDev.setControls(null);
      window.gowDev.setPlayerVisible(true);
    });
    await clock.dispose();
  }
}

function pose(x, z, yaw) {
  return { x, y: 0, z, yaw };
}

async function settle(clock, pose) {
  return clock.evaluate((clock, { pose, dt }) => {
    const dev = window.gowDev;
    dev.setControls(null);
    dev.teleportPlayer(pose);
    for (let i = 0; i < 12; i++) clock.step(dt);
    dev.setPlayerVisible(false);
    return dev.state().player.scale;
  }, { pose, dt });
}

function logReport(label, report) {
  console.log(label, JSON.stringify(report, (_, value) => value === Infinity ? "∞" : value));
}

async function measureOutline(clock, portals, phases, followCamera = false) {
  return clock.evaluate((clock, { portals, phases, followCamera, dt }) => {
    const dev = window.gowDev;
    const probe = dev.flickerProbe({ portals });
    let seenWarp = false;
    let arrivalFrames = 0;
    for (const { frames, forward = 0, strafe = 0, look = 0 } of phases) {
      dev.setControls({ forward, strafe });
      for (let i = 0; i < frames; i++) {
        if (look) dev.look(look, 0);
        clock.step(dt);
        probe.capture();
        if (followCamera) {
          const { camera } = dev.state();
          if (camera.warped) seenWarp = true;
          if (seenWarp && !camera.warped && ++arrivalFrames === 3) break;
        }
      }
    }
    return { report: probe.report(), seenWarp, arrivalFrames, state: dev.state() };
  }, { portals, phases, followCamera, dt });
}

function checkOutline(report, { spikes, maxPerFrame, subpixel = false }) {
  logReport("Contour", report);
  expect(report.perFrame).toHaveLength(report.frames - 2);
  const attributed = Object.values(report.byPortal).flatMap((counts) => Object.values(counts));
  expect(attributed.reduce((sum, count) => sum + count, 0)).toBe(report.spikes);
  expect(report.spikes).toBeLessThanOrEqual(Math.ceil(1.5 * spikes));
  expect(report.maxPerFrame).toBeLessThanOrEqual(Math.max(8, Math.ceil(1.5 * maxPerFrame)));
  if (!subpixel) expect(report.spikes).toBeLessThanOrEqual(Math.floor(report.frames / 2));
}

const advance = [{ frames: 100, forward: 1 }];
const routes = [
  ["le contour de l’arche B reste stable à l’approche sur le sable", pose(-28.8, -25.5, Math.PI), "B", advance, { spikes: 19, maxPerFrame: 2 }],
  ["le contour de l’arche A reste stable à l’approche", pose(0.4, 26.5, 0), "A", advance, { spikes: 29, maxPerFrame: 2 }],
  ["le contour de A2 reste stable à l’approche", pose(26.5, 2.6, east), "A2", advance, { spikes: 35, maxPerFrame: 4 }],
  ["le contour de A2 reste stable en reculant", pose(28.6, 2.3, east), "A2", [{ frames: 100, forward: -1 }], { spikes: 23, maxPerFrame: 4 }],
  // Captures 43–45 (§ 14) : le montant lointain alterne entre deux niveaux de récursion.
  ["la porte est du pavillon reste stable pendant les pas chassés", pose(-32.2, 4.6, east), "E",
    [{ frames: 35, strafe: 1 }, { frames: 65, strafe: -1 }], { spikes: 101, maxPerFrame: 39, subpixel: true }],
  ["le contour de la cabine P reste stable à l’approche", pose(31, -24, Math.PI), "P", advance, { spikes: 0, maxPerFrame: 0 }],
  // Captures 61–63 (§ 14) : la fente entre la colonne et le montant laisse entrevoir la mosaïque.
  ["le contour de P reste stable quand la caméra tourne", pose(30.3, -25.8, Math.PI), "P", [{ frames: 100, look: 3 }],
    { spikes: 56, maxPerFrame: 8, subpixel: true }],
  ["le grand tunnel reste stable à l’approche de P1", pose(-42.6, 32.4, east), "P1", advance, { spikes: 0, maxPerFrame: 0 }],
];

for (const [title, start, portal, phases, calibration] of routes) {
  test(title, async ({ page }) => {
    const { report } = await withClock(page, async (clock) => {
      await settle(clock, start);
      return measureOutline(clock, [portal], phases);
    });
    checkOutline(report, calibration);
    // Le crénelage du montant de E toléré ci-dessus n’affecte pas le sol (534 pixels avant correctifs).
    if (portal === "E") expect(report.byPortal.E.bottom).toBe(0);
  });
}

test("les contours du petit tunnel restent stables au retour par P2", async ({ page }) => {
  const { report, state } = await withClock(page, async (clock) => {
    await settle(clock, pose(-35.85, 31.88, east));
    const entry = await clock.evaluate((clock, dt) => {
      const dev = window.gowDev;
      dev.setControls({ forward: 1 });
      for (let i = 0; i < 100 && dev.state().player.scale === 1; i++) clock.step(dt);
      return dev.state();
    }, dt);
    expect(entry.traversals.map((event) => event.portal)).toEqual(["P1"]);
    expect(entry.player.scale).toBe(0.5);
    expect(await settle(clock, pose(-29.12, 31.66, -east))).toBe(0.5);
    return measureOutline(clock, ["P2", "P1"], advance);
  });
  expect(state.player.scale).toBe(1);
  expect(state.traversals.map((event) => event.portal)).toEqual(["P1", "P2"]);
  checkOutline(report, { spikes: 41, maxPerFrame: 4 });
});

test("le contour de A2 reste stable jusqu’au passage de la caméra dans le couloir", async ({ page }) => {
  const result = await withClock(page, async (clock) => {
    await settle(clock, pose(30.15, 2.3, east));
    return measureOutline(clock, ["A2", "B2"], [{ frames: 280, forward: 1 }], true);
  });
  expect(result.state.traversals.map((event) => event.portal)).toEqual(["A2"]);
  expect(result.seenWarp).toBe(true);
  expect(result.arrivalFrames).toBe(3);
  expect(result.state.camera.y).toBeLessThan(-15);
  checkOutline(result.report, { spikes: 58, maxPerFrame: 3 });
});

test("le voile du pavillon varie de moins de 0,05 entre deux images", async ({ page }) => {
  const routes = [
    { name: "avance", pose: pose(-35.2, 6.6, east), frames: 200, forward: 1 },
    { name: "rotation", pose: pose(-33.8, 7.2, east), frames: 300, look: 6 },
    { name: "diagonale", pose: pose(-34.8, 4.6, Math.PI / 3), frames: 200, forward: 1 },
  ];
  const reports = await withClock(page, async (clock) => {
    await page.evaluate(() => window.gowDev.setMaxDepth(4));
    const reports = [];
    for (const route of routes) {
      await settle(clock, route.pose);
      const report = await clock.evaluate((clock, { route, dt }) => {
        const dev = window.gowDev;
        const distances = [4, 8, 12, 16, 20, 24, 28, 32, 40];
        function hazeAt({ start, end }, d) {
          return Number.isFinite(end) ? Math.max(0, Math.min(1, (d - start) / (end - start))) : 0;
        }
        let previous = dev.state();
        let worst = null;
        let worstAtCrossing = null;
        dev.setControls({ forward: route.forward ?? 0 });
        for (let frame = 1; frame <= route.frames; frame++) {
          if (route.look) dev.look(route.look, 0);
          clock.step(dt);
          const state = dev.state();
          const cameraJump = Math.hypot(state.camera.x - previous.camera.x, state.camera.y - previous.camera.y,
            state.camera.z - previous.camera.z) > 2;
          for (const current of state.portals.haze) {
            const before = previous.portals.haze.find((range) => range.portal === current.portal);
            if (!before) continue;
            for (const d of distances) {
              const delta = Math.abs(hazeAt(current, d) - hazeAt(before, d));
              if (!worst || delta > worst.delta) worst = { delta, frame, d, before, after: current, cameraJump };
              if (cameraJump && (!worstAtCrossing || delta > worstAtCrossing.delta)) {
                worstAtCrossing = { delta, frame, d, before, after: current };
              }
            }
          }
          previous = state;
        }
        return { route: route.name, worst, worstAtCrossing };
      }, { route, dt });
      reports.push(report);
    }
    return reports;
  });
  logReport("Voile", reports);
  for (const { route, worst, worstAtCrossing } of reports) {
    expect(worst, route).toBeTruthy();
    if (route === "rotation") expect(worstAtCrossing, "franchissement de E ou W pendant la rotation").toBeTruthy();
    expect.soft(worst.delta, route).toBeLessThan(0.05);
  }
});

test("les premières traversées du joueur et de la caisse réutilisent les effets chargés", async ({ page }) => {
  const { effects, traversals, ghost } = await withClock(page, (clock) => clock.evaluate(async (clock, dt) => {
    const dev = window.gowDev;
    async function render(frames) {
      for (let i = 0; i < frames; i++) {
        clock.step(dt);
        // Laisse aboutir la compilation parallèle de WebGL pendant la traversée.
        await new Promise(requestAnimationFrame);
      }
    }
    await render(8);
    const effects = { loaded: dev.state().effects };
    dev.teleportPlayer({ x: 0.38, y: 0, z: 29.45, yaw: 0 });
    await render(12);
    effects.beforePlayer = dev.state().effects;
    dev.setControls({ forward: 1 });
    await render(120);
    effects.afterPlayer = dev.state().effects;
    dev.setControls(null);
    dev.teleportPlayer({ x: 26.5, y: 0, z: 2.6, yaw: Math.PI / 2 });
    await render(12);
    effects.beforeCrate = dev.state().effects;
    const crate = dev.crate("caisse de l’arche");
    const { origin } = dev.portal("A2");
    crate.place({ x: origin.x - 0.4, y: origin.y + 0.5, z: origin.z + 0.25 });
    const ghost = crate.visual().ghost;
    crate.push({ x: 6, y: 0, z: 0 });
    await render(48);
    effects.afterCrate = dev.state().effects;
    return { effects, traversals: dev.state().traversals, ghost };
  }, dt));
  logReport("Effets compilés", effects);
  expect(traversals.map(({ traveler, portal }) => [traveler, portal])).toEqual([["joueur", "A"], ["caisse de l’arche", "A2"]]);
  expect(ghost).toBe(true);
  expect(effects.loaded).toBeGreaterThan(0);
  expect.soft(effects.afterPlayer, "passage du joueur par A").toBe(effects.loaded);
  expect(effects.afterCrate, "passage de la caisse par A2").toBe(effects.afterPlayer);
});
