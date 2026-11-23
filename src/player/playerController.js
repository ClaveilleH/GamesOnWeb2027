import { NormalizeRadians } from "@babylonjs/core/Maths/math.scalar.functions";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ShapeCastResult } from "@babylonjs/core/Physics/shapeCastResult";
import { CharacterSupportedState, PhysicsCharacterController } from "@babylonjs/core/Physics/v2/characterController";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { FIXED_STEP, PLAYER, SPAWN_YAW } from "../config.js";
import { collisionLayer } from "../core/physics.js";

const down = new Vector3(0, -1, 0);
const forward = new Vector3(0, 0, 1);
// Modes de déplacement du menu debug : marche normale, vol avec collisions, vol à travers les murs.
export const movementModes = Object.freeze(["walk", "fly", "noclip"]);
const FLY_SPRINT = 2.5;
const FLY_RESPONSE = 10;

// `spawn` : centre de la capsule au départ ; `spawnYaw` : orientation au départ et à chaque réapparition.
export function createPlayerController(scene, spawn, gravity, shouldRespawn = (position) => position.y < PLAYER.respawnBelow,
  spawnYaw = SPAWN_YAW) {
  const capsule = new PhysicsCharacterController(spawn, {
    capsuleHeight: PLAYER.height,
    capsuleRadius: PLAYER.radius,
  }, scene);
  capsule.shape.filterMembershipMask = collisionLayer.player;
  capsule.keepDistance = PLAYER.contactDistance;
  capsule.keepContactTolerance = PLAYER.contactTolerance;
  capsule.maxSlopeCosine = Math.cos(PLAYER.maxSlope);
  capsule.maxStepHeight = PLAYER.maxStepHeight;
  capsule.acceleration = 1;
  capsule.characterMass = PLAYER.mass;
  capsule.characterStrength = PLAYER.strength;
  const solverSpeed = capsule.maxCharacterSpeedForSolver;

  const desired = Vector3.Zero();
  const velocity = Vector3.Zero();
  const warpedCenter = Vector3.Zero();
  const scaledGravity = gravity.clone();
  const surface = capsule.checkSupport(FIXED_STEP, down);
  const physics = scene.getPhysicsEngine();
  const plugin = physics.getPhysicsPlugin();
  const supportQuery = {
    shape: capsule.shape, startPosition: new Vector3(), endPosition: new Vector3(), rotation: Quaternion.Identity(),
    shouldHitTriggers: false, ignoreBody: physics.getBodies().find((body) => body.shape === capsule.shape),
  };
  const capsuleHit = new ShapeCastResult();
  const supportHit = new ShapeCastResult();
  const state = {
    position: Vector3.Zero(), yaw: spawnYaw, speed: 0, scale: 1,
    grounded: false, verticalSpeed: 0, respawned: true,
    mode: "walk", flySpeed: 8,
    // Première personne : le corps regarde où regarde la caméra au lieu de se tourner vers sa course.
    faceCamera: false,
  };
  const noGravity = Vector3.Zero();
  const flyStart = Vector3.Zero();
  const previousPose = { position: Vector3.Zero(), yaw: spawnYaw };
  let coyote = 0;
  let jumpBuffer = 0;
  let risingFromJump = false;
  let pushingBody = false;
  let placedSupport = false;
  capsule.onTriggerCollisionObservable.add(({ impulse }) => {
    if (impulse.x * desired.x + impulse.z * desired.z > 0) pushingBody = true;
  });

  function syncFeet() {
    state.position.copyFrom(capsule.getPosition());
    state.position.y -= capsule.footOffset + capsule.keepDistance;
  }

  function syncPreviousPose() {
    previousPose.position.copyFrom(state.position);
    previousPose.yaw = state.yaw;
  }

  function center(out) {
    return out.copyFrom(capsule.getPosition());
  }

  function setScale(scale) {
    if (state.scale === scale) return;
    capsule.setShapeOptions({ capsuleHeight: PLAYER.height * scale, capsuleRadius: PLAYER.radius * scale }, true);
    capsule.shape.filterMembershipMask = collisionLayer.player;
    const newDistance = PLAYER.contactDistance * scale;
    center(desired).y += newDistance - capsule.keepDistance;
    capsule.setPosition(desired);
    capsule.keepDistance = newDistance;
    capsule.keepContactTolerance = PLAYER.contactTolerance * scale;
    capsule.maxStepHeight = PLAYER.maxStepHeight * scale;
    capsule.characterMass = PLAYER.mass * scale ** 3;
    // Une poussée F = m·a change comme la masse (s³) et l’accélération (s).
    capsule.characterStrength = PLAYER.strength * scale ** 4;
    capsule.maxCharacterSpeedForSolver = solverSpeed * scale;
    gravity.scaleToRef(scale, scaledGravity);
    state.scale = scale;
    syncFeet();
  }

  function readArrivalSupport() {
    // setPosition conserve les contacts de départ. Un balayage vertical mesure l’appui
    // à l’arrivée jusqu’à ce que la prochaine intégration reconstruise les contacts.
    supportQuery.shape = capsule.shape;
    supportQuery.startPosition.copyFrom(warpedCenter).y += capsule.keepDistance;
    supportQuery.endPosition.copyFrom(warpedCenter).y -= capsule.keepDistance + capsule.keepContactTolerance;
    plugin.shapeCast(supportQuery, capsuleHit, supportHit);
    surface.averageSurfaceVelocity.setAll(0);
    surface.averageAngularSurfaceVelocity.setAll(0);
    surface.averageSurfaceNormal.copyFrom(supportHit.hitNormal);
    surface.supportedState = supportHit.hasHit && supportHit.hitNormal.y >= capsule.maxSlopeCosine
      ? CharacterSupportedState.SUPPORTED : CharacterSupportedState.UNSUPPORTED;
    surface.isSurfaceDynamic = supportHit.hasHit && supportHit.body.getMotionType() === PhysicsMotionType.DYNAMIC;
    if (surface.isSurfaceDynamic) {
      supportHit.body.getLinearVelocityToRef(surface.averageSurfaceVelocity);
      supportHit.body.getAngularVelocityToRef(surface.averageAngularSurfaceVelocity);
    }
  }

  function applyWarp(warp) {
    pushingBody = false;
    warp.point(capsule.getPosition(), warpedCenter);
    warp.direction(capsule.getVelocity(), velocity);
    setScale(state.scale * warp.scale);
    capsule.setPosition(warpedCenter);
    capsule.setVelocity(velocity);
    state.yaw = warp.yaw(state.yaw);
    state.speed *= warp.scale;
    state.verticalSpeed = velocity.y;
    warp.point(previousPose.position, previousPose.position);
    previousPose.yaw = warp.yaw(previousPose.yaw);
    syncFeet();
    readArrivalSupport();
    placedSupport = true;
    state.grounded = surface.supportedState === CharacterSupportedState.SUPPORTED && !risingFromJump;
  }

  // Arrête la capsule et oublie l’appui et le saut en cours : le pas suivant ne lit pas les anciens contacts.
  function stopMotion() {
    capsule.setVelocity(Vector3.ZeroReadOnly);
    coyote = jumpBuffer = 0;
    risingFromJump = false;
    surface.supportedState = CharacterSupportedState.UNSUPPORTED;
    placedSupport = true;
  }

  function place(center, yaw) {
    pushingBody = false;
    capsule.setPosition(center);
    stopMotion();
    state.yaw = yaw;
  }

  function teleport(feet, yaw) {
    desired.set(feet.x, feet.y + capsule.footOffset + capsule.keepDistance, feet.z);
    place(desired, yaw);
    state.grounded = state.respawned = false;
    state.speed = state.verticalSpeed = 0;
    syncFeet();
    syncPreviousPose();
  }

  // Garde les pieds en place : setScale garde le centre, la capsule agrandie s’enfoncerait dans le sol.
  function resize(scale) {
    if (!(scale > 0) || state.scale === scale) return;
    const feet = state.position.clone();
    setScale(scale);
    feet.y += 0.01 * scale;
    teleport(feet, state.yaw);
  }

  function setMode(mode) {
    if (!movementModes.includes(mode) || state.mode === mode) return;
    state.mode = mode;
    stopMotion();
  }

  function turn(dt, dx, dz, cameraYaw) {
    if (state.faceCamera && !state.respawned) {
      state.yaw = cameraYaw;
    } else if (state.speed > 0.08 * state.scale) {
      state.yaw += NormalizeRadians(Math.atan2(dx, dz) - state.yaw) * -Math.expm1(-PLAYER.turnRate * dt);
    }
  }

  function fly(dt, input, cameraYaw) {
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const vertical = Number(input.up) - Number(input.down);
    desired.set(input.forward * sin + input.strafe * cos, vertical, input.forward * cos - input.strafe * sin);
    const length = desired.length();
    if (length > 0) desired.scaleInPlace(state.flySpeed * state.scale * (input.sprint ? FLY_SPRINT : 1) / length);
    // Vitesse lissée : le vol démarre et s’arrête sans à-coup, sans inertie gênante.
    Vector3.LerpToRef(capsule.getVelocity(), desired, -Math.expm1(-FLY_RESPONSE * dt), velocity);
    flyStart.copyFrom(capsule.getPosition());
    if (state.mode === "noclip") {
      // Aucun solveur : la capsule passe les murs, la traversée des portails suit le centre.
      capsule.setPosition(velocity.scaleToRef(dt, warpedCenter).addInPlace(flyStart));
      capsule.setVelocity(velocity);
    } else {
      surface.supportedState = CharacterSupportedState.UNSUPPORTED;
      capsule.setVelocity(velocity);
      capsule.integrate(dt, surface, noGravity);
    }
    syncFeet();
    const { x, z } = capsule.getPosition();
    const dx = x - flyStart.x;
    const dz = z - flyStart.z;
    state.speed = Math.hypot(dx, dz) / dt;
    state.verticalSpeed = capsule.getVelocity().y;
    state.grounded = false;
    turn(dt, dx, dz, cameraYaw);
    placedSupport = true;
  }

  function update(dt, input, cameraYaw) {
    syncPreviousPose();
    const falling = state.mode === "walk" && shouldRespawn(capsule.getPosition());
    state.respawned = input.respawn || falling;
    if (state.respawned) {
      setScale(1);
      place(spawn, spawnYaw);
    }
    if (state.mode !== "walk" && !state.respawned) {
      fly(dt, input, cameraYaw);
      return state;
    }
    if (!placedSupport) capsule.checkSupportToRef(dt, down, surface);
    placedSupport = false;
    const grounded = surface.supportedState === CharacterSupportedState.SUPPORTED && !risingFromJump;
    coyote = grounded ? PLAYER.coyoteTime : Math.max(0, coyote - dt);
    jumpBuffer = input.jump ? PLAYER.jumpBuffer : Math.max(0, jumpBuffer - dt);

    const moving = !state.respawned && (input.forward !== 0 || input.strafe !== 0);
    if (moving) {
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      desired.set(input.forward * sin + input.strafe * cos, 0, input.forward * cos - input.strafe * sin);
      desired.normalize().scaleInPlace((input.sprint ? PLAYER.runSpeed : PLAYER.walkSpeed) * state.scale);
    } else {
      desired.setAll(0);
    }

    const current = capsule.getVelocity();
    if (grounded) {
      capsule.maxAcceleration = (moving ? PLAYER.acceleration : PLAYER.braking) * state.scale;
      // Au contact d'une caisse, le solveur freine la capsule. La poussée continue depuis la vitesse commandée.
      const driveVelocity = pushingBody && moving ? velocity : current;
      capsule.calculateMovementToRef(dt, forward, surface.averageSurfaceNormal, driveVelocity,
        surface.averageSurfaceVelocity, desired, capsule.up, velocity);
    } else {
      const dx = desired.x - current.x;
      const dz = desired.z - current.z;
      const delta = Math.hypot(dx, dz);
      const gain = delta > 0 ? Math.min(1, PLAYER.airAcceleration * state.scale * dt / delta) : 0;
      velocity.set(current.x + dx * gain, current.y + scaledGravity.y * dt, current.z + dz * gain);
    }

    const jumping = jumpBuffer > 0 && coyote > 0;
    if (jumping) {
      velocity.y = PLAYER.jumpSpeed * state.scale;
      risingFromJump = true;
      coyote = jumpBuffer = 0;
    }
    const { x: startX, z: startZ } = capsule.getPosition();
    capsule.setVelocity(velocity);
    pushingBody = false;
    capsule.integrate(dt, surface, scaledGravity);

    syncFeet();
    const dx = state.position.x - startX;
    const dz = state.position.z - startZ;
    state.speed = Math.hypot(dx, dz) / dt;
    state.verticalSpeed = capsule.getVelocity().y;
    state.grounded = grounded && !jumping;
    if (state.verticalSpeed <= 0) risingFromJump = false;
    turn(dt, dx, dz, cameraYaw);
    if (state.respawned) syncPreviousPose();
    return state;
  }

  syncFeet();
  syncPreviousPose();
  return {
    state, previousPose, center, applyWarp, syncPreviousPose, teleport, update, resize, setMode,
    get capsuleHeight() { return capsule.shapeOptions.capsuleHeight; },
    dispose: () => capsule.dispose(),
  };
}
