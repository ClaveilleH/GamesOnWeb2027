import { expect, test } from "@playwright/test";
import { Matrix } from "@babylonjs/core/Maths/math.vector.js";
import { createFlickerProbe } from "../src/dev/flickerProbe.js";
import { countIsolatedChanges, outlineMask } from "../src/dev/frameProbe.js";

test("un pixel qui revient à sa couleur après une image est compté", () => {
  const a = Uint8Array.of(0, 0, 0, 0, 10, 20, 30, 40);
  const b = Uint8Array.of(20, 20, 20, 0, 30, 40, 50, 60);
  const c = Uint8Array.of(0, 0, 0, 0, 12, 20, 30, 40);
  const indices = [];
  expect(countIsolatedChanges(a, b, c, null, 60, 24, indices)).toBe(1);
  expect(indices).toEqual([1]);
  expect(countIsolatedChanges(a, b, c, null, 60, 2, indices)).toBe(0);
  expect(indices).toEqual([]);
});

test("un changement durable ne compte pas", () => {
  const a = Uint8Array.of(0, 0, 0, 255);
  const b = Uint8Array.of(240, 80, 10, 255);
  expect(countIsolatedChanges(a, b, b, null, 60, 24)).toBe(0);
  expect(countIsolatedChanges(a, a, b, null, 60, 24)).toBe(0);
  expect(countIsolatedChanges(a, b, Uint8Array.of(0, 80, 0, 255), null, 60, 24)).toBe(0);
});

test("le masque retient seulement les pixels de la bande", () => {
  const a = new Uint8Array(12);
  const b = new Uint8Array(12).fill(255);
  const indices = [];
  expect(countIsolatedChanges(a, b, a, Uint8Array.of(1, 0, 1), 60, 24, indices)).toBe(2);
  expect(indices).toEqual([0, 2]);
});

test("la bande d’un segment oblique suit son tracé et ses extrémités", () => {
  const segments = [{ ax: 0.5, ay: 1.5, bx: 2.5, by: 3.5 }];
  const mask = new Uint8Array(20).fill(1);
  expect(outlineMask(segments, 4, 5, 0.8, mask)).toBe(mask);
  expect([...mask]).toEqual([
    0, 0, 0, 0,
    1, 1, 0, 0,
    1, 1, 1, 0,
    0, 1, 1, 0,
    0, 0, 0, 0,
  ]);
});

test("la sonde attribue chaque pixel au bord le plus proche de l’image du milieu", () => {
  const buffers = new Set();
  let frame = 0;
  const engine = {
    getRenderWidth: () => 10,
    getRenderHeight: () => 10,
    readPixels(x, y, w, h, alpha, flush, buffer) {
      buffers.add(buffer);
      buffer.fill(0);
      if (frame === 1) {
        buffer[(2 * w + 4) * 4 + 3] = 255; // bord bas
        buffer[(5 * w + 7) * 4] = 255;     // bord droit
      }
      frame++;
    },
  };
  const projection = Matrix.PerspectiveFovLH(Math.PI / 2, 1, 0.1, 10);
  const outside = Matrix.Translation(2, 0, 0);
  let view = outside;
  const camera = {
    viewport: { x: 0, y: 0, width: 1, height: 1 },
    getViewMatrix: () => view, getProjectionMatrix: () => projection,
  };
  function opening(name, x, y, z) {
    return { name, origin: { x, y, z }, width: 1, height: 1, yaw: 0 };
  }
  const portals = [opening("derrière", 0, -0.5, -1), opening("voisine", 0.04, -0.46, 1), opening("A", 0, -0.5, 1)];
  const probe = createFlickerProbe(engine, camera, portals, { portals: portals.map((p) => p.name), band: 0.4 });
  for (const matrix of [outside, Matrix.IdentityReadOnly, outside, outside]) {
    view = matrix;
    probe.capture();
  }
  expect(buffers.size).toBe(3);
  expect(probe.report()).toEqual({ frames: 4, spikes: 2, maxPerFrame: 2, perFrame: [2, 0], byPortal: {
    derrière: { bottom: 0, right: 0, top: 0, left: 0 },
    voisine: { bottom: 0, right: 0, top: 0, left: 0 },
    A: { bottom: 1, right: 1, top: 0, left: 0 },
  } });
});
