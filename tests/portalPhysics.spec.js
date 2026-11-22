import { expect, test } from "@playwright/test";
import { PLAYER } from "../src/config.js";
import { signedDistance } from "../src/portals/math.js";
import { expectCleanPage, startDevGame } from "./support/devGame.js";

const hz = 144;
const archCrate = "caisse de l’arche";
const tunnelCrate = "caisse du tunnel";

test.beforeEach(({ page }) => startDevGame(page));
test.afterEach(({ page }) => expectCleanPage(page));

async function record(page, portal, name, launch = false) {
  return page.evaluate(({ portal, name, launch, hz }) => {
    const dev = window.gowDev;
    const entry = dev.portal(portal);
    const exit = dev.portal(entry.target);
    const nx = Math.sin(entry.yaw);
    const nz = Math.cos(entry.yaw);
    function start(distance, height) {
      return { x: entry.origin.x + nx * distance, y: entry.origin.y + height,
        z: entry.origin.z + nz * distance, yaw: entry.yaw + Math.PI };
    }
    const crate = dev.crate(name);
    const clock = dev.manualClock();
    const frames = [];
    try {
      crate.place({ ...start(1, 0.5), yaw: launch ? Math.PI / 4 : 0 });
      if (!launch) dev.teleportPlayer(start(2.2, 0));
      for (let i = 0; i < 12; i++) clock.step(1000 / hz);
      if (launch) crate.push({ x: -6.5 * nx, y: 0, z: -6.5 * nz });
      else dev.setControls({ forward: 1 });
      for (let i = 0; i < (launch ? 50 : 260); i++) {
        clock.step(1000 / hz);
        const { player, traversals } = dev.state();
        frames.push({ visual: crate.visual(), body: crate.state(), player, traversals });
      }
      return { frames, entry, exit };
    } finally {
      dev.setControls(null);
      clock.release();
    }
  }, { portal, name, launch, hz });
}

function warp(point, from, to) {
  const s = from.scale;
  return { x: to.origin.x + s * (point.x - from.origin.x), y: to.origin.y + s * (point.y - from.origin.y),
    z: to.origin.z + s * (point.z - from.origin.z) };
}

function trajectory({ frames, entry, exit }, name) {
  return frames.map(({ visual, body, player, traversals }) => {
    const boxCrossed = traversals.some((e) => e.traveler === name);
    const playerCrossed = traversals.some((e) => e.traveler === "joueur");
    const box = boxCrossed ? warp(visual, exit, entry) : visual;
    const feet = playerCrossed ? warp(player, exit, entry) : player;
    const d = signedDistance(entry, box);
    return { d, gap: signedDistance(entry, feet) - d, height: box.y - entry.origin.y, tilt: visual.tilt,
      speed: Math.hypot(body.velocity.x, body.velocity.z) / body.scale,
      boxCrossed, playerCrossed };
  });
}

function differences(values) {
  return values.slice(1).map((v, i) => v - values[i]);
}

function trajectoryMetrics(samples) {
  const steps = differences(samples.map((p) => -p.d));
  return {
    minStep: Math.min(...steps), maxChange: Math.max(...differences(steps).map(Math.abs)),
    heightError: Math.max(...samples.map((p) => Math.abs(p.height - 0.5))),
    tilt: Math.max(...samples.map((p) => p.tilt)),
  };
}

function checkTrajectory({ minStep, maxChange, heightError, tilt }) {
  expect(minStep).toBeGreaterThanOrEqual(-0.0005);
  expect(maxChange).toBeLessThanOrEqual(0.004);
  expect(heightError).toBeLessThanOrEqual(0.01);
  expect(tilt).toBeLessThan(0.05);
}

