import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
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

// Un seul corps statique pour tous les triangles en collision, sommets passés en coordonnées monde :
// la hiérarchie glTF (et sa racine en miroir) ne concerne plus Havok.
function createMeshCollider(scene, meshes) {
  const positions = [];
  const indices = [];
  const point = new Vector3();
  for (const mesh of meshes) {
    const world = mesh.computeWorldMatrix(true);
    const local = mesh.getVerticesData(VertexBuffer.PositionKind);
    const base = positions.length / 3;
    for (let i = 0; i < local.length; i += 3) {
      Vector3.TransformCoordinatesFromFloatsToRef(local[i], local[i + 1], local[i + 2], world, point);
      positions.push(point.x, point.y, point.z);
    }
    const meshIndices = mesh.getIndices() ?? Array.from({ length: local.length / 3 }, (_, i) => i);
    for (const index of meshIndices) indices.push(base + index);
  }
  const collider = new Mesh("map · collisions", scene);
  Object.assign(new VertexData(), { positions, indices }).applyToMesh(collider);
  solidCollider(collider, PhysicsShapeType.MESH);
}

function createBoxCollider(scene, mesh) {
  mesh.computeWorldMatrix(true);
  const { minimumWorld: min, maximumWorld: max } = mesh.getBoundingInfo().boundingBox;
  const size = max.subtract(min);
  const collider = CreateBox(mesh.name + " · collision", { width: size.x, height: size.y, depth: size.z }, scene);
  collider.position.copyFrom(Vector3.Center(min, max));
  solidCollider(collider, PhysicsShapeType.BOX);
}

function solidCollider(collider, shapeType) {
  collider.isVisible = false;
  collider.isPickable = false;
  const aggregate = new PhysicsAggregate(collider, shapeType, { mass: 0, friction: 0.8 }, collider.getScene());
  aggregate.shape.filterMembershipMask = collisionLayer.terrain;
}

// Départ : nœud `spawn: true`, pieds à sa position, regard selon son axe +Z glTF (−Y d'un objet Blender).
// Sans départ, le joueur tombe au-dessus de l'origine.
function findSpawn(container) {
  const node = [...container.transformNodes, ...container.meshes].find((candidate) => extrasOf(candidate).spawn);
  if (!node) console.warn("Map sans nœud `spawn` : départ à l'origine.");
  const world = node?.computeWorldMatrix(true);
  const feet = node ? node.getAbsolutePosition().clone() : Vector3.Zero();
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
// Retourne { casters, spawn: { feet, position, yaw } }.
export async function loadMap(scene, url) {
  await import("@babylonjs/loaders/glTF/index.js");
  const container = await LoadAssetContainerAsync(url, scene);
  container.addAllToScene();
  const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  if (meshes.length === 0) throw new Error(`La map ${url} ne contient aucun maillage.`);

  const solid = [];
  for (const mesh of meshes) {
    mesh.layerMask = PortalLayers.world;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    const collider = colliderOf(mesh);
    if (collider === "mesh") solid.push(mesh);
    else if (collider === "box") createBoxCollider(scene, mesh);
    else if (collider !== "none") console.warn(`${mesh.name} : collider « ${collider} » inconnu, ignoré.`);
  }
  if (solid.length > 0) createMeshCollider(scene, solid);

  const spawn = findSpawn(container);
  // Après les collisions : la fusion par matériau supprime les maillages d'origine.
  return { casters: batchStaticMeshes("map", meshes), spawn };
}
