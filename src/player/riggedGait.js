import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Animation } from "@babylonjs/core/Animations/animation";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { PLAYER } from "../config.js";
import { gaitOf } from "./gait.js";

// Démarche procédurale portée sur un modèle à squelette (os nommés), avec la MÊME logique
// que le squelette d'os (skeletonVisual.js) : idle, marche, course, saut, chute. Deux usages :
//   createRiggedGait : anime les os en direct, image par image (pas de clip) ;
//   bakeGaitClips    : fige la démarche en vrais AnimationGroups keyframés (idle/walk/run…).
// Pensé pour le rig du modèle Shrek (type Auto-Rig Pro) ; retourne null / [] si les os manquent.

// Rôle → début du nom de l'os dans le fichier (le suffixe « _NN » est ignoré).
const ROLE_PREFIX = {
  hips: "root.x",
  chest: "spine_02.x",
  head: "head.x",
  thighL: "thigh_stretch.l", thighR: "thigh_stretch.r",
  shinL: "leg_stretch.l", shinR: "leg_stretch.r",
  footL: "foot.l", footR: "foot.r",
  armL: "arm_stretch.l", armR: "arm_stretch.r",
  forearmL: "forearm_stretch.l", forearmR: "forearm_stretch.r",
};

// Axes LOCAUX de rotation. `swing` = balancement avant/arrière ; `spread` = écartement des bras.
const X = Object.freeze(new Vector3(1, 0, 0));
const Y = Object.freeze(new Vector3(0, 1, 0));
const Z = Object.freeze(new Vector3(0, 0, 1));
const TUNING = {
  swingAxis: X, swingSign: 1,
  spreadAxis: Z, spreadSign: 1,
  hipsYawAxis: Y, hipsYawSign: 1,
  chestAxis: X, chestSign: 1,
  headAxis: Y, headSign: 1,
};

// Articulations animées (rôles) et clé d'angle associée.
const SWING_ROLES = ["thighL", "thighR", "shinL", "shinR", "footL", "footR", "forearmL", "forearmR"];
const ARM_ROLES = [["armL", "spreadL"], ["armR", "spreadR"]];
const REQUIRED = ["thighL", "thighR", "shinL", "shinR", "armL", "armR"];
const ARM_DOWN_FRACTION = 0.9;

function restOf(node) {
  if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
  return node.rotationQuaternion.clone();
}

// Repère les os par leur nom et calcule leur pose de repos. Le modèle étant bind en T-pose,
// on abaisse les bras le long du corps : calcul en repère LOCAL (direction du bras = position
// de l'enfant, « bas » du monde ramené par l'inverse de la matrice monde), sans dépendre des axes.
function setupRig(container) {
  const nodes = {};
  for (const [role, prefix] of Object.entries(ROLE_PREFIX)) {
    const node = container.transformNodes.find((n) => n.name.startsWith(prefix))
      ?? container.meshes.find((n) => n.name.startsWith(prefix));
    if (node) nodes[role] = node;
  }
  if (REQUIRED.some((role) => !nodes[role])) return null;

  const rest = new Map();
  for (const node of Object.values(nodes)) rest.set(node, restOf(node));
  const worldDown = new Vector3(0, -1, 0);
  for (const [arm, child] of [[nodes.armL, nodes.forearmL], [nodes.armR, nodes.forearmR]]) {
    if (!child) continue;
    arm.computeWorldMatrix(true);
    const inverse = arm.getWorldMatrix().clone().invert();
    const localDir = child.position.clone().normalize();
    const localDown = Vector3.TransformNormal(worldDown, inverse).normalize();
    const target = Vector3.Lerp(localDir, localDown, ARM_DOWN_FRACTION).normalize();
    const delta = new Quaternion();
    Quaternion.FromUnitVectorsToRef(localDir, target, delta);
    rest.set(arm, rest.get(arm).multiply(delta));
  }
  return { nodes, rest };
}

// Angles cibles de chaque articulation pour une démarche, à une phase donnée (sans lissage).
// Porté depuis skeletonVisual.js pour que squelette et modèle bougent pareil.
function gaitTargets(gait, stride, breath, strength) {
  const running = gait === "run";
  const walking = gait === "walk" || running;
  const wave = Math.sin(stride);
  const swing = strength * (running ? 0.92 : 0.59);
  const t = {
    hipsYaw: wave * strength * 0.105,
    chestX: running ? 0.16 : walking ? 0.06 : 0.012 * Math.sin(breath),
    headY: gait === "idle" ? 0.09 * Math.sin(breath * 0.6) : 0,
  };
  for (const side of [-1, 1]) {
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
    t[L ? "thighL" : "thighR"] = thigh;
    t[L ? "shinL" : "shinR"] = shin;
    t[L ? "footL" : "footR"] = -0.45 * (thigh + shin);
    t[L ? "armL" : "armR"] = arm;
    t[L ? "spreadL" : "spreadR"] = side * spread;
    t[L ? "forearmL" : "forearmR"] = forearm;
  }
  return t;
}

