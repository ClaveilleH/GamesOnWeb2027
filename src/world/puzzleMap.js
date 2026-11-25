import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsMotionType, PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { collisionLayer } from "../core/physics.js";
import { createCrate } from "./crates.js";
import { batchStaticMeshes } from "./staticBatch.js";
import { canvasMaterial, FLOOR_PAINT_Z_OFFSET, paintZoneSign, solidTerrain, terrainMaterial } from "./testTerrain.js";

// Carte « casse-tête » : trois salles de test fermées, à résoudre l'une après l'autre, avec les seules
// mécaniques du jeu (portails liés, portails d'échelle, caisses poussées qui traversent les portails, saut).
// S'y ajoutent des plaques de pression, des portes coulissantes et un portail dont le lien bascule.
//
//   Salle 1 « Poids »      : la caisse est sur un balcon inaccessible ; un portail y mène. La faire tomber,
//                             la pousser sur la plaque : la porte s'ouvre.
//   Salle 2 « Échelle »    : la corniche (1,9 m) est trop haute. La petite caisse (0,5 m) traverse le petit
//                             portail et ressort du grand à 1 m : elle sert alors de marchepied.
//   Salle 3 « Aiguillage » : le portail du sol mène à une cellule close où attend la caisse. Caisse sur la
//                             plaque, le même portail mène au sommet de la tour, vers la sortie.
//
// Toutes les salles sont couvertes : les deux faces de chaque lien sont à l'ombre et chaque lien est
// translatif (yaw_B = yaw_A − π), comme l'exigent les règles d'éclairage (docs/PORTALS.md § 11).

const frameOverhang = 0.01;
const wall = 0.4;
const doorWidth = 2.4;
const doorHeight = 3;

// Points de reprise (centre de la capsule) et salles, du sud au nord. Le joueur avance vers +Z (lacet 0).
const rooms = Object.freeze([
  { title: null, spawn: [0, 1.2, -40], test: (p) => p.z < -32 },
  { title: "Salle 1 · Poids", spawn: [0, 1.2, -30], test: (p) => p.z < -15.8 },
  { title: "Salle 2 · Échelle", spawn: [0, 1.2, -14], test: (p) => p.z < 2.2 },
  { title: "Salle 3 · Aiguillage", spawn: [0, 3.1, 3.6], test: (p) => p.z < 24.2 || p.y < 4 },
  { title: "Sortie", spawn: [0, 5.8, 26.5], test: () => true },
]);

export const puzzleDestinations = Object.freeze([
  { label: "Départ", feet: { x: 0, y: 0.05, z: -40 }, yaw: 0 },
  { label: "Salle 1 · Poids", feet: { x: 0, y: 0.05, z: -30 }, yaw: 0 },
  { label: "Salle 1 · balcon", feet: { x: -5, y: 2.65, z: -20 }, yaw: 0 },
  { label: "Salle 2 · Échelle", feet: { x: 0, y: 0.05, z: -14 }, yaw: 0 },
  { label: "Salle 3 · Aiguillage", feet: { x: 0, y: 1.95, z: 3.6 }, yaw: 0 },
  { label: "Salle 3 · cellule", feet: { x: 16, y: 0.05, z: 10.5 }, yaw: 0 },
  { label: "Sortie", feet: { x: 0, y: 4.55, z: 26.5 }, yaw: 0 },
]);

