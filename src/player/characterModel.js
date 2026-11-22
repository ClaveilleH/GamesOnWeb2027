import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CHARACTER, PLAYER } from "../config.js";
import { PortalLayers } from "../portals/layers.js";
import { gaitOf } from "./gait.js";

// Démarches reconnues et mots-clés cherchés dans les noms d'animations du modèle
// quand `CHARACTER.animations` ne donne pas le nom exact.
const gaitKeywords = {
  idle: ["idle", "stand", "breath", "repos"],
  walk: ["walk", "marche"],
  run: ["run", "sprint", "jog", "course"],
  jump: ["jump", "saut"],
  fall: ["fall", "chute", "air"],
};

function pickAnimations(groups) {
  const found = {};
  for (const [gait, keywords] of Object.entries(gaitKeywords)) {
    const wanted = CHARACTER.animations[gait];
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
export async function createCharacterModel(scene, url) {
  await import("@babylonjs/loaders/glTF/index.js");
  const container = await LoadAssetContainerAsync(url, scene);
  if (!container.meshes.some((mesh) => mesh.getTotalVertices() > 0)) {
    container.dispose();
    throw new Error(`Le modèle ${url} ne contient aucun maillage.`);
  }
  container.addAllToScene();

  const root = new TransformNode("personnage", scene);
  const fit = new TransformNode("personnage · calage", scene);
  fit.parent = root;
  for (const node of container.rootNodes) node.parent = fit;

  // Calage : hauteur du joueur, pieds au sol, centré sur l'axe vertical, orienté vers +Z.
  fit.rotation.y = CHARACTER.yawOffset;
  fit.computeWorldMatrix(true);
  let { min, max } = fit.getHierarchyBoundingVectors(true);
  const height = max.y - min.y;
  if (!(height > 0)) {
    // Le modèle est déjà dans la scène : le retirer avant que le jeu ne reprenne le squelette.
    container.dispose();
    root.dispose();
    throw new Error(`Le modèle ${url} n'a pas de hauteur mesurable.`);
  }
  fit.scaling.setAll(PLAYER.height / height);
  fit.computeWorldMatrix(true);
  ({ min, max } = fit.getHierarchyBoundingVectors(true));
  const center = Vector3.Center(min, max);
  fit.position.set(-center.x, -min.y, -center.z);

  const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  for (const mesh of meshes) {
    mesh.layerMask = PortalLayers.late;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
  }
  const materials = [...new Set(meshes.map((mesh) => mesh.material).filter(Boolean))];

  const groups = container.animationGroups;
  for (const group of groups) group.stop();
  const clips = pickAnimations(groups);
  const active = [...new Set(Object.values(clips).filter(Boolean))];
  const weights = new Map(active.map((group) => [group, 0]));
  for (const group of active) {
    group.start(true);
    group.weight = 0;
  }

  function update(dt, speed, grounded, verticalSpeed) {
    if (active.length === 0) return;
    const gait = gaitOf(speed, grounded, verticalSpeed);
    const target = clips[gait];
    const blend = -Math.expm1(-CHARACTER.blendRate * dt);
    for (const group of active) {
      const weight = weights.get(group) + ((group === target ? 1 : 0) - weights.get(group)) * blend;
      weights.set(group, weight);
      group.weight = weight;
    }
    if (target && (gait === "walk" || gait === "run")) {
      const reference = gait === "run" ? CHARACTER.runAnimationSpeed : CHARACTER.walkAnimationSpeed;
      target.speedRatio = Math.min(1.6, Math.max(0.5, speed / reference));
    }
  }

  return {
    root, update, materials,
    weights: () => Object.fromEntries(active.map((group) => [group.name, Number(group.weight.toFixed(2))])),
    animations: Object.fromEntries(Object.entries(clips).map(([gait, group]) => [gait, group?.name ?? null])),
    setFade(alpha) {
      if (materials.length === 0 || materials[0].alpha === alpha) return false;
      for (const material of materials) material.alpha = alpha;
      return true;
    },
    dispose() {
      container.dispose();
      root.dispose();
    },
  };
}
