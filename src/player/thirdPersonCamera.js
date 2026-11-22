import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CAMERA, SPAWN_YAW } from "../config.js";
import { createSightTest } from "../core/physics.js";
import { createViewResult, isViewWarped, MIN_NEAR } from "../portals/cameraPath.js";

// Caméra du joueur : à l’épaule (par défaut) ou à la première personne (menu debug).
// Les deux modes pilotent la même TargetCamera, celle que le rendu des portails suit.
export function createThirdPersonCamera(scene) {
  const camera = new TargetCamera("caméra épaule", Vector3.Zero(), scene);
  camera.fov = CAMERA.fov;
  camera.minZ = CAMERA.minZ;
  camera.maxZ = CAMERA.maxZ;
  const collide = createSightTest(scene.getPhysicsEngine());
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
  const simulatedEye = Vector3.Zero();
  const eyeLag = Vector3.Zero();
  const eyeOptions = { epsilon: 0 };
  let yaw = SPAWN_YAW;
  let pitch = CAMERA.initialPitch;
  let distance = CAMERA.distance;
  let cameraScale = 1;
  let warped = false;
  let snap = false;
  let firstPerson = false;

  const pitchLimits = () => (firstPerson
    ? [CAMERA.firstPersonMinPitch, CAMERA.firstPersonMaxPitch]
    : [CAMERA.minPitch, CAMERA.maxPitch]);

  function clampPitch(value) {
    const [min, max] = pitchLimits();
    return Math.max(min, Math.min(max, value));
  }

  function setNear(nearestPortalDistance) {
    const nearestInCameraUnits = nearestPortalDistance / cameraScale;
    camera.minZ = Math.max(MIN_NEAR, Math.min(CAMERA.minZ, 0.5 * nearestInCameraUnits)) * cameraScale;
  }

  // L’œil suit les pieds interpolés, qui peuvent être de l’autre côté d’un portail juste après
  // une traversée. Le chemin part de l’œil simulé : à l’aplomb du centre et les portails étant
  // verticaux, il est toujours dans l’espace du joueur. Il ne suit que le retard d’interpolation :
  // si la garde ε le raccourcit, l’œil recule de quelques millimètres au plus, sans changer de hauteur.
  function followEye(feet, scale, portals, simulatedFeet) {
    const eyeHeight = CAMERA.eyeHeight * scale;
    simulatedEye.set(simulatedFeet.x, simulatedFeet.y + eyeHeight, simulatedFeet.z);
    eyeLag.set(feet.x, feet.y + eyeHeight, feet.z).subtractInPlace(simulatedEye);
    eyeOptions.epsilon = 2 * MIN_NEAR * scale;
    portals.traceView(simulatedEye, eyeLag, eyeLag.length(), eyeOptions, eyeView);
    cameraScale = scale * eyeView.warp.scale;
    warped = eyeView.crossed > 0;
    setNear(eyeView.nearestPortalDistance);
    camera.position.copyFrom(eyeView.position);
    camera.rotation.set(pitch, eyeView.warp.yaw(yaw), 0);
    snap = false;
    return 0;
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
    pitch = firstPerson ? CAMERA.firstPersonPitch : CAMERA.initialPitch;
    snap = true;
  }

  return {
    camera, reset,
    get firstPerson() { return firstPerson; },
    // Garde le regard ; l’épaule lissée repart de la position du joueur au retour à l’épaule.
    setFirstPerson(enabled) {
      if (firstPerson === enabled) return;
      firstPerson = enabled;
      pitch = clampPitch(pitch);
      snap = true;
    },
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
      pitch = clampPitch(pitch + dy * CAMERA.sensitivity);
      return yaw;
    },
    // Renvoie la distance de l’œil à l’épaule (0 à la première personne), qui règle le fondu du joueur.
    follow(dt, feet, scale, portals, simulatedFeet = feet) {
      if (firstPerson) return followEye(feet, scale, portals, simulatedFeet);
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
      setNear(eyeView.nearestPortalDistance);
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
