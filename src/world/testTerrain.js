import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateRibbon } from "@babylonjs/core/Meshes/Builders/ribbonBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { collisionLayer } from "../core/physics.js";
import { batchStaticMeshes } from "./staticBatch.js";

export const spawnPoint = new Vector3(0, 3.65, -10);
const fieldSize = 100;
const trainingSize = 40;
const ramps = [
  { x: -4.3, angle: 18, height: 1.6 },
  { x: -7.8, angle: 32, height: 2.1 },
  { x: -11.3, angle: 60, height: 2.8 },
];
const jumps = [
  { x: 3.8, z: -4.3, height: 0.45 },
  { x: 5.5, z: -1.5, height: 0.9 },
  { x: 7.2, z: 1.3, height: 1.35 },
];

// Décalages de profondeur constants des peintures posées sur un sol : sols peints, puis panneaux au-dessus.
export const FLOOR_PAINT_Z_OFFSET = -8;
const SIGN_Z_OFFSET = -12;

export function terrainMaterial(scene, name, color) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(color);
  mat.specularColor = Color3.Black();
  return mat;
}

// Matériau mat portant une texture dessinée au canevas : `size` en pixels (nombre ou { width, height }),
// `paint(ctx, size)` dessine avant l’envoi au GPU.
export function canvasMaterial(scene, name, size, paint) {
  const texture = new DynamicTexture(name, size, scene, true);
  paint(texture.getContext(), texture.getSize());
  texture.update();
  const material = terrainMaterial(scene, name, "#ffffff");
  material.diffuseTexture = texture;
  return material;
}

export function solidTerrain(mesh, mat, shapeType = PhysicsShapeType.BOX, layer = collisionLayer.terrain) {
  mesh.material = mat;
  mesh.receiveShadows = true;
  const aggregate = new PhysicsAggregate(mesh, shapeType, { mass: 0, friction: 0.8 }, mesh.getScene());
  aggregate.shape.filterMembershipMask = layer;
  return mesh;
}

function paintGrid(scene) {
  // Maille de cinq mètres, répétée sur toute la dalle.
  const mat = canvasMaterial(scene, "enrobé quadrillé", 512, (ctx, { width }) => {
    const unit = width / 5;
    ctx.scale(unit, unit);
    ctx.fillStyle = "#436866";
    ctx.fillRect(0, 0, 5, 5);
    ctx.lineWidth = 0.025;
    for (let i = 0; i <= 5; i++) {
      ctx.strokeStyle = i % 5 === 0 ? "#60817c" : "#507470";
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 5);
      ctx.moveTo(0, i);
      ctx.lineTo(5, i);
      ctx.stroke();
    }
  });
  mat.diffuseTexture.wrapU = mat.diffuseTexture.wrapV = Texture.WRAP_ADDRESSMODE;

  // La face supérieure de la dalle porte directement le quadrillage, les chants restent unis.
  const faceUV = Array(6).fill(new Vector4(0.5, 0.5, 0.5, 0.5));
  faceUV[4] = new Vector4(0, 0, fieldSize / 5, fieldSize / 5);
  const deck = CreateBox("dalle", { width: fieldSize, height: 0.64, depth: fieldSize, faceUV }, scene);
  deck.position.y = -0.32;
  solidTerrain(deck, mat);
}

export function paintZoneSign(scene, title, x, z, width, height) {
  const sign = CreateGround(title, { width, height }, scene);
  sign.position.set(x, 0.008, z);
  sign.material = canvasMaterial(scene, title, { width: 1024, height: 256 }, (ctx) => {
    ctx.fillStyle = "#385756";
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = "#efac72";
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 996, 228);
    ctx.fillStyle = "#f2c494";
    ctx.font = "bold 84px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, 512, 132, 930);
  });
  // Décalage constant, jamais proportionnel à la pente : vue à travers un portail, la projection oblique
  // donne au sol une pente de profondeur énorme, et zOffset le ferait passer devant ce qui y est posé.
  // Il reste au-dessus des sols peints (FLOOR_PAINT_Z_OFFSET).
  sign.material.zOffsetUnits = SIGN_Z_OFFSET;
  sign.receiveShadows = true;
  return sign;
}

