import { Scene } from "@babylonjs/core/scene";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
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
    Object.assign(room, { theme, index, origin, lights: [], mirrors: [], probes: [], shadows: [], updates: [] });
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
      // Miroir plan en temps réel (salle et joueur), flouté de `blur` pixels. `plane` est le plan du miroir,
      // normale tournée vers l'arrière de la surface ; `surface` est exclu de son propre reflet.
      mirror(material, surface, plane, { level = 0.5, blur = 0, size = 1024 } = {}) {
        const mirror = new MirrorTexture(`${name} · miroir ${room.mirrors.length}`, size, scene, true);
        mirror.mirrorPlane = plane;
        if (blur) mirror.blurKernel = blur;
        mirror.level = level;
        mirror.renderList = room.meshes.filter((mesh) => mesh !== surface && mesh.material !== material);
        material.reflectionTexture = mirror;
        room.mirrors.push(mirror);
        return mirror;
      },
      mirrorFloor(material, options) {
        return ctx.mirror(material, room.anchors.floor, new Plane(0, -1, 0, 0.002), options);
      },
      // Ombres portées d'une lumière ponctuelle ou d'un projecteur : tout le mobilier, plus le joueur.
      shadows(light, { size = 1024, darkness = 0.15, bias = 0.0005, soft = true } = {}) {
        const generator = new ShadowGenerator(size, light);
        generator.usePercentageCloserFiltering = true;
        generator.filteringQuality = soft ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
        generator.bias = bias;
        generator.setDarkness(darkness);
        generator.transparencyShadow = true;
        for (const mesh of room.meshes) {
          if (mesh !== room.anchors.floor && mesh !== room.anchors.ceiling && !room.anchors.walls.includes(mesh)) {
            generator.addShadowCaster(mesh, false);
          }
        }
        room.shadows.push(generator);
        return generator;
      },
      // Maillage quelconque rattaché à la salle (allumé et éteint avec elle).
      add(mesh, material) {
        if (material) mesh.material = material;
        mesh.isPickable = false;
        if (mesh.getClassName() !== "TransformNode") room.meshes.push(mesh);
        return mesh;
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
      // Exclut un maillage du halo (glow) : sa propre émission reste nette.
      noGlow(mesh) { glow.addExcludedMesh(mesh); },
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

  // Brouillard de la scène hors de cette carte, restauré à la sortie.
  const sceneFog = { mode: scene.fogMode, color: scene.fogColor.clone(), density: scene.fogDensity };

  // Post-traitement de la salle active (pipeline de rendu sur la caméra), recréé à chaque entrée.
  let disposePost = null;

  function activate(index) {
    if (index === current) return;
    current = index;
    disposePost?.();
    disposePost = null;
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
      if (on) {
        for (const generator of room.shadows) {
          const casters = generator.getShadowMap().renderList;
          for (const mesh of playerMeshes) if (!casters.includes(mesh)) generator.addShadowCaster(mesh, false);
        }
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
    // Traitement d'image de la salle (tone mapping, exposition, contraste, vignette), neutre par défaut.
    const image = scene.imageProcessingConfiguration;
    const look = rooms[index].theme.image ?? {};
    image.toneMappingEnabled = Boolean(look.toneMapping);
    image.toneMappingType = { aces: 1, neutral: 2 }[look.toneMapping] ?? 0;
    image.exposure = look.exposure ?? 1;
    image.contrast = look.contrast ?? 1;
    image.vignetteEnabled = Boolean(look.vignette);
    image.vignetteWeight = look.vignette ?? 0;
    image.vignetteColor.set(0, 0, 0, 0);
    // Saturation globale (−100 : noir et blanc) et teinte d'étalonnage facultatives.
    image.colorCurvesEnabled = look.saturation !== undefined || look.tint !== undefined;
    if (image.colorCurvesEnabled) {
      const curves = new ColorCurves();
      curves.globalSaturation = look.saturation ?? 0;
      if (look.tint) {
        curves.globalHue = look.tint.hue;
        curves.globalDensity = look.tint.density;
      }
      image.colorCurves = curves;
    }
    if (rooms[index].theme.post && scene.activeCamera) {
      disposePost = rooms[index].theme.post(scene, scene.activeCamera, rooms[index]);
    }
    // Brouillard exponentiel facultatif : `fog: { color, density }`.
    const fog = rooms[index].theme.fog;
    scene.fogMode = fog ? Scene.FOGMODE_EXP2 : Scene.FOGMODE_NONE;
    if (fog) {
      scene.fogColor = color(fog.color);
      scene.fogDensity = fog.density;
    }
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
      disposePost?.();
      scene.fogMode = sceneFog.mode;
      scene.fogColor = sceneFog.color;
      scene.fogDensity = sceneFog.density;
      clearTimeout(bannerTimer);
      banner.remove();
    },
  };
}
