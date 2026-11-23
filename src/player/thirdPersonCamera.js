import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Clamp } from "@babylonjs/core/Maths/math.scalar.functions";
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
  const eyeOptions = { epsilon: 0, clearance: 0, collide };
  let yaw = SPAWN_YAW;
  let pitch = CAMERA.initialPitch;
  let distance = CAMERA.distance;
  let cameraScale = 1;
  let warped = false;
  let snap = false;
  let firstPerson = false;
  // Œil du modèle à l’échelle 1 (src/player/firstPersonFit.js).
  const eye = { height: 0, forward: 0 };

  function clampPitch(value) {
    return firstPerson
      ? Clamp(value, CAMERA.firstPersonMinPitch, CAMERA.firstPersonMaxPitch)
      : Clamp(value, CAMERA.minPitch, CAMERA.maxPitch);
  }

  function setNear(nearestPortalDistance) {
    const nearestInCameraUnits = nearestPortalDistance / cameraScale;
    camera.minZ = Clamp(0.5 * nearestInCameraUnits, MIN_NEAR, CAMERA.minZ) * cameraScale;
  }

  // L’œil suit les pieds interpolés, qui peuvent être de l’autre côté d’un portail juste après
  // une traversée, et se tient devant l’axe du corps : il peut donc franchir un portail avant le
  // corps, ou entrer dans un mur. Le chemin part de l’axe à hauteur d’œil : à l’aplomb du centre et
  // les portails étant verticaux, ce point est toujours dans l’espace du joueur. Le chemin reste à
  // l’horizontale (retard d’interpolation et avancée) : si un mur ou la garde ε le raccourcit, l’œil
  // recule sans changer de hauteur.
  function followEye(feet, scale, portals, simulatedFeet) {
    const eyeHeight = eye.height * scale;
    const forward = eye.forward * scale;
    simulatedEye.set(simulatedFeet.x, simulatedFeet.y + eyeHeight, simulatedFeet.z);
    eyeLag.set(feet.x + Math.sin(yaw) * forward, feet.y + eyeHeight, feet.z + Math.cos(yaw) * forward)
      .subtractInPlace(simulatedEye);
    eyeOptions.epsilon = 2 * MIN_NEAR * scale;
    eyeOptions.clearance = CAMERA.eyeWallClearance * scale;
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
    // `fit` : { eyeHeight, eyeForward } du modèle, à l’échelle 1.
    setFirstPerson(enabled, fit) {
      if (fit) {
        eye.height = fit.eyeHeight;
        eye.forward = fit.eyeForward;
      }
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
