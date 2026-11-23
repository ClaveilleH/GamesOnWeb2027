// Assemble la salle d'arcade et sa façade en une seule map jouable : public/models/maps/arcade.glb.
// Lancer : npm run maps. Sources : source/salle.glb et source/facade.glb, exports three.js
// (glTF : Y vers le haut, mètres, faces avant vers +Z). Conventions de map : docs/MAPS.md.
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, join, mergeDocuments, quantize, unpartition, weld } from "@gltf-transform/functions";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const OUTPUT = here("../../public/models/maps/arcade.glb");

// Mesures relevées sur les sources (coordonnées glTF de chaque fichier).
const HALL_DOOR_Z = 1.4; // milieu de l'ouverture du mur +X de la salle (z de 0,54 à 2,26)
const HALL_WALL_OUTSIDE_X = 5.56; // face extérieure du mur +X, moulures comprises
const FACADE_BACK_Z = -0.72; // dos de la façade
// Marche de la façade (0,14 m) au niveau du seuil de la salle (0,16 m) : sans rebord, le joueur passe
// sans avoir à monter une marche (le contrôleur demande de la hauteur libre au-dessus de la tête).
const FACADE_LIFT = 0.02;
const DOOR_HINGE = { x: 0.85, z: -0.54 }; // gonds des battants : bords extérieurs, face arrière
// Le joueur (1,92 m) ne passe pas sous l'imposte d'origine (1,95 m, marche à 0,14 m) : on la remonte
// sous le linteau (2,37 m), avec de la marge pour la tête. Hauteurs [bas, haut] de chaque boîte, avant → après.
const TRANSOM = [
  { from: [1.95, 2.03], to: [2.18, 2.23] }, // traverse
  { from: [2.01, 2.39], to: [2.22, 2.39] }, // vitrage
];
const WALL = { inside: 3.75, outside: 4, height: 3.75 }; // murs de la salle : épaisseur 0,25 m

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const hall = await io.read(here("source/salle.glb"));
const facade = await io.read(here("source/facade.glb"));

openDoors(facade);
const hallRoot = sceneRoot(hall).setName("salle");
const facadeSource = sceneRoot(facade);
const merged = mergeDocuments(hall, facade);
const scene = hall.getRoot().getDefaultScene();
for (const other of hall.getRoot().listScenes()) if (other !== scene) other.dispose();

// Façade contre le mur +X, tournée vers +X, porte dans l'axe de celle de la salle.
const facadeRoot = merged.get(facadeSource).setName("facade")
  .setRotation(yawQuaternion(90))
  .setTranslation([HALL_WALL_OUTSIDE_X - FACADE_BACK_Z, FACADE_LIFT, HALL_DOOR_Z]);
scene.addChild(facadeRoot);

// Les confettis du sol affleurent le dessus de la dalle (y = 0,15) : sans écart, ils scintillent.
for (const node of hallRoot.listChildren().flatMap(descendants)) {
  if (node.getName().startsWith("floor_") && node.getExtras().role === "accent") {
    const [x, y, z] = node.getTranslation();
    node.setTranslation([x, y + 0.003, z]);
  }
}

// La salle est livrée ouverte comme une maquette (pas de mur +Z, pas de toit) : on la ferme.
const material = (name) => hall.getRoot().listMaterials().find((m) => m.getName() === name);
const sootBlack = material("soot black");
const neonPurpleDark = material("neon purple dark");
const closure = hall.createNode("salle_fermeture");
hallRoot.addChild(closure);
addBox(closure, "mur_avant", [-5.5, 0, WALL.inside], [5.5, WALL.height, WALL.outside], sootBlack);
// Mêmes filets que le mur du fond : à 1,14 m dedans, en haut dehors.
addBox(closure, "mur_avant_filet", [-5.25, 1.14, WALL.inside - 0.04], [5.25, 1.2, WALL.inside], neonPurpleDark);
addBox(closure, "mur_avant_corniche", [-5.53, 3.45, WALL.outside], [5.53, 3.63, WALL.outside + 0.04], neonPurpleDark);
addBox(closure, "toit", [-5.56, WALL.height, -4.06], [5.56, WALL.height + 0.15, WALL.outside + 0.06], sootBlack);

