import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CharacterSupportedState, PhysicsCharacterController } from "@babylonjs/core/Physics/v2/characterController";
import { PLAYER, SPAWN_YAW } from "../config.js";
import { collisionLayer } from "../core/physics.js";

const down = new Vector3(0, -1, 0);
const forward = new Vector3(0, 0, 1);

export function createPlayerController(scene, spawn, gravity) {
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

  const desired = Vector3.Zero();
  const velocity = Vector3.Zero();
  const state = {
    position: Vector3.Zero(), yaw: SPAWN_YAW, speed: 0,
    grounded: false, verticalSpeed: 0, respawned: true,
  };
  const previousPose = { position: Vector3.Zero(), yaw: SPAWN_YAW };
  let coyote = 0;
  let jumpBuffer = 0;
  let risingFromJump = false;

  function syncFeet() {
    state.position.copyFrom(capsule.getPosition());
    state.position.y -= capsule.footOffset + capsule.keepDistance;
  }

  function syncPreviousPose() {
    previousPose.position.copyFrom(state.position);
    previousPose.yaw = state.yaw;
  }

  function respawn() {
    capsule.setPosition(spawn);
    capsule.setVelocity(Vector3.ZeroReadOnly);
    coyote = jumpBuffer = 0;
    risingFromJump = false;
    state.yaw = SPAWN_YAW;
  }

  function update(dt, input, cameraYaw) {
    syncPreviousPose();
    state.respawned = input.respawn || capsule.getPosition().y < PLAYER.respawnBelow;
    if (state.respawned) respawn();
    const surface = capsule.checkSupport(dt, down);
    // Une téléportation conserve les contacts du pas précédent jusqu'à l'intégration.
    if (state.respawned) surface.supportedState = CharacterSupportedState.UNSUPPORTED;
    const grounded = surface.supportedState === CharacterSupportedState.SUPPORTED && !risingFromJump;
    coyote = grounded ? PLAYER.coyoteTime : Math.max(0, coyote - dt);
    jumpBuffer = input.jump ? PLAYER.jumpBuffer : Math.max(0, jumpBuffer - dt);

    const moving = !state.respawned && (input.forward !== 0 || input.strafe !== 0);
    if (moving) {
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      desired.set(input.forward * sin + input.strafe * cos, 0, input.forward * cos - input.strafe * sin);
      desired.normalize().scaleInPlace(input.sprint ? PLAYER.runSpeed : PLAYER.walkSpeed);
    } else {
      desired.setAll(0);
    }

    const current = capsule.getVelocity();
    if (grounded) {
      capsule.maxAcceleration = moving ? PLAYER.acceleration : PLAYER.braking;
      capsule.calculateMovementToRef(dt, forward, surface.averageSurfaceNormal, current,
        surface.averageSurfaceVelocity, desired, capsule.up, velocity);
    } else {
      const dx = desired.x - current.x;
      const dz = desired.z - current.z;
      const delta = Math.hypot(dx, dz);
      const gain = delta > 0 ? Math.min(1, PLAYER.airAcceleration * dt / delta) : 0;
      velocity.set(current.x + dx * gain, current.y + gravity.y * dt, current.z + dz * gain);
    }

    const jumping = jumpBuffer > 0 && coyote > 0;
    if (jumping) {
      velocity.y = PLAYER.jumpSpeed;
      risingFromJump = true;
      coyote = jumpBuffer = 0;
    }
    const { x: startX, z: startZ } = capsule.getPosition();
    capsule.setVelocity(velocity);
    capsule.integrate(dt, surface, gravity);

    syncFeet();
    const dx = state.position.x - startX;
    const dz = state.position.z - startZ;
    state.speed = Math.hypot(dx, dz) / dt;
    state.verticalSpeed = capsule.getVelocity().y;
    state.grounded = grounded && !jumping;
    if (state.verticalSpeed <= 0) risingFromJump = false;
    if (state.speed > 0.08) {
      const delta = Math.atan2(dx, dz) - state.yaw;
      state.yaw += Math.atan2(Math.sin(delta), Math.cos(delta)) * -Math.expm1(-PLAYER.turnRate * dt);
    }
    if (state.respawned) syncPreviousPose();
    return state;
  }

  syncFeet();
  syncPreviousPose();
  return { state, previousPose, syncPreviousPose, update, dispose: () => capsule.dispose() };
}
