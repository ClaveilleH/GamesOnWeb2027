import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Clamp, InverseLerp, NormalizeRadians, SmoothStep } from "@babylonjs/core/Maths/math.scalar.functions";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import { CAMERA, FIXED_STEP, MAX_ACCUMULATED_TIME, PLAYER, SPAWN_YAW } from "./config.js";
import { collisionLayer, initPhysics } from "./core/physics.js";
import { installDevHook, observeDevEffects } from "./dev/devHook.js";
import { createBindings } from "./input/bindings.js";
import { createInput } from "./input/input.js";
import { createKeyboardLayout } from "./input/keyboardLayout.js";
import { createPlayerController } from "./player/playerController.js";
import { createSkeletonVisual } from "./player/skeletonVisual.js";
import { createThirdPersonCamera } from "./player/thirdPersonCamera.js";
import { createPortalSystem } from "./portals/index.js";
import { createHud } from "./ui/hud.js";
import { createMenu } from "./ui/menu.js";
import { createPlatform } from "./platform/browser.js";
import { createPortalDemos } from "./world/portalDemos.js";
import { createTestTerrain, spawnPoint } from "./world/testTerrain.js";

const canvas = document.querySelector("#scene");
const status = document.querySelector("#status");

async function start() {
  const engine = new Engine(canvas, true, { alpha: true, stencil: true });
  const getEffects = observeDevEffects(engine);
  const scene = new Scene(engine);
  try {
    scene.clearColor = new Color4(0, 0, 0, 0);
    const gravity = await initPhysics(scene);
    scene.physicsEnabled = false;
    const physics = scene.getPhysicsEngine();
    const plugin = physics.getPhysicsPlugin();
    const sky = new HemisphericLight("ciel", Vector3.Up(), scene);
    sky.intensity = 0.72;
    sky.groundColor = Color3.FromHexString("#76918b");
    const sun = new DirectionalLight("soleil", new Vector3(-0.58, -1, 0.48), scene);
    // Le volume fixe englobe la dalle et les futurs intérieurs à −20 m, même hors champ.
    sun.direction.scaleToRef(-90, sun.position);
    sun.shadowFrustumSize = 150;
    sun.intensity = 0.78;
    sun.diffuse = Color3.FromHexString("#ffecd3");
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = 200;
    // 4096 texels sur 150 m : environ 3,7 cm par texel, comme l'ancienne carte sur la seule zone d'entraînement.
    const shadows = new ShadowGenerator(4096, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    // Le personnage continue de projeter son ombre pendant le fondu de proximité.
    shadows.transparencyShadow = true;
    // Seules les faces arrière, dans l'ombre de toute façon, s'écrivent dans la carte : pas d'acné sur les faces éclairées.
    shadows.forceBackFacesOnly = true;
    shadows.bias = 0.00015;
    shadows.normalBias = 0.006;
    shadows.setDarkness(0.2);

    const casters = createTestTerrain(scene);
    const visual = createSkeletonVisual(scene);
    scene.onDisposeObservable.addOnce(visual.dispose);
    const camera = createThirdPersonCamera(scene);
    const lightRayQuery = { collideWith: collisionLayer.terrain | collisionLayer.portalBack | collisionLayer.portalFrame };
    const lightRayHit = new PhysicsRaycastResult();
    const lightRayEnd = new Vector3();
    function isLightBlocked(origin, towardLight, maxDistance) {
      towardLight.scaleToRef(maxDistance, lightRayEnd).addInPlace(origin);
      physics.raycastToRef(origin, lightRayEnd, lightRayHit, lightRayQuery);
      return lightRayHit.hasHit;
    }
    const portals = createPortalSystem(scene, { camera: camera.camera, isLightBlocked });
    scene.onDisposeObservable.addOnce(portals.dispose);
    const demos = createPortalDemos(scene, portals);
    // Le ciel est peint par le quad de fond du renderer, après le décor, là où la profondeur vaut encore 1.
    portals.createSky({
      zenithColor: "#e1dfbd",
      midColor: "#adc2b2",
      horizonColor: "#789b95",
      sunDirection: new Vector3(0.28, 0.24, 0.93),
    });
    function shouldRespawn(position) {
      if (position.y >= PLAYER.respawnBelow) return false;
      if (position.y < -30) return true;
      for (const volume of demos.interiors) {
        if (volume.intersectsPoint(position)) return false;
      }
      return true;
    }
    const player = createPlayerController(scene, spawnPoint, gravity, shouldRespawn);
    scene.onDisposeObservable.addOnce(player.dispose);
    const crates = demos.crates;
    for (const crate of crates) scene.onDisposeObservable.addOnce(crate.dispose);
    const bones = visual.root.getChildMeshes();
    for (const mesh of [...casters, ...demos.casters, ...bones]) shadows.addShadowCaster(mesh, false);
    const playerTraveler = {
      name: "joueur", center: player.center, applyWarp: player.applyWarp,
      visual: {
        root: visual.root, materials: visual.materials, radius: () => 1.1 * player.state.scale,
        center: (out) => out.set(visual.root.position.x, visual.root.position.y + player.capsuleHeight / 2, visual.root.position.z),
      },
    };
    portals.addTraveler(playerTraveler);
    portals.onTraverseObservable.add(({ traveler, warp }) => {
      if (traveler === playerTraveler) camera.applyWarp(warp);
    });
    const bindings = createBindings();
    const layout = createKeyboardLayout();
    scene.onDisposeObservable.addOnce(layout.dispose);
    const hud = createHud(bindings, layout, portals);
    scene.onDisposeObservable.addOnce(hud.dispose);
    let previousFrameTime = 0;
    let accumulatedTime = 0;
    const platform = createPlatform();
    const menu = createMenu(bindings, layout, (key) => {
      previousFrameTime = performance.now();
      accumulatedTime = 0;
      player.syncPreviousPose();
      for (const crate of crates) crate.capturePose();
      input.resume(key);
    });
    scene.onDisposeObservable.addOnce(menu.dispose);
    const input = createInput(canvas, bindings, platform, {
      isPaused: () => menu.isOpen,
      openMenu: menu.open,
      onCapture: (captured) => hud.showCaptureHint(!menu.isOpen && !captured),
      toggleDebug: hud.toggleDebug,
    });
    scene.onDisposeObservable.addOnce(input.dispose);

    function present(dt, alpha) {
      const { previousPose, state } = player;
      const feet = visual.root.position;
      Vector3.LerpToRef(previousPose.position, state.position, alpha, feet);
      visual.root.rotation.y = previousPose.yaw + NormalizeRadians(state.yaw - previousPose.yaw) * alpha;
      visual.root.scaling.setAll(state.scale);
      visual.update(dt, state.speed / state.scale, state.grounded, state.verticalSpeed / state.scale);
      for (const crate of crates) crate.present(alpha);
      portals.updateGhosts();
      const shoulderDistance = camera.follow(dt, feet, false, state.scale, portals, state.position);
      const fade = InverseLerp(CAMERA.fadeNear, CAMERA.fadeFar, shoulderDistance);
      if (visual.setFade(SmoothStep(CAMERA.minPlayerOpacity, 1, fade))) portals.syncGhostAppearance(playerTraveler);
      hud.update(state, camera, visual.root);
    }
    camera.reset(SPAWN_YAW);
    present(0, 0);
    installDevHook({
      scene, player, playerTraveler, camera, portals, input, crates, getEffects, presentPose: () => present(0, 1),
      syncFrameTime(now, restart) {
        previousFrameTime = now;
        if (restart) accumulatedTime = 0;
      },
    });
    scene.onAfterRenderObservable.add(() => hud.updatePortals(engine.getFps()));
    scene.onBeforeRenderObservable.add(() => {
      if (menu.isOpen) return;
      const now = performance.now();
      const frameTime = (now - previousFrameTime) / 1000;
      previousFrameTime = now;
      accumulatedTime = Math.min(accumulatedTime + frameTime, MAX_ACCUMULATED_TIME);
      const steps = Math.floor(accumulatedTime / FIXED_STEP);
      accumulatedTime -= steps * FIXED_STEP;

      // Une image sans pas physique laisse les entrées en attente pour le prochain pas.
      if (steps > 0) {
        const controls = input.read();
        camera.look(controls.lookX, controls.lookY);
        for (let i = 0; i < steps; i++) {
          if (player.update(FIXED_STEP, controls, camera.yaw).respawned) {
            camera.reset(SPAWN_YAW);
            portals.resetTraveler(playerTraveler);
            portals.resetHaze();
          }
          for (const crate of crates) crate.capturePose();
          plugin.executeStep(FIXED_STEP, physics.getBodies());
          for (const crate of crates) crate.afterStep();
          portals.updateTravelers();
          for (const crate of crates) crate.syncProxy();
          controls.jump = false;
          controls.respawn = false;
        }
      }
      const alpha = Clamp(accumulatedTime / FIXED_STEP);
      present(frameTime, alpha);
    });

    const resize = new ResizeObserver(() => engine.resize());
    resize.observe(canvas);
    engine.resize();
    scene.onDisposeObservable.addOnce(() => resize.disconnect());
    function onPageHide(event) {
      if (!event.persisted) engine.dispose();
    }
    window.addEventListener("pagehide", onPageHide);
    scene.onDisposeObservable.addOnce(() => window.removeEventListener("pagehide", onPageHide));
    if (import.meta.hot) import.meta.hot.dispose(() => engine.dispose());
    await portals.warmUp();
    menu.open();
    engine.runRenderLoop(() => scene.render());
    status.hidden = true;
  } catch (error) {
    engine.dispose();
    throw error;
  }
}

start().catch((error) => {
  console.error(error);
  status.textContent = "Impossible de charger la scène 3D. Vérifiez que WebGL est activé et rechargez la page.";
  status.hidden = false;
});