// Abords : chaussée et trottoir devant la façade.
const outside = hall.createNode("abords");
scene.addChild(outside);
const asphalt = hall.createMaterial("asphalte").setBaseColorFactor([0.028, 0.03, 0.034, 1])
  .setRoughnessFactor(0.95).setMetallicFactor(0);
const pavement = hall.createMaterial("trottoir").setBaseColorFactor([0.16, 0.165, 0.18, 1])
  .setRoughnessFactor(0.9).setMetallicFactor(0);
addBox(outside, "chaussee", [-20, -0.2, -20], [25, 0, 20], asphalt);
addBox(outside, "trottoir", [HALL_WALL_OUTSIDE_X, 0, -5], [9.5, 0.1, 6], pavement);

// Babylon a besoin d'indices pour retourner les faces en miroir.
await hall.transform(weld(), dedup(), flatten());

// Ce parent empêche join de mêler les accents (ampoules comprises) aux obstacles.
const decorations = hall.createNode("decors").setExtras({ collider: "none" });
for (const node of scene.listChildren()) {
  if (node.getExtras().role === "accent") decorations.addChild(node);
}
scene.addChild(decorations);
await hall.transform(join(), quantize({ quantizeNormal: 8 }), unpartition());

// Après la fusion pour conserver ce nœud vide, sur la chaussée face à la porte (+Z local vers −X).
const spawn = hall.createNode("spawn").setTranslation([11.5, 0, HALL_DOOR_Z]).setRotation(yawQuaternion(-90))
  .setExtras({ spawn: true });
scene.addChild(spawn);
await io.write(OUTPUT, hall);
console.log(`Map écrite : ${OUTPUT}`);

function sceneRoot(document) {
  const roots = document.getRoot().getDefaultScene().listChildren();
  if (roots.length !== 1) throw new Error(`Une seule racine attendue, ${roots.length} trouvées.`);
  return roots[0];
}

function descendants(node) {
  return [node, ...node.listChildren().flatMap(descendants)];
}

// Quaternion d'une rotation de `degrees` autour de +Y (glTF, sens direct vu d'en haut : +Z vers +X).
function yawQuaternion(degrees) {
  const half = degrees * Math.PI / 360;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

// Boîte indexée de `min` à `max` (coordonnées du parent), centrée sur son nœud.
function addBox(parent, name, min, max, mat) {
  const document = hall;
  const center = min.map((v, i) => (v + max[i]) / 2);
  const half = max.map((v, i) => (v - min[i]) / 2);
  const positions = [];
  const normals = [];
  const indices = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
      const base = positions.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [0, 0, 0];
        p[axis] = sign * half[axis];
        p[u] = a * half[u];
        p[v] = b * half[v];
        positions.push(...p);
        normals.push(...[0, 1, 2].map((i) => (i === axis ? sign : 0)));
      }
      // Sens direct vu de l'extérieur.
      indices.push(...(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map((i) => base + i));
    }
  }
  const buffer = document.getRoot().listBuffers()[0];
  const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const primitive = document.createPrimitive().setMaterial(mat)
    .setAttribute("POSITION", accessor("VEC3", new Float32Array(positions)))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array(normals)))
    .setIndices(accessor("SCALAR", new Uint16Array(indices)));
  const node = document.createNode(name).setTranslation(center).setMesh(document.createMesh(name).addPrimitive(primitive));
  parent.addChild(node);
  return node;
}

