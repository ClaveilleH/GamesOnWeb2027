import { expect, test } from "@playwright/test";

const dt = 1000 / 144;
const archCrate = "caisse de l’arche";
// Direction du soleil (main.js) : ses rayons descendent vers −X et +Z.
const sun = { x: -0.58, y: -1, z: 0.48 };

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

function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("l’ombre d’une caisse devant l’arche A se prolonge devant B sur l’esplanade", async ({ page }) => {
  const samples = await withClock(page, (clock) => clock.evaluate(async (clock, { archCrate, sun }) => {
    const dev = window.gowDev;
    const a = dev.portal("A");
    const b = dev.portal("B");
    const crate = dev.crate(archCrate);
    const warp = (p) => ({
      x: b.origin.x + (p.x - a.origin.x),
      y: b.origin.y + (p.y - a.origin.y),
      z: b.origin.z + (p.z - a.origin.z),
    });
    const toGround = (p) => {
      const t = (p.y - b.origin.y) / -sun.y;
      return { x: p.x + t * sun.x, y: b.origin.y, z: p.z + t * sun.z };
    };
    async function sample(worldPoint) {
      clock.step(0);
      const screen = dev.project(worldPoint);
      const reading = dev.samplePixel(screen.x, screen.y);
      clock.step(0);
      return await reading;
    }

    // Caméra côté esplanade, regardant vers la face avant de B.
    dev.teleportPlayer({ x: b.origin.x, y: b.origin.y, z: b.origin.z + 2.5, yaw: Math.PI });
    dev.setPlayerVisible(false);
    clock.step(0);

    // 1) Caisse posée au sol devant A (sans chevaucher le plan : z + 0,5 = 30,95 < 31).
    const onGround = { x: a.origin.x + 0.35, y: 0.5, z: a.origin.z - 0.55, yaw: 0 };
    const upperTarget = toGround(warp({ x: onGround.x, y: onGround.y + 0.25, z: onGround.z + 0.4 }));
    const litNeighbor = { x: b.origin.x - 0.4, y: b.origin.y, z: b.origin.z + 0.9 };
    crate.place(onGround);
    const groundNear = await sample(upperTarget);
    const neighborNear = await sample(litNeighbor);

    // 2) Caisse devant A dont le rayon issu du centre transporté touche la face avant de B.
    const lifted = { x: a.origin.x + 0.35, y: 1.6, z: a.origin.z - 0.55, yaw: 0 };
    const centerTarget = toGround(warp(lifted));
    crate.place(lifted);
    const centerNear = await sample(centerTarget);

    // 3) Caisse déplacée loin de A : les mêmes points redeviennent ensoleillés.
    crate.place({ x: a.origin.x, y: 0.5, z: a.origin.z - 10, yaw: 0 });
    const groundFar = await sample(upperTarget);
    const centerFar = await sample(centerTarget);

    return { groundNear, neighborNear, groundFar, centerNear, centerFar, upperTarget, centerTarget };
  }, { archCrate, sun }));

  console.log("Ombre A → B", samples);
  expect(samples.upperTarget.z).toBeGreaterThan(-32);
  expect(samples.centerTarget.z).toBeGreaterThan(-32);
  expect(luminance(samples.neighborNear) - luminance(samples.groundNear)).toBeGreaterThan(25);
  expect(luminance(samples.groundFar) - luminance(samples.groundNear)).toBeGreaterThan(25);
  expect(luminance(samples.neighborNear) - luminance(samples.centerNear)).toBeGreaterThan(25);
  expect(luminance(samples.centerFar) - luminance(samples.centerNear)).toBeGreaterThan(25);
});

