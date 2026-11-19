import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import { CAMERA, SPAWN_YAW } from "../config.js";
import { collisionLayer } from "../core/physics.js";

// `crossPortal(from, to)` permet à la caméra de voir et de passer à travers les portails :
// la position est calculée du côté du personnage puis reportée de l'autre côté du portail.
export function createThirdPersonCamera(scene, crossPortal = () => null) {
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
  const from = Vector3.Zero();
  const to = Vector3.Zero();
  const mappedTarget = Vector3.Zero();
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
    follow(dt, feet, respawned = false) {
      if (respawned) {
        yaw = SPAWN_YAW;
        pitch = CAMERA.initialPitch;
      }
      shoulder.set(feet.x, feet.y + CAMERA.shoulderHeight, feet.z);
      Vector3.LerpToRef(target, shoulder, respawned ? 1 : -Math.expm1(-CAMERA.followRate * dt), target);
      const horizontal = Math.cos(pitch);
      direction.set(-Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal);
      direction.scaleToRef(CAMERA.distance, end).addInPlace(target);
      let reach = CAMERA.distance;
      const crossing = crossPortal(target, end);
      if (crossing) {
        physics.raycastToRef(target, crossing.point, hit, query);
        if (hit.hasHit) {
          reach = hit.hitDistance;
        } else {
          crossing.point.addToRef(crossing.translation, from);
          end.addToRef(crossing.translation, to);
          physics.raycastToRef(from, to, hit, query);
          if (hit.hasHit) reach = crossing.s * CAMERA.distance + hit.hitDistance;
        }
      } else {
        physics.raycastToRef(target, end, hit, query);
        if (hit.hasHit) reach = hit.hitDistance;
      }
      const allowed = reach < CAMERA.distance ? Math.max(camera.minZ, reach - CAMERA.wallClearance) : CAMERA.distance;
      if (respawned || allowed < distance) distance = allowed;
      else distance += (allowed - distance) * -Math.expm1(-CAMERA.releaseRate * dt);
      direction.scaleToRef(distance, camera.position).addInPlace(target);
      const shoulderDistance = Vector3.Distance(camera.position, shoulder);
      const seen = crossPortal(target, camera.position);
      if (seen) {
        camera.position.addInPlace(seen.translation);
        target.addToRef(seen.translation, mappedTarget);
        camera.setTarget(mappedTarget);
      } else {
        camera.setTarget(target);
      }
      return shoulderDistance;
    },
    // Suit le personnage quand il est téléporté par un portail.
    shift(translation) {
      target.addInPlace(translation);
    },
    camera,
    dispose: () => camera.dispose(),
  };
}
