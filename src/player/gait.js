import { PLAYER } from "../config.js";

// Démarche affichée par le visuel du joueur (squelette ou modèle glTF), à l'échelle 1 :
// vitesse horizontale et vitesse verticale en m/s.
export function gaitOf(speed, grounded, verticalSpeed) {
  if (!grounded) return verticalSpeed > 0.15 ? "jump" : "fall";
  if (speed < 0.12) return "idle";
  return speed > PLAYER.walkSpeed + 0.4 ? "run" : "walk";
}

// Phase de la démarche procédurale, partagée par le squelette d'os et les modèles riggés.
export function createGaitPhase() {
  return { gait: "idle", strength: 0, stride: 0, breath: 0 };
}

// Avance la foulée et la respiration d'un pas `dt`, et choisit la démarche.
export function advanceGait(phase, dt, speed, grounded, verticalSpeed) {
  const gait = gaitOf(speed, grounded, verticalSpeed);
  const walking = gait === "walk" || gait === "run";
  phase.gait = gait;
  phase.strength = walking ? Math.min(speed / PLAYER.walkSpeed, 1) : 0;
  phase.breath += dt * 2.2;
  if (walking) phase.stride += dt * Math.PI * 2 * (0.6 + 0.23 * speed);
  return phase;
}

// Part du chemin restant vers la pose cible parcourue en `dt` (lissage des articulations).
export function gaitBlend(dt) {
  return -Math.expm1(-13 * dt);
}

// Angles cibles (radians) de chaque articulation pour une démarche et une phase, sans lissage,
// écrits dans `out` : bassin, buste, tête, puis cuisse, tibia, pied, bras, écartement et avant-bras
// de chaque côté (suffixes L pour le côté −1, R pour le côté +1).
export function gaitTargets(gait, stride, breath, strength, out = {}) {
  const running = gait === "run";
  const walking = gait === "walk" || running;
  const wave = Math.sin(stride);
  const swing = strength * (running ? 0.92 : 0.59);
  out.hipsYaw = wave * strength * 0.105;
  out.chestX = running ? 0.16 : walking ? 0.06 : 0.012 * Math.sin(breath);
  out.headY = gait === "idle" ? 0.09 * Math.sin(breath * 0.6) : 0;
  for (let side = -1; side <= 1; side += 2) {
    const L = side < 0;
    const step = side * wave;
    let thigh = -step * swing;
    let shin = strength * Math.max(0, -step) * (running ? 1.05 : 0.65);
    let arm = step * swing * 0.88;
    let spread = 0.075;
    let forearm = running ? -0.92 : -0.18 - 0.2 * strength;
    if (gait === "jump") {
      thigh = side === 1 ? -0.83 : -0.32;
      shin = side === 1 ? 1.05 : 0.69;
      arm = -0.56 + side * 0.28;
      spread = 0.32;
      forearm = -0.76;
    } else if (gait === "fall") {
      thigh = -0.17 + side * 0.11;
      shin = 0.37;
      arm = 0.04;
      spread = 0.56;
      forearm = -0.28;
    }
    out[L ? "thighL" : "thighR"] = thigh;
    out[L ? "shinL" : "shinR"] = shin;
    out[L ? "footL" : "footR"] = -0.45 * (thigh + shin);
    out[L ? "armL" : "armR"] = arm;
    out[L ? "spreadL" : "spreadR"] = side * spread;
    out[L ? "forearmL" : "forearmR"] = forearm;
  }
  return out;
}
