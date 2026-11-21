import { Mesh } from "@babylonjs/core/Meshes/mesh";

export function batchStaticMeshes(zone, meshes) {
  const batches = [];
  const groups = new Map();
  for (const mesh of meshes) {
    if (!mesh.material || mesh.material.subMaterials || mesh.isAnInstance || mesh.hasInstances || mesh.hasThinInstances) {
      batches.push(mesh);
      continue;
    }
    // MergeMeshes exige les mêmes attributs de sommet, même si le matériau les ignore.
    const key = [mesh.material.uniqueId, mesh.getVerticesDataKinds().sort().join(","), mesh.sideOrientation,
      mesh.layerMask, mesh.receiveShadows, mesh.isPickable].join("/");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  }

  for (const group of groups.values()) {
    const first = group[0];
    if (group.length === 1) {
      first.freezeWorldMatrix();
      batches.push(first);
      continue;
    }
    const merged = Mesh.MergeMeshes(group, false, true);
    merged.name = zone + " · " + first.material.name;
    merged.layerMask = first.layerMask;
    merged.receiveShadows = first.receiveShadows;
    merged.isPickable = first.isPickable;
    merged.cullingStrategy = Mesh.CULLINGSTRATEGY_STANDARD;
    merged.freezeWorldMatrix();
    batches.push(merged);
    for (const mesh of group) {
      // Havok a copié la forme. La scène garde le nœud pour libérer son PhysicsAggregate à la fermeture.
      if (mesh.physicsBody) {
        mesh.setEnabled(false);
        mesh.releaseSubMeshes();
        mesh.geometry.releaseForMesh(mesh, true);
        const scene = mesh.getScene();
        scene.removeMesh(mesh);
        scene.addTransformNode(mesh);
      } else {
        mesh.dispose();
      }
    }
  }
  return batches;
}
