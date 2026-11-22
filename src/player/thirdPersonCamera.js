import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import { CAMERA, SPAWN_YAW } from "../config.js";
import { collisionLayer } from "../core/physics.js";
import { createViewResult, isViewWarped, MIN_NEAR } from "../portals/cameraPath.js";

const baseMinZ = 0.04;

export function createThirdPersonCamera(scene) {
  const camera = new TargetCamera("caméra épaule", Vector3.Zero(), scene);
  camera.fov = CAMERA.fov;
  camera.minZ = baseMinZ;
  camera.maxZ = 500;
  const physics = scene.getPhysicsEngine();
  const query = { collideWith: collisionLayer.terrain | collisionLayer.portalBack | collisionLayer.portalFrame };
  const hit = new PhysicsRaycastResult();
  const target = Vector3.Zero();
  const shoulder = Vector3.Zero();
  const simulatedShoulder = Vector3.Zero();
  const lagDirection = Vector3.Zero();
  const direction = Vector3.Zero();
  const shoulderView = createViewResult();
  const eyeView = createViewResult();
  const shoulderOptions = { epsilon: 0 };
  const viewOptions = { epsilon: 0, clearance: 0, collide };
  const placementOptions = { epsilon: 0 };
  let yaw = SPAWN_YAW;
  let pitch = CAMERA.initialPitch;
  let distance = CAMERA.distance;
  let cameraScale = 1;
  let warped = false;
  let snap = false;

  function collide(from, to) {
    physics.raycastToRef(from, to, hit, query);
    return hit.hasHit ? hit.hitDistance : null;
  }

  function locateShoulder(portals, simulatedFeet, scale) {
    simulatedShoulder.set(simulatedFeet.x, simulatedFeet.y + CAMERA.shoulderHeight * scale, simulatedFeet.z);
    target.subtractToRef(simulatedShoulder, lagDirection);
    let lag = lagDirection.length();
    const precision = 1e-7 * scale;
    const nearest = portals.nearestPortalDistance(simulatedShoulder);
    if (nearest > lag + precision) return null;
    // L’épaule interpolée et lissée peut encore être du côté d’entrée après le pas de traversée.
    shoulderOptions.epsilon = precision;
    if (nearest <= precision && lag > 0) {
      portals.traceView(simulatedShoulder, lagDirection, 0, shoulderOptions, shoulderView);
      simulatedShoulder.copyFrom(shoulderView.position);
      target.subtractToRef(simulatedShoulder, lagDirection);
      lag = lagDirection.length();
    }
    return portals.traceView(simulatedShoulder, lagDirection, lag, shoulderOptions, shoulderView);
  }

  function reset(newYaw) {
    yaw = newYaw;
    pitch = CAMERA.initialPitch;
    snap = true;
  }

  return {
    camera, reset,
    applyWarp(warp) {
      yaw = warp.yaw(yaw);
      warp.point(target, target);
    },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get warped() { return warped; },
    get scale() { return cameraScale; },
    look(dx, dy) {
      yaw = (yaw + dx * CAMERA.sensitivity) % (2 * Math.PI);
      pitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, pitch + dy * CAMERA.sensitivity));
      return yaw;
    },
    follow(dt, feet, scale, portals, simulatedFeet = feet) {
      shoulder.set(feet.x, feet.y + CAMERA.shoulderHeight * scale, feet.z);
      Vector3.LerpToRef(target, shoulder, snap ? 1 : -Math.expm1(-CAMERA.followRate * dt), target);
      const horizontal = Math.cos(pitch);
      direction.set(-Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal);
      const anchor = locateShoulder(portals, simulatedFeet, scale);
      const origin = anchor?.position ?? target;
      const shoulderScale = scale * (anchor?.warp.scale ?? 1);
      if (anchor) anchor.warp.direction(direction, direction).normalize();
      viewOptions.clearance = CAMERA.wallClearance * shoulderScale;
      viewOptions.epsilon = placementOptions.epsilon = 2 * MIN_NEAR * shoulderScale;
      const allowed = portals.traceView(origin, direction, CAMERA.distance * shoulderScale, viewOptions, eyeView).allowed / shoulderScale;
      if (snap || allowed < distance) distance = allowed;
      else distance += (allowed - distance) * -Math.expm1(-CAMERA.releaseRate * dt);
      portals.traceView(origin, direction, distance * shoulderScale, placementOptions, eyeView);
      cameraScale = shoulderScale * eyeView.warp.scale;
      warped = isViewWarped(eyeView, anchor);
      const nearestInCameraUnits = eyeView.nearestPortalDistance / cameraScale;
      camera.minZ = Math.max(MIN_NEAR, Math.min(baseMinZ, 0.5 * nearestInCameraUnits)) * cameraScale;
      camera.position.copyFrom(eyeView.position);
      camera.setTarget(eyeView.target);
      if (camera.position.equals(eyeView.target)) {
        // Au contact du mur, l’épaule et l’œil peuvent coïncider.
        camera.rotation.set(pitch, eyeView.warp.yaw(anchor ? anchor.warp.yaw(yaw) : yaw), 0);
      } else if (camera.position.z !== eyeView.position.z) {
        // TargetCamera décale z pour une visée exactement latérale, même à très petite échelle.
        camera.position.z = eyeView.position.z;
        const dx = eyeView.target.x - camera.position.x;
        camera.rotation.x = -Math.atan2(eyeView.target.y - camera.position.y, Math.abs(dx));
        camera.rotation.y = Math.sign(dx) * Math.PI / 2;
      }
      snap = false;
      return eyeView.allowed / shoulderScale;
    },
  };
}
