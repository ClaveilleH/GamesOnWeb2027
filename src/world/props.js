import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { collisionLayer } from "../core/physics.js";
import { PortalLayers } from "../portals/layers.js";
import { terrainMaterial } from "./testTerrain.js";

// Enregistre le bon plugin de chargement selon l'extension (glTF/GLB ou OBJ).
async function registerLoader(url) {
  if (/\.obj($|\?)/i.test(url)) await import("@babylonjs/loaders/OBJ/index.js");
  else await import("@babylonjs/loaders/glTF/index.js");
}

// Charge un décor glTF/GLB fixe et le pose dans le monde, pieds au sol, centré sur
// son emprise, orienté par `yaw`. `height` (m) met le modèle à l'échelle ; une boîte
// de collision statique à l'emprise arrête le joueur sauf si `collision` est false.
// Retourne { root, casters, dispose } : `casters` sont les maillages à ombrer.
export async function loadDecorProp(scene, spec) {
  await registerLoader(spec.url);
  const container = await LoadAssetContainerAsync(spec.url, scene);
  const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  if (meshes.length === 0) {
    container.dispose();
    throw new Error(`Le décor ${spec.url} ne contient aucun maillage.`);
  }
  container.addAllToScene();

  const root = new TransformNode(spec.name, scene);
  const fit = new TransformNode(spec.name + " · calage", scene);
  fit.parent = root;
  for (const node of container.rootNodes) node.parent = fit;

  // Calage mesuré pendant que `root` est encore à l'origine : l'emprise reste en
  // coordonnées locales, ce qui donne directement la taille de la boîte de collision.
  fit.rotation.set(spec.pitch ?? 0, spec.yaw ?? 0, spec.roll ?? 0);
  fit.computeWorldMatrix(true);
  let { min, max } = fit.getHierarchyBoundingVectors(true);
  if (spec.height) {
    const modelHeight = max.y - min.y;
    if (modelHeight > 1e-4) {
      fit.scaling.setAll(spec.height / modelHeight);
      fit.computeWorldMatrix(true);
      ({ min, max } = fit.getHierarchyBoundingVectors(true));
    }
  }
  const center = Vector3.Center(min, max);
  fit.position.set(-center.x, -min.y, -center.z);
  const size = max.subtract(min);

  // Matériau uni optionnel : indispensable pour un OBJ sans .mtl (sinon blanc par défaut).
  const material = spec.color ? terrainMaterial(scene, spec.name, spec.color) : null;
  for (const mesh of meshes) {
    mesh.layerMask = PortalLayers.world;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    if (material) mesh.material = material;
  }

  const position = new Vector3(spec.position.x, spec.position.y, spec.position.z);
  let collider = null;
  if (spec.collision !== false && size.y > 1e-4) {
    collider = CreateBox(spec.name + " · collision", { width: size.x, height: size.y, depth: size.z }, scene);
    collider.position.set(position.x, position.y + size.y / 2, position.z);
    collider.isVisible = false;
    collider.isPickable = false;
    const aggregate = new PhysicsAggregate(collider, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
    aggregate.shape.filterMembershipMask = collisionLayer.terrain;
  }

  root.position.copyFrom(position);

  return {
    root,
    casters: meshes,
    position,
    spec,
    dispose() {
      collider?.dispose();
      container.dispose();
      root.dispose();
    },
  };
}
