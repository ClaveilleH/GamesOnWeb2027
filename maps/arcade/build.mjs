// Assemble la salle, la façade et les abords de source/ en public/models/maps/arcade.glb (npm run maps).
// La géométrie et le départ sont définis dans les sources (voir docs/MAPS.md).
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, join, mergeDocuments, quantize, unpartition, weld } from "@gltf-transform/functions";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const OUTPUT = here("../../public/models/maps/arcade.glb");

// Mesures des sources en mètres, dans le repère glTF (+Y vers le haut).
const HALL_DOOR_Z = 1.4; // milieu de l'ouverture du mur +X de la salle
const HALL_WALL_OUTSIDE_X = 5.56; // face extérieure du mur +X, moulures comprises
const FACADE_BACK_Z = -0.72; // dos de la façade
const FACADE_LIFT = 0.02; // la marche de 0,14 m doit affleurer le seuil de 0,16 m

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hall = await io.read(here("source/salle.glb"));
const facade = await io.read(here("source/facade.glb"));
const outside = await io.read(here("source/abords.glb"));

// Un quart de tour autour de +Y aligne la porte de la façade sur l'ouverture du mur +X.
sceneRoot(facade)
  .setRotation([0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)])
  .setTranslation([HALL_WALL_OUTSIDE_X - FACADE_BACK_Z, FACADE_LIFT, HALL_DOOR_Z]);

const scene = hall.getRoot().getDefaultScene();
for (const source of [facade, outside]) {
  const merged = mergeDocuments(hall, source);
  scene.addChild(merged.get(sceneRoot(source)));
}
for (const other of hall.getRoot().listScenes()) if (other !== scene) other.dispose();

// flatten et join suppriment les nœuds vides. Le départ peut hériter du placement de ses parents.
const spawns = [];
scene.traverse((node) => {
  if (node.getExtras().spawn) {
    spawns.push({ name: node.getName(), matrix: node.getWorldMatrix(), extras: node.getExtras() });
  }
});

// Babylon a besoin d'indices pour retourner les faces en miroir.
await hall.transform(weld(), dedup(), flatten());

// Ce parent empêche join de mêler les accents (ampoules comprises) aux obstacles.
const decorations = hall.createNode("decors").setExtras({ collider: "none" });
for (const node of scene.listChildren()) {
  if (node.getExtras().role === "accent") decorations.addChild(node);
}
scene.addChild(decorations);
await hall.transform(join(), quantize({ quantizeNormal: 8 }), unpartition());

for (const { name, matrix, extras } of spawns) {
  scene.addChild(hall.createNode(name).setMatrix(matrix).setExtras(extras));
}
await io.write(OUTPUT, hall);
console.log(`Map écrite : ${OUTPUT}`);

function sceneRoot(document) {
  const roots = document.getRoot().getDefaultScene().listChildren();
  if (roots.length !== 1) throw new Error(`Une seule racine attendue, ${roots.length} trouvées.`);
  return roots[0];
}
