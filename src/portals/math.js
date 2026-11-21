import { Plane } from "@babylonjs/core/Maths/math.plane.js";
import { Matrix, Quaternion, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";

const fullTurn = 2 * Math.PI;
const minClipW = 1e-6;
const localPoint = new Vector3();

export function portalBasis(yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    right: new Vector3(cos, 0, -sin),
    up: Vector3.Up(),
    normal: new Vector3(sin, 0, cos),
  };
}

// La base d’un portail (portalBasis) contient déjà cos et sin du lacet : ces fonctions, appelées
// pour chaque voyageur et chaque portail à chaque image, évitent ainsi de les recalculer.
export function toLocal(portal, p, out = new Vector3()) {
  const x = p.x - portal.origin.x;
  const z = p.z - portal.origin.z;
  const { right, normal } = portal;
  if (right && normal) return out.set(right.x * x + right.z * z, p.y - portal.origin.y, normal.x * x + normal.z * z);
  const cos = Math.cos(portal.yaw);
  const sin = Math.sin(portal.yaw);
  return out.set(cos * x - sin * z, p.y - portal.origin.y, sin * x + cos * z);
}

export function signedDistance(portal, p) {
  const normal = portal.normal;
  if (normal) return normal.x * (p.x - portal.origin.x) + normal.z * (p.z - portal.origin.z);
  return Math.sin(portal.yaw) * (p.x - portal.origin.x) + Math.cos(portal.yaw) * (p.z - portal.origin.z);
}

export function insideAperture(portal, local, margin = 0) {
  return Math.abs(local.x) <= portal.width / 2 + margin && local.y >= -margin && local.y <= portal.height + margin;
}

