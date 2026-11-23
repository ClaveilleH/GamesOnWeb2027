import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Animation } from "@babylonjs/core/Animations/animation";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { advanceGait, createGaitPhase, gaitBlend, gaitTargets } from "./gait.js";

// Démarche procédurale (gait.js, la même que le squelette d'os) portée sur un modèle à squelette
// (os nommés) : idle, marche, course, saut, chute. Deux usages :
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

// Axes LOCAUX de rotation, propres au rig : `swing` = balancement avant/arrière ; `spread` = écartement
// des bras. Un axe opposé (par exemple −X) inverse le sens d'un mouvement.
const X = Object.freeze(new Vector3(1, 0, 0));
const Y = Object.freeze(new Vector3(0, 1, 0));
const Z = Object.freeze(new Vector3(0, 0, 1));
const AXES = Object.freeze({ swing: X, spread: Z, hipsYaw: Y, chest: X, head: Y });

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

const tmp = new Quaternion();
const pose = new Quaternion();
// Quaternion local d'un os : rest · rotation(axis, angle) [· rotation(axis2, angle2)], dans un tampon partagé.
function boneQuat(restQ, axis, angle, axis2, angle2) {
  Quaternion.RotationAxisToRef(axis, angle, tmp);
  restQ.multiplyToRef(tmp, pose);
  if (axis2) {
    Quaternion.RotationAxisToRef(axis2, angle2, tmp);
    pose.multiplyToRef(tmp, pose);
  }
  return pose;
}

// Applique les angles `v` à tous les os. `write(role, quaternion)` reçoit chaque pose, à copier aussitôt.
function composePose(nodes, rest, v, write) {
  if (nodes.hips) write("hips", boneQuat(rest.get(nodes.hips), AXES.hipsYaw, v.hipsYaw));
  if (nodes.chest) write("chest", boneQuat(rest.get(nodes.chest), AXES.chest, v.chestX));
  if (nodes.head) write("head", boneQuat(rest.get(nodes.head), AXES.head, v.headY));
  for (const role of SWING_ROLES) {
    if (nodes[role]) write(role, boneQuat(rest.get(nodes[role]), AXES.swing, v[role]));
  }
  for (const [role, spread] of ARM_ROLES) {
    if (nodes[role]) write(role, boneQuat(rest.get(nodes[role]), AXES.swing, v[role], AXES.spread, v[spread]));
  }
}

// Anime les os en direct, image par image, avec lissage.
export function createRiggedGait(container) {
  const rig = setupRig(container);
  if (!rig) return null;
  const { nodes, rest } = rig;

  const phase = createGaitPhase();
  const target = gaitTargets("idle", 0, 0, 0);
  const keys = Object.keys(target);
  const eased = Object.fromEntries(keys.map((key) => [key, 0]));
  const writeBone = (role, q) => nodes[role].rotationQuaternion.copyFrom(q);

  function update(dt, speed, grounded, verticalSpeed) {
    const { gait, strength, stride, breath } = advanceGait(phase, dt, speed, grounded, verticalSpeed);
    gaitTargets(gait, stride, breath, strength, target);
    const blend = gaitBlend(dt);
    for (const key of keys) eased[key] += (target[key] - eased[key]) * blend;
    composePose(nodes, rest, eased, writeBone);
  }

  return {
    update,
    animations: Object.fromEntries(["idle", "walk", "run", "jump", "fall"].map((g) => [g, "procédural"])),
    weights: () => ({ [phase.gait]: 1 }),
  };
}

// Fige la démarche en AnimationGroups keyframés nommés idle/walk/run/jump/fall. Chaque clip
// échantillonne un cycle (foulée ou respiration) ; marche et course bouclent sur la foulée.
const CLIP_SPECS = [
  { gait: "idle", strength: 0, strideTo: 0, breathTo: 10 * Math.PI, frames: 40, period: 14.3 },
  { gait: "walk", strength: 1, strideTo: 2 * Math.PI, breathTo: 0, frames: 24, period: 1.0 },
  { gait: "run", strength: 1, strideTo: 2 * Math.PI, breathTo: 0, frames: 24, period: 0.6 },
  { gait: "jump", strength: 0, strideTo: 0, breathTo: 0, frames: 1, period: 1 },
  { gait: "fall", strength: 0, strideTo: 0, breathTo: 0, frames: 1, period: 1 },
];

export function bakeGaitClips(container) {
  const rig = setupRig(container);
  if (!rig) return [];
  const { nodes, rest } = rig;
  const scene = nodes.thighL.getScene();
  const roles = Object.keys(nodes);

  return CLIP_SPECS.map((spec) => {
    const group = new AnimationGroup(spec.gait, scene);
    const fps = spec.frames / spec.period;
    const keys = {};
    for (const role of roles) keys[role] = [];
    for (let i = 0; i <= spec.frames; i++) {
      const u = i / spec.frames;
      const v = gaitTargets(spec.gait, u * spec.strideTo, u * spec.breathTo, spec.strength);
      composePose(nodes, rest, v, (role, q) => keys[role].push({ frame: i, value: q.clone() }));
    }
    for (const role of roles) {
      if (!keys[role].length) continue;
      const anim = new Animation(`${spec.gait}:${role}`, "rotationQuaternion", fps,
        Animation.ANIMATIONTYPE_QUATERNION, Animation.ANIMATIONLOOPMODE_CYCLE);
      anim.setKeys(keys[role]);
      group.addTargetedAnimation(anim, nodes[role]);
    }
    return group;
  });
}