// Les battants sont livrés fermés. Chaque maillage `doors_*` est fait de boîtes de 36 sommets :
// celles d'un battant (sous la traverse, entre les montants) passent dans un nœud par battant, articulé
// sur son gond et ouvert à 90° vers l'intérieur, comme le veulent les barres de poussée côté rue.
// Le montant central suit le battant droit.
function openDoors(document) {
  const sides = {
    gauche: { hinge: [-DOOR_HINGE.x, 0, DOOR_HINGE.z], yaw: 90, primitives: [] },
    droite: { hinge: [DOOR_HINGE.x, 0, DOOR_HINGE.z], yaw: -90, primitives: [] },
  };
  let doorsParent = null;
  let transoms = 0;
  for (const node of document.getRoot().listNodes()) {
    if (!node.getName().startsWith("doors_") || !node.getMesh()) continue;
    const world = node.getWorldMatrix();
    if (world.some((value, i) => i < 12 && value !== (i % 5 === 0 ? 1 : 0))) {
      throw new Error(`${node.getName()} : seule une translation est attendue.`);
    }
    const offset = world.slice(12, 15);
    doorsParent = node.getParentNode();
    for (const primitive of node.getMesh().listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      const normal = primitive.getAttribute("NORMAL");
      if (primitive.getIndices() || position.getCount() % 36) throw new Error(`${node.getName()} : boîtes de 36 sommets attendues.`);
      const kept = { positions: [], normals: [] };
      const leaves = { gauche: { positions: [], normals: [] }, droite: { positions: [], normals: [] } };
      const p = [0, 0, 0];
      const n = [0, 0, 0];
      for (let box = 0; box < position.getCount(); box += 36) {
        const center = [0, 0, 0];
        let [bottom, top] = [Infinity, -Infinity];
        for (let i = box; i < box + 36; i++) {
          position.getElement(i, p);
          for (let k = 0; k < 3; k++) center[k] += (p[k] + offset[k]) / 36;
          bottom = Math.min(bottom, p[1] + offset[1]);
          top = Math.max(top, p[1] + offset[1]);
        }
        const [x, y, z] = center;
        const inLeaf = Math.abs(x) < DOOR_HINGE.x + 0.01 && y > 0.13 && y < 1.95 && z > -0.6 && z < -0.38;
        const side = inLeaf ? (x < -0.01 ? "gauche" : "droite") : null;
        const transom = TRANSOM.find(({ from }) => Math.abs(bottom - from[0]) < 0.005 && Math.abs(top - from[1]) < 0.005);
        if (transom) transoms++;
        const target = side ? leaves[side] : kept;
        for (let i = box; i < box + 36; i++) {
          position.getElement(i, p);
          normal.getElement(i, n);
          if (transom) {
            const { from, to } = transom;
            p[1] = to[0] + (p[1] + offset[1] - from[0]) * (to[1] - to[0]) / (from[1] - from[0]) - offset[1];
          }
          const shift = side ? sides[side].hinge : [0, 0, 0];
          target.positions.push(...p.map((v, k) => (side ? v + offset[k] - shift[k] : v)));
          target.normals.push(...n);
        }
      }
      for (const [side, data] of Object.entries(leaves)) {
        if (data.positions.length === 0) continue;
        sides[side].primitives.push(document.createPrimitive().setMaterial(primitive.getMaterial())
          .setAttribute("POSITION", document.createAccessor().setType("VEC3").setArray(new Float32Array(data.positions)))
          .setAttribute("NORMAL", document.createAccessor().setType("VEC3").setArray(new Float32Array(data.normals))));
      }
      if (kept.positions.length === 0) {
        node.getMesh().removePrimitive(primitive);
      } else {
        position.setArray(new Float32Array(kept.positions));
        normal.setArray(new Float32Array(kept.normals));
      }
    }
  }
  if (!doorsParent) throw new Error("Battants introuvables dans la façade.");
  if (transoms !== TRANSOM.length) throw new Error(`Imposte : ${transoms} boîte(s) trouvée(s) sur ${TRANSOM.length}.`);
  const parentOffset = doorsParent.getWorldMatrix().slice(12, 15);
  for (const [side, { hinge, yaw, primitives }] of Object.entries(sides)) {
    if (primitives.length === 0) throw new Error(`Battant ${side} vide.`);
    const mesh = document.createMesh(`battant_${side}`);
    for (const primitive of primitives) mesh.addPrimitive(primitive);
    doorsParent.addChild(document.createNode(`battant_${side}`).setMesh(mesh)
      .setTranslation(hinge.map((v, k) => v - parentOffset[k])).setRotation(yawQuaternion(yaw))
      .setExtras({ role: "door", side }));
  }
}
