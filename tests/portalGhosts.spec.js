import { expect, test } from "@playwright/test";
import { expectCleanPage, startDevGame, withClock } from "./support/devGame.js";

const dt = 1000 / 144;
const archCrate = "caisse de l’arche";

test.beforeEach(({ page }) => startDevGame(page));
test.afterEach(({ page }) => expectCleanPage(page));

function evalPlane(plane, p) {
  return plane.normal.x * p.x + plane.normal.y * p.y + plane.normal.z * p.z + plane.d;
}

function isIdlePlane(plane) {
  return plane
    && Math.abs(plane.normal.x) < 1e-6
    && Math.abs(plane.normal.y + 1) < 1e-6
    && Math.abs(plane.normal.z) < 1e-6
    && Math.abs(plane.d + 1e6) < 1;
}

function colorDistance(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

test("deux portails côte à côte affichent deux fantômes cohérents sans compilation d’effet", async ({ page }) => {
  const result = await withClock(page, (clock) => clock.evaluate(async (clock, { archCrate, dt }) => {
    const dev = window.gowDev;
    const portals = dev.portalSystem;
    const crate = dev.crate(archCrate);
    async function render(frames) {
      for (let i = 0; i < frames; i++) {
        clock.step(dt);
        await new Promise(requestAnimationFrame);
      }
    }
    async function sample(worldPoint) {
      clock.step(0);
      const screen = dev.project(worldPoint);
      const reading = dev.samplePixel(screen.x, screen.y);
      clock.step(0);
      return await reading;
    }

    dev.setPlayerVisible(false);
    dev.teleportPlayer({ x: 12.4, y: 0, z: -42.5, yaw: Math.PI });
    await render(4);
    const initialCount = portals.portals.length;
    const effectsBefore = dev.state().effects;

    // Deux portails de 1,2 × 2 m côte à côte dans le plan z = −45, reliés à deux destinations éloignées.
    const g1 = portals.createPortal({ name: "test-G1", origin: { x: 39.4, y: 0, z: -45 }, yaw: Math.PI, width: 1.2, height: 2, sides: "both" });
    const g2 = portals.createPortal({ name: "test-G2", origin: { x: 40.6, y: 0, z: -45 }, yaw: Math.PI, width: 1.2, height: 2, sides: "both" });
    const h1 = portals.createPortal({ name: "test-H1", origin: { x: 12, y: 0, z: -45 }, yaw: 0, width: 1.2, height: 2, sides: "both" });
    const h2 = portals.createPortal({ name: "test-H2", origin: { x: -12, y: 0, z: -45 }, yaw: 0, width: 1.2, height: 2, sides: "both" });
    portals.link(g1, h1);
    portals.link(g2, h2);

    try {
      // Caisse posée à cheval sur la jonction x = 40 et sur le plan z = −45 (centre devant le plan, z = −45,2).
      crate.place({ x: 40.0, y: 0.5, z: -45.2, yaw: 0 });
      await render(4);
      const straddleTwo = {
        stateGhosts: dev.state().ghosts,
        visual: crate.visual(),
        details: crate.ghosts(),
      };

      // Vérification par pixels à la destination H1 : moitié issue de G1 visible, moitié issue de G2 rejetée.
      dev.teleportPlayer({ x: 12.4, y: 0, z: -42.5, yaw: Math.PI });
      const h1Visible = await sample({ x: 12.3, y: 0.5, z: -44.7 });
      const h1ClippedOther = await sample({ x: 12.9, y: 0.5, z: -44.7 });
      // Vue latérale derrière le plan z = −45 (sans traverser l’ouverture H1) : le dos du fantôme H1 est coupé.
      dev.teleportPlayer({ x: 15.0, y: 0, z: -45.3, yaw: -Math.PI / 2 });
      const h1ClippedBack = await sample({ x: 12.3, y: 0.5, z: -45.3 });

      // Vérification par pixels à la destination H2 : moitié issue de G2 visible, moitié issue de G1 rejetée.
      dev.teleportPlayer({ x: -12.4, y: 0, z: -42.5, yaw: Math.PI });
      const h2Visible = await sample({ x: -12.3, y: 0.5, z: -44.7 });
      const h2ClippedOther = await sample({ x: -12.9, y: 0.5, z: -44.7 });

      // Un seul fantôme quand la caisse ne chevauche plus que G1 (x = 39,0 → distance à G2 = 1,0 > rayon 0,866).
      crate.place({ x: 39.0, y: 0.5, z: -45.2, yaw: 0 });
      await render(4);
      const straddleOne = {
        stateGhosts: dev.state().ghosts,
        visual: crate.visual(),
        details: crate.ghosts(),
      };

      // Caisse éloignée : aucun fantôme ; lecture des pixels de référence du fond devant H1 et H2.
      crate.place({ x: 40.0, y: 0.5, z: -40.0, yaw: 0 });
      await render(4);
      const straddleNone = {
        stateGhosts: dev.state().ghosts,
        visual: crate.visual(),
        details: crate.ghosts(),
      };

      dev.teleportPlayer({ x: 12.4, y: 0, z: -42.5, yaw: Math.PI });
      const h1RefVisible = await sample({ x: 12.3, y: 0.5, z: -44.7 });
      const h1RefOther = await sample({ x: 12.9, y: 0.5, z: -44.7 });
      dev.teleportPlayer({ x: 15.0, y: 0, z: -45.3, yaw: -Math.PI / 2 });
      const h1RefBack = await sample({ x: 12.3, y: 0.5, z: -45.3 });

      dev.teleportPlayer({ x: -12.4, y: 0, z: -42.5, yaw: Math.PI });
      const h2RefVisible = await sample({ x: -12.3, y: 0.5, z: -44.7 });
      const h2RefOther = await sample({ x: -12.9, y: 0.5, z: -44.7 });

      const effectsAfter = dev.state().effects;
      return {
        initialCount, effectsBefore, effectsAfter,
        straddleTwo, straddleOne, straddleNone,
        pixels: {
          h1Visible, h1ClippedOther, h1ClippedBack, h1RefVisible, h1RefOther, h1RefBack,
          h2Visible, h2ClippedOther, h2RefVisible, h2RefOther,
        },
      };
    } finally {
      for (const portal of [g1, g2, h1, h2]) portals.removePortal(portal);
    }
  }, { archCrate, dt }));

  const remainingCount = await page.evaluate(() => window.gowDev.portalSystem.portals.length);
  expect(remainingCount).toBe(result.initialCount);

  // Deux fantômes actifs à cheval sur la jonction.
  expect(result.straddleTwo.stateGhosts).toBe(2);
  expect(result.straddleTwo.visual.ghost).toBe(true);
  expect(result.straddleTwo.visual.ghosts).toBe(2);

  const activeTwo = result.straddleTwo.details.ghosts.filter((g) => g.active);
  expect(activeTwo).toHaveLength(2);
  const ghostH1 = activeTwo.find((g) => g.x > 0);
  const ghostH2 = activeTwo.find((g) => g.x < 0);
  expect(ghostH1).toBeTruthy();
  expect(ghostH2).toBeTruthy();

  // Poses exactes W_1(visuel) et W_2(visuel).
  const v2 = result.straddleTwo.visual;
  expect(v2.x).toBeCloseTo(40.0, 3);
  expect(v2.y).toBeCloseTo(0.5, 3);
  expect(v2.z).toBeCloseTo(-45.2, 3);
  expect(ghostH1.x).toBeCloseTo(v2.x - 27.4, 5);
  expect(ghostH1.y).toBeCloseTo(v2.y, 5);
  expect(ghostH1.z).toBeCloseTo(v2.z, 5);
  expect(ghostH1.yaw).toBeCloseTo(v2.yaw, 5);
  expect(ghostH2.x).toBeCloseTo(v2.x - 52.6, 5);
  expect(ghostH2.y).toBeCloseTo(v2.y, 5);
  expect(ghostH2.z).toBeCloseTo(v2.z, 5);
  expect(ghostH2.yaw).toBeCloseTo(v2.yaw, 5);

  // Cohérence des plans de coupe : original (devant z = −45), fantôme H1 (z > −45 et x < 12,6), fantôme H2 (z > −45 et x > −12,6).
  const orig = result.straddleTwo.details.original;
  expect(evalPlane(orig.clipPlane, { x: 39.7, y: 0.5, z: -45.2 })).toBeLessThan(0);
  expect(evalPlane(orig.clipPlane2, { x: 40.3, y: 0.5, z: -45.2 })).toBeLessThan(0);
  expect(evalPlane(orig.clipPlane, { x: 39.7, y: 0.5, z: -44.8 })).toBeGreaterThan(0);
  expect(evalPlane(orig.clipPlane2, { x: 40.3, y: 0.5, z: -44.8 })).toBeGreaterThan(0);

  expect(evalPlane(ghostH1.clipPlane, { x: 12.3, y: 0.5, z: -44.8 })).toBeLessThan(0);
  expect(evalPlane(ghostH1.clipPlane2, { x: 12.3, y: 0.5, z: -44.8 })).toBeLessThan(0);
  expect(evalPlane(ghostH1.clipPlane2, { x: 12.9, y: 0.5, z: -44.8 })).toBeGreaterThan(0);
  expect(evalPlane(ghostH1.clipPlane, { x: 12.3, y: 0.5, z: -45.2 })).toBeGreaterThan(0);

  expect(evalPlane(ghostH2.clipPlane, { x: -12.3, y: 0.5, z: -44.8 })).toBeLessThan(0);
  expect(evalPlane(ghostH2.clipPlane2, { x: -12.3, y: 0.5, z: -44.8 })).toBeLessThan(0);
  expect(evalPlane(ghostH2.clipPlane2, { x: -12.9, y: 0.5, z: -44.8 })).toBeGreaterThan(0);
  expect(evalPlane(ghostH2.clipPlane, { x: -12.3, y: 0.5, z: -45.2 })).toBeGreaterThan(0);

  // Vérification pixels : chaque fantôme est visible du côté de son ouverture et coupé au-delà de la jonction.
  const px = result.pixels;
  expect(colorDistance(px.h1Visible, px.h1RefVisible)).toBeGreaterThan(35);
  expect(px.h1Visible[0] - px.h1Visible[2]).toBeGreaterThan(30);
  expect(colorDistance(px.h1ClippedOther, px.h1RefOther)).toBeLessThanOrEqual(2);
  expect(colorDistance(px.h1ClippedBack, px.h1RefBack)).toBeLessThanOrEqual(2);

  expect(colorDistance(px.h2Visible, px.h2RefVisible)).toBeGreaterThan(35);
  expect(px.h2Visible[0] - px.h2Visible[2]).toBeGreaterThan(30);
  expect(colorDistance(px.h2ClippedOther, px.h2RefOther)).toBeLessThanOrEqual(2);

  // Un seul fantôme quand seul G1 est chevauché ; clipPlane2 revient au plan neutre.
  expect(result.straddleOne.stateGhosts).toBe(1);
  expect(result.straddleOne.visual.ghost).toBe(true);
  expect(result.straddleOne.visual.ghosts).toBe(1);
  expect(isIdlePlane(result.straddleOne.details.original.clipPlane2)).toBe(true);
  const activeOne = result.straddleOne.details.ghosts.filter((g) => g.active);
  expect(activeOne).toHaveLength(1);
  expect(isIdlePlane(activeOne[0].clipPlane2)).toBe(true);

  // Aucun fantôme loin des ouvertures.
  expect(result.straddleNone.stateGhosts).toBe(0);
  expect(result.straddleNone.visual.ghost).toBe(false);
  expect(result.straddleNone.visual.ghosts).toBe(0);
  // Au repos, l’original n’a plus de plan de coupe : la variante sans plan a été préchauffée (warmUp).
  expect(result.straddleNone.details.original.clipPlane).toBeNull();
  expect(result.straddleNone.details.original.clipPlane2).toBeNull();

  // Zéro compilation shader pendant tout le scénario.
  expect(result.effectsBefore).toBeGreaterThan(0);
  expect(result.effectsAfter).toBe(result.effectsBefore);
});

test("deux portails en angle transportent le plan de l’autre portail avec rotation et échelle", async ({ page }) => {
  const result = await withClock(page, (clock) => clock.evaluate(async (clock, { archCrate, dt }) => {
    const dev = window.gowDev;
    const portals = dev.portalSystem;
    const crate = dev.crate(archCrate);
    async function render(frames) {
      for (let i = 0; i < frames; i++) {
        clock.step(dt);
        await new Promise(requestAnimationFrame);
      }
    }

    dev.setPlayerVisible(false);
    dev.teleportPlayer({ x: 12, y: 0, z: -42, yaw: Math.PI });
    await render(4);
    const effectsBefore = dev.state().effects;

    // Coin à 90° en (40, −45) : C1 sur z = −45 (vers E1 tourné de +90° et demi-échelle), C2 sur x = 40 (vers E2 tourné de 45°).
    const c1 = portals.createPortal({ name: "test-C1", origin: { x: 39.4, y: 0, z: -45 }, yaw: Math.PI, width: 1.2, height: 2, sides: "both" });
    const c2 = portals.createPortal({ name: "test-C2", origin: { x: 40.0, y: 0, z: -45.6 }, yaw: -Math.PI / 2, width: 1.2, height: 2, sides: "both" });
    const e1 = portals.createPortal({ name: "test-E1", origin: { x: 12, y: 0, z: -45 }, yaw: Math.PI / 2, width: 0.6, height: 1, sides: "both" });
    const e2 = portals.createPortal({ name: "test-E2", origin: { x: -12, y: 0, z: -45 }, yaw: Math.PI / 4, width: 1.2, height: 2, sides: "both" });
    portals.link(c1, e1, { allowRotation: true });
    portals.link(c2, e2, { allowRotation: true });

    try {
      crate.place({ x: 39.8, y: 0.5, z: -45.2, yaw: 0 });
      await render(4);
      const details = crate.ghosts();
      const visual = crate.visual();
      const ghostsCount = dev.state().ghosts;

      const w1 = (p) => {
        const out = c1.warp.point(p);
        return { x: out.x, y: out.y, z: out.z };
      };
      const w2 = (p) => {
        const out = c2.warp.point(p);
        return { x: out.x, y: out.y, z: out.z };
      };

      const warpedSamples = {
        e1Pose: w1(visual),
        e2Pose: w2(visual),
        e1Kept: w1({ x: 39.7, y: 0.5, z: -44.8 }),
        e1BehindBoth: w1({ x: 40.2, y: 0.5, z: -44.8 }),
        e1NotCrossed: w1({ x: 39.7, y: 0.5, z: -45.2 }),
        e2Kept: w2({ x: 40.2, y: 0.5, z: -45.2 }),
        e2BehindBoth: w2({ x: 40.2, y: 0.5, z: -44.8 }),
        e2NotCrossed: w2({ x: 39.7, y: 0.5, z: -45.2 }),
      };

      // Vérifie aussi deux fantômes simultanés sur le joueur et le compteur d’effets.
      crate.place({ x: 40, y: 0.5, z: -38, yaw: 0 });
      dev.teleportPlayer({ x: 39.8, y: 0, z: -45.2, yaw: 0 });
      dev.setPlayerVisible(true);
      await render(2);
      const playerGhostsVisible = dev.state().ghosts;
      dev.setPlayerVisible(false);
      await render(2);
      const playerGhostsHidden = dev.state().ghosts;
      const effectsAfter = dev.state().effects;

      // Vérifie syncGhostAppearance, isGhostActive, ghostCount et la restauration des plans au désenregistrement.
      const scene = c1.aperture.getScene();
      const sourceCrate = scene.getMeshByName(archCrate);
      const probeMesh = sourceCrate.clone("sonde · deux fantômes", null);
      const probeMaterial = sourceCrate.material.clone("sonde · matériau");
      probeMaterial.clipPlane = null;
      probeMaterial.clipPlane2 = null;
      probeMesh.material = probeMaterial;
      probeMesh.position.set(39.8, 0.5, -45.2);
      const probeTraveler = {
        name: "sonde",
        center(out) { return out.copyFrom(probeMesh.position); },
        applyWarp() {},
        visual: { root: probeMesh, materials: [probeMaterial], radius: () => 0.866 },
      };
      const unregister = portals.addTraveler(probeTraveler);
      let apiCheck;
      try {
        portals.updateGhosts();
        const ghostMats = scene.materials.filter((m) => m.name.startsWith("sonde · matériau · fantôme "));
        probeMaterial.alpha = 0.37;
        probeMesh.visibility = 0.64;
        portals.syncGhostAppearance(probeTraveler);
        const ghostMeshes = scene.meshes.filter((m) => m.name.startsWith("sonde · deux fantômes · fantôme "));
        apiCheck = {
          active: portals.isGhostActive(probeTraveler),
          count: portals.ghostCount(probeTraveler),
          total: portals.activeGhosts,
          alphas: ghostMats.map((m) => m.alpha),
          visibilities: ghostMeshes.map((m) => m.visibility),
        };
      } finally {
        unregister();
        apiCheck.restoredNull = probeMaterial.clipPlane === null && probeMaterial.clipPlane2 === null;
        probeMesh.dispose();
        probeMaterial.dispose();
      }

      return {
        effectsBefore, effectsAfter, ghostsCount, visual, details, warpedSamples,
        playerGhostsVisible, playerGhostsHidden, apiCheck,
      };
    } finally {
      for (const portal of [c1, c2, e1, e2]) portals.removePortal(portal);
    }
  }, { archCrate, dt }));

  expect(result.ghostsCount).toBe(2);
  expect(result.visual.ghost).toBe(true);
  expect(result.visual.ghosts).toBe(2);

  const active = result.details.ghosts.filter((g) => g.active);
  expect(active).toHaveLength(2);
  const ghostE1 = active.find((g) => g.x > 0);
  const ghostE2 = active.find((g) => g.x < 0);
  expect(ghostE1).toBeTruthy();
  expect(ghostE2).toBeTruthy();

  // Poses et échelles exactes (E1 à demi-échelle et tourné de +π/2, E2 à échelle 1 et tourné de −π/4).
  expect(result.visual.x).toBeCloseTo(39.8, 3);
  expect(result.visual.y).toBeCloseTo(0.5, 3);
  expect(result.visual.z).toBeCloseTo(-45.2, 3);
  const s = result.warpedSamples;
  expect(ghostE1.x).toBeCloseTo(s.e1Pose.x, 5);
  expect(ghostE1.y).toBeCloseTo(s.e1Pose.y, 5);
  expect(ghostE1.z).toBeCloseTo(s.e1Pose.z, 5);
  expect(ghostE1.scaling.x).toBeCloseTo(0.5, 5);
  expect(ghostE1.scaling.y).toBeCloseTo(0.5, 5);
  expect(ghostE1.scaling.z).toBeCloseTo(0.5, 5);
  expect(ghostE2.x).toBeCloseTo(s.e2Pose.x, 5);
  expect(ghostE2.y).toBeCloseTo(s.e2Pose.y, 5);
  expect(ghostE2.z).toBeCloseTo(s.e2Pose.z, 5);
  expect(ghostE2.scaling.x).toBeCloseTo(1, 5);

  // Original : rejette z > −45 et x > 40.
  const orig = result.details.original;
  const origKept = (p) => evalPlane(orig.clipPlane, p) <= 0 && evalPlane(orig.clipPlane2, p) <= 0;
  expect(origKept({ x: 39.7, y: 0.5, z: -45.2 })).toBe(true);
  expect(origKept({ x: 39.7, y: 0.5, z: -44.8 })).toBe(false);
  expect(origKept({ x: 40.2, y: 0.5, z: -45.2 })).toBe(false);
  expect(origKept({ x: 40.2, y: 0.5, z: -44.8 })).toBe(false);

  // Fantôme E1 : garde ce qui a traversé C1 sans traverser C2 ; rejette le morceau derrière C2 via clipPlane2 transporté.
  expect(evalPlane(ghostE1.clipPlane, s.e1Kept)).toBeLessThan(0);
  expect(evalPlane(ghostE1.clipPlane2, s.e1Kept)).toBeLessThan(0);
  expect(evalPlane(ghostE1.clipPlane2, s.e1BehindBoth)).toBeGreaterThan(0);
  expect(evalPlane(ghostE1.clipPlane, s.e1NotCrossed)).toBeGreaterThan(0);

  // Fantôme E2 : garde ce qui a traversé C2 sans traverser C1 ; rejette le morceau derrière C1 via clipPlane2 transporté.
  expect(evalPlane(ghostE2.clipPlane, s.e2Kept)).toBeLessThan(0);
  expect(evalPlane(ghostE2.clipPlane2, s.e2Kept)).toBeLessThan(0);
  expect(evalPlane(ghostE2.clipPlane2, s.e2BehindBoth)).toBeGreaterThan(0);
  expect(evalPlane(ghostE2.clipPlane, s.e2NotCrossed)).toBeGreaterThan(0);

  // Deux fantômes sur le joueur aussi, API publique synchronisée et zéro compilation d’effet.
  console.log("Multi-fantômes (angle), effets =", result.effectsBefore, "→", result.effectsAfter);
  expect(result.playerGhostsVisible).toBe(2);
  expect(result.playerGhostsHidden).toBe(0);
  expect(result.apiCheck).toEqual({
    active: true,
    count: 2,
    total: 2,
    alphas: [0.37, 0.37],
    visibilities: [0.64, 0.64],
    restoredNull: true,
  });
  expect(result.effectsAfter).toBe(result.effectsBefore);
});
