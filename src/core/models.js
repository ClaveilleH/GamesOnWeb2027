import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

// Enregistre le bon plugin de chargement selon l'extension (glTF/GLB ou OBJ).
async function registerLoader(url) {
  if (/\.obj($|\?)/i.test(url)) await import("@babylonjs/loaders/OBJ/index.js");
  else await import("@babylonjs/loaders/glTF/index.js");
}

// Charge un fichier glTF/GLB/OBJ et l'ajoute à la scène. Retourne { container, meshes } : `meshes` sont
// les maillages qui ont des sommets (calque `layerMask`, non sélectionnables, recevant les ombres).
// Un fichier sans maillage est refusé avant d'entrer dans la scène.
export async function loadContainer(scene, url, layerMask) {
  await registerLoader(url);
  const container = await LoadAssetContainerAsync(url, scene);
  try {
    const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
    if (meshes.length === 0) throw new Error(`Le modèle ${url} ne contient aucun maillage.`);
    container.addAllToScene();
    for (const mesh of meshes) {
      mesh.layerMask = layerMask;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
    }
    return { container, meshes };
  } catch (error) {
    container.dispose();
    throw error;
  }
}

// Charge un fichier glTF/GLB/OBJ dans la scène et le cale sous un nœud `root` laissé à l'origine :
// tourné de `pitch` et `yaw` (radians, +Z du fichier vers +Z du monde à 0), mis à la hauteur `height`
// (m) si elle est donnée et mesurable, pieds à y = 0 et centré sur l'axe vertical.
// Retourne { container, root, meshes, size, dispose } : `meshes` sont les maillages qui ont des sommets
// (calque `layerMask`, non sélectionnables, recevant les ombres), `size` l'emprise après calage.
export async function loadFittedModel(scene, url, { name, pitch = 0, yaw = 0, height = null, layerMask }) {
  const { container, meshes } = await loadContainer(scene, url, layerMask);

  const root = new TransformNode(name, scene);
  const fit = new TransformNode(name + " · calage", scene);
  fit.parent = root;
  for (const node of container.rootNodes) node.parent = fit;

  fit.rotation.set(pitch, yaw, 0);
  fit.computeWorldMatrix(true);
  let { min, max } = fit.getHierarchyBoundingVectors(true);
  const modelHeight = max.y - min.y;
  if (height && modelHeight > 1e-4) {
    fit.scaling.setAll(height / modelHeight);
    fit.computeWorldMatrix(true);
    ({ min, max } = fit.getHierarchyBoundingVectors(true));
  }
  const center = Vector3.Center(min, max);
  fit.position.set(-center.x, -min.y, -center.z);

  return {
    container, root, meshes, size: max.subtract(min),
    dispose() {
      container.dispose();
      root.dispose();
    },
  };
}
