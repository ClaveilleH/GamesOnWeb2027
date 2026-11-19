import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Clamp, InverseLerp, NormalizeRadians, SmoothStep } from "@babylonjs/core/Maths/math.scalar.functions";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CAMERA, PLAYER, FIXED_STEP, MAX_ACCUMULATED_TIME, SPAWN_YAW } from "./config.js";
import { initPhysics } from "./core/physics.js";
import { createBindings } from "./input/bindings.js";
import { createInput } from "./input/input.js";
import { createKeyboardLayout } from "./input/keyboardLayout.js";
import { createPlayerController } from "./player/playerController.js";
import { createSkeletonVisual } from "./player/skeletonVisual.js";
import { createThirdPersonCamera } from "./player/thirdPersonCamera.js";
import { createHud } from "./ui/hud.js";
import { createMenu } from "./ui/menu.js";
import { createTestTerrain, spawnPoint } from "./world/testTerrain.js";
import { createPortalViews, createTunnelGeometry, crossPortal, straddledPortal } from "./world/nonEuclideanTunnel.js";

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

    const casters = [...createTestTerrain(scene), ...createTunnelGeometry(scene)];
    const player = createPlayerController(scene, spawnPoint, gravity, crossPortal);
    scene.onDisposeObservable.addOnce(player.dispose);
    const visual = createSkeletonVisual(scene);
    scene.onDisposeObservable.addOnce(visual.dispose);
    // Double du squelette affiché de l'autre côté d'un portail quand le corps le chevauche.
    const twin = createSkeletonVisual(scene);
    twin.root.setEnabled(false);
    scene.onDisposeObservable.addOnce(twin.dispose);
    for (const mesh of [...casters, ...visual.root.getChildMeshes()]) shadows.addShadowCaster(mesh, false);
    const camera = createThirdPersonCamera(scene, crossPortal);
    const portalViews = createPortalViews(scene, camera.camera);
    scene.onDisposeObservable.addOnce(portalViews.dispose);
    const bindings = createBindings();
    const layout = createKeyboardLayout();
    scene.onDisposeObservable.addOnce(layout.dispose);
    const hud = createHud(bindings, layout);
    scene.onDisposeObservable.addOnce(hud.dispose);
    let previousFrameTime = 0;
    let accumulatedTime = 0;
    const menu = createMenu(bindings, layout, () => {
      previousFrameTime = performance.now();
      accumulatedTime = 0;
      player.syncPreviousPose();
      input.capture();
    });
    scene.onDisposeObservable.addOnce(menu.dispose);
    const input = createInput(canvas, bindings, {
      isPaused: () => menu.isOpen,
      openMenu: menu.open,
      onCapture: (captured) => hud.showCaptureHint(!menu.isOpen && !captured),
      toggleDebug: hud.toggleDebug,
    });
    scene.onDisposeObservable.addOnce(input.dispose);

    function present(dt, alpha, respawned) {
      const { previousPose, state } = player;
      const feet = visual.root.position;
      Vector3.LerpToRef(previousPose.position, state.position, alpha, feet);
      visual.root.rotation.y = previousPose.yaw + NormalizeRadians(state.yaw - previousPose.yaw) * alpha;
      visual.update(dt, state);
      twin.update(dt, state);
      const twinOffset = straddledPortal(feet, PLAYER.radius + 0.1);
      twin.root.setEnabled(twinOffset !== null);
      if (twinOffset) {
        feet.addToRef(twinOffset, twin.root.position);
        twin.root.rotation.y = visual.root.rotation.y;
      }
      const shoulderDistance = camera.follow(dt, feet, respawned);
      const fade = InverseLerp(CAMERA.fadeNear, CAMERA.fadeFar, shoulderDistance);
      visual.setFade(SmoothStep(CAMERA.minPlayerOpacity, 1, fade));
      twin.setFade(SmoothStep(CAMERA.minPlayerOpacity, 1, fade));
      hud.update(state, camera, visual.root);
    }
    // Accès de débogage en développement : `__game.camera.look(dx, dy)` tourne la caméra
    // sans pointer lock (navigateurs pilotés, panneaux intégrés).
    if (import.meta.env.DEV) window.__game = { scene, camera, player };
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
          const state = player.update(FIXED_STEP, controls, yaw);
          if (state.respawned) {
            respawned = true;
            yaw = SPAWN_YAW;
          } else if (state.teleport) {
            camera.shift(state.teleport);
          }
          controls.jump = false;
          controls.respawn = false;
        }
      }
      const alpha = Clamp(accumulatedTime / FIXED_STEP);
      present(frameTime, alpha, respawned);
    });
    scene.onBeforeRenderObservable.add(portalViews.update);

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
