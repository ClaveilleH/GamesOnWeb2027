import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import { CAMERA, SPAWN_YAW } from "../config.js";
import { collisionLayer } from "../core/physics.js";

export function createThirdPersonCamera(scene) {
  const camera = new TargetCamera("caméra épaule", Vector3.Zero(), scene);
  camera.fov = CAMERA.fov;
  camera.minZ = 0.04;
  const physics = scene.getPhysicsEngine();
  const query = { collideWith: collisionLayer.terrain };
  const hit = new PhysicsRaycastResult();
  const target = Vector3.Zero();
  const shoulder = Vector3.Zero();
  const direction = Vector3.Zero();
  const end = Vector3.Zero();
  const rayStart = Vector3.Zero();
  const rayEnd = Vector3.Zero();
  let yaw = SPAWN_YAW;
  let pitch = CAMERA.initialPitch;
  let distance = CAMERA.distance;

  return {
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    look(dx, dy) {
      yaw = (yaw + dx * CAMERA.sensitivity) % (2 * Math.PI);
      pitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, pitch + dy * CAMERA.sensitivity));
      return yaw;
    },
    camera,
    // `limitRay(from, to)`, facultatif, renvoie la portion [start, stop] (en fractions) du rayon
    // épaule → caméra à tester contre le décor ; la caméra ne va pas au-delà de `stop`. Avec
    // `soft`, elle s'en rapproche en douceur au lieu d'y être ramenée d'un coup.
    follow(dt, feet, respawned = false, limitRay = null) {
      if (respawned) {
        yaw = SPAWN_YAW;
        pitch = CAMERA.initialPitch;
      }
      shoulder.set(feet.x, feet.y + CAMERA.shoulderHeight, feet.z);
      Vector3.LerpToRef(target, shoulder, respawned ? 1 : -Math.expm1(-CAMERA.followRate * dt), target);
      const horizontal = Math.cos(pitch);
      direction.set(-Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal);
      direction.scaleToRef(CAMERA.distance, end).addInPlace(target);
      const { start, stop, soft = false } = limitRay?.(target, end) ?? { start: 0, stop: 1 };
      let allowed = stop * CAMERA.distance;
      if (start < stop) {
        Vector3.LerpToRef(target, end, start, rayStart);
        Vector3.LerpToRef(target, end, stop, rayEnd);
        physics.raycastToRef(rayStart, rayEnd, hit, query);
        if (hit.hasHit) allowed = start * CAMERA.distance + hit.hitDistance - CAMERA.wallClearance;
      }
      allowed = Math.max(camera.minZ, allowed);
      if (respawned || (allowed < distance && !soft)) distance = allowed;
      else distance += (allowed - distance) * -Math.expm1(-CAMERA.releaseRate * dt);
      direction.scaleToRef(distance, camera.position).addInPlace(target);
      camera.setTarget(target);
      return Vector3.Distance(camera.position, shoulder);
    },
    // Déplace la caméra par une homothétie de rapport `scale` (passage d'un portail).
    transform(map, scale) {
      map(target, target);
      map(camera.position, camera.position);
      distance *= scale;
      camera.setTarget(target);
    },
    dispose: () => camera.dispose(),
  };
}
