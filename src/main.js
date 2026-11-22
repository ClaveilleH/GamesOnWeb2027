import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Clamp, InverseLerp, NormalizeRadians, SmoothStep } from "@babylonjs/core/Maths/math.scalar.functions";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CAMERA, CHARACTERS, DEFAULT_CHARACTER, FIXED_STEP, MAX_ACCUMULATED_TIME, PLAYER, PROPS, SPAWN_YAW, characterByKey } from "./config.js";
import { createSightTest, initPhysics } from "./core/physics.js";
import { createBindings } from "./input/bindings.js";
import { createInput } from "./input/input.js";
import { createKeyboardLayout } from "./input/keyboardLayout.js";
import { readPreference, writePreference } from "./input/preferences.js";
import { createPlayerController } from "./player/playerController.js";
import { createCharacterModel } from "./player/characterModel.js";
import { createSkeletonVisual } from "./player/skeletonVisual.js";
import { createThirdPersonCamera } from "./player/thirdPersonCamera.js";
import { createPortalSystem } from "./portals/index.js";
import { createDebugMenu } from "./ui/debugMenu.js";
import { createHud } from "./ui/hud.js";
import { createMenu } from "./ui/menu.js";
import { createPlatform } from "./platform/browser.js";
import { createLighting, skyPalette } from "./world/lighting.js";
import { createPortalDemos } from "./world/portalDemos.js";
import { loadDecorProp } from "./world/props.js";
import { createTestTerrain, spawnPoint } from "./world/testTerrain.js";

const canvas = document.querySelector("#scene");
const status = document.querySelector("#status");
// `npm run dev` ou `?dev` : hook de pilotage des tests (docs/PORTALS.md § 10.3), chargé à part du bundle principal.
const devMode = import.meta.env.DEV || new URLSearchParams(location.search).has("dev");

const CHARACTER_PREFERENCE = "character";

// Personnage à charger : `?model=<url>` (outils/tests) > `?character=<clé>` > choix mémorisé
// > Shrek par défaut. Les tests automatisés (`navigator.webdriver`) gardent le squelette,
// léger et stable, sauf override explicite.
function resolveCharacter() {
  const params = new URLSearchParams(location.search);
  const model = params.get("model");
  if (model !== null) {
    const base = characterByKey(DEFAULT_CHARACTER) ?? CHARACTERS[0];
    return { ...base, key: "custom", label: "Modèle imposé", model: model === "none" ? null : model };
  }
  const key = params.get("character")
    || readPreference(CHARACTER_PREFERENCE)
    || (navigator.webdriver ? "squelette" : DEFAULT_CHARACTER);
  return characterByKey(key) ?? characterByKey("squelette");
}

// Modèle choisi, sinon squelette procédural. Un modèle introuvable ou illisible n'empêche
// pas de jouer : on revient au squelette.
async function createPlayerVisual(scene, character) {
  if (character.model) {
    try {
      return await createCharacterModel(scene, character);
    } catch (error) {
      console.warn(`Modèle ${character.model} non chargé, retour au squelette procédural.`, error);
    }
  }
  return createSkeletonVisual(scene);
}

// Décors fixes (CONFIG `PROPS`). Un fichier absent est vérifié avant le chargement
// pour ne laisser ni erreur réseau ni erreur Babylon : il est simplement ignoré.
async function loadProps(scene) {
  const loaded = [];
  for (const spec of PROPS) {
    try {
      // En dev, Vite renvoie `index.html` (text/html) pour un fichier absent au lieu d'un 404 :
      // on traite les deux cas comme « introuvable » pour éviter une tentative de chargement vouée à l'échec.
      const head = await fetch(spec.url, { method: "HEAD" });
      if (!head.ok || (head.headers.get("content-type") || "").includes("text/html")) {
        console.warn(`Décor ${spec.url} introuvable, ignoré.`);
        continue;
      }
      loaded.push(await loadDecorProp(scene, spec));
    } catch (error) {
      console.warn(`Décor ${spec.url} non chargé, ignoré : ${error.message}`);
    }
  }
  return loaded;
}

