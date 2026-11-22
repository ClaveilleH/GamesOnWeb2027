import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ShapeCastResult } from "@babylonjs/core/Physics/shapeCastResult";
import { CharacterSupportedState, PhysicsCharacterController } from "@babylonjs/core/Physics/v2/characterController";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { FIXED_STEP, PLAYER, SPAWN_YAW } from "../config.js";
import { collisionLayer } from "../core/physics.js";

const down = new Vector3(0, -1, 0);
const forward = new Vector3(0, 0, 1);

export function createPlayerController(scene, spawn, gravity, shouldRespawn = (position) => position.y < PLAYER.respawnBelow) {
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
    position: Vector3.Zero(), yaw: SPAWN_YAW, speed: 0, scale: 1,
    grounded: false, verticalSpeed: 0, respawned: true,
  };
  const previousPose = { position: Vector3.Zero(), yaw: SPAWN_YAW };
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

  function place(center, yaw) {
    pushingBody = false;
    capsule.setPosition(center);
    capsule.setVelocity(Vector3.ZeroReadOnly);
    coyote = jumpBuffer = 0;
    risingFromJump = false;
    state.yaw = yaw;
    surface.supportedState = CharacterSupportedState.UNSUPPORTED;
    placedSupport = true;
  }

  function teleport(feet, yaw) {
    desired.set(feet.x, feet.y + capsule.footOffset + capsule.keepDistance, feet.z);
    place(desired, yaw);
    state.grounded = state.respawned = false;
    state.speed = state.verticalSpeed = 0;
    syncFeet();
    syncPreviousPose();
  }

  function update(dt, input, cameraYaw) {
    syncPreviousPose();
    state.respawned = input.respawn || shouldRespawn(capsule.getPosition());
    if (state.respawned) {
      setScale(1);
      place(spawn, SPAWN_YAW);
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
    if (state.speed > 0.08 * state.scale) {
      const delta = Math.atan2(dx, dz) - state.yaw;
      state.yaw += Math.atan2(Math.sin(delta), Math.cos(delta)) * -Math.expm1(-PLAYER.turnRate * dt);
    }
    if (state.respawned) syncPreviousPose();
    return state;
  }

  syncFeet();
  syncPreviousPose();
  return {
    state, previousPose, center, applyWarp, syncPreviousPose, teleport, update,
    get capsuleHeight() { return capsule.shapeOptions.capsuleHeight; },
    dispose: () => capsule.dispose(),
  };
}
