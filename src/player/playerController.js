import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ProximityCastResult } from "@babylonjs/core/Physics/proximityCastResult";
import { CharacterSupportedState, PhysicsCharacterController } from "@babylonjs/core/Physics/v2/characterController";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { FIXED_STEP, PLAYER, SPAWN_YAW } from "../config.js";
import { collisionLayer } from "../core/physics.js";

const down = new Vector3(0, -1, 0);
const forward = new Vector3(0, 0, 1);

function refreshContacts(capsule) {
  // Babylon 9.37 conserve les contacts après setPosition et n'expose pas leur reconstruction en API publique.
  capsule._refreshManifoldAtPosition(capsule.getPosition());
}

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
  const exitQuery = {
    shape: capsule.shape, position: capsule.getPosition(), rotation: Quaternion.Identity(),
    maxDistance: 0, shouldHitTriggers: false, ignoreBody: physics.getBodies().find((body) => body.shape === capsule.shape),
  };
  const capsuleHit = new ProximityCastResult();
  const exitHit = new ProximityCastResult();
  const recoverySpeed = capsule.penetrationRecoverySpeed;
  const state = {
    position: Vector3.Zero(), yaw: SPAWN_YAW, speed: 0, scale: 1,
    grounded: false, verticalSpeed: 0, respawned: true,
  };
  const previousPose = { position: Vector3.Zero(), yaw: SPAWN_YAW };
  let coyote = 0;
  let jumpBuffer = 0;
  let risingFromJump = false;
  let invalidateSupport = false;
  let pushingBody = false;
  let checkExitOverlap = false;
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
    capsule.characterStrength = PLAYER.strength * scale ** 3;
    capsule.maxCharacterSpeedForSolver = solverSpeed * scale;
    gravity.scaleToRef(scale, scaledGravity);
    state.scale = scale;
    syncFeet();
  }

  function applyWarp(warp) {
    pushingBody = false;
    checkExitOverlap = true;
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
    refreshContacts(capsule);
    capsule.checkSupportToRef(FIXED_STEP, down, surface);
    state.grounded = surface.supportedState === CharacterSupportedState.SUPPORTED && !risingFromJump;
    invalidateSupport = false;
  }

  function place(center, yaw) {
    pushingBody = false;
    checkExitOverlap = false;
    capsule.setPosition(center);
    capsule.setVelocity(Vector3.ZeroReadOnly);
    coyote = jumpBuffer = 0;
    risingFromJump = false;
    state.yaw = yaw;
    invalidateSupport = true;
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
    capsule.checkSupportToRef(dt, down, surface);
    // Une téléportation conserve les contacts du pas précédent jusqu'à l'intégration.
    if (invalidateSupport) surface.supportedState = CharacterSupportedState.UNSUPPORTED;
    invalidateSupport = false;
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
    if (checkExitOverlap) {
      exitQuery.shape = capsule.shape;
      plugin.shapeProximity(exitQuery, capsuleHit, exitHit);
      checkExitOverlap = exitHit.hasHit && exitHit.body.getMotionType() === PhysicsMotionType.DYNAMIC;
      // À la sortie, Havok peut écarter la caisse déjà engagée sans repousser la capsule à travers le plan.
      if (checkExitOverlap) capsule.penetrationRecoverySpeed = 0;
    }
    capsule.integrate(dt, surface, scaledGravity);
    capsule.penetrationRecoverySpeed = recoverySpeed;

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
    state, previousPose, center, setScale, applyWarp, syncPreviousPose, teleport, update,
    get capsuleHeight() { return capsule.shapeOptions.capsuleHeight; },
    dispose: () => capsule.dispose(),
  };
}