async function start() {
  // Chargé avant le moteur : le compteur de compilations doit voir les tout premiers effets.
  const dev = devMode ? await import("./dev/devHook.js") : null;
  const engine = new Engine(canvas, true, { alpha: true, stencil: true });
  const getEffects = dev?.observeDevEffects(engine);
  const scene = new Scene(engine);
  try {
    scene.clearColor = new Color4(0, 0, 0, 0);
    const gravity = await initPhysics(scene);
    scene.physicsEnabled = false;
    const physics = scene.getPhysicsEngine();
    const plugin = physics.getPhysicsPlugin();
    const { shadows } = createLighting(scene);

    const casters = createTestTerrain(scene);
    const character = resolveCharacter();
    const visual = await createPlayerVisual(scene, character);
    scene.onDisposeObservable.addOnce(visual.dispose);
    const camera = createThirdPersonCamera(scene);
    const sightTest = createSightTest(physics);
    const lightRayEnd = new Vector3();
    function isLightBlocked(origin, towardLight, maxDistance) {
      towardLight.scaleToRef(maxDistance, lightRayEnd).addInPlace(origin);
      return sightTest(origin, lightRayEnd) !== null;
    }
    const portals = createPortalSystem(scene, { camera: camera.camera, isLightBlocked });
    scene.onDisposeObservable.addOnce(portals.dispose);
    const demos = createPortalDemos(scene, portals);
    const props = await loadProps(scene);
    for (const prop of props) scene.onDisposeObservable.addOnce(prop.dispose);
    // Le ciel est peint par le quad de fond du renderer, après le décor, là où la profondeur vaut encore 1.
    portals.createSky(skyPalette);
    function shouldRespawn(position) {
      if (position.y >= PLAYER.respawnBelow) return false;
      if (position.y < PLAYER.interiorRespawnBelow) return true;
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
    const propCasters = props.flatMap((prop) => prop.casters);
    for (const mesh of [...casters, ...demos.casters, ...propCasters, ...bones]) shadows.addShadowCaster(mesh, false);
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
    const debugGame = {
      player, portals, timeScale: 1,
      characters: CHARACTERS.map(({ key, label }) => ({ key, label })),
      currentCharacter: character.key,
      // Le personnage est choisi au chargement : on mémorise et on recharge la page.
      selectCharacter(key) {
        if (key === character.key) return;
        writePreference(CHARACTER_PREFERENCE, key);
        location.reload();
      },
      get hudVisible() { return hud.debugVisible; },
      toggleHud: hud.toggleDebug,
      teleport(feet, yaw) {
        player.teleport(feet, yaw);
        portals.resetTraveler(playerTraveler);
        portals.resetHaze();
        camera.reset(yaw);
      },
    };
    const debugMenu = createDebugMenu(canvas, debugGame);
    scene.onDisposeObservable.addOnce(debugMenu.dispose);
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
      toggleDebug() {
        hud.toggleDebug();
        debugMenu.refresh();
      },
      toggleDebugMenu: debugMenu.toggle,
    });
    scene.onDisposeObservable.addOnce(input.dispose);

    // Décors interactifs (config `PROPS[].interact`) : à portée, une invite s'affiche en bas
    // de l'écran ; l'appui sur « Interagir » déclenche le décor via `onPropInteraction`.
    const interactables = props.filter((prop) => prop.spec.interact).map((prop) => ({ prop, config: prop.spec.interact }));
    let activeInteractable = null;
    function nearestInteractable(position) {
      let best = null;
      let bestDistance = Infinity;
      for (const item of interactables) {
        const distance = Math.hypot(position.x - item.prop.position.x, position.z - item.prop.position.z);
        if (distance <= item.config.radius && distance < bestDistance) {
          best = item;
          bestDistance = distance;
        }
      }
      return best;
    }
    // Point d'extension : ce que déclenche un décor à l'appui sur « Interagir » à portée.
    // Rien n'est encore branché — on signale seulement le déclenchement (console + évènement).
    function onPropInteraction(prop) {
      console.info(`Interaction déclenchée : ${prop.spec.name}`);
      window.dispatchEvent(new CustomEvent("gow:interact", { detail: { name: prop.spec.name } }));
    }

    function present(dt, alpha) {
      const { previousPose, state } = player;
      const feet = visual.root.position;
      Vector3.LerpToRef(previousPose.position, state.position, alpha, feet);
      visual.root.rotation.y = previousPose.yaw + NormalizeRadians(state.yaw - previousPose.yaw) * alpha;
      visual.root.scaling.setAll(state.scale);
      visual.update(dt, state.speed / state.scale, state.grounded, state.verticalSpeed / state.scale);
      for (const crate of crates) crate.present(alpha);
      portals.updateGhosts();
      const shoulderDistance = camera.follow(dt, feet, state.scale, portals, state.position);
      const fade = InverseLerp(CAMERA.fadeNear, CAMERA.fadeFar, shoulderDistance);
      if (visual.setFade(SmoothStep(CAMERA.minPlayerOpacity, 1, fade))) portals.syncGhostAppearance(playerTraveler);
      hud.update(state, camera, visual.root);
      activeInteractable = nearestInteractable(state.position);
      hud.showInteraction(activeInteractable ? activeInteractable.config.prompt : null);
      debugMenu.update();
    }
    camera.reset(SPAWN_YAW);
    present(0, 0);
    dev?.installDevHook({
      scene, player, playerTraveler, visual, camera, portals, input, crates, getEffects, presentPose: () => present(0, 1),
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
      // Le menu debug ralentit ou accélère la simulation ; l’affichage garde le temps réel.
      accumulatedTime = Math.min(accumulatedTime + frameTime * debugGame.timeScale, MAX_ACCUMULATED_TIME);
      const steps = Math.floor(accumulatedTime / FIXED_STEP);
      accumulatedTime -= steps * FIXED_STEP;

      // Une image sans pas physique laisse les entrées en attente pour le prochain pas.
      if (steps > 0) {
        const controls = input.read();
        if (controls.interact && activeInteractable) onPropInteraction(activeInteractable.prop);
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
