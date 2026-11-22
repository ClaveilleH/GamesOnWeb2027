import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Clamp, InverseLerp, NormalizeRadians, SmoothStep } from "@babylonjs/core/Maths/math.scalar.functions";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CAMERA, FIXED_STEP, MAX_ACCUMULATED_TIME, SPAWN_YAW } from "./config.js";
import { initPhysics } from "./core/physics.js";
import { createBindings } from "./input/bindings.js";
import { createInput } from "./input/input.js";
import { createKeyboardLayout } from "./input/keyboardLayout.js";
import { createPlayerController } from "./player/playerController.js";
import { createSkeletonVisual } from "./player/skeletonVisual.js";
import { createThirdPersonCamera } from "./player/thirdPersonCamera.js";
import { createHud } from "./ui/hud.js";
import { createMenu } from "./ui/menu.js";
import { createPlatform } from "./platform/browser.js";
import { createTestTerrain, spawnPoint } from "./world/testTerrain.js";
import {
  SHRINK, createPortalViews, createShrinkingCorridor, crossesPortal, mainCameraLayerMask, scaleAround,
} from "./world/shrinkingPortal.js";

const canvas = document.querySelector("#scene");
const status = document.querySelector("#status");

async function start() {
  const engine = new Engine(canvas, true, { alpha: true, stencil: true });
  const scene = new Scene(engine);
  try {
    scene.clearColor = new Color4(0, 0, 0, 0);
    const gravity = await initPhysics(scene);
    const sky = new HemisphericLight("ciel", Vector3.Up(), scene);
    sky.intensity = 0.72;
    sky.groundColor = Color3.FromHexString("#76918b");
    const sun = new DirectionalLight("soleil", new Vector3(-0.58, -1, 0.48), scene);
    sun.position.set(12, 22, -11);
    sun.intensity = 0.78;
    sun.diffuse = Color3.FromHexString("#ffecd3");
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = 65;
    const shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    // Le personnage continue de projeter son ombre pendant le fondu de proximité.
    shadows.transparencyShadow = true;
    shadows.bias = 0.0007;
    shadows.normalBias = 0.025;
    shadows.setDarkness(0.2);

    const casters = createTestTerrain(scene);
    createShrinkingCorridor(scene);
    const player = createPlayerController(scene, spawnPoint, gravity, {
      crosses: crossesPortal,
      transform: (point, out) => scaleAround(point, -1, out),
      scale: 1 / SHRINK.ratio,
    });
    scene.onDisposeObservable.addOnce(player.dispose);
    const visual = createSkeletonVisual(scene);
    scene.onDisposeObservable.addOnce(visual.dispose);
    for (const mesh of [...casters, ...visual.root.getChildMeshes()]) shadows.addShadowCaster(mesh, false);
    const camera = createThirdPersonCamera(scene);
    camera.camera.layerMask = mainCameraLayerMask;
    const portalViews = createPortalViews(scene, camera.camera);
    scene.onDisposeObservable.addOnce(portalViews.dispose);
    const bindings = createBindings();
    const layout = createKeyboardLayout();
    scene.onDisposeObservable.addOnce(layout.dispose);
    const hud = createHud(bindings, layout);
    scene.onDisposeObservable.addOnce(hud.dispose);
    let previousFrameTime = 0;
    let accumulatedTime = 0;
    const platform = createPlatform();
    const menu = createMenu(bindings, layout, (key) => {
      previousFrameTime = performance.now();
      accumulatedTime = 0;
      player.syncPreviousPose();
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

    // La caméra ne franchit pas le portail en même temps que le joueur : tant qu'elle est en
    // retard de `cameraLag` passages, elle vise l'image agrandie du joueur, T^cameraLag(pieds),
    // vue à travers le portail, puis se réduit à son tour en traversant le plan du portail.
    let cameraLag = 0;
    let crossingsSeen = 0;
    const cameraFeet = Vector3.Zero();
    const portalMargin = 0.06;
    function limitCameraRay(from, to) {
      const plane = SHRINK.portal - portalMargin;
      if (cameraLag > 0) {
        // La caméra glisse jusqu'au portail et le traverse, puis se réduit à son tour.
        if (to.z >= plane) return { start: 1, stop: 1 };
        const crossing = (from.z - SHRINK.portal - 0.1) / (from.z - to.z);
        return { start: Math.max(0, crossing), stop: Math.max(0, crossing), soft: true };
      }
      const inCorridor = Math.abs(from.x - SHRINK.x) < SHRINK.width / 2 && from.z > SHRINK.back && from.z < plane;
      if (inCorridor && to.z > plane) return { start: 0, stop: (plane - from.z) / (to.z - from.z) };
      return { start: 0, stop: 1 };
    }

    function present(dt, alpha, respawned) {
      const { previousPose, state } = player;
      const feet = visual.root.position;
      Vector3.LerpToRef(previousPose.position, state.position, alpha, feet);
      visual.root.rotation.y = previousPose.yaw + NormalizeRadians(state.yaw - previousPose.yaw) * alpha;
      visual.update(dt, state);
      if (respawned) cameraLag = 0;
      else cameraLag += state.crossings - crossingsSeen;
      crossingsSeen = state.crossings;
      scaleAround(feet, cameraLag, cameraFeet);
      const shoulderDistance = camera.follow(dt, cameraFeet, respawned, limitCameraRay);
      while (cameraLag > 0 && camera.camera.position.z > SHRINK.portal) {
        camera.transform((point, out) => scaleAround(point, -1, out), 1 / SHRINK.ratio);
        cameraLag--;
      }
      portalViews.update();
      const fade = InverseLerp(CAMERA.fadeNear, CAMERA.fadeFar, shoulderDistance);
      visual.setFade(SmoothStep(CAMERA.minPlayerOpacity, 1, fade));
      hud.update(state, camera, visual.root);
    }
    present(0, 0, true);
    menu.open();
    scene.onBeforeRenderObservable.add(() => {
      if (menu.isOpen) return;
      const now = performance.now();
      const frameTime = (now - previousFrameTime) / 1000;
      previousFrameTime = now;
      accumulatedTime = Math.min(accumulatedTime + frameTime, MAX_ACCUMULATED_TIME);
      const steps = Math.floor(accumulatedTime / FIXED_STEP);
      accumulatedTime -= steps * FIXED_STEP;

      let respawned = false;
      // Une image sans pas physique laisse les entrées en attente pour le prochain pas.
      if (steps > 0) {
        const controls = input.read();
        let yaw = camera.look(controls.lookX, controls.lookY);
        for (let i = 0; i < steps; i++) {
          if (player.update(FIXED_STEP, controls, yaw).respawned) {
            respawned = true;
            yaw = SPAWN_YAW;
          }
          controls.jump = false;
          controls.respawn = false;
        }
      }
      const alpha = Clamp(accumulatedTime / FIXED_STEP);
      present(frameTime, alpha, respawned);
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
    // Accès de mise au point en développement (tests manuels dans la console).
    if (import.meta.env.DEV) {
      window.__game = { scene, player, camera, portalViews, get cameraLag() { return cameraLag; } };
    }
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