// Marquage de la piste centrale : quadrillage, couloir gradué, flèches, cercle de départ et légendes.
function drawTrainingFloor(ctx, { width: size }) {
  const scale = size / trainingSize;
  // Le dessin est coté en mètres. Le haut de la texture correspond au nord (+Z).
  ctx.setTransform(scale, 0, 0, scale, size / 2, size / 2);
  ctx.fillStyle = "#436866";
  ctx.fillRect(-20, -20, 40, 40);
  ctx.fillStyle = "#4a706d";
  ctx.fillRect(-2.2, -18, 4.4, 33);

  function line(x1, z1, x2, z2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, -z1);
    ctx.lineTo(x2, -z2);
    ctx.stroke();
  }

  function label(text, x, z, height, color, align = "center") {
    ctx.fillStyle = color;
    ctx.font = `bold ${height}px sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(text, x, -z);
  }

  for (let m = -20; m <= 20; m++) {
    const color = m % 5 === 0 ? "#60817c" : "#507470";
    line(m, -20, m, 20, color, 0.025);
    line(-20, m, 20, m, color, 0.025);
  }
  ctx.strokeStyle = "#91a99b";
  ctx.lineWidth = 0.09;
  ctx.strokeRect(-19.35, -19.35, 38.7, 38.7);
  for (const x of [-2.2, 2.2]) line(x, -15, x, 18, "#91b2a4", 0.055);
  for (let m = -4; m <= 28; m++) {
    const z = spawnPoint.z + m;
    const major = m % 5 === 0;
    line(2.2, z, major ? 1.55 : 1.93, z, "#d0d2b2", major ? 0.085 : 0.045);
    if (major) label(`${m} m`, 1.26, z + 0.14, 0.42, "#dae0cb", "right");
  }
  for (const z of [-6.2, 0.8, 7.8, 14.8]) {
    line(-0.35, z, 0, z + 0.35, "#afc2ae", 0.08);
    line(0, z + 0.35, 0.35, z, "#afc2ae", 0.08);
  }
  ctx.strokeStyle = "#efac72";
  ctx.lineWidth = 0.095;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(spawnPoint.x, -spawnPoint.z, 1.36, i * Math.PI / 2 + 0.12, (i + 1) * Math.PI / 2 - 0.12);
    ctx.stroke();
  }
  label("DÉPART", 0, spawnPoint.z - 1.92, 0.36, "#f2c494");
  for (const { x, angle } of ramps) label(`${angle}°`, x, -5.05, 0.72, "#e3d1a8");
  for (const { x, z, height } of jumps) {
    label(`${height.toFixed(2).replace(".", ",")} m`, x, z - 1.65, 0.42, "#ede3bf");
  }
}

function paintFloor(scene) {
  const floor = CreateGround("piste centrale", { width: trainingSize, height: trainingSize }, scene);
  floor.position.y = 0.004;
  floor.receiveShadows = true;
  floor.material = canvasMaterial(scene, "enrobé", 2048, drawTrainingFloor);
  // Décalage constant, comme les sols des démos (voir paintZoneSign).
  floor.material.zOffsetUnits = FLOOR_PAINT_Z_OFFSET;
}

function addHorizon(scene) {
  for (const [radius, base, color] of [[125, 7, "#91aaa0"], [95, 2.2, "#72918a"]]) {
    const crest = [];
    const baseLine = [];
    for (let i = 0; i < 96; i++) {
      const angle = i * Math.PI / 48;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const height = base + 3.4 * Math.sin(angle * 5 + radius) + 2 * Math.cos(angle * 11) + 1.4 * Math.sin(angle * 23);
      crest.push(new Vector3(x, height, z));
      baseLine.push(new Vector3(x, -18, z));
    }
    const ridge = CreateRibbon("relief lointain", { pathArray: [crest, baseLine], closePath: true }, scene);
    ridge.material = terrainMaterial(scene, "brume", color);
    ridge.material.backFaceCulling = false;
    ridge.material.disableLighting = true;
    ridge.material.emissiveColor = Color3.FromHexString(color);
    ridge.isPickable = false;
  }
}

function wallSign(scene, title, detail, x, y, z, width) {
  const height = width / 4;
  const sign = CreatePlane(title, { width, height }, scene);
  sign.position.set(x, y, z);
  sign.material = canvasMaterial(scene, title, { width: 512, height: 128 }, (ctx) => {
    ctx.fillStyle = "#253e40";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#f4b783";
    ctx.fillRect(18, 20, 7, 88);
    ctx.font = "bold 58px sans-serif";
    ctx.fillStyle = "#f6f0d9";
    ctx.fillText(title, 44, 69);
    ctx.font = "24px sans-serif";
    ctx.fillStyle = "#bdcec0";
    ctx.fillText(detail, 46, 106);
  });
}

// Le même profil longitudinal (distance, hauteur) définit le dessin et l'enveloppe Havok.
function extrudeProfile(scene, name, width, profile) {
  const left = profile.map(([z, y]) => [-width / 2, y, z]);
  const right = profile.map(([z, y]) => [width / 2, y, z]);
  const positions = [];
  const indices = [];
  function face(points) {
    const start = positions.length / 3;
    for (const point of points) positions.push(...point);
    for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1);
  }
  face(left);
  face([...right].reverse());
  for (let i = 0; i < profile.length; i++) {
    const next = (i + 1) % profile.length;
    face([left[i], right[i], right[next], left[next]]);
  }
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = [];
  // Les UV neutres permettent de fusionner les profils avec les boîtes en béton.
  data.uvs = new Float32Array(2 * positions.length / 3);
  VertexData.ComputeNormals(positions, indices, data.normals);
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  return mesh;
}

export function createTestTerrain(scene) {
  const mint = terrainMaterial(scene, "béton céladon", "#75988b");
  const clay = terrainMaterial(scene, "béton ocre", "#ba8664");
  const wall = terrainMaterial(scene, "béton sombre", "#4c716c");
  const edges = [];
  const casters = [];

  function box(name, x, y, z, width, height, depth, mat) {
    const mesh = CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    return solidTerrain(mesh, mat);
  }

  function topEdge(x, y, z, width) {
    edges.push([new Vector3(x - width / 2 + 0.08, y + 0.012, z),
      new Vector3(x + width / 2 - 0.08, y + 0.012, z)]);
  }

  paintGrid(scene);
  paintFloor(scene);
  addHorizon(scene);
  for (const { x, angle, height } of ramps) {
    const width = 2.7;
    const depth = height / Math.tan(angle * Math.PI / 180);
    const toe = -4.4;
    const ramp = extrudeProfile(scene, `rampe ${angle}°`, width, [[0, 0], [depth, height], [depth, 0]]);
    ramp.position.set(x, 0, toe);
    const mat = angle > 45 ? clay : mint;
    casters.push(solidTerrain(ramp, mat, PhysicsShapeType.CONVEX_HULL));
    casters.push(box("palier", x, height / 2, toe + depth + 1, width, height, 2, mat));
    for (const side of [-1, 1]) {
      const edgeX = x + side * (width / 2 - 0.1);
      edges.push([new Vector3(edgeX, 0.03, toe), new Vector3(edgeX, height + 0.015, toe + depth),
        new Vector3(edgeX, height + 0.015, toe + depth + 1.9)]);
    }
  }
  for (const { x, z, height } of jumps) {
    casters.push(box("plot de saut", x, height / 2, z, 2.15, height, 2.1, clay));
    topEdge(x, height, z - 1, 2.15);
    topEdge(x, height, z + 1, 2.15);
  }
  for (let i = 0; i < 8; i++) {
    const height = (i + 1) * 0.18;
    const front = 2.725 + i * 0.55;
    const step = extrudeProfile(scene, "marche", 2.6, [
      [0, 0], [0, height - 0.11], [0.16, height], [0.55, height], [0.55, 0],
    ]);
    step.position.set(3.3, 0, front);
    casters.push(solidTerrain(step, mint, PhysicsShapeType.CONVEX_HULL));
    topEdge(3.3, height, front + 0.18, 2.6);
  }
  casters.push(box("palier des marches", 3.3, 0.72, 8.1, 2.6, 1.44, 2, mint));

  function markedWall(title, detail, x, z, width) {
    casters.push(box("mur " + title, x, 1.6, z, width, 3.2, 0.5, wall));
    wallSign(scene, title, detail, x, 2.37, z - 0.26, Math.min(5.2, width - 0.4));
    topEdge(x, 3.2, z - 0.18, width);
  }
  markedWall("PENTES", "18°  /  32°  /  60°", -7.8, 5.4, 10);
  markedWall("SAUTS", "0,45  /  0,90  /  1,35 m", 9, 5, 5.8);
  markedWall("ESCALIER", "8 marches de 18 cm", 3.3, 11, 4.5);
  casters.push(box("retour de mur", -12.6, 1.2, 3.45, 0.4, 2.4, 3.4, wall));
  const markings = CreateLineSystem("arêtes peintes", { lines: edges, useVertexAlpha: false }, scene);
  markings.color = Color3.FromHexString("#d6d8ac");
  markings.isPickable = false;
  return batchStaticMeshes("entraînement", casters);
}
