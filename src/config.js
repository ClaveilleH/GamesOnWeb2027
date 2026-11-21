export const GRAVITY = -19;
export const FIXED_STEP = 1 / 60;
export const MAX_ACCUMULATED_TIME = 0.25;
export const SPAWN_YAW = 0;

export const PLAYER = Object.freeze({
  height: 1.92,
  radius: 0.32,
  mass: 75,
  strength: 1200,
  contactDistance: 0.025,
  contactTolerance: 0.03,
  walkSpeed: 3.6,
  runSpeed: 6.4,
  acceleration: 23,
  braking: 29,
  airAcceleration: 9,
  jumpSpeed: 6.8,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  maxSlope: 45 * Math.PI / 180,
  maxStepHeight: 0.23,
  turnRate: 14,
  respawnBelow: -7,
});

export const CAMERA = Object.freeze({
  shoulderHeight: 1.46,
  distance: 4.6,
  initialPitch: 0.18,
  minPitch: -0.34,
  maxPitch: 1.16,
  sensitivity: 0.0023,
  followRate: 14,
  releaseRate: 8,
  wallClearance: 0.18,
  fadeNear: 0.5,
  fadeFar: 1.2,
  minPlayerOpacity: 0.03,
  fov: 0.82,
});