export function createPuzzleMap(scene, portals) {
  const zones = [];
  let zoneMeshes;
  const casters = [];
  const crates = [];
  const interactables = [];
  const plates = [];
  const doors = [];

  const concrete = terrainMaterial(scene, "béton clair", "#c9cdc4");
  const panel = terrainMaterial(scene, "panneau blanc", "#e4e4dc");
  const trim = terrainMaterial(scene, "acier gris", "#56626a");
  const dark = terrainMaterial(scene, "acier sombre", "#2f3a40");
  const frameMat = terrainMaterial(scene, "cadre de portail", "#d98a3c");
  const scaleFrameMat = terrainMaterial(scene, "cadre d’échelle", "#4aa3b5");
  const switchFrameMat = terrainMaterial(scene, "cadre d’aiguillage", "#9a7bd1");
  const outside = terrainMaterial(scene, "sol extérieur", "#8fa596");
  // Intérieurs : seule la lumière d'ambiance y entre, une légère émission garde les murs lisibles.
  for (const mat of [concrete, panel]) mat.emissiveColor = Color3.FromHexString("#2a2a26");

  function beginZone(name) {
    zoneMeshes = [];
    zones.push({ name, meshes: zoneMeshes });
  }

  // Boîte statique donnée par ses bornes.
  function slab(name, x0, x1, y0, y1, z0, z1, mat, layer = collisionLayer.terrain) {
    const mesh = CreateBox(name, { width: x1 - x0, height: y1 - y0, depth: z1 - z0 }, scene);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    zoneMeshes.push(solidTerrain(mesh, mat, PhysicsShapeType.BOX, layer));
    return mesh;
  }

  function block(name, x, y, z, width, height, depth, mat, yaw = 0, layer = collisionLayer.terrain) {
    const mesh = CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    zoneMeshes.push(solidTerrain(mesh, mat, PhysicsShapeType.BOX, layer));
  }

  // Mur perpendiculaire à Z, de x0 à x1, percé d'une ouverture centrée en `gap.x` (facultative).
  function wallZ(name, x0, x1, z0, z1, y0, y1, mat, gap = null) {
    if (!gap) return slab(name, x0, x1, y0, y1, z0, z1, mat);
    const gx0 = gap.x - gap.width / 2;
    const gx1 = gap.x + gap.width / 2;
    slab(name, x0, gx0, y0, y1, z0, z1, mat);
    slab(name, gx1, x1, y0, y1, z0, z1, mat);
    if (gap.y1 < y1) slab(name + " · linteau", gx0, gx1, gap.y1, y1, z0, z1, mat);
    if (gap.y0 > y0) slab(name + " · allège", gx0, gx1, y0, gap.y0, z0, z1, mat);
  }

  // Salle couverte : deux murs latéraux et un toit (les murs nord et sud sont posés à part).
  function shell(name, x0, x1, z0, z1, height) {
    slab(name + " · mur ouest", x0 - wall, x0, 0, height, z0, z1, panel);
    slab(name + " · mur est", x1, x1 + wall, 0, height, z0, z1, panel);
    slab(name + " · toit", x0 - wall, x1 + wall, height, height + wall, z0 - wall, z1 + wall, concrete);
  }

  function floorPaint(name, x0, x1, y, z0, z1, material) {
    const width = x1 - x0;
    const depth = z1 - z0;
    // Des triangles courts gardent les UV et la profondeur précis quand le sol passe sous l’œil.
    const floor = CreateGround(name, { width, height: depth,
      subdivisionsX: Math.ceil(width * 2), subdivisionsY: Math.ceil(depth * 2) }, scene);
    floor.position.set((x0 + x1) / 2, y + 0.004, (z0 + z1) / 2);
    floor.material = material;
    floor.material.zOffsetUnits = FLOOR_PAINT_Z_OFFSET;
    floor.receiveShadows = true;
    floor.isPickable = false;
  }

  function tiles(name, width, depth, color, line) {
    return canvasMaterial(scene, name, { width: 1024, height: Math.round(1024 * depth / width) }, (ctx, size) => {
      ctx.scale(size.width / width, size.height / depth);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, depth);
      ctx.fillStyle = line;
      for (let x = 0; x <= width; x += 1) ctx.fillRect(x - 0.02, 0, 0.04, depth);
      for (let z = 0; z <= depth; z += 1) ctx.fillRect(0, z - 0.02, width, 0.04);
    });
  }

  function sign(title, x, y, z, width, depth, yaw = 0) {
    const mesh = paintZoneSign(scene, title, x, z, width, depth);
    mesh.position.y += y;
    mesh.rotation.y = yaw;
    return mesh;
  }

  // Cadre d'ouverture (repris de portalDemos.js) : montants et linteau, avancés de 1 cm devant le plan.
  function doorway(name, x, y, z, yaw, width, height, wallWidth, wallHeight, thickness, mat, layer) {
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

  // Alcôve fermée derrière un portail à sens unique (calque `portalBack`, docs/PORTALS.md § 11.5).
  function closeAlcove(door, clearance, thickness, mat) {
    const { name, origin, yaw, width, height } = door;
    function part(label, lateral, y, behind, w, h, d) {
      block(name + " · " + label, origin.x + lateral * Math.cos(yaw) - behind * Math.sin(yaw), origin.y + y,
        origin.z - lateral * Math.sin(yaw) - behind * Math.cos(yaw), w, h, d, mat, yaw, collisionLayer.portalBack);
    }
    const run = clearance - thickness;
    for (const side of [-1, 1]) {
      part("joue", side * (width + thickness) / 2, height / 2, thickness + run / 2, thickness, height, run);
    }
    part("fond", 0, height / 2, clearance + thickness / 2, width + 2 * thickness, height, thickness);
    part("couverture", 0, height + thickness / 2, thickness + clearance / 2, width + 2 * thickness, thickness, clearance);
  }

  // Portail isolé dans un cadre coloré, son alcôve derrière lui.
  function kiosk(name, x, y, z, yaw, width, height, mat) {
    const k = width / 2.4;
    const t = 0.16;
    const jamb = Math.max(0.18, 0.32 * k);
    const door = doorway(name, x, y, z, yaw, width, height, width + 2 * jamb, height + jamb, t, mat, collisionLayer.portalFrame);
    closeAlcove(door, 0.75, t, dark);
    return portals.createPortal(door);
  }

  // Voile affiché dans l'alcôve d'un portail délié.
  function inactiveVeil(portal) {
    const veil = CreatePlane(portal.name + " · voile", { width: portal.width, height: portal.height }, scene);
    // Dans l'alcôve, 30 cm derrière le plan : rien de coplanaire à l'ouverture.
    veil.position.set(portal.origin.x - portal.normal.x * 0.3, portal.origin.y + portal.height / 2,
      portal.origin.z - portal.normal.z * 0.3);
    veil.rotation.y = portal.yaw;
    const mat = terrainMaterial(scene, portal.name + " · voile", "#20252c");
    mat.emissiveColor = Color3.FromHexString("#3a2f52");
    mat.backFaceCulling = false;
    veil.material = mat;
    veil.isPickable = false;
    return veil;
  }

  // Indicateur lumineux : rouge éteint, vert allumé.
  function lamp(name, x, y, z, width, height, depth) {
    const mesh = CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    const mat = terrainMaterial(scene, name, "#401818");
    mesh.material = mat;
    mesh.isPickable = false;
    return {
      mesh,
      set(on) {
        mat.diffuseColor.copyFrom(on ? Color3.FromHexString("#2d6a3a") : Color3.FromHexString("#6a2d2d"));
        mat.emissiveColor.copyFrom(on ? Color3.FromHexString("#46e07a") : Color3.FromHexString("#b33a3a"));
      },
    };
  }

  // Plaque de pression : enfoncée par le joueur ou par une caisse posée dessus.
  function plate(name, x, y, z, size = 2.2) {
    const mesh = CreateBox(name, { width: size, height: 0.06, depth: size }, scene);
    mesh.position.set(x, y + 0.03, z);
    const mat = terrainMaterial(scene, name, "#7a3030");
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    const rim = CreateBox(name + " · bord", { width: size + 0.3, height: 0.03, depth: size + 0.3 }, scene);
    rim.position.set(x, y + 0.015, z);
    rim.material = trim;
    rim.receiveShadows = true;
    rim.isPickable = false;
    const state = { name, x, y, z, half: size / 2, pressed: false, listeners: [], mesh, mat };
    plates.push(state);
    return state;
  }

  function setPlate(state, pressed) {
    if (state.pressed === pressed) return;
    state.pressed = pressed;
    state.mesh.position.y = state.y + (pressed ? 0.012 : 0.03);
    state.mat.diffuseColor.copyFrom(Color3.FromHexString(pressed ? "#3f9a58" : "#7a3030"));
    state.mat.emissiveColor.copyFrom(Color3.FromHexString(pressed ? "#1f6a33" : "#000000"));
    for (const listener of state.listeners) listener(pressed);
  }

  // Porte coulissante qui descend dans le sol (corps Havok animé).
  function slidingDoor(name, x, y, z, width, height, depth) {
    const mesh = CreateBox(name, { width, height, depth }, scene);
    mesh.position.set(x, y + height / 2, z);
    mesh.material = trim;
    mesh.receiveShadows = true;
    const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
    aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
    aggregate.shape.filterMembershipMask = collisionLayer.terrain;
    casters.push(mesh);
    // Sur la face sud du linteau, côté arrivée.
    const light = lamp(name + " · voyant", x, y + height + 0.35, z - wall / 2 - 0.04, width * 0.6, 0.16, 0.06);
    light.set(false);
    const door = {
      x, z, width, closedY: y + height / 2, openY: y - height / 2 - 0.05, current: y + height / 2,
      open: false, body: aggregate.body, mesh, light, target: new Vector3(), rotation: Quaternion.Identity(),
    };
    doors.push(door);
    return door;
  }

  function resetButton(name, x, y, z, prompt, action) {
    const base = CreateCylinder(name, { height: 0.95, diameter: 0.42, tessellation: 12 }, scene);
    base.position.set(x, y + 0.475, z);
    zoneMeshes.push(solidTerrain(base, trim, PhysicsShapeType.CYLINDER));
    const cap = CreateCylinder(name + " · bouton", { height: 0.1, diameter: 0.3, tessellation: 16 }, scene);
    cap.position.set(x, y + 1, z);
    const capMat = terrainMaterial(scene, name + " · bouton", "#c43c2c");
    capMat.emissiveColor = Color3.FromHexString("#5a1208");
    cap.material = capMat;
    cap.isPickable = false;
    interactables.push({ spec: { name, interact: { prompt, radius: 1.5 } }, root: base, onInteract: action });
  }

  function crate(name, x, y, z, options = {}) {
    const start = { x, y, z, yaw: 0, scale: options.scale ?? 1 };
    const body = createCrate(scene, portals, { name, position: new Vector3(x, y, z), ...options });
    crates.push(body);
    return { body, reset: () => body.place(start) };
  }

  // ─── Sol et parvis ──────────────────────────────────────────────────────────────────────────────
  beginZone("parvis");
  slab("sol", -50, 50, -1, 0, -50, 50, outside);
  floorPaint("dallage du parvis", -8, 8, 0, -46, -32.4, tiles("dalles du parvis", 16, 13.6, "#9fb0a3", "#c5cfc0"));
  sign("CASSE-TÊTE", 0, 0, -36, 7, 1.7);

  // ─── Salle 1 : Poids ────────────────────────────────────────────────────────────────────────────
  beginZone("salle 1");
  const h1 = 6.5;
  shell("salle 1", -8, 8, -32, -16, h1);
  wallZ("salle 1 · façade", -8 - wall, 8 + wall, -32 - wall, -32, 0, h1, panel, { x: 0, width: doorWidth, y0: 0, y1: doorHeight });
  wallZ("salle 1 · mur nord", -8, 8, -16, -16 + wall, 0, h1, panel, { x: 0, width: doorWidth, y0: 0, y1: doorHeight });
  floorPaint("sol de la salle 1", -8, 8, 0, -32, -16, tiles("dalles de la salle 1", 16, 16, "#7d8784", "#a8b0ab"));
  // Balcon inaccessible (2,6 m) au nord-ouest.
  const balcony = 2.6;
  slab("salle 1 · balcon", -8, -2, 0, balcony, -22.4, -16, concrete);
  slab("salle 1 · garde-corps", -8, -7.6, balcony, balcony + 0.5, -22.4, -16, trim);
  const p1a = kiosk("1A", 5, 0, -27, Math.PI, doorWidth, doorHeight, frameMat);
  const p1b = kiosk("1B", -5, balcony, -21.4, 0, doorWidth, doorHeight, frameMat);
  portals.link(p1a, p1b);
  const plate1 = plate("salle 1 · plaque", 3.5, 0, -20);
  const door1 = slidingDoor("salle 1 · porte", 0, 0, -16 + wall / 2, doorWidth, doorHeight, 0.3);
  plate1.listeners.push((pressed) => { door1.open = pressed; });
  const crate1 = crate("caisse de la salle 1", -4, balcony + 0.5, -18.6);
  resetButton("salle 1 · rappel", -7, 0, -30.5, "rappeler la caisse", crate1.reset);
  sign("POUSSEZ LA CAISSE SUR LA PLAQUE", 0, 0, -29.5, 7, 1.1);

  // ─── Salle 2 : Échelle ──────────────────────────────────────────────────────────────────────────
  beginZone("salle 2");
  const h2 = 6;
  const ledge = 1.9;
  shell("salle 2", -8, 8, -16 + wall, 2, h2);
  wallZ("salle 2 · mur nord", -8, 8, 2, 2 + wall, 0, h2, panel, { x: 0, width: doorWidth, y0: ledge, y1: ledge + doorHeight });
  floorPaint("sol de la salle 2", -8, 8, 0, -15.6, -3, tiles("dalles de la salle 2", 16, 12.6, "#7d8784", "#a8b0ab"));
  slab("salle 2 · corniche", -8, 8, 0, ledge, -3, 2, concrete);
  slab("salle 2 · nez de corniche", -8, 8, ledge - 0.12, ledge, -3.08, -3, trim);
  // g (1,2 m) ↔ G (2,4 m) : la petite caisse poussée dans g ressort de G deux fois plus grande.
  const bigGate = kiosk("G", -4, 0, -9, 0, doorWidth, 2.8, scaleFrameMat);
  const smallGate = kiosk("g", 4, 0, -9, Math.PI, 1.2, 1.4, scaleFrameMat);
  portals.link(smallGate, bigGate);
  // Rails bas qui alignent la petite caisse sur l'ouverture de g.
  for (const side of [-1, 1]) {
    slab("salle 2 · rail", 4 + side * 0.6 + (side > 0 ? 0 : -0.15), 4 + side * 0.6 + (side > 0 ? 0.15 : 0), 0, 0.35, -12.8, -9.1, trim);
  }
  const crate2 = crate("caisse de la salle 2", 4, 0.25, -11.6, { scale: 0.5, color: "#bd8555" });
  resetButton("salle 2 · rappel", -7, 0, -14.5, "rappeler la caisse", crate2.reset);
  sign("1,9 m", 0, ledge, -0.5, 2.6, 0.9);

  // ─── Salle 3 : Aiguillage ───────────────────────────────────────────────────────────────────────
  beginZone("salle 3");
  const h3 = 8.5;
  const tower = 4.5;
  shell("salle 3", -8, 8, 2 + wall, 24, h3);
  wallZ("salle 3 · mur nord", -8, 8, 24, 24 + wall, 0, h3, panel, { x: 0, width: doorWidth, y0: tower, y1: tower + doorHeight });
  slab("salle 3 · palier", -8, 8, 0, ledge, 2 + wall, 5, concrete);
  slab("salle 3 · tour", -8, 8, 0, tower, 16, 24, concrete);
  slab("salle 3 · nez de tour", -8, 8, tower - 0.12, tower, 15.92, 16, trim);
  floorPaint("sol de la salle 3", -8, 8, 0, 5, 16, tiles("dalles de la salle 3", 16, 11, "#7d8784", "#a8b0ab"));
  const switchGate = kiosk("E3", -4, 0, 10, Math.PI, doorWidth, doorHeight, switchFrameMat);
  const towerGate = kiosk("Y", 0, tower, 17.2, 0, doorWidth, doorHeight, switchFrameMat);
  const plate3 = plate("salle 3 · plaque", 4, 0, 7.5);
  sign("LA PLAQUE AIGUILLE LE PORTAIL", 0, 0, 14.2, 7.4, 1.1);

  beginZone("cellule");
  // Cellule close hors du bâtiment, accessible seulement par X.
  const cell = { x0: 12, x1: 20, z0: 7.6, z1: 15.6, h: 4 };
  shell("cellule", cell.x0, cell.x1, cell.z0, cell.z1, cell.h);
  slab("cellule · mur sud", cell.x0, cell.x1, 0, cell.h, cell.z0 - wall, cell.z0, panel);
  slab("cellule · mur nord", cell.x0, cell.x1, 0, cell.h, cell.z1, cell.z1 + wall, panel);
  floorPaint("sol de la cellule", cell.x0, cell.x1, 0, cell.z0, cell.z1, tiles("dalles de la cellule", 8, 8, "#6c6880", "#9a95ad"));
  const cellGate = kiosk("X", 16, 0, 9, 0, doorWidth, doorHeight, switchFrameMat);
  sign("R : RECOMMENCER LA SALLE", 16, 0, 14.4, 5.6, 0.9);
  const crate3 = crate("caisse de la salle 3", 16, 0.5, 12.6, { color: "#8f6bb8" });
  beginZone("salle 3 · rappel");
  resetButton("salle 3 · rappel", -7, 0, 6, "rappeler la caisse", crate3.reset);

  const veils = new Map([[cellGate, inactiveVeil(cellGate)], [towerGate, inactiveVeil(towerGate)]]);
  function route(toTower) {
    portals.link(switchGate, toTower ? towerGate : cellGate);
    for (const [portal, veil] of veils) veil.setEnabled(!portal.target);
  }
  route(false);
  plate3.listeners.push(route);

  // ─── Sortie ─────────────────────────────────────────────────────────────────────────────────────
  beginZone("sortie");
  shell("sortie", -8, 8, 24 + wall, 32, h3);
  slab("sortie · mur nord", -8, 8, 0, h3, 32, 32 + wall, panel);
  slab("sortie · socle", -8, 8, 0, tower, 24 + wall, 32, concrete);
  floorPaint("sol de la sortie", -8, 8, tower, 24.4, 32, tiles("dalles de la sortie", 16, 7.6, "#6f8f7c", "#a7c2ae"));
  const goal = { x: 0, y: tower, z: 29.5, radius: 1.4 };
  const goalPad = CreateCylinder("arrivée", { height: 0.05, diameter: goal.radius * 2, tessellation: 48 }, scene);
  goalPad.position.set(goal.x, tower + 0.025, goal.z);
  const goalMat = terrainMaterial(scene, "arrivée", "#d9b44a");
  goalMat.emissiveColor = Color3.FromHexString("#6a5010");
  goalPad.material = goalMat;
  goalPad.isPickable = false;
  sign("ARRIVÉE", 0, tower, 27.2, 4.2, 1.1);

  for (const { name, meshes } of zones) casters.push(...batchStaticMeshes(name, meshes));

  // ─── Bandeau ────────────────────────────────────────────────────────────────────────────────────
  const banner = document.createElement("p");
  banner.id = "puzzle-banner";
  banner.setAttribute("role", "status");
  banner.hidden = true;
  document.querySelector("#interaction-prompt")?.before(banner);
  let bannerTimer = 0;
  function announce(text, seconds = 3.5) {
    banner.textContent = text;
    banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = seconds > 0 ? setTimeout(() => { banner.hidden = true; }, seconds * 1000) : 0;
  }

  // ─── Logique ────────────────────────────────────────────────────────────────────────────────────
  const spawn = new Vector3(...rooms[0].spawn);
  let reached = 0;
  let elapsed = 0;
  let finished = false;

  function inside(state, p, margin) {
    return Math.abs(p.x - state.x) <= state.half + margin && Math.abs(p.z - state.z) <= state.half + margin;
  }

  function nearDoor(door, p) {
    return Math.abs(p.x - door.x) < door.width / 2 + 0.6 && Math.abs(p.z - door.z) < 1.2;
  }

  function update(dt, player) {
    const feet = player.state.position;
    // Plaques : le joueur debout dessus, ou le centre d'une caisse au-dessus.
    for (const state of plates) {
      let pressed = inside(state, feet, 0) && feet.y > state.y - 0.2 && feet.y < state.y + 0.5;
      for (const box of crates) {
        if (pressed) break;
        const p = box.body.transformNode.position;
        pressed = inside(state, p, 0) && p.y > state.y && p.y < state.y + 1.5;
      }
      setPlate(state, pressed);
    }
    // Portes : une porte ne remonte pas sous le joueur ni sous une caisse.
    for (const door of doors) {
      let goal = door.open ? door.openY : door.closedY;
      if (!door.open && (nearDoor(door, feet) || crates.some((box) => nearDoor(door, box.body.transformNode.position)))) {
        goal = door.current;
      }
      const step = 5 * dt;
      door.current += Math.max(-step, Math.min(step, goal - door.current));
      door.target.set(door.mesh.position.x, door.current, door.mesh.position.z);
      door.body.setTargetTransform(door.target, door.rotation);
      door.light.set(door.open);
    }
    // Reprise : la dernière salle atteinte, sans retour en arrière.
    const room = rooms.findIndex((r) => r.test(feet));
    if (room > reached) {
      reached = room;
      spawn.set(...rooms[room].spawn);
      if (rooms[room].title && room < rooms.length - 1) announce(rooms[room].title);
    }
    if (reached >= 1 && !finished) elapsed += dt;
    if (!finished && Math.hypot(feet.x - goal.x, feet.z - goal.z) < goal.radius && Math.abs(feet.y - goal.y) < 0.6) {
      finished = true;
      const seconds = Math.round(elapsed);
      announce(`Casse-tête résolu en ${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s !`, 0);
    }
  }

  function dispose() {
    clearTimeout(bannerTimer);
    banner.remove();
  }

  return {
    casters, crates, interiors: [], interactables, spawn, destinations: puzzleDestinations, update, dispose,
    // Lecture pour le hook de dev et les tests.
    state: () => ({
      room: reached, finished, plates: Object.fromEntries(plates.map((p) => [p.name, p.pressed])),
      doors: doors.map((door) => door.open), switchTarget: switchGate.target?.name ?? null,
    }),
  };
}