const tmp = new Quaternion();
// Quaternion local d'un os : rest · rotation(axis, angle) [· rotation(axis2, angle2)].
function boneQuat(restQ, axis, angle, axis2, angle2, out = new Quaternion()) {
  Quaternion.RotationAxisToRef(axis, angle, tmp);
  restQ.multiplyToRef(tmp, out);
  if (axis2) {
    Quaternion.RotationAxisToRef(axis2, angle2, tmp);
    out.multiplyToRef(tmp, out);
  }
  return out;
}

const S = TUNING;
// Applique les angles `v` à tous les os. `write(role, quaternion)` reçoit chaque pose.
function composePose(nodes, rest, v, write) {
  if (nodes.hips) write("hips", boneQuat(rest.get(nodes.hips), S.hipsYawAxis, S.hipsYawSign * v.hipsYaw));
  if (nodes.chest) write("chest", boneQuat(rest.get(nodes.chest), S.chestAxis, S.chestSign * v.chestX));
  if (nodes.head) write("head", boneQuat(rest.get(nodes.head), S.headAxis, S.headSign * v.headY));
  for (const role of SWING_ROLES) {
    if (nodes[role]) write(role, boneQuat(rest.get(nodes[role]), S.swingAxis, S.swingSign * v[role]));
  }
  for (const [role, sp] of ARM_ROLES) {
    if (nodes[role]) write(role, boneQuat(rest.get(nodes[role]), S.swingAxis, S.swingSign * v[role], S.spreadAxis, S.spreadSign * v[sp]));
  }
}

// Anime les os en direct, image par image, avec lissage.
export function createRiggedGait(container) {
  const rig = setupRig(container);
  if (!rig) return null;
  const { nodes, rest } = rig;

  const eased = gaitTargets("idle", 0, 0, 0);
  for (const key of Object.keys(eased)) eased[key] = 0;
  let stride = 0;
  let breath = 0;
  let currentGait = "idle";

  function update(dt, speed, grounded, verticalSpeed) {
    const gait = gaitOf(speed, grounded, verticalSpeed);
    currentGait = gait;
    const walking = gait === "walk" || gait === "run";
    const strength = walking ? Math.min(speed / PLAYER.walkSpeed, 1) : 0;
    breath += dt * 2.2;
    if (walking) stride += dt * Math.PI * 2 * (0.6 + 0.23 * speed);
    const target = gaitTargets(gait, stride, breath, strength);
    const blend = -Math.expm1(-13 * dt);
    for (const key of Object.keys(eased)) eased[key] += (target[key] - eased[key]) * blend;
    composePose(nodes, rest, eased, (role, q) => nodes[role].rotationQuaternion.copyFrom(q));
  }

  return {
    update,
    animations: Object.fromEntries(["idle", "walk", "run", "jump", "fall"].map((g) => [g, "procédural"])),
    weights: () => ({ [currentGait]: 1 }),
  };
}

// Fige la démarche en AnimationGroups keyframés nommés idle/walk/run/jump/fall. Chaque clip
// échantillonne un cycle (foulée ou respiration) ; marche et course bouclent sur la foulée.
const CLIP_SPECS = [
  { name: "idle", gait: "idle", strength: 0, strideTo: 0, breathTo: 10 * Math.PI, frames: 40, period: 14.3 },
  { name: "walk", gait: "walk", strength: 1, strideTo: 2 * Math.PI, breathTo: 0, frames: 24, period: 1.0 },
  { name: "run", gait: "run", strength: 1, strideTo: 2 * Math.PI, breathTo: 0, frames: 24, period: 0.6 },
  { name: "jump", gait: "jump", strength: 0, strideTo: 0, breathTo: 0, frames: 1, period: 1 },
  { name: "fall", gait: "fall", strength: 0, strideTo: 0, breathTo: 0, frames: 1, period: 1 },
];

export function bakeGaitClips(container) {
  const rig = setupRig(container);
  if (!rig) return [];
  const { nodes, rest } = rig;
  const scene = nodes.thighL.getScene();
  const roles = Object.keys(nodes);

  return CLIP_SPECS.map((spec) => {
    const group = new AnimationGroup(spec.name, scene);
    const fps = spec.frames / spec.period;
    const keys = {};
    for (const role of roles) keys[role] = [];
    for (let i = 0; i <= spec.frames; i++) {
      const u = spec.frames === 0 ? 0 : i / spec.frames;
      const v = gaitTargets(spec.gait, u * spec.strideTo, u * spec.breathTo, spec.strength);
      composePose(nodes, rest, v, (role, q) => keys[role].push({ frame: i, value: q.clone() }));
    }
    for (const role of roles) {
      if (!keys[role].length) continue;
      const anim = new Animation(`${spec.name}:${role}`, "rotationQuaternion", fps,
        Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE);
      anim.setKeys(keys[role]);
      group.addTargetedAnimation(anim, nodes[role]);
    }
    return group;
  });
}
