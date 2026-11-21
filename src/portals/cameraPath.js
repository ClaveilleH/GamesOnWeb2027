import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import {
  composeWarps, createWarpBuffer, distanceToAperture, identityWarp, insideAperture, rayCrossing, signedDistance, toLocal,
} from "./math.js";

export const MIN_NEAR = 0.005;
const maxCrossings = 4;
const noOptions = Object.freeze({});
const workspaces = new WeakMap();

function createWorkspace() {
  return {
    segments: Array.from({ length: maxCrossings + 1 }, () => ({
      start: new Vector3(), dir: new Vector3(), at: 0, scale: 1, entry: null,
    })),
    hit: { point: new Vector3() }, end: new Vector3(), local: new Vector3(), composition: createWarpBuffer(),
  };
}

export function createViewResult() {
  const work = createWorkspace();
  const out = { position: new Vector3(), target: new Vector3(), warp: identityWarp,
    allowed: 0, nearestPortalDistance: Infinity, crossed: 0 };
  workspaces.set(out, work);
  return out;
}

export function nearestPortalDistance(portals, point) {
  let distance = Infinity;
  for (let i = 0; i < portals.length; i++) distance = Math.min(distance, distanceToAperture(portals[i], point));
  return distance;
}

export function isViewWarped(eye, shoulder) {
  if (!shoulder || !shoulder.crossed) return eye.crossed > 0;
  if (shoulder.crossed !== eye.crossed) return true;
  const fromPlayer = workspaces.get(shoulder).segments;
  const fromShoulder = workspaces.get(eye).segments;
  // Un aller jusqu’à l’épaule lissée peut être défait en sens inverse en allant jusqu’à l’œil.
  for (let i = 1; i <= eye.crossed; i++) {
    if (fromPlayer[i].entry.target !== fromShoulder[eye.crossed + 1 - i].entry) return true;
  }
  return false;
}

function withinGuard(portal, point, guard, local) {
  toLocal(portal, point, local);
  return Math.abs(local.z) < guard && insideAperture(portal, local, guard);
}

function placeEnd(portals, work, depth, allowed, epsilon, out) {
  const { segments, local } = work;
  while (depth > 0 && allowed < segments[depth].at) depth--;
  for (;; depth--) {
    const { start, dir, at, scale, entry } = segments[depth];
    let length = (allowed - at) * scale;
    const guard = epsilon * scale;
    dir.scaleToRef(length, out.position).addInPlace(start);
    for (let i = 0; i < portals.length; i++) {
      const portal = portals[i];
      if (!portal.warp || portal === entry?.target || !withinGuard(portal, out.position, guard, local)) continue;
      const from = signedDistance(portal, start);
      const normal = portal.normal;
      const speed = Vector3.Dot(normal, dir);
      const side = Math.sign(from) || -Math.sign(speed) || 1;
      if (side * speed < 0 && Math.abs(from) >= guard) {
        length = Math.max(0, (side * guard - from) / speed);
        allowed = at + length / scale;
        dir.scaleToRef(length, out.position).addInPlace(start);
      } else {
        // Un rayon tangent ou né dans la garde ne peut pas toujours la quitter en se rétractant.
        normal.scaleAndAddToRef(side * guard - local.z, out.position);
      }
    }
    // Juste après un passage, reculer de ε peut ramener l’œil dans l’espace précédent.
    if (entry && withinGuard(entry.target, out.position, guard, local)) {
      allowed = at;
      continue;
    }
    out.allowed = allowed;
    return depth;
  }
}

const sharedResult = createViewResult();

export function traceView(portals, origin, direction, distance, {
  collide, clearance = 0, epsilon = 2 * MIN_NEAR,
} = noOptions, out = sharedResult) {
  let work = workspaces.get(out);
  if (!work) {
    work = createWorkspace();
    workspaces.set(out, work);
    out.position ??= new Vector3();
    out.target ??= new Vector3();
  }
  const { segments, end, hit } = work;
  let depth = 0;
  segments[0].start.copyFrom(origin);
  segments[0].dir.copyFrom(direction).normalize();
  let allowed = segments[0].dir.lengthSquared() > 0 ? Math.max(0, distance) : 0;

  while (allowed > segments[depth].at) {
    const { start, dir, at, scale, entry } = segments[depth];
    let length = (allowed - at) * scale;
    let first = null;
    for (let i = 0; i < portals.length; i++) {
      const portal = portals[i];
      if (!portal.warp || portal === entry?.target) continue;
      if (rayCrossing(portal, start, dir, length, hit) && (!first || hit.distance < length)) {
        first = portal;
        length = hit.distance;
      }
    }
    dir.scaleToRef(length, end).addInPlace(start);
    const obstacle = collide?.(start, end);
    if (obstacle != null && obstacle <= length) {
      allowed = Math.max(0, at + obstacle / scale - clearance);
      break;
    }
    if (!first) break;
    const nextAt = at + length / scale;
    if (depth === maxCrossings) {
      allowed = nextAt;
      break;
    }
    const next = segments[++depth];
    next.entry = first;
    next.at = nextAt;
    next.scale = scale * first.warp.scale;
    first.warp.point(end, next.start);
    first.warp.direction(dir, next.dir).normalize();
  }

  depth = placeEnd(portals, work, depth, allowed, epsilon, out);
  out.crossed = depth;
  out.warp = identityWarp;
  for (let i = 0; i < depth; i++) {
    const portal = segments[i + 1].entry;
    out.warp = composeWarps(out.warp, portal.warp, work.composition);
  }
  out.warp.point(segments[0].start, out.target);
  out.nearestPortalDistance = nearestPortalDistance(portals, out.position);
  return out;
}
