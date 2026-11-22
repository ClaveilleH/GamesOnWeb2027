import { BoundingBox } from "@babylonjs/core/Culling/boundingBox";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { collisionLayer } from "../core/physics.js";
import { createCrate } from "./crates.js";
import { batchStaticMeshes } from "./staticBatch.js";
import { paintZoneSign, solidTerrain, terrainMaterial } from "./testTerrain.js";

const east = Math.PI / 2;
const west = -Math.PI / 2;
const basement = -20;
// La face avant du cadre masque la marge du stencil, la face arrière rejoint l’alcôve.
const frameOverhang = 0.01;

function paintedMaterial(scene, name, width, depth, color, paint) {
  const texture = new DynamicTexture(name, { width: 1024, height: Math.round(1024 * depth / width) }, scene, true);
  const ctx = texture.getContext();
  const size = texture.getSize();
  ctx.scale(size.width / width, size.height / depth);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, depth);
  paint(ctx);
  texture.update();
  const material = terrainMaterial(scene, name, "#ffffff");
  material.diffuseTexture = texture;
  return material;
}

export function createPortalDemos(scene, portals) {
  const zones = [];
  let zoneMeshes;
  const crates = [];
  const interiors = [];
  const stone = terrainMaterial(scene, "calcaire", "#c5b29a");
  const copper = terrainMaterial(scene, "terre cuite", "#b46e4e");
  const blue = terrainMaterial(scene, "céramique bleue", "#3c9099");
  const gold = terrainMaterial(scene, "ocre jaune", "#cf9b47");
  const slate = terrainMaterial(scene, "ardoise", "#496b70");

  function beginZone(name) {
    zoneMeshes = [];
    zones.push({ name, meshes: zoneMeshes });
  }

  function block(name, x, y, z, width, height, depth, mat, yaw = 0, layer = collisionLayer.terrain) {
    const mesh = CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    zoneMeshes.push(solidTerrain(mesh, mat, PhysicsShapeType.BOX, layer));
  }

  function archFrame(name, x, y, z, scale, portal = false) {
    const width = 2.4 * scale;
    const height = 3 * scale;
    const post = 0.46 * scale;
    function beam(label, cx, cy, w, h, depth, material) {
      block(name + " · " + label, cx, cy, z, w, h, depth, material, 0, portal ? collisionLayer.portalFrame : collisionLayer.terrain);
      if (!portal) return;
      // La coupe oblique ouvre la boîte. Ces deux sections intérieures referment la pierre
      // vue de chaque côté, y compris pour les échantillons MSAA à incidence rasante.
      for (const side of [-1, 1]) {
        const cap = CreatePlane(name + " · section", { width: w, height: h }, scene);
        cap.position.set(cx, cy, z + side * frameOverhang / 2);
        cap.rotation.y = side > 0 ? Math.PI : 0;
        cap.material = material;
        cap.receiveShadows = true;
        zoneMeshes.push(cap);
      }
    }
    for (const side of [-1, 1]) {
      beam("pilier", x + side * (width + post) / 2, y + height / 2, post, height, 0.64 * scale, stone);
    }
    beam("linteau", x, y + height + post / 2, width + 2 * post + 0.18 * scale, post, 0.76 * scale, copper);
  }

  function arch(name, x, z, yaw) {
    archFrame(name, x, 0, z, 1, true);
    return portals.createPortal({ name, origin: new Vector3(x, 0, z), yaw, width: 2.4, height: 3, sides: "both" });
  }

  beginZone("arche A");
  const a = arch("A", 0, 31, Math.PI);
  beginZone("esplanade");
  const b = arch("B", -30, -32, 0);
  portals.link(a, b);
  const offset = 3 * Math.SQRT1_2;
  crates.push(createCrate(scene, portals, {
    name: "caisse de l’arche", position: new Vector3(a.origin.x + offset, 0.5, a.origin.z - offset), size: 1,
  }));
  paintZoneSign(scene, "PARADOXE SPATIAL", 0, 24, 5.8, 1.45);

  const sand = CreateDisc("esplanade de sable", { radius: 7, tessellation: 96 }, scene);
  sand.rotation.x = Math.PI / 2;
  sand.position.set(b.origin.x, 0.004, b.origin.z);
  sand.material = terrainMaterial(scene, "sable", "#d8b98a");
  sand.material.diffuseColor.scaleInPlace(0.77);
  sand.material.zOffsetUnits = -8;
  sand.receiveShadows = true;

  function obelisk(x, z, height, mat) {
    block("socle d’obélisque", x, 0.14, z, 1.12, 0.28, 1.12, stone);
    const shaft = CreateCylinder("obélisque", { height, diameterTop: 0.52, diameterBottom: 1, tessellation: 4 }, scene);
    shaft.position.set(x, 0.28 + height / 2, z);
    const tip = CreateCylinder("pointe d’obélisque", { height: 0.48, diameterTop: 0, diameterBottom: 0.52, tessellation: 4 }, scene);
    tip.position.set(x, 0.28 + height + 0.24, z);
    zoneMeshes.push(solidTerrain(shaft, mat, PhysicsShapeType.CONVEX_HULL), solidTerrain(tip, gold, PhysicsShapeType.CONVEX_HULL));
  }
  obelisk(-31.55, -27.6, 2.8, blue);
  obelisk(-28.4, -36.5, 2.1, copper);
  block("bloc d’ocre", -28.3, 0.49, -27.2, 1.2, 0.98, 1.3, gold);
  block("bloc de céramique", -32, 0.64, -36.8, 1.3, 1.28, 1.1, blue);

  function floorPaint(name, x, y, z, width, depth, material) {
    // Des triangles courts gardent les UV et la profondeur précis quand le sol passe sous l’œil.
    const floor = CreateGround(name, { width, height: depth,
      subdivisionsX: Math.ceil(width * 2), subdivisionsY: Math.ceil(depth * 2) }, scene);
    floor.position.set(x, y + 0.004, z);
    floor.material = material;
    floor.material.zOffsetUnits = -8;
    floor.receiveShadows = true;
    floor.isPickable = false;
  }

  function tiledFloor(name, width, depth, unit, color, line, firstJoint = 0) {
    return paintedMaterial(scene, name, width, depth, color, (ctx) => {
      const inset = 0.2 * unit;
      const joint = 0.05 * unit;
      ctx.fillStyle = line;
      for (let x = firstJoint; x < width; x += unit) ctx.fillRect(x, 0, joint, depth);
      for (let z = 0; z < depth; z += unit) ctx.fillRect(0, z, width, joint);
      ctx.strokeStyle = line;
      ctx.lineWidth = 0.07 * unit;
      ctx.strokeRect(inset, inset, width - 2 * inset, depth - 2 * inset);
    });
  }

  function sign(title, x, y, z, width, depth, yaw = 0) {
    const mesh = paintZoneSign(scene, title, x, z, width, depth);
    mesh.position.y += y;
    mesh.rotation.y = yaw;
    return mesh;
  }

  function doorway(name, x, y, z, yaw, width, height, wallWidth, wallHeight, thickness, mat, layer = collisionLayer.terrain) {
    const jamb = (wallWidth - width) / 2;
    const depth = thickness + frameOverhang;
    const behind = (thickness - frameOverhang) / 2;
    const cx = x - Math.sin(yaw) * behind;
    const cz = z - Math.cos(yaw) * behind;
    for (const side of [-1, 1]) {
      const offset = side * (width + jamb) / 2;
      block(name + " · montant", cx + Math.cos(yaw) * offset, y + height / 2, cz - Math.sin(yaw) * offset,
        jamb, height, depth, mat, yaw, layer);
    }
    block(name + " · linteau", cx, y + (height + wallHeight) / 2, cz, wallWidth, wallHeight - height, depth, mat, yaw, layer);
    return { name, origin: new Vector3(x, y, z), yaw, width, height, sides: "front" };
  }

  function closeAlcove(door, clearance, thickness, mat) {
    const { name, origin, yaw, width, height } = door;
    function part(label, lateral, y, behind, w, h, d, layer = collisionLayer.portalBack) {
      block(name + " · " + label, origin.x + lateral * Math.cos(yaw) - behind * Math.sin(yaw), origin.y + y,
        origin.z - lateral * Math.sin(yaw) - behind * Math.cos(yaw), w, h, d, mat, yaw, layer);
    }
    // Le tableau de la porte occupe la première épaisseur de l’alcôve.
    const run = clearance - thickness;
    for (const side of [-1, 1]) {
      part("joue", side * (width + thickness) / 2, height / 2, thickness + run / 2, thickness, height, run);
    }
    part("fond", 0, height / 2, clearance + thickness / 2, width + 2 * thickness, height, thickness);
    part("couverture", 0, height + thickness / 2, thickness + clearance / 2, width + 2 * thickness, thickness, clearance);
    if (origin.y < 0) {
      part("seuil", 0, -thickness / 2, (clearance + thickness) / 2, width + 2 * thickness, thickness, clearance + thickness, collisionLayer.terrain);
    }
  }

  function coveredTunnel(name, fromX, toX, y, z, width, height, thickness, walls, roof) {
    const x = (fromX + toX) / 2;
    const length = toX - fromX;
    for (const side of [-1, 1]) {
      block(name + " · paroi", x, y + (height - thickness) / 2, z + side * (width - thickness) / 2,
        length, height - thickness, thickness, walls);
    }
    block(name + " · toit", x, y + height - thickness / 2, z, length, thickness, width, roof);
  }

  function ruler(length, depth, markEntrances = false) {
    return paintedMaterial(scene, length + " m", length, depth, "#587674", (ctx) => {
      ctx.fillStyle = "#d9debc";
      ctx.font = "bold 0.34px sans-serif";
      ctx.textAlign = "center";
      // Dans le couloir, les ouvertures marquent déjà les deux extrémités de la règle.
      const firstTick = markEntrances ? 1 : 0;
      for (let m = firstTick; m <= length - firstTick; m++) {
        const major = m % 5 === 0 || m === length;
        const tick = major ? 0.56 : 0.25;
        ctx.fillRect(m - 0.035, 0, 0.07, tick);
        ctx.fillRect(m - 0.035, depth - tick, 0.07, tick);
        if (major && m > 0 && m < length) ctx.fillText(String(m), m, 0.92);
      }
      ctx.fillStyle = "#ffe1a6";
      ctx.font = "bold 0.72px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(length + " m", length / 2, depth / 2);
      if (markEntrances) {
        for (const [x, angle] of [[2.5, east], [length - 2.5, west]]) {
          ctx.save();
          ctx.translate(x, depth / 2);
          ctx.rotate(angle);
          ctx.fillText(length + " m", 0, 0);
          ctx.restore();
        }
      }
    });
  }

  function buildLongCorridor() {
    const t = 0.16;
    const width = 3;
    const height = 3;
    const recess = 0.75;
    function gate(name, x, y, yaw) {
      return portals.createPortal(doorway(name, x, y, 2, yaw, 2.4, 2.8, width - 2 * t, height - t, t, gold, collisionLayer.portalFrame));
    }
    beginZone("galerie extérieure");
    coveredTunnel("galerie extérieure", 29.5, 36.5, 0, 2, width, height, t, copper, stone);
    const entry = gate("A2", 31, 0, west);
    const exit = gate("C", 33.5, 0, east);
    const shortRuler = ruler(7, width - 2 * t);
    floorPaint("mesure extérieure", 33, 0, 2, 7, width - 2 * t, shortRuler);
    floorPaint("mesure sur le toit", 33, height, 2, 7, width - 2 * t, shortRuler);
    const plaque = sign("7 m", 33, 1.75, 0.497, 2.1, 0.74);
    plaque.rotation.x = -Math.PI / 2;
    sign("ARCHITECTURE NON EUCLIDIENNE", 26.5, 0, 2, 7.2, 1.6, east);

    beginZone("galerie souterraine");
    coveredTunnel("galerie souterraine", 20, 44, basement, 2, width, height, t, stone, slate);
    block("dalle de la galerie", 32, basement - t / 2, 2, 24, t, width, slate);
    floorPaint("graduations du couloir", 32, basement, 2, 24, width - 2 * t, ruler(24, width - 2 * t, true));
    const start = gate("B2", 20, basement, east);
    const end = gate("D", 44, basement, west);
    closeAlcove(start, recess, t, slate);
    closeAlcove(end, recess, t, slate);
    portals.link(entry, start);
    portals.link(exit, end);
    interiors.push(new BoundingBox(new Vector3(20 - recess, basement, 0.5), new Vector3(44 + recess, basement + height, 3.5)));
  }

  function buildCyclicRoom() {
    beginZone("pavillon");
    const t = 0.18;
    const h = 3.2;
    const red = terrainMaterial(scene, "rouge de fer", "#cc6353");
    const azure = terrainMaterial(scene, "bleu outremer", "#568bb7");
    const yellow = terrainMaterial(scene, "jaune de Naples", "#e6ba5b");
    const green = terrainMaterial(scene, "vert jade", "#53967d");
    block("pavillon · mur nord", -33, h / 2, 9 + t / 2, 6 + 2 * t, h, t, red);
    doorway("entrée du pavillon", -33, 0, 3, 0, 2, 2.6, 6 + 2 * t, h, t, yellow);
    function sideDoor(name, x, yaw, mat) {
      doorway("pavillon · mur " + name, x, 0, 6, yaw, 2.28, 2.74, 6, h, t, mat);
      const portal = portals.createPortal(doorway(name, x, 0, 6, yaw, 2, 2.6, 2.28, 2.74, t, stone, collisionLayer.portalFrame));
      closeAlcove(portal, 0.6, t, mat);
      return portal;
    }
    portals.link(sideDoor("E", -30, west, azure), sideDoor("W", -36, east, green));
    block("pavillon · plafond", -33, h + t / 2, 6, 6 + 2 * t, t, 6 + 2 * t, stone);
    floorPaint("carrelage du pavillon", -33, 0, 6, 6, 6, tiledFloor("carreaux de ciment", 6, 6, 1, "#738d85", "#bdc9a5"));
    const stripes = paintedMaterial(scene, "rayures du pilier", 1, 1, "#f0d098", (ctx) => {
      ctx.fillStyle = "#615968";
      for (let i = 0; i < 8; i++) ctx.fillRect(0, i / 8, 1, 1 / 24);
    });
    const pillar = CreateCylinder("pilier rayé", { height: h, diameter: 0.48, tessellation: 8 }, scene);
    pillar.position.set(-33, h / 2, 6);
    zoneMeshes.push(solidTerrain(pillar, stripes, PhysicsShapeType.CONVEX_HULL));
    sign("PIÈCES CYCLIQUES INFINIES", -33, 0, 0.9, 6.6, 1.5);
  }

  function buildCabin() {
    beginZone("cabine");
    const t = 0.16;
    const p = portals.createPortal(doorway("P", 30, 0, -28.7, 0, 1.6, 2.4, 2.6, 3 - t, t, copper, collisionLayer.portalFrame));
    block("cabine · fond", 30, (3 - t) / 2, -31.3 + t / 2, 2.6, 3 - t, t, copper);
    for (const side of [-1, 1]) {
      block("cabine · paroi", 30 + side * (2.6 - t) / 2, (3 - t) / 2, -30, t, 3 - t, 2.6 - 2 * t, gold);
    }
    block("cabine · toit", 30, 3 - t / 2, -30, 2.6, t, 2.6, stone);
    sign("GÉOMÉTRIE IMPOSSIBLE", 30, 0, -25.8, 6.4, 1.55, Math.PI);

    beginZone("grande salle");
    const q = portals.createPortal(doorway("Q", 30, basement, -33, Math.PI, 1.6, 2.4, 14 + 2 * t, 6, t, copper, collisionLayer.portalFrame));
    closeAlcove(q, 0.75, t, copper);
    portals.link(p, q);
    block("salle · dallage", 30, basement - t / 2, -40, 14, t, 14, slate);
    block("salle · plafond", 30, basement + 6 + t / 2, -40, 14 + 2 * t, t, 14 + 2 * t, stone);
    block("salle · mur sud", 30, basement + 3, -47 - t / 2, 14 + 2 * t, 6, t, blue);
    for (const side of [-1, 1]) {
      block("salle · paroi", 30 + side * (7 + t / 2), basement + 3, -40, t, 6, 14, stone);
      for (const [z, offset] of [[-35.2, 4.5], [-40, 3.2], [-44.8, 1.85]]) {
        const x = 30 + side * offset;
        block("salle · fût", x, basement + 3, z, 0.68, 6, 0.68, stone);
        block("salle · chapiteau", x, basement + 5.75, z, 1.16, 0.5, 1.16, gold);
      }
    }
    const mosaic = tiledFloor("mosaïque", 14, 14, 1, "#93a89a", "#d5d6b9");
    const threshold = tiledFloor("pierre des seuils", 1.6, 1.2, 0.4, "#80948a", "#b5beaa");
    // En rotation devant P, les joints des seuils et de la mosaïque défilent sous le pixel (§ 13.2).
    mosaic.diffuseTexture.anisotropicFilteringLevel = 1;
    threshold.diffuseTexture.anisotropicFilteringLevel = 1;
    floorPaint("mosaïque de la salle", 30, basement, -40, 14, 14, mosaic);
    for (const door of [p, q]) {
      floorPaint(door.name + " · seuil pavé", door.origin.x, door.origin.y + 0.002, door.origin.z, door.width, 1.2, threshold);
    }
    sign("14 × 14 m", 30, basement, -40, 7.2, 2.4, Math.PI);
    interiors.push(new BoundingBox(new Vector3(23, basement, -47), new Vector3(37, basement + 6, -33 + 0.75)));
  }

  function buildGarden() {
    beginZone("tunnels et jardin");
    const z = 31.5;
    // P1 et P2 coupent le milieu d’une dalle à leurs échelles respectives.
    const paving = tiledFloor("pavés des tunnels", 6, 3, 1, "#83897a", "#d3ba8d", 0.5);
    // À l’approche de P1, le filtrage isotrope supprime les pixels isolés des joints lointains.
    paving.diffuseTexture.anisotropicFilteringLevel = 1;
    function scaleTunnel(name, x, yaw, scale) {
      const t = 0.16 * scale;
      const width = 3 * scale;
      const height = 3.2 * scale;
      const facing = Math.sin(yaw);
      const mouth = x + facing * 5 * scale;
      const back = x - facing * scale;
      const tunnel = name + " · tunnel";
      coveredTunnel(tunnel, Math.min(mouth, back), Math.max(mouth, back), 0, z, width, height, t, blue, stone);
      floorPaint(tunnel + " pavé", (mouth + back) / 2, 0, z, 6 * scale, width, paving);
      const gate = portals.createPortal(doorway(name, x, 0, z, yaw, 2.4 * scale, 2.8 * scale, width - 2 * t, height - t, t, gold, collisionLayer.portalFrame));
      // Le renfoncement dans le mur de fond laisse 0,6 m libres même derrière la petite ouverture.
      const niche = doorway(tunnel + " · niche", x - facing * 0.6 * scale, 0, z, yaw,
        gate.width, gate.height, width - 2 * t, height - t, t, slate, collisionLayer.portalBack);
      closeAlcove(niche, 0.6 * scale, t, slate);
      return gate;
    }
    const p1 = scaleTunnel("P1", -35, west, 1);
    const p2 = scaleTunnel("P2", -30, east, 0.5);
    portals.link(p1, p2);
    sign("MANIPULATION D’ÉCHELLE", -42.5, 0, z, 6.4, 1.55, east);

    const t = 0.16;
    // Le porche et le tableau de la porte abritent le dernier demi-mètre jusqu’au jardin.
    coveredTunnel("porche du jardin", -27.5, -27 - t, 0, z, 1.5, 1.6, 0.08, blue, stone);
    doorway("porte du jardin", -27, 0, z, east, 1.34, 1.52, 8 + 2 * t, 2.6, t, stone);
    // Test : une poterne à la taille réduite laisse ressortir le joueur rétréci, qui peut
    // contourner les tunnels jusqu’à l’entrée de P1 et rétrécir à nouveau (0,5 → 0,25 → …).
    const wallX = -19 + t / 2;
    const wallFrom = z - 4 - t;
    const wallTo = z + 4 + t;
    const posternZ = 29.5;
    const posternWidth = 1.34;
    const posternHeight = 1.52;
    const posternFrom = posternZ - posternWidth / 2;
    const posternTo = posternZ + posternWidth / 2;
    block("jardin · mur est", wallX, 1.3, (wallFrom + posternFrom) / 2, t, 2.6, posternFrom - wallFrom, stone);
    block("jardin · mur est", wallX, 1.3, (posternTo + wallTo) / 2, t, 2.6, wallTo - posternTo, stone);
    block("jardin · linteau de la poterne", wallX, (posternHeight + 2.6) / 2, posternZ, t, 2.6 - posternHeight, posternWidth, stone);
    sign("RETOUR VERS P1", -16.5, 0, posternZ, 4.2, 1.1, west);
    for (const side of [-1, 1]) {
      block("jardin · enceinte", -23, 1.3, z + side * (4 + t / 2), 8, 2.6, t, stone);
    }
    floorPaint("jardin pavé", -23, 0, z, 8, 8, tiledFloor("pavés du jardin", 8, 8, 0.5, "#709383", "#a8b99a"));
    const foliage = terrainMaterial(scene, "feuillage de buis", "#67865a");
    for (const pz of [28.7, 34.3]) {
      block("jardin · jardinière", -24.65, 0.09, pz, 1.65, 0.18, 0.58, copper);
      block("jardin · buis taillé", -24.65, 0.33, pz, 1.48, 0.3, 0.47, foliage);
      for (const x of [-25.7, -23.6]) {
        block("jardin · petit pilier", x, 0.45, pz, 0.36, 0.9, 0.36, blue);
        block("jardin · couronnement", x, 0.96, pz, 0.52, 0.12, 0.52, gold);
      }
    }
    for (let i = 0; i < 5; i++) {
      const h = 0.09 * (i + 1);
      block("jardin · marche", -21, h / 2, 31.4 + (i + 0.5) * 0.28, 2, h, 0.28, stone);
    }
    block("jardin · palier", -21, 0.225, 33.4, 2, 0.45, 1.2, stone);
    archFrame("mini-arche", -21, 0.45, 33.4, 0.5);
    crates.push(
      createCrate(scene, portals, { name: "caisse du tunnel", position: new Vector3(-40.7, 0.5, z + 0.38) }),
      createCrate(scene, portals, { name: "caisse du jardin", position: new Vector3(-24.4, 0.25, z - 0.85), scale: 0.5, color: "#bd8555" }),
    );
  }

  buildLongCorridor();
  buildCyclicRoom();
  buildCabin();
  buildGarden();
  const casters = zones.flatMap(({ name, meshes }) => batchStaticMeshes(name, meshes));
  return { casters, crates, interiors };
}