test("le projecteur ne laisse pas d’ombre parasite derrière B ni à côté de l’ouverture", async ({ page }) => {
  const samples = await withClock(page, (clock) => clock.evaluate(async (clock, { archCrate, sun }) => {
    const dev = window.gowDev;
    const a = dev.portal("A");
    const b = dev.portal("B");
    const crate = dev.crate(archCrate);
    async function sample(worldPoint) {
      clock.step(0);
      const screen = dev.project(worldPoint);
      const reading = dev.samplePixel(screen.x, screen.y);
      clock.step(0);
      return await reading;
    }

    // Point derrière B exactement sous l’ombre qu’un clone non découpé projetterait.
    dev.teleportPlayer({ x: b.origin.x, y: b.origin.y, z: b.origin.z - 1.6, yaw: 0 });
    dev.setPlayerVisible(false);
    const nearA = { x: a.origin.x + 0.35, y: 0.5, z: a.origin.z - 0.55, yaw: 0 };
    const warped = { x: b.origin.x + 0.35, y: 0.5, z: b.origin.z - 0.55 };
    const behindPoint = { x: warped.x + 0.5 * sun.x, y: b.origin.y, z: warped.z + 0.5 * sun.z };
    crate.place(nearA);
    const behindNear = await sample(behindPoint);
    crate.place({ x: a.origin.x, y: 0.5, z: a.origin.z - 10, yaw: 0 });
    const behindFar = await sample(behindPoint);

    // Point à côté de l’ouverture de B (hors du prisme latéral ouest, hors de l’ombre du pilier).
    dev.teleportPlayer({ x: b.origin.x - 1.2, y: b.origin.y, z: b.origin.z + 2.5, yaw: Math.PI });
    dev.setPlayerVisible(false);
    const sidePoint = { x: b.origin.x - 2.35, y: b.origin.y, z: b.origin.z + 0.05 };
    crate.place({ x: a.origin.x - 1.35, y: 0.5, z: a.origin.z - 0.55, yaw: 0 });
    const sideNear = await sample(sidePoint);
    crate.place({ x: a.origin.x, y: 0.5, z: a.origin.z - 10, yaw: 0 });
    const sideFar = await sample(sidePoint);

    return { behindPoint, behindNear, behindFar, sidePoint, sideNear, sideFar };
  }, { archCrate, sun }));

  console.log("Sans ombre parasite", samples);
  expect(samples.behindPoint.z).toBeLessThan(-32);
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(samples.behindNear[i] - samples.behindFar[i])).toBeLessThanOrEqual(2);
    expect(Math.abs(samples.sideNear[i] - samples.sideFar[i])).toBeLessThanOrEqual(2);
  }
});

test("l’ombre traverse l’arche dans l’autre sens (arrière de B vers arrière de A)", async ({ page }) => {
  const samples = await withClock(page, (clock) => clock.evaluate(async (clock, { archCrate, sun }) => {
    const dev = window.gowDev;
    const a = dev.portal("A");
    const b = dev.portal("B");
    const crate = dev.crate(archCrate);
    async function sample(worldPoint) {
      clock.step(0);
      const screen = dev.project(worldPoint);
      const reading = dev.samplePixel(screen.x, screen.y);
      clock.step(0);
      return await reading;
    }

    // Caméra derrière A, regardant vers le sud (face arrière de A).
    dev.teleportPlayer({ x: a.origin.x, y: a.origin.y, z: a.origin.z + 2.5, yaw: Math.PI });
    dev.setPlayerVisible(false);
    const behindB = { x: b.origin.x + 0.35, y: 1.6, z: b.origin.z - 0.55, yaw: 0 };
    const warped = { x: a.origin.x + 0.35, y: 1.6, z: a.origin.z - 0.55 };
    const t = warped.y / -sun.y;
    const target = { x: warped.x + t * sun.x, y: a.origin.y, z: warped.z + t * sun.z };
    const lit = { x: a.origin.x + 0.25, y: a.origin.y, z: a.origin.z + 0.18 };
    crate.place(behindB);
    const shadowPixel = await sample(target);
    const litPixel = await sample(lit);
    crate.place({ x: b.origin.x, y: 0.5, z: b.origin.z - 10, yaw: 0 });
    const farPixel = await sample(target);
    return { target, shadowPixel, litPixel, farPixel };
  }, { archCrate, sun }));

  console.log("Ombre B → A", samples);
  expect(samples.target.z).toBeGreaterThan(31);
  expect(luminance(samples.litPixel) - luminance(samples.shadowPixel)).toBeGreaterThan(12);
  expect(luminance(samples.farPixel) - luminance(samples.shadowPixel)).toBeGreaterThan(12);
});

