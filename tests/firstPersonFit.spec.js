import { expect, test } from "@playwright/test";
import { CAMERA } from "../src/config.js";
import { fitFromPoints } from "../src/player/firstPersonFit.js";

// Corps synthétiques faits de boîtes (coins seulement), face vers +Z, pieds à y = 0.
function body(boxes) {
  const points = [];
  for (const [x0, x1, y0, y1, z0, z1] of boxes) {
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) points.push(x, y, z);
    // Remplit la hauteur : une boîte haute ne doit pas laisser de tranche vide.
    for (let y = y0; y < y1; y += 0.01) points.push(x0, y, z0, x1, y, z1);
  }
  return points;
}

const legs = [-0.15, 0.15, 0, 0.9, -0.1, 0.1];
const torso = [-0.25, 0.25, 0.9, 1.55, -0.12, 0.15];

test("le cou d’un humanoïde est sous la tête, l’œil entre le cou et le sommet du crâne", () => {
  const fit = fitFromPoints(body([
    legs, torso,
    [-0.04, 0.04, 1.55, 1.62, -0.04, 0.04], // cou
    [-0.11, 0.11, 1.62, 1.85, -0.11, 0.12], // tête
    [-0.05, 0.05, 1.88, 1.92, -0.05, 0.05], // crâne arrondi, séparé du reste
  ]));
  expect(fit.headCutHeight).toBeGreaterThan(1.53);
  expect(fit.headCutHeight).toBeLessThan(1.64);
  expect(fit.eyeHeight).toBeCloseTo((fit.headCutHeight + 1.92) / 2, 5);
  // Avant du torse, plus l’évasement du champ de vision entre l’œil et la coupe.
  const spread = Math.tan(CAMERA.fov / 2) * (fit.eyeHeight - fit.headCutHeight);
  expect(fit.eyeForward).toBeCloseTo(0.15 + spread, 5);
});

test("sans cou et avec de grandes oreilles, la coupe reste au ras des épaules, pas dans le visage", () => {
  const fit = fitFromPoints(body([
    legs, torso,
    [-0.17, 0.17, 1.55, 1.92, -0.16, 0.2], // tête posée sur les épaules
    [-0.26, 0.26, 1.78, 1.86, -0.03, 0.03], // oreilles
  ]));
  expect(fit.headCutHeight).toBeGreaterThan(1.5);
  expect(fit.headCutHeight).toBeLessThan(1.6);
});

test("un nuage vide donne des réglages nuls", () => {
  expect(fitFromPoints([])).toEqual({ eyeHeight: 0, eyeForward: 0, headCutHeight: 0 });
});