function createCorners() {
  return [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
}

export function apertureCorners(portal, margin = 0, out = createCorners()) {
  const { origin, yaw, width, height } = portal;
  const halfWidth = width / 2 + margin;
  const dx = Math.cos(yaw) * halfWidth;
  const dz = -Math.sin(yaw) * halfWidth;
  const bottom = origin.y - margin;
  const top = origin.y + height + margin;
  out[0].set(origin.x - dx, bottom, origin.z - dz);
  out[1].set(origin.x + dx, bottom, origin.z + dz);
  out[2].set(origin.x + dx, top, origin.z + dz);
  out[3].set(origin.x - dx, top, origin.z - dz);
  return out;
}

export function distanceToAperture(portal, p) {
  const { x, y, z } = toLocal(portal, p, localPoint);
  const dx = Math.max(0, Math.abs(x) - portal.width / 2);
  const dy = Math.max(0, -y, y - portal.height);
  return Math.hypot(dx, dy, z);
}

function normalizeYaw(angle) {
  const yaw = angle % fullTurn;
  if (yaw <= -Math.PI) return yaw + fullTurn;
  if (yaw > Math.PI) return yaw - fullTurn;
  return yaw;
}

export function hasWarpRotation(warp, tolerance = 1e-6) {
  return Math.abs(normalizeYaw(warp.rotationY)) > tolerance;
}

export function createWarpBuffer() {
  const translation = new Vector3();
  const matrix = Matrix.Identity();
  const rotation = Quaternion.Identity();
  let scaledCos = 1;
  let scaledSin = 0;
  let inverseWarp = null;

  // Les allers-retours de simulation gardent la précision JS malgré la matrice de rendu en Float32.
  function direction(v, out = new Vector3()) {
    return out.set(scaledCos * v.x + scaledSin * v.z, warp.scale * v.y, scaledCos * v.z - scaledSin * v.x);
  }

  const warp = {
    rotationY: 0, scale: 1, translation, matrix, direction,
    point(p, out = new Vector3()) {
      return direction(p, out).addInPlace(translation);
    },
    yaw(theta) {
      return theta + warp.rotationY;
    },
    quaternion(q, out = new Quaternion()) {
      return rotation.multiplyToRef(q, out);
    },
    inverse() {
      if (warp === identityWarp) return warp;
      inverseWarp ??= createWarpBuffer().set(translation, Vector3.ZeroReadOnly, -warp.rotationY, 1 / warp.scale, warp);
      return inverseWarp;
    },
  };
  function set(fromOrigin, toOrigin, angle, scale, inverse = null) {
    warp.rotationY = normalizeYaw(angle);
    warp.scale = scale;
    scaledCos = scale * Math.cos(warp.rotationY);
    scaledSin = scale * Math.sin(warp.rotationY);
    direction(fromOrigin, translation);
    toOrigin.subtractToRef(translation, translation);
    Quaternion.RotationAxisToRef(Vector3.UpReadOnly, warp.rotationY, rotation);
    Matrix.FromValuesToRef(
      scaledCos, 0, -scaledSin, 0,
      0, scale, 0, 0,
      scaledSin, 0, scaledCos, 0,
      translation.x, translation.y, translation.z, 1, matrix,
    );
    inverseWarp = inverse;
    return warp;
  }
  return { warp, set };
}

export function createWarp(from, to) {
  const scale = to.width / from.width;
  const heightScale = to.height / from.height;
  if (Math.abs(heightScale - scale) > 1e-6 * Math.max(1, scale)) {
    throw new Error("Les ouvertures des portails doivent être homothétiques.");
  }
  return createWarpBuffer().set(from.origin, to.origin, to.yaw + Math.PI - from.yaw, scale);
}

export const identityWarp = Object.freeze(createWarpBuffer().warp);
const composedOrigin = new Vector3();

export function composeWarps(first, second, buffer) {
  if (first === identityWarp) return second;
  if (second === identityWarp) return first;
  second.point(first.translation, composedOrigin);
  return (buffer ?? createWarpBuffer()).set(Vector3.ZeroReadOnly, composedOrigin,
    first.rotationY + second.rotationY, first.scale * second.scale);
}

function crossingSide(portal, startDistance, endDistance) {
  if (startDistance > 0 && endDistance <= 0) return "front";
  if (portal.sides === "both" && startDistance < 0 && endDistance >= 0) return "back";
  return null;
}

const hitPoint = new Vector3();

function pointInAperture(portal, point) {
  return insideAperture(portal, toLocal(portal, point, localPoint));
}

export function segmentCrossing(portal, a, b, out) {
  const start = signedDistance(portal, a);
  const end = signedDistance(portal, b);
  const side = crossingSide(portal, start, end);
  if (!side) return null;
  const t = start / (start - end);
  Vector3.LerpToRef(a, b, t, hitPoint);
  if (!pointInAperture(portal, hitPoint)) return null;
  out ??= { point: new Vector3() };
  out.t = t;
  out.side = side;
  out.point.copyFrom(hitPoint);
  return out;
}

export function rayCrossing(portal, origin, dir, maxDistance, out) {
  const start = signedDistance(portal, origin);
  const speed = Math.sin(portal.yaw) * dir.x + Math.cos(portal.yaw) * dir.z;
  if (speed === 0 || maxDistance <= 0) return null;
  const side = crossingSide(portal, start, start + speed * maxDistance);
  if (!side) return null;
  const distance = -start / speed;
  dir.scaleToRef(distance, hitPoint).addInPlace(origin);
  if (!pointInAperture(portal, hitPoint)) return null;
  out ??= { point: new Vector3() };
  out.distance = distance;
  out.side = side;
  out.point.copyFrom(hitPoint);
  return out;
}

export function portalPlane(portal, side = 1, out = new Plane(0, 0, 0, 0)) {
  const x = side * Math.sin(portal.yaw);
  const z = side * Math.cos(portal.yaw);
  out.normal.set(x, 0, z);
  out.d = -(x * portal.origin.x + z * portal.origin.z);
  return out;
}

export function discardPlane(portal, discardSide, out) {
  return portalPlane(portal, discardSide, out);
}

const warpedPlanePoint = new Vector3();
const otherLocal = new Vector3();
const otherSourcePlane = new Plane(0, 0, 0, 0);

export function warpPlane(warp, plane, out = new Plane(0, 0, 0, 0)) {
  const { normal } = plane;
  const length = normal.length();
  if (length <= 1e-12) return null;
  const invLength = 1 / length;
  const nx = normal.x * invLength;
  const ny = normal.y * invLength;
  const nz = normal.z * invLength;
  const d = plane.d * invLength;
  warpedPlanePoint.set(-d * nx, -d * ny, -d * nz);
  warp.point(warpedPlanePoint, warpedPlanePoint);
  out.normal.set(nx, ny, nz);
  warp.direction(out.normal, out.normal).scaleInPlace(1 / warp.scale);
  out.d = -Vector3.Dot(out.normal, warpedPlanePoint);
  return out;
}

export function secondaryGhostClipPlane(portal, side, other, otherSide, out = new Plane(0, 0, 0, 0)) {
  const nx = -side * Math.sin(portal.yaw);
  const nz = -side * Math.cos(portal.yaw);
  const ox = -otherSide * Math.sin(other.yaw);
  const oz = -otherSide * Math.cos(other.yaw);
  // Portails en angle ou de rejets opposés : image par le warp du plan de rejet de l’autre portail.
  if (nx * ox + nz * oz <= 1 - 1e-4) {
    discardPlane(other, -otherSide, otherSourcePlane);
    return warpPlane(portal.warp, otherSourcePlane, out);
  }
  // Portails parallèles rejetant du même côté (dont côte à côte dans un même plan) :
  // l’image du plan de l’autre portail s’opposerait au plan de destination et masquerait le fantôme.
  // Quand les ouvertures ne se recouvrent pas dans le plan, on transporte le plan de frontière de l’autre portail.
  warpedPlanePoint.set(portal.origin.x, portal.origin.y + portal.height / 2, portal.origin.z);
  toLocal(other, warpedPlanePoint, otherLocal);
  const offsetY = otherLocal.y - other.height / 2;
  const gapX = Math.abs(otherLocal.x) - (portal.width + other.width) / 2;
  const gapY = Math.abs(offsetY) - (portal.height + other.height) / 2;
  if (gapX >= -1e-4 || gapY >= -1e-4) {
    if (gapX >= gapY && Math.abs(otherLocal.x) > 1e-6) {
      const dir = Math.sign(otherLocal.x);
      const rx = Math.cos(other.yaw);
      const rz = -Math.sin(other.yaw);
      const edgeX = other.origin.x + dir * (other.width / 2) * rx;
      const edgeZ = other.origin.z + dir * (other.width / 2) * rz;
      otherSourcePlane.normal.set(-dir * rx, 0, -dir * rz);
      otherSourcePlane.d = -(otherSourcePlane.normal.x * edgeX + otherSourcePlane.normal.z * edgeZ);
      return warpPlane(portal.warp, otherSourcePlane, out);
    }
    if (Math.abs(offsetY) > 1e-6) {
      const dir = Math.sign(offsetY);
      const edgeY = dir > 0 ? other.origin.y + other.height : other.origin.y;
      otherSourcePlane.normal.set(0, -dir, 0);
      otherSourcePlane.d = dir * edgeY;
      return warpPlane(portal.warp, otherSourcePlane, out);
    }
  }
  const offset = nx * (other.origin.x - portal.origin.x) + nz * (other.origin.z - portal.origin.z);
  if (Math.abs(offset) < 1e-4) return null;
  discardPlane(other, -otherSide, otherSourcePlane);
  return warpPlane(portal.warp, otherSourcePlane, out);
}

const viewNormal = new Vector3();
const viewPoint = new Vector3();
const inverseProjection = new Matrix();
const farCorner = new Vector4();

export function applyObliqueNearPlane(projection, view, planeNormal, planePoint, out = new Matrix()) {
  Vector3.TransformNormalToRef(planeNormal, view, viewNormal);
  Vector3.TransformCoordinatesToRef(planePoint, view, viewPoint);
  const { x, y, z } = viewNormal;
  const w = -Vector3.Dot(viewNormal, viewPoint);
  if (w >= 0) return null; // L’œil doit être dans le demi-espace rejeté.

  projection.invertToRef(inverseProjection);
  Vector4.TransformCoordinatesFromFloatsToRef(x < 0 ? -1 : 1, y < 0 ? -1 : 1, 1, inverseProjection, farCorner);
  const dot = x * farCorner.x + y * farCorner.y + z * farCorner.z + w * farCorner.w;
  if (dot <= 1e-8) return null;
  const a = 2 / dot;
  const m = projection.m;
  Matrix.FromValuesToRef(
    m[0], m[1], a * x - m[3], m[3],
    m[4], m[5], a * y - m[7], m[7],
    m[8], m[9], a * z - m[11], m[11],
    m[12], m[13], a * w - m[15], m[15], out,
  );
  return out;
}

const corners = createCorners();
// Chaque demi-espace peut ajouter au plus un sommet au quadrilatère convexe.
const clipVertices = Array.from({ length: 6 }, () => new Vector4());
const clippedVertices = Array.from({ length: 6 }, () => new Vector4());
const distanceToEyePlane = (p) => p.w - minClipW;
const distanceToNearPlane = (p) => p.z + p.w;

function clipPolygon(input, count, output, distanceToPlane) {
  let written = 0;
  let previous = input[count - 1];
  let previousDistance = distanceToPlane(previous);
  for (let i = 0; i < count; i++) {
    const current = input[i];
    const distance = distanceToPlane(current);
    if ((previousDistance < 0 && distance > 0) || (previousDistance > 0 && distance < 0)) {
      const t = previousDistance / (previousDistance - distance);
      current.subtractToRef(previous, output[written++]).scaleInPlace(t).addInPlace(previous);
    }
    if (distance >= 0) output[written++].copyFrom(current);
    previous = current;
    previousDistance = distance;
  }
  return written;
}

export function projectAperture(portal, viewProjection, renderWidth, renderHeight, margin = 0, out = {}) {
  apertureCorners(portal, margin, corners);
  let maxW = -Infinity;
  for (let i = 0; i < corners.length; i++) {
    Vector4.TransformCoordinatesToRef(corners[i], viewProjection, clipVertices[i]);
    maxW = Math.max(maxW, clipVertices[i].w);
  }
  if (maxW <= minClipW) return null;
  const inFront = clipPolygon(clipVertices, corners.length, clippedVertices, distanceToEyePlane);
  if (inFront < 3) return null;
  const count = clipPolygon(clippedVertices, inFront, clipVertices, distanceToNearPlane);
  if (count < 3) return null;

  let minX = renderWidth;
  let minY = renderHeight;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < count; i++) {
    const p = clipVertices[i];
    const x = (p.x / p.w * 0.5 + 0.5) * renderWidth;
    const y = (p.y / p.w * 0.5 + 0.5) * renderHeight;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  minX = Math.max(0, minX);
  minY = Math.max(0, minY);
  maxX = Math.min(renderWidth, maxX);
  maxY = Math.min(renderHeight, maxY);
  if (maxX <= minX || maxY <= minY) return null;
  out.x = Math.floor(minX);
  out.y = Math.floor(minY);
  out.width = Math.ceil(maxX) - out.x;
  out.height = Math.ceil(maxY) - out.y;
  return out;
}

export function intersectRects(a, b, out = {}) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  if (width < 1 || height < 1) return null;
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
  return out;
}

