import { Clamp } from "@babylonjs/core/Maths/math.scalar.functions";
import { PLAYER } from "../config.js";
import { loadFittedModel } from "../core/models.js";
import { PortalLayers } from "../portals/layers.js";
import { gaitOf } from "./gait.js";
import { bakeGaitClips, createRiggedGait } from "./riggedGait.js";

// Démarches reconnues et mots-clés cherchés dans les noms d'animations du modèle
// quand `character.animations` ne donne pas le nom exact.
const gaitKeywords = {
  idle: ["idle", "stand", "breath", "repos"],
  walk: ["walk", "marche"],
  run: ["run", "sprint", "jog", "course"],
  jump: ["jump", "saut"],
  fall: ["fall", "chute", "air"],
};

function pickAnimations(groups, named) {
  const found = {};
  for (const [gait, keywords] of Object.entries(gaitKeywords)) {
    const wanted = named[gait];
    found[gait] = wanted
      ? groups.find((group) => group.name === wanted) ?? null
      : groups.find((group) => keywords.some((word) => group.name.toLowerCase().includes(word))) ?? null;
  }
  // Une démarche absente reprend la plus proche disponible.
  found.idle ??= found.walk ?? groups[0] ?? null;
  found.walk ??= found.run ?? found.idle;
  found.run ??= found.walk;
  found.fall ??= found.jump ?? found.idle;
  found.jump ??= found.fall;
  return found;
}

// Charge un personnage glTF/GLB et expose la même interface que `createSkeletonVisual` :
// { root, update(dt, speed, grounded, verticalSpeed), materials, setFade(alpha), dispose() }.
// `root` a ses pieds à l'origine, regarde vers +Z et mesure `PLAYER.height`.
// `character` est une entrée de `CHARACTERS` (config) : model, yawOffset, animation, animations, vitesses, blendRate.
export async function createCharacterModel(scene, character) {
  const url = character.model;
  // Calage : hauteur du joueur, pieds au sol, centré sur l'axe vertical, orienté vers +Z.
  const model = await loadFittedModel(scene, url, {
    name: "personnage", yaw: character.yawOffset, height: PLAYER.height, layerMask: PortalLayers.late,
  });
  if (!(model.size.y > 1e-4)) {
    // Le modèle est déjà dans la scène : le retirer avant que le jeu ne reprenne le squelette.
    model.dispose();
    throw new Error(`Le modèle ${url} n'a pas de hauteur mesurable.`);
  }
  const { container, root, meshes } = model;
  const materials = [...new Set(meshes.map((mesh) => mesh.material).filter(Boolean))];

  let update, weights, animations;
  let bakedGroups = [];
  // `animation: "procedural"` : on pilote les os du modèle avec la démarche du squelette (marche,
  // course, idle, saut, chute) au lieu de jouer un clip. Si le rig n'est pas reconnu,
  // on retombe sur les clips du fichier.
  const rig = character.animation === "procedural" ? createRiggedGait(container) : null;
  if (rig) {
    for (const group of [...container.animationGroups]) group.dispose();
    ({ update, weights, animations } = rig);
  } else {
    // `animation: "baked"` : on fige la démarche du squelette en vrais clips keyframés et on jette
    // le clip d'origine du fichier. Sinon on garde les clips du fichier tels quels.
    let groups = container.animationGroups;
    if (character.animation === "baked") {
      const baked = bakeGaitClips(container);
      if (baked.length) {
        for (const group of [...container.animationGroups]) group.dispose();
        groups = bakedGroups = baked;
      }
    }
    for (const group of groups) group.stop();
    const clips = pickAnimations(groups, character.animations);
    const active = [...new Set(Object.values(clips).filter(Boolean))];
    const groupWeights = new Map(active.map((group) => [group, 0]));
    for (const group of active) {
      group.start(true);
      group.weight = 0;
    }
    update = function (dt, speed, grounded, verticalSpeed) {
      if (active.length === 0) return;
      const gait = gaitOf(speed, grounded, verticalSpeed);
      const target = clips[gait];
      const blend = -Math.expm1(-character.blendRate * dt);
      for (const group of active) {
        const weight = groupWeights.get(group) + ((group === target ? 1 : 0) - groupWeights.get(group)) * blend;
        groupWeights.set(group, weight);
        group.weight = weight;
      }
      if (target && (gait === "walk" || gait === "run")) {
        const reference = gait === "run" ? character.runAnimationSpeed : character.walkAnimationSpeed;
        target.speedRatio = Clamp(speed / reference, 0.5, 1.6);
      }
    };
    weights = () => Object.fromEntries(active.map((group) => [group.name, Number(group.weight.toFixed(2))]));
    animations = Object.fromEntries(Object.entries(clips).map(([gait, group]) => [gait, group?.name ?? null]));
  }

  return {
    root, update, materials, weights, animations,
    setFade(alpha) {
      for (const material of materials) material.alpha = alpha;
    },
    dispose() {
      for (const group of bakedGroups) group.dispose();
      model.dispose();
    },
  };
}