test("portails à sens unique, abris à l’ombre, compteur shadowCasters et zéro compilation d’effet", async ({ page }) => {
  const result = await withClock(page, (clock) => clock.evaluate(async (clock, { archCrate, dt }) => {
    const dev = window.gowDev;
    const portals = dev.portalSystem;
    const a = dev.portal("A");
    const b2 = dev.portal("B2");
    const w = dev.portal("W");
    const p = dev.portal("P");
    const q = dev.portal("Q");
    const crate = dev.crate(archCrate);
    const created = [];
    async function render(frames) {
      for (let i = 0; i < frames; i++) {
        clock.step(dt);
        await new Promise(requestAnimationFrame);
      }
    }

    try {
      dev.teleportPlayer({ x: 0, y: 0, z: 20, yaw: 0 });
      dev.setPlayerVisible(false);
      await render(8);
      const effectsLoaded = dev.state().effects;

      // Loin de tout portail.
      crate.place({ x: a.origin.x, y: 0.5, z: a.origin.z - 10, yaw: 0 });
      await render(4);
      const far = dev.state().shadowCasters;

      // Devant A (sans chevaucher).
      crate.place({ x: a.origin.x + 0.35, y: 0.5, z: a.origin.z - 0.55, yaw: 0 });
      await render(4);
      const nearA = dev.state().shadowCasters;

      // À cheval sur A (fantôme actif ET projecteur d’ombre actif).
      crate.place({ x: a.origin.x + 0.35, y: 0.5, z: a.origin.z - 0.15, yaw: 0 });
      await render(4);
      const straddlingA = { ghosts: dev.state().ghosts, shadowCasters: dev.state().shadowCasters };

      // Joueur visible lui aussi devant A.
      dev.teleportPlayer({ x: a.origin.x - 0.3, y: 0, z: a.origin.z - 0.6, yaw: 0 });
      dev.setPlayerVisible(true);
      await render(4);
      const crateAndPlayer = dev.state().shadowCasters;
      dev.setPlayerVisible(false);
      await render(2);
      const playerHidden = dev.state().shadowCasters;

      // Paire à sens unique en plein soleil : O1 (+Z, rayons sortants) ↔ O2 (−Z, rayons entrants).
      const o1 = portals.createPortal({
        name: "test-O1", origin: { x: 18, y: 0, z: -44 }, yaw: 0, width: 1.6, height: 2.4, sides: "front",
      });
      const o2 = portals.createPortal({
        name: "test-O2", origin: { x: 24, y: 0, z: -44 }, yaw: Math.PI, width: 1.6, height: 2.4, sides: "front",
      });
      created.push(o1, o2);
      portals.link(o1, o2);

      crate.place({ x: o1.origin.x, y: 0.5, z: o1.origin.z + 0.55, yaw: 0 });
      await render(2);
      const frontSunOneWayExit = dev.state().shadowCasters;

      crate.place({ x: o1.origin.x, y: 0.5, z: o1.origin.z - 0.55, yaw: 0 });
      await render(2);
      const backSunOneWayExit = dev.state().shadowCasters;

      crate.place({ x: o2.origin.x, y: 0.5, z: o2.origin.z - 0.55, yaw: 0 });
      await render(4);
      const frontSunOneWayEntry = dev.state().shadowCasters;

      crate.place({ x: o2.origin.x, y: 0.5, z: o2.origin.z + 0.55, yaw: 0 });
      await render(2);
      const backSunOneWayEntry = dev.state().shadowCasters;

      for (const portal of created) portals.removePortal(portal);
      created.length = 0;

      // P ↔ Q : P est sortant, Q est sous terre à l’abri (lumière bloquée → aucun projecteur).
      crate.place({ x: p.origin.x, y: 0.5, z: p.origin.z + 0.55, yaw: 0 });
      await render(2);
      const frontP = dev.state().shadowCasters;

      crate.place({ x: p.origin.x, y: 0.5, z: p.origin.z - 0.55, yaw: 0 });
      await render(2);
      const backP = dev.state().shadowCasters;

      crate.place({ x: q.origin.x, y: q.origin.y + 0.5, z: q.origin.z - 0.55, yaw: 0 });
      await render(4);
      const frontQ = dev.state().shadowCasters;

      crate.place({ x: q.origin.x, y: q.origin.y + 0.5, z: q.origin.z + 0.55, yaw: 0 });
      await render(2);
      const backQ = dev.state().shadowCasters;

      // Joueur visible à l’abri : couloir souterrain à 1 m de B2 et pavillon à 0,8 m de W.
      crate.place({ x: a.origin.x, y: 0.5, z: a.origin.z - 10, yaw: 0 });
      dev.setPlayerVisible(true);
      dev.teleportPlayer({ x: b2.origin.x + 1, y: b2.origin.y, z: b2.origin.z, yaw: Math.PI / 2 });
      await render(4);
      const playerCorridorB2 = dev.state().shadowCasters;

      dev.teleportPlayer({ x: w.origin.x + 0.8, y: w.origin.y, z: w.origin.z, yaw: Math.PI / 2 });
      await render(4);
      const playerPavilionW = dev.state().shadowCasters;

      const effectsAfter = dev.state().effects;
      return {
        effectsLoaded, effectsAfter, far, nearA, straddlingA, crateAndPlayer, playerHidden,
        frontSunOneWayExit, backSunOneWayExit, frontSunOneWayEntry, backSunOneWayEntry,
        frontP, backP, frontQ, backQ, playerCorridorB2, playerPavilionW,
      };
    } finally {
      for (const portal of created) portals.removePortal(portal);
    }
  }, { archCrate, dt }));

  console.log("Projecteurs et effets", result);
  expect(result.far).toBe(0);
  expect(result.nearA).toBe(1);
  expect(result.straddlingA).toEqual({ ghosts: 1, shadowCasters: 1 });
  expect(result.crateAndPlayer).toBe(2);
  expect(result.playerHidden).toBe(1);
  expect(result.frontSunOneWayExit).toBe(0);
  expect(result.backSunOneWayExit).toBe(0);
  expect(result.frontSunOneWayEntry).toBe(1);
  expect(result.backSunOneWayEntry).toBe(0);
  expect(result.frontP).toBe(0);
  expect(result.backP).toBe(0);
  expect(result.frontQ).toBe(0);
  expect(result.backQ).toBe(0);
  expect(result.playerCorridorB2).toBe(0);
  expect(result.playerPavilionW).toBe(0);
  expect(result.effectsLoaded).toBeGreaterThan(0);
  expect(result.effectsAfter).toBe(result.effectsLoaded);
});