export function aperturePyramidPlanes(portal, eye, margin = 0, out = Array.from({ length: 4 }, () => new Plane(0, 0, 0, 0))) {
  apertureCorners(portal, margin, corners);
  for (let i = 0; i < corners.length; i++) {
    const plane = out[i].copyFromPoints(eye, corners[i], corners[(i + 1) % 4]);
    // Le coin opposé désigne l’intérieur, quelle que soit la face vue par l’œil.
    if (plane.dotCoordinate(corners[(i + 2) % 4]) < 0) {
      plane.normal.negateInPlace();
      plane.d = -plane.d;
    }
  }
  return out;
}

const prismEdge = new Vector3();

export function shadowPortalCrossing(portal, center, radius, lightDir, out, sideOverride = 0) {
  if (lightDir.y >= -1e-6) return null;
  // Rejet rapide : l’ombre ne s’étend pas horizontalement au-delà de t_max·|L_h| du centre.
  const dx = center.x - portal.origin.x;
  const dz = center.z - portal.origin.z;
  const reachTime = (center.y - portal.origin.y + radius) / -lightDir.y;
  if (reachTime < 0) return null;
  const reach = reachTime * Math.hypot(lightDir.x, lightDir.z) + radius + portal.width / 2;
  if (dx * dx + dz * dz > reach * reach) return null;
  const cos = portal.right ? portal.right.x : Math.cos(portal.yaw);
  const sin = portal.normal ? portal.normal.x : Math.sin(portal.yaw);
  const lRight = cos * lightDir.x - sin * lightDir.z;
  const lNormal = sin * lightDir.x + cos * lightDir.z;
  if (Math.abs(lNormal) < 1e-6) return null;
  toLocal(portal, center, localPoint);
  const lx0 = localPoint.x;
  const ly0 = localPoint.y;
  const lz0 = localPoint.z;
  const side = sideOverride || (lz0 > 0 ? 1 : lz0 < 0 ? -1 : (lNormal < 0 ? 1 : -1));
  if (side < 0 && portal.sides !== "both") return null;
  const speed = -side * lNormal;
  if (speed <= 1e-6) return null;
  if (portal.target) {
    const destSpeed = side * (Math.sin(portal.target.yaw) * lightDir.x + Math.cos(portal.target.yaw) * lightDir.z);
    if (destSpeed <= 1e-6) return null;
  }
  const tMax = (ly0 + radius) / -lightDir.y;
  if (tMax < 0) return null;
  const d = Math.max(0, side * lz0);
  let sMin = Math.max(0, (ly0 - portal.height - radius) / -lightDir.y, (d - radius) / speed);
  let sMax = Math.min(tMax, (d + radius) / speed);
  if (sMin > sMax) return null;
  const halfWidth = portal.width / 2 + radius;
  if (Math.abs(lRight) < 1e-9) {
    if (Math.abs(lx0) > halfWidth) return null;
  } else {
    const a = (-halfWidth - lx0) / lRight;
    const b = (halfWidth - lx0) / lRight;
    sMin = Math.max(sMin, Math.min(a, b));
    sMax = Math.min(sMax, Math.max(a, b));
    if (sMin > sMax) return null;
  }
  out ??= {};
  out.distance = d / speed;
  out.side = side;
  return out;
}

export function shadowPrismPlanes(portal, direction, margin = 0, out = Array.from({ length: 4 }, () => new Plane(0, 0, 0, 0))) {
  if (Math.abs(Math.sin(portal.yaw) * direction.x + Math.cos(portal.yaw) * direction.z) <= 1e-9) return null;
  apertureCorners(portal, margin, corners);
  for (let i = 0; i < corners.length; i++) {
    const start = corners[i];
    const next = corners[(i + 1) % 4];
    const opposite = corners[(i + 2) % 4];
    const plane = out[i];
    next.subtractToRef(start, prismEdge);
    Vector3.CrossToRef(prismEdge, direction, plane.normal);
    const length = plane.normal.length();
    if (length <= 1e-12) return null;
    plane.normal.scaleInPlace(1 / length);
    plane.d = -Vector3.Dot(plane.normal, start);
    // Babylon rejette le demi-espace positif : le coin opposé doit rester du côté négatif.
    if (plane.dotCoordinate(opposite) > 0) {
      plane.normal.negateInPlace();
      plane.d = -plane.d;
    }
  }
  return out;
}
