import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { BoundingBox } from "@babylonjs/core/Culling/boundingBox";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PLAYER } from "../config.js";
import { collisionLayer } from "../core/physics.js";
import { PortalLayers } from "../portals/layers.js";
import { batchStaticMeshes } from "./staticBatch.js";

// Propriétés d'un nœud de map : `extras` glTF, c'est-à-dire les « Custom Properties » de Blender.
const extrasOf = (node) => node.metadata?.gltf?.extras ?? {};

// `collider` du nœud ou de son plus proche ancêtre qui en a un : "mesh" par défaut.
function colliderOf(node) {
  for (let current = node; current; current = current.parent) {
    const { collider } = extrasOf(current);
    if (collider) return collider;
  }
  return "mesh";
}

// Un export sans indices (three.js) est marqué `isUnIndexed` et `getIndices()` y renvoie [] :
// ni Havok ni la fusion par matériau n'y verraient un seul triangle.
function indexTriangles(mesh) {
  if (!mesh.isUnIndexed) return;
  mesh.setIndices(Uint32Array.from({ length: mesh.getTotalVertices() }, (_, i) => i));
  mesh.isUnIndexed = false;
}

// Une matrice monde par exemplaire affiché : chaque thin instance (EXT_mesh_gpu_instancing), sinon le maillage.
// L'extension du chargeur qui crée des thin instances installe aussi `thinInstanceGetWorldMatrices`.
function worldMatricesOf(mesh) {
  const world = mesh.computeWorldMatrix(true);
  return mesh.hasThinInstances ? mesh.thinInstanceGetWorldMatrices().map((instance) => instance.multiply(world)) : [world];
}

// Un seul corps statique pour tous les triangles en collision, sommets passés en coordonnées monde :
// la hiérarchie glTF (et sa racine en miroir) ne concerne plus Havok.
function createMeshCollider(scene, meshes) {
  const positions = [];
  const indices = [];
  const point = new Vector3();
  for (const mesh of meshes) {
    const local = mesh.getVerticesData(VertexBuffer.PositionKind);
    const meshIndices = mesh.getIndices();
    for (const world of worldMatricesOf(mesh)) {
      const base = positions.length / 3;
      for (let i = 0; i < local.length; i += 3) {
        Vector3.TransformCoordinatesFromFloatsToRef(local[i], local[i + 1], local[i + 2], world, point);
        positions.push(point.x, point.y, point.z);
      }
      for (const index of meshIndices) indices.push(base + index);
    }
  }
  const collider = new Mesh("map · collisions", scene);
  Object.assign(new VertexData(), { positions, indices }).applyToMesh(collider);
  solidCollider(collider, PhysicsShapeType.MESH);
}

function createBoxColliders(scene, mesh) {
  // Boîte de la géométrie seule : avec des thin instances, `getBoundingInfo()` les englobe toutes.
  const { minimum, maximum } = (mesh.rawBoundingInfo ?? mesh.getBoundingInfo()).boundingBox;
  for (const world of worldMatricesOf(mesh)) {
    const { minimumWorld: min, maximumWorld: max } = new BoundingBox(minimum, maximum, world);
    const size = max.subtract(min);
    const collider = CreateBox(mesh.name + " · collision", { width: size.x, height: size.y, depth: size.z }, scene);
    collider.position.copyFrom(Vector3.Center(min, max));
    solidCollider(collider, PhysicsShapeType.BOX);
  }
}

function solidCollider(collider, shapeType) {
  collider.isVisible = false;
  collider.isPickable = false;
  const aggregate = new PhysicsAggregate(collider, shapeType, { mass: 0, friction: 0.8 }, collider.getScene());
  aggregate.shape.filterMembershipMask = collisionLayer.terrain;
}

// Départ : nœud `spawn: true`, pieds à sa position, regard selon son axe +Z glTF (−Y d'un objet Blender).
// Sans départ, le joueur tombe sur l'origine depuis le haut de la map (`top`).
function findSpawn(container, top) {
  const node = [...container.transformNodes, ...container.meshes].find((candidate) => extrasOf(candidate).spawn);
  if (!node) console.warn("Map sans nœud `spawn` : départ au-dessus de l'origine.");
  const world = node?.computeWorldMatrix(true);
  const feet = node ? node.getAbsolutePosition().clone() : new Vector3(0, top, 0);
  const forward = node ? Vector3.TransformNormal(Vector3.Forward(), world) : Vector3.Forward();
  return {
    feet,
    // Centre de la capsule, quelques centimètres au-dessus du sol : le joueur se pose au premier pas.
    position: feet.add(new Vector3(0, PLAYER.height / 2 + 0.05, 0)),
    yaw: Math.atan2(forward.x, forward.z),
  };
}

// Charge une map glTF/GLB (docs/MAPS.md) à la place du terrain d'entraînement. Les maillages sont
// rendus dans le monde, reçoivent et projettent les ombres et arrêtent le joueur selon `collider`.
// Retourne { casters, spawn: { feet, position, yaw }, respawnBelow }. En cas d'échec, la scène
// est rendue telle qu'avant l'appel.
export async function loadMap(scene, url) {
  await import("@babylonjs/loaders/glTF/index.js");
  const container = await LoadAssetContainerAsync(url, scene);
  const previousMeshes = new Set(scene.meshes);
  try {
    const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
    if (meshes.length === 0) throw new Error(`La map ${url} ne contient aucun maillage.`);
    container.addAllToScene();
    // La map est statique : ses maillages vont être fusionnés, une animation n'aurait plus rien à animer.
    for (const group of [...container.animationGroups]) group.dispose();

    const solid = [];
    for (const mesh of meshes) {
      indexTriangles(mesh);
      mesh.layerMask = PortalLayers.world;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      const collider = colliderOf(mesh);
      if (collider === "mesh") solid.push(mesh);
      else if (collider === "box") createBoxColliders(scene, mesh);
      else if (collider !== "none") console.warn(`${mesh.name} : collider « ${collider} » inconnu, ignoré.`);
    }
    if (solid.length > 0) createMeshCollider(scene, solid);

    const inMap = new Set(meshes);
    const { min, max } = scene.getWorldExtends((mesh) => inMap.has(mesh));
    const spawn = findSpawn(container, max.y);
    return {
      // Après les collisions : la fusion par matériau supprime les maillages d'origine.
      casters: batchStaticMeshes("map", meshes),
      spawn,
      // Même marge sous le point le plus bas de la map que sous le terrain d'entraînement, dont le sol est à 0.
      respawnBelow: min.y + PLAYER.respawnBelow,
    };
  } catch (error) {
    container.dispose();
    // Restent les colliders, chacun avec son PhysicsAggregate, et les lots déjà fusionnés.
    for (const mesh of scene.meshes.filter((mesh) => !previousMeshes.has(mesh))) mesh.dispose();
    throw error;
  }
}