test("l’ombre du joueur suit sa position à l’image près sans retard d’une image", async ({ page }) => {
  const samples = await withClock(page, (clock) => clock.evaluate(async (clock, { sun }) => {
    const dev = window.gowDev;
    // Crâne du squelette (y ≈ 1,785 m, sphère de 37 cm) projeté au sol sur l’esplanade de sable ensoleillée.
    const skullHeight = 1.785;
    const shadowOf = (p) => {
      const t = skullHeight / -sun.y;
      return { x: p.x + t * sun.x, y: 0, z: p.z + t * sun.z };
    };
    const pose1 = { x: -26, y: 0, z: -33, yaw: 0 };
    const pose2 = { x: -24.5, y: 0, z: -33, yaw: 0 };
    const spot1 = shadowOf(pose1);
    const spot2 = shadowOf(pose2);

    // 1) Joueur en pose1 : spot1 est dans son ombre, spot2 est au soleil.
    dev.teleportPlayer(pose1);
    dev.setPlayerVisible(true);
    clock.step(0);
    const screen1Before = dev.project(spot1);
    const screen2Before = dev.project(spot2);
    const read1Before = dev.samplePixel(screen1Before.x, screen1Before.y);
    const read2Before = dev.samplePixel(screen2Before.x, screen2Before.y);
    clock.step(0);
    const before = { spot1: await read1Before, spot2: await read2Before };

    // 2) Déplacement direct vers pose2, puis une seule image rendue : l’ombre doit suivre dès cette image.
    dev.teleportPlayer(pose2);
    const screen1After = dev.project(spot1);
    const screen2After = dev.project(spot2);
    const read1After = dev.samplePixel(screen1After.x, screen1After.y);
    const read2After = dev.samplePixel(screen2After.x, screen2After.y);
    clock.step(0);
    const after = { spot1: await read1After, spot2: await read2After };

    return { spot1, spot2, before, after };
  }, { sun }));

  console.log("Suivi ombre joueur", samples);
  // Avant déplacement : spot1 assombri, spot2 ensoleillé.
  expect(luminance(samples.before.spot2) - luminance(samples.before.spot1)).toBeGreaterThan(25);
  // Dès la première image après déplacement : spot1 redevient ensoleillé, spot2 passe dans l’ombre.
  expect(luminance(samples.after.spot1) - luminance(samples.before.spot1)).toBeGreaterThan(25);
  expect(luminance(samples.before.spot2) - luminance(samples.after.spot2)).toBeGreaterThan(25);
  expect(luminance(samples.after.spot1) - luminance(samples.after.spot2)).toBeGreaterThan(25);
});
