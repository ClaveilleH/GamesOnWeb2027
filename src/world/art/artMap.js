import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import { collisionLayer } from "../../core/physics.js";
import { ROOM, buildArcadeRoom } from "./arcadeKit.js";
import { THEMES } from "./themes.js";

// Map « direction artistique » : la même salle d'arcade répétée, une direction artistique par salle
// (matériaux, lumières, reflets, glow). Une seule salle est active à la fois : les autres sont éteintes,
// ce qui isole leurs lumières et ne rend que les reflets de la salle où se trouve le joueur.
// L'ambiance globale (ciel hémisphérique, soleil) est réglée par la salle active.

const SPACING = 30;
const color = (value) => (value instanceof Color3 ? value : Color3.FromHexString(value));

export function createArtMap(scene) {
  const hemi = scene.getLightByName("ciel");
  const sun = scene.getLightByName("soleil");
  const glow = new GlowLayer("néons", scene, { blurKernelSize: 64, mainTextureRatio: 0.5 });
  glow.intensity = 0;
  const playerMeshes = [];
  const rooms = [];

  const ground = CreateBox("salles · dalle", { width: SPACING * THEMES.length + 20, height: 1, depth: 40 }, scene);
  ground.position.set((SPACING * (THEMES.length - 1)) / 2, -0.5, 0);
  ground.isVisible = false;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene)
    .shape.filterMembershipMask = collisionLayer.terrain;

  THEMES.forEach((theme, index) => {
    const origin = new Vector3(index * SPACING, 0, 0);
    const name = `salle ${index + 1}`;
    const look = theme.look(scene, name);
    const room = buildArcadeRoom(scene, name, origin, look);
    Object.assign(room, { theme, index, origin, lights: [], mirrors: [], probes: [], updates: [] });
    const local = (x, y, z) => new Vector3(origin.x + x, y, origin.z + z);

    // Outils passés à la direction artistique pour éclairer et décorer sa salle.
    const ctx = {
      scene, room, look, local, ROOM,
      point(label, x, y, z, hex, intensity = 1, range = 10) {
        const light = new PointLight(`${name} · ${label}`, local(x, y, z), scene);
        light.diffuse = color(hex);
        light.specular = color(hex);
        light.intensity = intensity;
        light.range = range;
        room.lights.push(light);
        return light;
      },
      spot(label, position, direction, hex, intensity = 1, angle = 0.9, exponent = 2, range = 12) {
        const light = new SpotLight(`${name} · ${label}`, local(...position), new Vector3(...direction).normalize(),
          angle, exponent, scene);
        light.diffuse = color(hex);
        light.specular = color(hex);
        light.intensity = intensity;
        light.range = range;
        room.lights.push(light);
        return light;
      },
      // Boîte décorative (néon, panneau) en coordonnées locales, sans collision.
      box(label, x, y, z, w, h, d, material, yaw = 0) {
        const mesh = CreateBox(`${name} · ${label}`, { width: w, height: h, depth: d }, scene);
        mesh.position.copyFrom(local(x, y, z));
        mesh.rotation.y = yaw;
        mesh.material = material;
        mesh.isPickable = false;
        room.meshes.push(mesh);
        return mesh;
      },
      // Sol miroir : reflet plan en temps réel de la salle et du joueur, flouté de `blur` pixels.
      mirrorFloor(material, { level = 0.5, blur = 0, size = 1024 } = {}) {
        const mirror = new MirrorTexture(`${name} · miroir`, size, scene, true);
        mirror.mirrorPlane = new Plane(0, -1, 0, 0.002);
        if (blur) mirror.blurKernel = blur;
        mirror.level = level;
        mirror.renderList = room.meshes.filter((mesh) => mesh !== room.anchors.floor);
        material.reflectionTexture = mirror;
        room.mirrors.push(mirror);
        return mirror;
      },
      // Sonde de réflexion au centre de la salle, rendue une fois à l'entrée : reflets des surfaces brillantes.
      probe(materials, { level = 0.4, size = 256, at = [0, 1.6, 0] } = {}) {
        const probe = new ReflectionProbe(`${name} · sonde`, size, scene);
        probe.position.copyFrom(local(...at));
        probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
        // Une surface qui reflète la sonde ne peut pas être rendue dedans (boucle de rétroaction WebGL).
        const reflecting = new Set(materials);
        for (const mesh of room.meshes) {
          if (!reflecting.has(mesh.material) && mesh !== room.anchors.floor) probe.renderList.push(mesh);
        }
        probe.cubeTexture.level = level;
        for (const mat of materials) mat.reflectionTexture = probe.cubeTexture;
        room.probes.push(probe);
        return probe;
      },
      // Panneau plat (enseigne, affiche) en coordonnées locales, face tournée vers `yaw` (0 : vers −Z).
      plane(label, x, y, z, w, h, material, yaw = 0) {
        const mesh = CreatePlane(`${name} · ${label}`, { width: w, height: h }, scene);
        mesh.position.copyFrom(local(x, y, z));
        mesh.rotation.y = yaw;
        mesh.material = material;
        mesh.isPickable = false;
        room.meshes.push(mesh);
        return mesh;
      },
      onUpdate(fn) { room.updates.push(fn); },
    };
    theme.decorate?.(ctx);
    rooms.push(room);
  });

  // ─── Salle active ───────────────────────────────────────────────────────────────────────────────
  let current = -1;
  let time = 0;
  const banner = document.createElement("p");
  banner.className = "map-banner";
  banner.setAttribute("role", "status");
  banner.hidden = true;
  document.querySelector("#interaction-prompt")?.before(banner);
  let bannerTimer = 0;

  function activate(index) {
    if (index === current) return;
    current = index;
    for (const room of rooms) {
      const on = room.index === index;
      for (const mesh of room.meshes) mesh.setEnabled(on);
      for (const light of room.lights) light.setEnabled(on);
      for (const mirror of room.mirrors) {
        for (const mesh of playerMeshes) {
          if (on && !mirror.renderList.includes(mesh)) mirror.renderList.push(mesh);
        }
      }
      for (const probe of room.probes) {
        if (on) probe.cubeTexture.resetRefreshCounter();
      }
    }
    const { ambient = {}, glow: glowIntensity = 0 } = rooms[index].theme;
    hemi.intensity = ambient.hemi ?? 0.7;
    hemi.diffuse = color(ambient.sky ?? "#ffffff");
    hemi.groundColor = color(ambient.ground ?? "#76918b");
    hemi.specular = color(ambient.specular ?? "#000000");
    hemi.setEnabled(hemi.intensity > 0);
    sun.setEnabled((ambient.sun ?? 0) > 0);
    sun.intensity = ambient.sun ?? 0;
    glow.intensity = glowIntensity;
    glow.isEnabled = glowIntensity > 0;
    banner.textContent = `${index + 1} · ${rooms[index].theme.title}`;
    banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner.hidden = true; }, 3000);
  }

  const spawnOf = (index) => new Vector3(index * SPACING, 1.2, -3.5);
  const spawn = spawnOf(0);
  activate(0);

  const interactables = rooms.map((room) => ({
    spec: { name: `${room.theme.title} · porte`, interact: { prompt: "passer à la salle suivante", radius: 1.4 } },
    root: { position: room.anchors.door },
    onInteract({ teleport }) {
      const next = (room.index + 1) % rooms.length;
      const feet = spawnOf(next);
      teleport({ x: feet.x, y: 0.05, z: feet.z }, 0);
    },
  }));

  return {
    casters: [], crates: [], interiors: [], interactables, spawn,
    destinations: rooms.map((room) => ({ label: `${room.index + 1} · ${room.theme.title}`,
      feet: { x: room.origin.x, y: 0.05, z: -3.5 }, yaw: 0 })),
    // Le joueur se reflète dans les miroirs de la salle active.
    attachPlayer(meshes) {
      playerMeshes.push(...meshes);
      const index = current;
      current = -1;
      activate(index);
    },
    update(dt, player) {
      time += dt;
      const index = Math.max(0, Math.min(rooms.length - 1, Math.round(player.state.position.x / SPACING)));
      activate(index);
      for (const fn of rooms[current].updates) fn(time, dt);
    },
    state: () => ({ room: current, theme: rooms[current].theme.key, count: rooms.length }),
    dispose() {
      clearTimeout(bannerTimer);
      banner.remove();
    },
  };
}