for (const [portal, name, scale] of [["A", archCrate, 1], ["A2", archCrate, 1], ["P1", tunnelCrate, 0.5]]) {
  test(`le joueur garde le contact avec la caisse à travers ${portal}`, async ({ page }) => {
    const run = await record(page, portal, name);
    const samples = trajectory(run, name);
    const between = samples.filter((p) => p.boxCrossed && !p.playerCrossed);
    const m = { ...trajectoryMetrics(samples), gap: Math.min(...samples.map((p) => p.gap)),
      between: between.length, minSpeed: -hz * Math.max(...differences(between.map((p) => p.d))) };
    console.log(portal, m);
    const last = run.frames.at(-1);
    expect(last.traversals.map((e) => [e.traveler, e.portal])).toEqual([[name, portal], ["joueur", portal]]);
    expect(last.body.scale).toBe(scale);
    expect(last.player.scale).toBe(scale);
    expect(m.between).toBeGreaterThan(1);
    expect(m.gap).toBeGreaterThanOrEqual(0.5 + PLAYER.radius - 0.03);
    expect(m.minSpeed).toBeGreaterThan(0.5);
    checkTrajectory(m);
  });
}

for (const portal of ["E", "Q"]) {
  test(`la caisse tournée à 45° traverse ${portal} sans freinage au seuil`, async ({ page }) => {
    const run = await record(page, portal, archCrate, true);
    const samples = trajectory(run, archCrate);
    // L’impulsion initiale démarre le mouvement après un pas de retard d’interpolation.
    const m = trajectoryMetrics(samples.slice(4));
    let maxLoss = 0;
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      if (Math.abs(prev.d) < 0.22 && prev.speed > 0.1) {
        maxLoss = Math.max(maxLoss, 1 - samples[i].speed / prev.speed);
      }
    }
    console.log(portal, { ...m, maxLoss, finalDistance: samples.at(-1).d });
    expect(run.frames.at(-1).traversals.map((e) => [e.traveler, e.portal])).toEqual([[archCrate, portal]]);
    expect(maxLoss).toBeLessThanOrEqual(0.15);
    checkTrajectory(m);
  });
}

test("la doublure suit la pose simulée des deux côtés de P1 et se désactive à distance", async ({ page }) => {
  const { frames, entry, exit } = await record(page, "P1", tunnelCrate);
  const sides = new Set();
  let maxError = 0;
  for (const { body, traversals } of frames) {
    const arrived = traversals.some((e) => e.traveler === tunnelCrate);
    const [from, to] = arrived ? [exit, entry] : [entry, exit];
    const near = Math.abs(signedDistance(from, body)) < Math.sqrt(3) / 2 * body.scale;
    if (near) {
      sides.add(body.straddling);
      expect(body.straddling).toBe(arrived ? entry.target : "P1");
      const expected = warp(body, from, to);
      maxError = Math.max(maxError, Math.hypot(body.proxy.x - expected.x, body.proxy.y - expected.y, body.proxy.z - expected.z));
    } else {
      expect(body.straddling).toBeNull();
      expect(body.proxy).toBeNull();
    }
  }
  expect(sides).toEqual(new Set(["P1", entry.target]));
  expect(frames.at(-1).body.proxy).toBeNull();
  console.log("Doublure P1", { maxError });
  expect(maxError).toBeLessThanOrEqual(0.001);

  // place() doit aussi basculer les masques et déplacer la doublure sans attendre un pas.
  const [near, far] = await page.evaluate((name) => {
    const dev = window.gowDev;
    const crate = dev.crate(name);
    const { origin } = dev.portal("P2");
    crate.place({ ...origin, x: origin.x + 0.1, y: origin.y + 0.25 });
    const near = crate.state();
    crate.place({ ...origin, x: origin.x + 2, y: origin.y + 0.25 });
    return [near, crate.state()];
  }, tunnelCrate);
  expect(near.straddling).toBe(entry.target);
  const expected = warp(near, exit, entry);
  expect(Math.hypot(near.proxy.x - expected.x, near.proxy.y - expected.y, near.proxy.z - expected.z)).toBeLessThanOrEqual(0.001);
  expect(far).toMatchObject({ straddling: null, proxy: null });
});
