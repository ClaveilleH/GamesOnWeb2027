import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { collisionLayer } from "../../core/physics.js";
import { paintMarquee, paintScreen } from "./screens.js";

// Salle d'arcade commune à toutes les directions artistiques : même plan, mêmes meubles. Seuls les
// matériaux (`look`) et les lumières changent d'une salle à l'autre. Repère local : origine au centre
// du sol, entrée au sud (−Z), bar au nord, bornes contre le mur est, table à l'ouest.
export const ROOM = Object.freeze({ width: 16, depth: 12, height: 4.2, wall: 0.3 });
export const CABINET_COUNT = 5;

export function buildArcadeRoom(scene, name, origin, look) {
  const meshes = [];
  const colliders = [];
  const screens = [];
  const anchors = { cabinets: [], bottles: [], stools: [], table: null, bar: null, door: null };
  const { width: W, depth: D, height: H, wall: T } = ROOM;
  const ox = origin.x;
  const oz = origin.z;

  function add(mesh, material, { shadows = true, parent = null } = {}) {
    mesh.material = material;
    mesh.receiveShadows = shadows;
    if (parent) mesh.parent = parent;
    meshes.push(mesh);
    return mesh;
  }

  function box(label, x, y, z, w, h, d, material, options) {
    const mesh = CreateBox(`${name} · ${label}`, { width: w, height: h, depth: d }, scene);
    mesh.position.set(options?.parent ? x : ox + x, y, options?.parent ? z : oz + z);
    return add(mesh, material, options);
  }

  function cylinder(label, x, y, z, diameter, h, material, options = {}) {
    const mesh = CreateCylinder(`${name} · ${label}`, {
      height: h, diameterTop: options.top ?? diameter, diameterBottom: diameter, tessellation: options.tessellation ?? 24,
    }, scene);
    mesh.position.set(options.parent ? x : ox + x, y, options.parent ? z : oz + z);
    return add(mesh, material, options);
  }

  // Collision statique invisible, en coordonnées locales de la salle.
  function collider(label, x, y, z, w, h, d, yaw = 0) {
    const mesh = CreateBox(`${name} · collision ${label}`, { width: w, height: h, depth: d }, scene);
    mesh.position.set(ox + x, y, oz + z);
    mesh.rotation.y = yaw;
    mesh.isVisible = false;
    mesh.isPickable = false;
    const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
    aggregate.shape.filterMembershipMask = collisionLayer.terrain;
    colliders.push(mesh);
  }

  // ─── Enveloppe ────────────────────────────────────────────────────────────────────────────────
  const floor = CreatePlane(`${name} · sol`, { width: W, height: D }, scene);
  floor.rotation.x = Math.PI / 2;
  floor.position.set(ox, 0.002, oz);
  add(floor, look.floor);
  anchors.floor = floor;
  // Faces intérieures en plans : la texture d'un mur garde le haut de l'image en haut, quelle que soit la paroi.
  function surface(label, x, y, z, w, h, rotation, material) {
    const mesh = CreatePlane(`${name} · ${label}`, { width: w, height: h }, scene);
    mesh.position.set(ox + x, y, oz + z);
    mesh.rotation.set(...rotation);
    return add(mesh, material);
  }
  anchors.walls = [
    surface("mur nord", 0, H / 2, D / 2, W, H, [0, 0, 0], look.wall),
    surface("mur sud", 0, H / 2, -D / 2, W, H, [0, Math.PI, 0], look.wall),
    surface("mur ouest", -W / 2, H / 2, 0, D, H, [0, -Math.PI / 2, 0], look.wall),
    surface("mur est", W / 2, H / 2, 0, D, H, [0, Math.PI / 2, 0], look.wall),
  ];
  anchors.ceiling = surface("plafond", 0, H, 0, W, D, [-Math.PI / 2, 0, 0], look.ceiling);
  collider("mur nord", 0, H / 2, D / 2 + T / 2, W + 2 * T, H, T);
  collider("mur sud", 0, H / 2, -D / 2 - T / 2, W + 2 * T, H, T);
  collider("mur ouest", -W / 2 - T / 2, H / 2, 0, T, H, D);
  collider("mur est", W / 2 + T / 2, H / 2, 0, T, H, D);
  collider("plafond", 0, H + T / 2, 0, W + 2 * T, T, D + 2 * T);
  // Plinthes : elles accrochent la lumière au pied des murs.
  for (const [label, x, z, w, d] of [["nord", 0, D / 2 - 0.02, W, 0.04], ["sud", 0, -D / 2 + 0.02, W, 0.04],
    ["ouest", -W / 2 + 0.02, 0, 0.04, D], ["est", W / 2 - 0.02, 0, 0.04, D]]) {
    box("plinthe " + label, x, 0.06, z, w, 0.12, d, look.trim);
  }

  // Porte vers la salle suivante (décor ; on la franchit avec « Interagir »).
  box("porte · cadre", 0, 1.2, -D / 2 + 0.04, 1.6, 2.4, 0.08, look.doorFrame);
  box("porte · battant", 0, 1.15, -D / 2 + 0.09, 1.3, 2.25, 0.04, look.door);
  const doorSign = CreatePlane(`${name} · porte · enseigne`, { width: 1.5, height: 0.32 }, scene);
  doorSign.position.set(ox, 2.75, oz - D / 2 + 0.02);
  doorSign.rotation.y = Math.PI;
  add(doorSign, look.sign, { shadows: false });
  anchors.door = new Vector3(ox, 0, oz - D / 2 + 0.6);

  // ─── Bar (mur nord) ───────────────────────────────────────────────────────────────────────────
  const barX = -3.2;
  const barLength = 6.4;
  const barZ = 3.9;
  box("bar · façade", barX, 0.52, barZ, barLength, 1.04, 0.62, look.counter);
  box("bar · plateau", barX, 1.07, barZ - 0.04, barLength + 0.2, 0.06, 0.78, look.counterTop);
  box("bar · repose-pied", barX, 0.18, barZ - 0.36, barLength, 0.04, 0.04, look.metal);
  collider("bar", barX, 0.55, barZ - 0.04, barLength + 0.2, 1.1, 0.78);
  anchors.bar = new Vector3(ox + barX, 1.1, oz + barZ);
  // Étagères rétroéclairées et bouteilles.
  anchors.backBar = box("bar · fond", barX, 1.75, D / 2 - 0.06, barLength, 1.5, 0.04, look.backBar);
  for (const [i, y] of [1.3, 1.82].entries()) {
    box("bar · étagère " + i, barX, y, D / 2 - 0.2, barLength - 0.4, 0.04, 0.28, look.shelf);
    for (let b = 0; b < 12; b++) {
      const x = barX - barLength / 2 + 0.45 + b * 0.47;
      const height = 0.26 + ((b * 7 + i * 3) % 4) * 0.035;
      const bottle = cylinder(`bouteille ${i}.${b}`, x, y + 0.02 + height / 2, D / 2 - 0.2, 0.085, height,
        look.glass((b + i) % 4), { top: 0.05, tessellation: 12 });
      anchors.bottles.push(bottle);
    }
  }
  box("bar · bandeau", barX, 2.62, D / 2 - 0.15, barLength, 0.12, 0.3, look.shelf);
  for (let s = 0; s < 4; s++) {
    const x = barX - 2.25 + s * 1.5;
    const z = barZ - 0.85;
    cylinder(`tabouret ${s} · pied`, x, 0.36, z, 0.06, 0.72, look.metal);
    cylinder(`tabouret ${s} · socle`, x, 0.015, z, 0.38, 0.03, look.metal);
    const seat = cylinder(`tabouret ${s} · assise`, x, 0.76, z, 0.4, 0.08, look.seat);
    anchors.stools.push(seat);
    collider(`tabouret ${s}`, x, 0.4, z, 0.4, 0.8, 0.4);
  }

  // ─── Table et chaises (ouest) ─────────────────────────────────────────────────────────────────
  const table = { x: -4.6, z: -2 };
  cylinder("table · plateau", table.x, 0.74, table.z, 1.3, 0.05, look.tableTop, { tessellation: 40 });
  cylinder("table · pied", table.x, 0.37, table.z, 0.1, 0.72, look.metal);
  cylinder("table · socle", table.x, 0.02, table.z, 0.6, 0.04, look.metal);
  collider("table", table.x, 0.38, table.z, 1.1, 0.76, 1.1);
  anchors.table = new Vector3(ox + table.x, 0.77, oz + table.z);
  for (let c = 0; c < 4; c++) {
    const angle = c * Math.PI / 2 + Math.PI / 4;
    const x = table.x + Math.cos(angle) * 1.05;
    const z = table.z + Math.sin(angle) * 1.05;
    const chair = new TransformNode(`${name} · chaise ${c}`, scene);
    chair.position.set(ox + x, 0, oz + z);
    chair.rotation.y = -angle - Math.PI / 2;
    box(`chaise ${c} · assise`, 0, 0.46, 0, 0.46, 0.05, 0.46, look.seat, { parent: chair });
    box(`chaise ${c} · dossier`, 0, 0.75, -0.21, 0.46, 0.55, 0.04, look.seat, { parent: chair });
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      box(`chaise ${c} · pied`, lx, 0.22, lz, 0.035, 0.44, 0.035, look.metal, { parent: chair });
    }
    collider(`chaise ${c}`, x, 0.5, z, 0.5, 1, 0.5, chair.rotation.y);
  }

  // ─── Bornes (mur est, tournées vers −X) ───────────────────────────────────────────────────────
  for (let i = 0; i < CABINET_COUNT; i++) {
    const z = -4 + i * 2;
    const x = W / 2 - 0.55;
    const pivot = new TransformNode(`${name} · borne ${i}`, scene);
    pivot.position.set(ox + x, 0, oz + z);
    pivot.rotation.y = -Math.PI / 2;
    const parent = { parent: pivot };
    const body = look.cabinet(i);
    box(`borne ${i} · caisson`, 0, 0.5, -0.05, 0.76, 1, 0.7, body, parent);
    const panel = box(`borne ${i} · pupitre`, 0, 1.04, 0.24, 0.76, 0.1, 0.4, look.panel, parent);
    panel.rotation.x = 0.28;
    box(`borne ${i} · tête`, 0, 1.6, -0.17, 0.76, 1.04, 0.46, body, parent);
    box(`borne ${i} · visière`, 0, 2.06, 0.1, 0.76, 0.06, 0.18, body, parent);
    box(`borne ${i} · fronton`, 0, 2.2, -0.08, 0.76, 0.26, 0.36, body, parent);
    for (const side of [-1, 1]) {
      box(`borne ${i} · flanc`, side * 0.4, 1.15, -0.05, 0.04, 2.3, 0.86, look.cabinetSide(i), parent);
      // Liseré lumineux sur l'arête avant du flanc (facultatif).
      if (look.cabinetEdge) box(`borne ${i} · liseré`, side * 0.4, 1.15, 0.385, 0.05, 2.3, 0.012, look.cabinetEdge(i), parent);
    }
    // Écran incliné et fronton peints au canevas.
    const screenTexture = new DynamicTexture(`${name} · écran ${i}`, { width: 512, height: 384 }, scene, false,
      look.pixelated ? Texture.NEAREST_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE);
    paintScreen(screenTexture.getContext(), screenTexture.getSize(), i, look.palette, look.scanlines !== false);
    screenTexture.update();
    const screen = CreatePlane(`${name} · borne ${i} · écran`, { width: 0.6, height: 0.45 }, scene);
    screen.position.set(0, 1.52, 0.065);
    screen.rotation.set(-0.22, Math.PI, 0);
    add(screen, look.screen(i, screenTexture), { shadows: false, parent: pivot });
    screens.push(screen);
    const marqueeTexture = new DynamicTexture(`${name} · fronton ${i}`, { width: 512, height: 160 }, scene, true);
    paintMarquee(marqueeTexture.getContext(), marqueeTexture.getSize(), i, look.palette);
    marqueeTexture.update();
    const marquee = CreatePlane(`${name} · borne ${i} · fronton`, { width: 0.72, height: 0.22 }, scene);
    marquee.position.set(0, 2.2, 0.101);
    marquee.rotation.y = Math.PI;
    add(marquee, look.marquee(i, marqueeTexture), { shadows: false, parent: pivot });
    // Manette et boutons.
    cylinder(`borne ${i} · manche`, -0.18, 1.14, 0.25, 0.025, 0.1, look.metal, { parent: pivot });
    const knob = CreateSphere(`${name} · borne ${i} · boule`, { diameter: 0.055, segments: 8 }, scene);
    knob.position.set(-0.18, 1.2, 0.25);
    add(knob, look.button(0), parent);
    for (let b = 0; b < 3; b++) {
      cylinder(`borne ${i} · bouton ${b}`, 0.02 + b * 0.09, 1.1, 0.27 - b * 0.012, 0.045, 0.03, look.button(b + 1), { parent: pivot, tessellation: 12 });
    }
    collider(`borne ${i}`, x, 1.15, z, 0.9, 2.3, 0.84);
    anchors.cabinets.push({ pivot, position: new Vector3(ox + x - 0.6, 1.5, oz + z), screen, marquee });
  }

  return { meshes, colliders, screens, anchors };
}
