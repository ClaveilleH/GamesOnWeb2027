import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { loadFittedModel } from "../core/models.js";
import { collisionLayer } from "../core/physics.js";
import { PortalLayers } from "../portals/layers.js";
import { terrainMaterial } from "./testTerrain.js";

// Charge un décor glTF/GLB/OBJ fixe et le pose dans le monde, pieds au sol, centré sur
// son emprise, orienté par `yaw` et `pitch`. `height` (m) met le modèle à l'échelle ; une boîte
// de collision statique à l'emprise arrête le joueur sauf si `collision` est false.
// Retourne { root, casters, spec, dispose } : `casters` sont les maillages à ombrer.
export async function loadDecorProp(scene, spec) {
  // Calage mesuré pendant que `root` est encore à l'origine : l'emprise reste en
  // coordonnées locales, ce qui donne directement la taille de la boîte de collision.
  const model = await loadFittedModel(scene, spec.url, {
    name: spec.name, pitch: spec.pitch, yaw: spec.yaw, height: spec.height, layerMask: PortalLayers.world,
  });
  const { root, meshes, size } = model;

  // Matériau uni optionnel : indispensable pour un OBJ sans .mtl (sinon blanc par défaut).
  if (spec.color) {
    const material = terrainMaterial(scene, spec.name, spec.color);
    for (const mesh of meshes) mesh.material = material;
  }

  root.position.set(spec.position.x, spec.position.y, spec.position.z);
  let collider = null;
  if (spec.collision !== false && size.y > 1e-4) {
    collider = CreateBox(spec.name + " · collision", { width: size.x, height: size.y, depth: size.z }, scene);
    collider.position.set(root.position.x, root.position.y + size.y / 2, root.position.z);
    collider.isVisible = false;
    collider.isPickable = false;
    const aggregate = new PhysicsAggregate(collider, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
    aggregate.shape.filterMembershipMask = collisionLayer.terrain;
  }

  return {
    root,
    casters: meshes,
    spec,
    dispose() {
      collider?.dispose();
      model.dispose();
    },
  };
}
