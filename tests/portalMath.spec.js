import { expect, test } from "@playwright/test";
import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import { Matrix, Quaternion, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import { createViewResult, traceView } from "../src/portals/cameraPath.js";
import { PortalLayers } from "../src/portals/layers.js";
import { straddlingPortal, straddlingPortals } from "../src/portals/travelers.js";
import {
  apertureCorners, aperturePyramidPlanes, applyObliqueNearPlane, composeWarps, createWarp,
  discardPlane, distanceToAperture, hasWarpRotation, identityWarp, insideAperture, intersectRects, portalBasis,
  portalPlane, projectAperture, rayCrossing, secondaryGhostClipPlane, segmentCrossing,
  shadowPortalCrossing, shadowPrismPlanes, signedDistance, toLocal, warpPlane,
} from "../src/portals/math.js";

const portal = Object.freeze({ origin: Vector3.Zero(), yaw: 0, width: 4, height: 3 });

function expectVector(actual, expected, tolerance = 1e-9) {
  expect(Vector3.Distance(actual, expected), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(tolerance);
}

function opening(x, z, yaw, width = 4) {
  return { origin: new Vector3(x, 0, z), yaw, width, height: width, sides: "both", ...portalBasis(yaw) };
}

function link(a, b) {
  a.target = b;
  b.target = a;
  a.warp = createWarp(a, b);
  b.warp = a.warp.inverse();
}

test("le chemin de vue rencontre le terrain dans l’espace de chaque segment tourné et redimensionné", () => {
  const a = opening(0, 0, 0);
  const b = opening(20, 0, Math.PI / 2, 2);
  const c = opening(21, 0, -Math.PI / 2, 2);
  const d = opening(-10, 7, Math.PI, 6);
  link(a, b);
  link(c, d);
  const portals = [c, d, b, a];
  const origin = new Vector3(0, 1, 2);
  const dir = new Vector3(0, 0, -1);
  const out = createViewResult();
  const segments = [];
  const options = { clearance: 0.2, collide(from, to) {
    segments.push([from.clone(), to.clone()]);
    return segments.length === 3 ? 1.5 : null;
  } };
  expect(traceView(portals, origin, dir, 6, options, out)).toBe(out);
  expect(segments).toHaveLength(3);
  expectVector(segments[0][1], new Vector3(0, 1, 0));
  expectVector(segments[1][0], new Vector3(20, 0.5, 0));
  expectVector(segments[1][1], new Vector3(21, 0.5, 0));
  expectVector(segments[2][0], new Vector3(-10, 1.5, 7));
  expectVector(segments[2][1], new Vector3(-10, 1.5, 4));
  expect(out.crossed).toBe(2);
  expect(out.warp.scale).toBe(1.5);
  expect(out.allowed).toBeCloseTo(4.8, 10);
  expectVector(out.position, new Vector3(-10, 1.5, 5.8));
  expectVector(out.target, c.warp.point(a.warp.point(origin)));
  const composite = out.warp;
  traceView(portals, origin, dir, 6, {}, out);
  expect(out.warp).toBe(composite);
  expectVector(out.position, segments[2][1]);

  for (const [collide, allowed] of [[() => 1, 0.8], [(from) => from.x > 19 ? 0.02 : null, 1.84]]) {
    traceView(portals, origin, dir, 6, { clearance: 0.2, collide }, out);
    expect(out.crossed).toBe(0);
    expect(out.allowed).toBeCloseTo(allowed, 10);
    expectVector(out.position, new Vector3(0, 1, 2 - allowed));
  }
  const nextOrigin = out.position.clone();
  traceView(portals, out.position, dir, 1, {}, out);
  expectVector(out.target, a.warp.point(nextOrigin));
});

test("la garde retient l’œil en amont sur les deux faces et suit l’échelle à la sortie", () => {
  const a = opening(0, 0, 0);
  const b = opening(20, 0, Math.PI, 2);
  link(a, b);
  const portals = [a, b];
  for (const side of [1, -1]) {
    const origin = new Vector3(-0.8, 1, side * 0.6);
    const dir = new Vector3(0.8, 0, -side * 0.6);
    for (const length of [0.99, 1, 1.01]) {
      const view = traceView(portals, origin, dir, length, { epsilon: 0.02 });
      expect(view.crossed).toBe(0);
      expect(view.position.z).toBeCloseTo(side * 0.02, 10);
      expect(view.allowed).toBeCloseTo(1 - 0.02 / 0.6, 10);
    }
    const view = traceView(portals, origin, dir, 1.05, { epsilon: 0.02 });
    expect(view.crossed).toBe(1);
    expect(view.nearestPortalDistance).toBeCloseTo(0.015, 10);
  }
  a.sides = "front";
  const back = traceView(portals, new Vector3(0, 1, -1), Vector3.Forward(), 2);
  expect(back.crossed).toBe(0);
  expectVector(back.position, new Vector3(0, 1, 1));
  const tangent = traceView(portals, new Vector3(0, 1, 0), Vector3.Right(), 0.5);
  expect(tangent.nearestPortalDistance).toBeCloseTo(0.01, 10);
});

test("une chaîne cyclique arrête l’œil avant un cinquième portail", () => {
  const a = opening(0, 1, Math.PI);
  const b = opening(0, -1, 0);
  link(a, b);
  const view = traceView([a, b], new Vector3(0, 1, 0), Vector3.Forward(), 12);
  expect(view.crossed).toBe(4);
  expect(view.allowed).toBeCloseTo(8.99, 10);
  expectVector(view.position, new Vector3(0, 1, 0.99));
  expectVector(view.target, new Vector3(0, 1, -8));
});

test("les trois calques de portail sont figés", () => {
  expect(PortalLayers).toEqual({ world: 1, late: 2, internal: 4 });
  expect(Object.isFrozen(PortalLayers)).toBe(true);
});

test("le repère, les coordonnées locales et la distance signée suivent le lacet", () => {
  const origin = new Vector3(6, -2, 8);
  const point = origin.add(new Vector3(2, 3, -4));
  for (const [yaw, right, normal, local] of [
    [0, new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(2, 3, -4)],
    [Math.PI / 2, new Vector3(0, 0, -1), new Vector3(1, 0, 0), new Vector3(4, 3, 2)],
    [Math.PI, new Vector3(-1, 0, 0), new Vector3(0, 0, -1), new Vector3(-2, 3, 4)],
  ]) {
    const opening = { ...portal, origin, yaw };
    const basis = portalBasis(yaw);
    expectVector(basis.right, right);
    expectVector(basis.up, Vector3.Up());
    expectVector(basis.normal, normal);
    const out = point.clone();
    expect(toLocal(opening, out, out)).toBe(out);
    expectVector(out, local);
    expect(signedDistance(opening, point)).toBeCloseTo(local.z, 9);
  }
});

test("la marge étend les quatre bords de l’ouverture autour du centre du bas", () => {
  const opening = { ...portal, origin: new Vector3(3, -2, 5), yaw: Math.PI / 2 };
  const corners = apertureCorners(opening);
  const first = corners[0];
  expect(apertureCorners(opening, 0.5, corners)).toBe(corners);
  expect(corners[0]).toBe(first);
  expectVector(corners[0], new Vector3(3, -2.5, 7.5));
  expectVector(corners[1], new Vector3(3, -2.5, 2.5));
  expectVector(corners[2], new Vector3(3, 1.5, 2.5));
  expectVector(corners[3], new Vector3(3, 1.5, 7.5));
  expect(insideAperture(opening, new Vector3(-2.5, -0.5, 4), 0.5)).toBe(true);
  expect(insideAperture(opening, new Vector3(2.5, 3.5, -4), 0.5)).toBe(true);
  expect(insideAperture(opening, new Vector3(2.51, 1, 0), 0.5)).toBe(false);
  expect(insideAperture(opening, new Vector3(0, -0.51, 0), 0.5)).toBe(false);
  expect(insideAperture(opening, new Vector3(0, 3.51, 0), 0.5)).toBe(false);
});

test("un lien translatif conserve la direction et échange les côtés des ouvertures", () => {
  const a = { ...portal, origin: new Vector3(1, 2, 3), yaw: Math.PI / 2 };
  const b = { ...portal, origin: new Vector3(9, -1, 7), yaw: a.yaw - Math.PI };
  const warp = createWarp(a, b);
  const point = new Vector3(3, 3, 2.25);
  expect(warp.rotationY).toBeCloseTo(0, 9);
  expectVector(warp.translation, new Vector3(8, -3, 4));
  expectVector(warp.point(point), new Vector3(11, 0, 6.25));
  expect(signedDistance(a, point)).toBeCloseTo(2, 9);
  expect(signedDistance(b, warp.point(point))).toBeCloseTo(-2, 9);
  expectVector(warp.direction(point), point);

  const onA = new Vector3(1, 3, 2);
  expectVector(toLocal(a, onA), new Vector3(1, 1, 0));
  expectVector(toLocal(b, warp.point(onA)), new Vector3(-1, 1, 0));
});

test("un warp réduit de moitié et tourne le point, la vitesse, le lacet et l’orientation", () => {
  const a = { ...portal, origin: new Vector3(3, -2, 5), yaw: Math.PI };
  const b = { origin: new Vector3(-7, 4, 1), yaw: Math.PI / 4, width: 2, height: 1.5 };
  const warp = createWarp(a, b);
  const offset = new Vector3(2, 4, -6);
  const point = a.origin.add(offset);
  const expectedOffset = new Vector3(-2 * Math.SQRT1_2, 2, -4 * Math.SQRT1_2);
  const out = point.clone();
  expect(warp.scale).toBe(0.5);
  expect(warp.rotationY).toBeCloseTo(Math.PI / 4, 9);
  expect(warp.yaw(Math.PI)).toBeCloseTo(5 * Math.PI / 4, 9);
  expect(warp.point(out, out)).toBe(out);
  expectVector(out, b.origin.add(expectedOffset));
  expectVector(Vector3.TransformCoordinates(point, warp.matrix), out, 1e-6);
  expect(warp.direction(offset, out)).toBe(out);
  expectVector(out, expectedOffset);
  expectVector(Vector3.TransformNormal(offset, warp.matrix), out, 1e-6);

  const orientation = Quaternion.RotationYawPitchRoll(0.35, -0.42, 0.71);
  const forward = new Vector3(0, 0, 1);
  const facing = forward.rotateByQuaternionToRef(orientation, new Vector3());
  expect(warp.quaternion(orientation, orientation)).toBe(orientation);
  expectVector(forward.rotateByQuaternionToRef(orientation, out), warp.direction(facing).scale(1 / warp.scale), 1e-6);

  const inverse = warp.inverse();
  expect(warp.inverse()).toBe(inverse);
  expect(inverse.inverse()).toBe(warp);
  expectVector(inverse.point(warp.point(point)), point);
  expectVector(inverse.direction(warp.direction(offset)), offset);
  expectVector(createWarp(b, a).point(warp.point(point)), point);
  const roundTrip = composeWarps(warp, inverse);
  expect(roundTrip.rotationY).toBeCloseTo(0, 9);
  expect(roundTrip.scale).toBeCloseTo(1, 9);
  expectVector(roundTrip.translation, Vector3.Zero());
  expectVector(roundTrip.point(point), point);
});

test("la composition applique le premier warp puis le second et admet un élément neutre", () => {
  const first = createWarp(portal, { ...portal, origin: new Vector3(2, -1, 4), yaw: -Math.PI });
  const second = createWarp(portal, { origin: new Vector3(-3, 1, 2), yaw: 0.7, width: 8, height: 6 });
  const point = new Vector3(2, 5, -1);
  const composed = composeWarps(first, second);
  expectVector(composed.point(point), second.point(first.point(point)));
  expectVector(composed.direction(point), second.direction(first.direction(point)));
  expectVector(composed.inverse().point(composed.point(point)), point);
  expect(Object.isFrozen(identityWarp)).toBe(true);
  expectVector(identityWarp.point(point), point);
  expectVector(composeWarps(identityWarp, first).point(point), first.point(point));
  expectVector(composeWarps(second, identityWarp).point(point), second.point(point));
  expect(createWarp({ ...portal, yaw: 2 * Math.PI }, portal).rotationY).toBe(Math.PI);
  expect(second.rotationY).toBeCloseTo(0.7 - Math.PI, 9);
});

test("le rapport des hauteurs doit suivre celui des largeurs à la tolérance relative près", () => {
  expect(() => createWarp(portal, { ...portal, width: 2 })).toThrow(/homothétiques/);
  expect(() => createWarp(portal, { ...portal, width: 40, height: 30.000015 })).not.toThrow();
  expect(() => createWarp(portal, { ...portal, width: 40, height: 30.000045 })).toThrow();
});

test("hasWarpRotation détecte une rotation hors tolérance modulo 2π", () => {
  expect(hasWarpRotation(identityWarp)).toBe(false);
  for (const [yawA, yawB, widthB] of [
    [0, -Math.PI, 4],
    [0, Math.PI, 4],
    [Math.PI / 2, -Math.PI / 2, 2],
    [Math.PI / 2, 3 * Math.PI / 2, 4],
    [0.7, 0.7 - Math.PI + 5e-7, 4],
    [0.7, 0.7 - Math.PI - 5e-7, 4],
    [0.7, 0.7 + Math.PI - 5e-7, 4],
    [-4 * Math.PI + 0.3, 6 * Math.PI + 0.3 - Math.PI, 2],
  ]) {
    const a = { ...portal, yaw: yawA };
    const b = { ...portal, yaw: yawB, width: widthB, height: portal.height * (widthB / portal.width) };
    const warp = createWarp(a, b);
    expect(hasWarpRotation(warp)).toBe(false);
    expect(hasWarpRotation(warp.inverse())).toBe(false);
  }
  for (const [yawA, yawB] of [
    [0, 0],
    [0, Math.PI / 2],
    [0.7, 0.7 - Math.PI + 2e-6],
    [0.7, 0.7 + Math.PI - 2e-6],
    [-Math.PI / 2, Math.PI / 4],
  ]) {
    const warp = createWarp({ ...portal, yaw: yawA }, { ...portal, yaw: yawB });
    expect(hasWarpRotation(warp)).toBe(true);
    expect(hasWarpRotation(warp.inverse())).toBe(true);
  }
  expect(hasWarpRotation({ rotationY: 4 * Math.PI + 5e-7 })).toBe(false);
  expect(hasWarpRotation({ rotationY: -2 * Math.PI + 2e-6 })).toBe(true);
  expect(hasWarpRotation({ rotationY: 1e-4 }, 1e-3)).toBe(false);
  expect(hasWarpRotation({ rotationY: 1e-4 }, 1e-5)).toBe(true);
});

test("le segment traverse une face autorisée au premier contact dans l’ouverture", () => {
  const a = new Vector3(-1, 0.5, 3);
  const b = new Vector3(1, 2.5, -1);
  const both = { ...portal, sides: "both" };
  const front = segmentCrossing(portal, a, b);
  const back = segmentCrossing(both, b, a);
  expect(front.t).toBe(0.75);
  expect(front.side).toBe("front");
  expectVector(front.point, new Vector3(0.5, 2, 0));
  expect(back.t).toBe(0.25);
  expect(back.side).toBe("back");
  expectVector(back.point, front.point);
  expect(segmentCrossing(portal, b, a)).toBeNull();
  expect(segmentCrossing({ ...portal, sides: "front" }, b, a)).toBeNull();
  expect(segmentCrossing(portal, a, new Vector3(5, 2, -1))).toBeNull();
  expect(segmentCrossing(portal, a, new Vector3(1, 2, a.z))).toBeNull();
  const edge = new Vector3(2, 3, 0);
  expect(segmentCrossing(portal, a, edge).t).toBe(1);
  expect(segmentCrossing(both, edge, b)).toBeNull();
});

test("le rayon tient compte de sa portée, de la face et des bords de l’ouverture", () => {
  const origin = new Vector3(-1, 1, 4);
  const dir = new Vector3(0.6, 0, -0.8);
  const front = rayCrossing(portal, origin, dir, 5);
  expect(front.distance).toBe(5);
  expect(front.side).toBe("front");
  expectVector(front.point, new Vector3(2, 1, 0));
  expect(rayCrossing(portal, origin, dir, 4.99)).toBeNull();
  expect(rayCrossing(portal, origin, Vector3.Up(), Infinity)).toBeNull();
  expect(rayCrossing(portal, origin, dir.negate(), 10)).toBeNull();
  expect(rayCrossing(portal, new Vector3(0, 1, 4), dir, 5)).toBeNull();
  const behind = new Vector3(0, 2, -4);
  const forward = new Vector3(0, 0, 1);
  expect(rayCrossing(portal, behind, forward, 4)).toBeNull();
  const back = rayCrossing({ ...portal, sides: "both" }, behind, forward, Infinity);
  expect(back.distance).toBe(4);
  expect(back.side).toBe("back");
  expectVector(back.point, new Vector3(0, 2, 0));
  expectVector(front.point, new Vector3(2, 1, 0));
});

test("la distance à l’ouverture atteint la face, une arête ou un coin", () => {
  const opening = { ...portal, origin: new Vector3(3, 1, -2), yaw: Math.PI / 2 };
  expect(distanceToAperture(opening, opening.origin)).toBe(0);
  expect(distanceToAperture(opening, new Vector3(5, 2, -2))).toBeCloseTo(2, 9);
  expect(distanceToAperture(opening, new Vector3(3, 0, -2))).toBeCloseTo(1, 9);
  expect(distanceToAperture(opening, new Vector3(15, 8, -7))).toBeCloseTo(13, 9);
});

test("le plan de matériau rejette les distances positives du côté demandé", () => {
  const opening = { ...portal, origin: new Vector3(5, 1, -4), yaw: -Math.PI / 4 };
  const offset = new Vector3(-Math.SQRT1_2, 0, Math.SQRT1_2).scale(3);
  const front = opening.origin.add(offset);
  const back = opening.origin.subtract(offset);
  expect(portalPlane(opening).dotCoordinate(front)).toBeCloseTo(3, 9);
  for (const side of [1, -1]) {
    const clip = discardPlane(opening, side);
    expect(portalPlane(opening, side).dotCoordinate(back)).toBeCloseTo(-side * 3, 9);
    expect(clip.dotCoordinate(opening.origin)).toBeCloseTo(0, 9);
    expect(clip.dotCoordinate(side === 1 ? front : back)).toBeGreaterThan(0);
    expect(clip.dotCoordinate(side === 1 ? back : front)).toBeLessThan(0);
  }
});

test("le plan proche d’origine reproduit les seize coefficients de la projection WebGL", () => {
  const projection = Matrix.PerspectiveFovLH(0.82, 16 / 9, 0.04, 500);
  const out = Matrix.Identity();
  const flag = out.updateFlag;
  expect(applyObliqueNearPlane(projection, Matrix.Identity(), new Vector3(0, 0, 1), new Vector3(0, 0, 0.04), out)).toBe(out);
  expect(out.updateFlag).not.toBe(flag);
  expect(out.isIdentity()).toBe(false);
  for (let i = 0; i < 16; i++) {
    expect(Math.abs(out.m[i] - projection.m[i])).toBeLessThanOrEqual(1e-9);
  }
});

test("une vue tournée et translatée coupe sur le plan incliné et conserve le coin lointain opposé", () => {
  const eye = new Vector3(4, 3, -6);
  const point = new Vector3(1, 2, 3);
  const view = Matrix.LookAtLH(eye, point, Vector3.Up());
  const normal = new Vector3(-0.6, 0.3, 1).normalize();
  const projection = Matrix.PerspectiveFovLH(0.82, 16 / 9, 0.04, 500);
  const oblique = projection.clone();
  expect(applyObliqueNearPlane(oblique, view, normal, point, oblique)).toBe(oblique);
  const viewProjection = view.multiply(oblique);
  const onPlane = point.add(new Vector3(1, 0, 0.6));
  const on = Vector4.TransformCoordinates(onPlane, viewProjection);
  const kept = Vector4.TransformCoordinates(point.add(normal), viewProjection);
  const cut = Vector4.TransformCoordinates(Vector3.Lerp(eye, point, 0.5), viewProjection);
  expect(Math.abs(on.z / on.w + 1)).toBeLessThanOrEqual(1e-6);
  expect(kept.z / kept.w).toBeGreaterThan(-1);
  expect(cut.z).toBeLessThan(-cut.w);
  const far = Vector3.TransformCoordinates(new Vector3(-1, 1, 1), Matrix.Invert(projection));
  expect(Vector3.TransformCoordinates(far, oblique).z).toBeCloseTo(1, 6);
});

test("un plan derrière l’œil ou au-delà du frustum ne donne pas de projection oblique", () => {
  const projection = Matrix.PerspectiveFovLH(0.82, 16 / 9, 0.04, 500);
  const view = Matrix.Identity();
  const normal = new Vector3(0, 0, 1);
  expect(applyObliqueNearPlane(projection, view, normal, new Vector3(0, 0, -2))).toBeNull();
  expect(applyObliqueNearPlane(projection, view, normal, new Vector3(0, 0, 600))).toBeNull();
});

test("le rectangle écran englobe l’ouverture en pixels à partir du bas gauche", () => {
  const projection = Matrix.PerspectiveFovLH(Math.PI / 2, 2, 1, 9);
  const opening = { ...portal, origin: new Vector3(0.125, -0.75, 4), width: 2, height: 2 };
  expect(projectAperture(opening, projection, 200, 100)).toEqual({ x: 89, y: 40, width: 26, height: 26 });
  expect(projectAperture(opening, projection, 200, 100, 0.25)).toEqual({ x: 85, y: 37, width: 33, height: 32 });
  const rect = {};
  expect(projectAperture(opening, projection, 200, 100, 0.25, rect)).toBe(rect);
  for (const origin of [new Vector3(100, 0, 4), new Vector3(0, 0, 0.5), new Vector3(0, 0, -2)]) {
    expect(projectAperture({ ...opening, origin }, projection, 200, 100)).toBeNull();
  }
});

test("une ouverture à cheval sur l’œil est découpée en homogène puis bornée à l’écran", () => {
  for (const [unit, near] of [[1, 1], [1e-6, 1e-8]]) {
    const projection = Matrix.PerspectiveFovLH(Math.PI / 2, 1, near, 9);
    const opening = {
      origin: new Vector3(0.4, -1.3, 0.75).scale(unit), yaw: Math.PI / 4,
      width: 2 * Math.SQRT2 * unit, height: 1.57 * unit,
    };
    // À z = unit, le bord découpé a x/z = 0,15. L’autre bord visible a x/z = −0,6/1,75.
    expect(projectAperture(opening, projection, 100, 100)).toEqual({ x: 32, y: 0, width: 26, height: 64 });
  }
  const tiny = { ...portal, origin: new Vector3(0, 0, 1e-6), width: 1e-6, height: 1e-6 };
  expect(projectAperture(tiny, Matrix.PerspectiveFovLH(Math.PI / 2, 1, 1e-8, 1), 100, 100)).toBeNull();
});

test("le rectangle écran suit aussi le plan proche oblique", () => {
  const projection = Matrix.PerspectiveFovLH(Math.PI / 2, 1, 1, 9);
  const oblique = applyObliqueNearPlane(projection, Matrix.Identity(), new Vector3(1, 0, 1), new Vector3(0.25, 0, 2));
  const opening = { ...portal, origin: new Vector3(0.1, -0.25, 2), width: 2, height: 1 };
  expect(projectAperture(opening, oblique, 100, 100)).toEqual({ x: 56, y: 43, width: 22, height: 26 });
});

test("l’intersection des rectangles exige un pixel dans chaque dimension", () => {
  const a = { x: 2, y: 3, width: 8, height: 7 };
  const b = { x: 9, y: 5, width: 4, height: 7 };
  expect(intersectRects(a, { ...b, x: 9.5 })).toBeNull();
  expect(intersectRects(a, { ...b, y: 10 })).toBeNull();
  expect(intersectRects(a, b, b)).toBe(b);
  expect(b).toEqual({ x: 9, y: 5, width: 1, height: 5 });
});

test("les quatre plans de culling englobent les rayons passant dans l’ouverture depuis les deux faces", () => {
  const opening = { ...portal, origin: new Vector3(3, 1, 5), yaw: Math.PI / 2 };
  const corners = apertureCorners(opening, 0.25);
  const planes = aperturePyramidPlanes(opening, new Vector3(6, 2, 7.5));
  for (const x of [6, 0]) {
    const eye = new Vector3(x, 2, 7.5);
    expect(aperturePyramidPlanes(opening, eye, 0.25, planes)).toBe(planes);
    for (let i = 0; i < 4; i++) {
      expect(planes[i].dotCoordinate(eye)).toBeCloseTo(0, 9);
      expect(planes[i].dotCoordinate(corners[i])).toBeCloseTo(0, 9);
      expect(planes[i].dotCoordinate(corners[(i + 1) % 4])).toBeCloseTo(0, 9);
      expect(planes[i].normal.length()).toBeCloseTo(1, 9);
    }
    const through = (point) => point.scale(2).subtract(eye);
    const inside = through(new Vector3(3, 2.5, 7.125));
    expect(planes.every((plane) => plane.dotCoordinate(inside) > 0)).toBe(true);
    for (const outside of [new Vector3(3, 2.5, 8), new Vector3(3, 2.5, 2), new Vector3(3, 0, 5), new Vector3(3, 5, 5)]) {
      expect(planes.some((plane) => plane.dotCoordinate(through(outside)) < 0)).toBe(true);
    }
  }
});

test("la détection d’ombre portée respecte la direction du soleil, les faces et la portée au sol", () => {
  const a = opening(0, 31, Math.PI, 2.4);
  a.height = 3;
  const b = opening(-30, -32, 0, 2.4);
  b.height = 3;
  link(a, b);
  const sun = new Vector3(-0.58, -1, 0.48).normalize();
  const radius = Math.sqrt(3) / 2;
  const out = {};

  // Caisse devant A : franchissement par l’avant, distance positive le long du soleil.
  const hitA = shadowPortalCrossing(a, new Vector3(0.35, 0.5, 30.45), radius, sun, out);
  expect(hitA).toBe(out);
  expect(hitA.side).toBe(1);
  expect(hitA.distance).toBeCloseTo(0.55 / sun.z, 9);

  // Trop loin devant A ou hors de l’ouverture latéralement.
  expect(shadowPortalCrossing(a, new Vector3(0.35, 0.5, 28.8), radius, sun)).toBeNull();
  expect(shadowPortalCrossing(a, new Vector3(4, 0.5, 30.45), radius, sun)).toBeNull();

  // Derrière B (portail double face) : franchissement par l’arrière autorisé.
  const hitB = shadowPortalCrossing(b, new Vector3(-29.65, 0.5, -32.55), radius, sun);
  expect(hitB.side).toBe(-1);
  expect(hitB.distance).toBeCloseTo(0.55 / sun.z, 9);

  // Portail à sens unique : l’arrière est refusé, l’avant est accepté seulement si le soleil y entre.
  const oneWay = { ...b, sides: "front" };
  expect(shadowPortalCrossing(oneWay, new Vector3(-29.65, 0.5, -32.55), radius, sun)).toBeNull();
  expect(shadowPortalCrossing(oneWay, new Vector3(-29.65, 0.5, -31.45), radius, sun)).toBeNull();
  const oneWayIn = { ...a, sides: "front" };
  expect(shadowPortalCrossing(oneWayIn, new Vector3(0.35, 0.5, 30.45), radius, sun).side).toBe(1);

  // Chevauchement côté sortie juste après warp : sideOverride écarte le faux franchissement arrière.
  expect(shadowPortalCrossing(b, new Vector3(-29.65, 0.5, -32.02), radius, sun, out, 1)).toBeNull();

  // Lien qui tourne de 180° (même normale) : le soleil ne sort pas du côté récepteur de la cible.
  const flipped = opening(-30, -32, Math.PI, 2.4);
  flipped.height = 3;
  const rotatedA = { ...a, target: flipped };
  expect(shadowPortalCrossing(rotatedA, new Vector3(0.35, 0.5, 30.45), radius, sun)).toBeNull();

  // Soleil montant ou parallèle au plan : aucun projecteur.
  expect(shadowPortalCrossing(a, new Vector3(0.35, 0.5, 30.45), radius, new Vector3(0, 1, 0))).toBeNull();
  expect(shadowPortalCrossing(a, new Vector3(0.35, 0.5, 30.45), radius, new Vector3(-1, -1, 0).normalize())).toBeNull();
});

test("les quatre plans du prisme lumineux rejettent l’extérieur selon la convention clipPlane de Babylon", () => {
  const b = { origin: new Vector3(-30, 0, -32), yaw: 0, width: 2.4, height: 3 };
  const sun = new Vector3(-0.58, -1, 0.48).normalize();
  const margin = 0.03;
  const corners = apertureCorners(b, margin);
  const planes = shadowPrismPlanes(b, sun, margin);
  expect(planes).toHaveLength(4);
  expect(shadowPrismPlanes(b, sun, margin, planes)).toBe(planes);

  for (let i = 0; i < 4; i++) {
    expect(planes[i].normal.length()).toBeCloseTo(1, 9);
    expect(planes[i].dotCoordinate(corners[i])).toBeCloseTo(0, 9);
    expect(planes[i].dotCoordinate(corners[(i + 1) % 4])).toBeCloseTo(0, 9);
    expect(Vector3.Dot(planes[i].normal, sun)).toBeCloseTo(0, 9);
    expect(planes[i].dotCoordinate(corners[(i + 2) % 4])).toBeLessThan(0);
  }

  // Point dans le prisme derrière B : conservé (dot ≤ 0 pour les quatre plans).
  const throughCenter = new Vector3(-30, 1.5, -32).subtract(sun.scale(2));
  expect(planes.every((plane) => plane.dotCoordinate(throughCenter) < 0)).toBe(true);

  // Points hors du prisme (sous le sol, au-dessus du linteau, à gauche ou à droite) : au moins un plan > 0.
  for (const offset of [
    new Vector3(-30, -0.5, -32),
    new Vector3(-30, 3.5, -32),
    new Vector3(-32, 1.5, -32),
    new Vector3(-28, 1.5, -32),
  ]) {
    const sample = offset.subtract(sun.scale(2));
    expect(planes.some((plane) => plane.dotCoordinate(sample) > 0)).toBe(true);
  }

  // Direction parallèle au plan du portail : prisme dégénéré.
  expect(shadowPrismPlanes(b, new Vector3(-1, -1, 0).normalize(), margin)).toBeNull();
});

test("warpPlane transporte un plan quelconque avec rotation, translation et échelle", () => {
  const a = { origin: new Vector3(3, -2, 5), yaw: Math.PI, width: 4, height: 3 };
  const b = { origin: new Vector3(-7, 4, 1), yaw: Math.PI / 4, width: 2, height: 1.5 };
  const warp = createWarp(a, b);
  // Plan incliné non unitaire pour vérifier la normalisation et la conservation du signe.
  const source = new Plane(2, -4, 6, -10);
  const unit = source.clone();
  const invLen = 1 / unit.normal.length();
  unit.normal.scaleInPlace(invLen);
  unit.d *= invLen;

  const out = new Plane(0, 0, 0, 0);
  expect(warpPlane(warp, source, out)).toBe(out);
  expect(out.normal.length()).toBeCloseTo(1, 9);
  for (const p of [
    new Vector3(0, 0, 0),
    new Vector3(4, 1.5, -2),
    new Vector3(-3, 7, 8),
    new Vector3(1, -2, 1),
  ]) {
    expect(out.dotCoordinate(warp.point(p))).toBeCloseTo(warp.scale * unit.dotCoordinate(p), 9);
  }
  // Transformation en place (out === plane).
  const inPlace = source.clone();
  expect(warpPlane(warp, inPlace, inPlace)).toBe(inPlace);
  expectVector(inPlace.normal, out.normal);
  expect(inPlace.d).toBeCloseTo(out.d, 9);
  // Plan dégénéré (normale nulle).
  expect(warpPlane(warp, new Plane(0, 0, 0, 1))).toBeNull();
});

test("secondaryGhostClipPlane rejette la partie engagée dans le second portail en angle, face à face ou côte à côte", () => {
  // 1) Coin à 90° avec rotation et demi-échelle sur la destination.
  const c1 = { origin: new Vector3(39.4, 0, -45), yaw: Math.PI, width: 1.2, height: 2, sides: "both" };
  const c2 = { origin: new Vector3(40.0, 0, -45.6), yaw: -Math.PI / 2, width: 1.2, height: 2, sides: "both" };
  const e1 = { origin: new Vector3(12, 0, -45), yaw: Math.PI / 2, width: 0.6, height: 1, sides: "both" };
  const e2 = { origin: new Vector3(-12, 0, -45), yaw: Math.PI / 4, width: 1.2, height: 2, sides: "both" };
  link(c1, e1);
  link(c2, e2);

  const clip1 = secondaryGhostClipPlane(c1, 1, c2, 1);
  expect(clip1.normal.length()).toBeCloseTo(1, 9);
  // Côté source, (39.7, 0.5, -44.8) a traversé C1 sans traverser C2 ; (40.2, 0.5, -44.8) a aussi traversé C2.
  expect(clip1.dotCoordinate(c1.warp.point(new Vector3(39.7, 0.5, -44.8)))).toBeLessThan(0);
  expect(clip1.dotCoordinate(c1.warp.point(new Vector3(40.2, 0.5, -44.8)))).toBeGreaterThan(0);
  expect(clip1.dotCoordinate(c1.warp.point(new Vector3(40.0, 0.5, -44.8)))).toBeCloseTo(0, 9);

  const clip2 = secondaryGhostClipPlane(c2, 1, c1, 1);
  expect(clip2.dotCoordinate(c2.warp.point(new Vector3(40.2, 0.5, -45.2)))).toBeLessThan(0);
  expect(clip2.dotCoordinate(c2.warp.point(new Vector3(40.2, 0.5, -44.8)))).toBeGreaterThan(0);

  // 2) Portails parallèles face à face (objet entre z = 0 et z = 0.8) : sens de rejet opposés.
  const f1 = { origin: new Vector3(0, 0, 0), yaw: 0, width: 2, height: 2, sides: "both" };
  const f2 = { origin: new Vector3(0, 0, 0.8), yaw: Math.PI, width: 2, height: 2, sides: "both" };
  const fd1 = { origin: new Vector3(20, 0, 0), yaw: Math.PI, width: 2, height: 2, sides: "both" };
  const fd2 = { origin: new Vector3(-20, 0, 0), yaw: 0, width: 2, height: 2, sides: "both" };
  link(f1, fd1);
  link(f2, fd2);
  const clipF1 = secondaryGhostClipPlane(f1, 1, f2, 1);
  expect(clipF1.dotCoordinate(f1.warp.point(new Vector3(0, 1, -0.2)))).toBeLessThan(0);
  expect(clipF1.dotCoordinate(f1.warp.point(new Vector3(0, 1, 1.0)))).toBeGreaterThan(0);

  // 3) Deux portails coplanaires côte à côte (hauteurs différentes) : plan séparateur vertical sur la jonction.
  const s1 = { origin: new Vector3(39.5, 0, -45), yaw: Math.PI, width: 1.0, height: 2.0, sides: "both" };
  const s2 = { origin: new Vector3(40.2, 0, -45), yaw: Math.PI, width: 0.4, height: 0.4, sides: "both" };
  const sd1 = { origin: new Vector3(12, 0, -45), yaw: Math.PI / 2, width: 0.5, height: 1.0, sides: "both" };
  const sd2 = { origin: new Vector3(-12, 0, -45), yaw: 0, width: 0.4, height: 0.4, sides: "both" };
  link(s1, sd1);
  link(s2, sd2);
  const clipS1 = secondaryGhostClipPlane(s1, 1, s2, 1);
  expect(clipS1.dotCoordinate(s1.warp.point(new Vector3(39.7, 0.5, -44.8)))).toBeLessThan(0);
  expect(clipS1.dotCoordinate(s1.warp.point(new Vector3(40.1, 0.5, -44.8)))).toBeGreaterThan(0);
  expect(clipS1.dotCoordinate(s1.warp.point(new Vector3(40.0, 0.5, -44.8)))).toBeCloseTo(0, 9);
  const clipS2 = secondaryGhostClipPlane(s2, 1, s1, 1);
  expect(clipS2.dotCoordinate(s2.warp.point(new Vector3(40.1, 0.2, -44.8)))).toBeLessThan(0);
  expect(clipS2.dotCoordinate(s2.warp.point(new Vector3(39.7, 0.2, -44.8)))).toBeGreaterThan(0);

  // 4) Deux portails coplanaires superposés verticalement : plan séparateur horizontal en y = 1.
  const v1 = { origin: new Vector3(0, 0, 0), yaw: 0, width: 2, height: 1, sides: "both" };
  const v2 = { origin: new Vector3(0, 1, 0), yaw: 0, width: 2, height: 1, sides: "both" };
  const vd1 = { origin: new Vector3(10, 0, 0), yaw: Math.PI, width: 2, height: 1, sides: "both" };
  const vd2 = { origin: new Vector3(-10, 1, 0), yaw: Math.PI, width: 2, height: 1, sides: "both" };
  link(v1, vd1);
  link(v2, vd2);
  const clipV1 = secondaryGhostClipPlane(v1, 1, v2, 1);
  expect(clipV1.dotCoordinate(v1.warp.point(new Vector3(0, 0.5, -0.2)))).toBeLessThan(0);
  expect(clipV1.dotCoordinate(v1.warp.point(new Vector3(0, 1.5, -0.2)))).toBeGreaterThan(0);

  // 5) Deux portails coplanaires confondus : aucun second plan (null → plan neutre).
  const dup = { origin: new Vector3(0, 0, 0), yaw: 0, width: 2, height: 1, sides: "both" };
  expect(secondaryGhostClipPlane(v1, 1, dup, 1)).toBeNull();
});

test("un objet ne chevauche un portail que si son centre est en face de l’ouverture, le second peut être voisin", () => {
  function gate(name, x, z, yaw, width, height) {
    return { name, origin: new Vector3(x, 0, z), yaw, width, height, sides: "both" };
  }
  const names = (list) => list.map((p) => p.name);
  const adapter = {};
  const radius = 1.1;
  // Arche de 2,4 m × 3 m, piliers de 0,46 m ; centre du joueur (capsule de rayon 0,32 m) à 0,9 m du sol.
  const arch = gate("arche", 0, 0, 0, 2.4, 3);
  link(arch, gate("sortie", 0, 40, -Math.PI, 2.4, 3));
  const portals = [arch, arch.target];
  expect(names(straddlingPortals(portals, adapter, new Vector3(0.88, 0.9, 0.1), radius))).toEqual(["arche"]);
  // Collé à la face extérieure d’un pilier, à cheval sur le plan, ou debout sur le linteau : pas de coupe.
  expect(straddlingPortals(portals, adapter, new Vector3(1.2 + 0.46 + 0.32, 0.9, 0), radius)).toEqual([]);
  expect(straddlingPortals(portals, adapter, new Vector3(0, 3.46 + 0.9, 0), radius)).toEqual([]);
  expect(straddlingPortal(portals, adapter, new Vector3(-1.98, 0.9, 0.2), radius)).toBeNull();
  expect(straddlingPortals(portals, adapter, new Vector3(0, 0.9, 1.1), radius)).toEqual([]);
  expect(straddlingPortals(portals, { canTraverse: (p) => p !== arch }, new Vector3(0, 0.9, 0.1), radius)).toEqual([]);

  // Deux ouvertures jointives dans un même plan, sans meneau : celle du centre, puis sa voisine.
  const left = gate("gauche", -1, 0, 0, 2, 2);
  const right = gate("droite", 1, 0, 0, 2, 2);
  link(left, gate("sortie gauche", -20, 30, Math.PI, 2, 2));
  link(right, gate("sortie droite", 20, 30, Math.PI, 2, 2));
  expect(names(straddlingPortals([left, right], adapter, new Vector3(-0.2, 1, 0.1), radius))).toEqual(["gauche", "droite"]);
  expect(names(straddlingPortals([left, right], adapter, new Vector3(0.2, 1, 0.1), radius))).toEqual(["droite", "gauche"]);

  // Une ouverture voisine plus proche du centre ne passe qu’en second, après celle qui lui fait face.
  const facing = gate("en face", 0, 0, 0, 2, 2);
  const beside = gate("voisine", 2.1, 0.45, 0, 2, 2);
  link(facing, gate("sortie en face", -20, -30, Math.PI, 2, 2));
  link(beside, gate("sortie voisine", 20, -30, Math.PI, 2, 2));
  const center = new Vector3(1, 1, 0.5);
  expect(names(straddlingPortals([beside, facing], adapter, center, radius))).toEqual(["en face", "voisine"]);
  expect(straddlingPortal([beside, facing], adapter, center, radius)).toBe(facing);
});
