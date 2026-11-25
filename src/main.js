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
import { measureFirstPerson } from "./player/firstPersonFit.js";
import { createSkeletonVisual } from "./player/skeletonVisual.js";
import { createThirdPersonCamera } from "./player/thirdPersonCamera.js";
import { createPortalSystem } from "./portals/index.js";
import { createDebugMenu } from "./ui/debugMenu.js";
import { createFpsMeter } from "./ui/fpsMeter.js";
import { createHud } from "./ui/hud.js";
import { createMenu } from "./ui/menu.js";
import { createPlatform } from "./platform/browser.js";
import { createSlowFrameMonitor, graphicsHelp, hasMajorPerformanceCaveat, isSoftwareRenderer } from "./platform/graphics.js";
import { createLighting, skyPalette } from "./world/lighting.js";
import { createPortalDemos } from "./world/portalDemos.js";
import { createPuzzleMap } from "./world/puzzleMap.js";
import { loadDecorProp } from "./world/props.js";
import { createTestTerrain, spawnPoint } from "./world/testTerrain.js";

const canvas = document.querySelector("#scene");
const status = document.querySelector("#status");
const graphicsWarning = document.querySelector("#graphics-warning");
const graphicsNotice = document.querySelector("#graphics-notice");

function showGraphicsWarning(title, open = false) {
  graphicsWarning.querySelector("summary").textContent = title;
  graphicsWarning.querySelector("p").textContent = graphicsHelp(navigator.userAgent, navigator.maxTouchPoints);
  graphicsWarning.open = open;
  graphicsWarning.hidden = false;
}
// `npm run dev` ou `?dev` : hook de pilotage des tests (docs/PORTALS.md § 10.3), chargé à part du bundle principal.
const devMode = import.meta.env.DEV || new URLSearchParams(location.search).has("dev");

const CHARACTER_PREFERENCE = "character";
const MAP_PREFERENCE = "map";
const MAPS = Object.freeze([
  { key: "demos", label: "Démos des portails" },
  { key: "casse-tete", label: "Casse-tête" },
]);

// Carte à charger : `?map=<clé>` > choix mémorisé > démos. Les tests gardent les démos sauf override.
function resolveMap() {
  const key = new URLSearchParams(location.search).get("map")
    || (navigator.webdriver ? null : readPreference(MAP_PREFERENCE));
  return MAPS.some((map) => map.key === key) ? key : "demos";
}

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
  if (isSoftwareRenderer(engine.getGlInfo().renderer) || hasMajorPerformanceCaveat()) {
    showGraphicsWarning("Le jeu utilise le rendu logiciel et risque de ralentir. Comment activer l’accélération graphique ?");
  }
  const getEffects = dev?.observeDevEffects(engine);
  const scene = new Scene(engine);
  try {
    scene.clearColor = new Color4(0, 0, 0, 0);
    const gravity = await initPhysics(scene);
    scene.physicsEnabled = false;
    const physics = scene.getPhysicsEngine();
    const plugin = physics.getPhysicsPlugin();
    const { shadows } = createLighting(scene);

    const mapKey = resolveMap();
    const puzzle = mapKey === "casse-tete";
    const casters = puzzle ? [] : createTestTerrain(scene);
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
    const demos = puzzle ? createPuzzleMap(scene, portals) : createPortalDemos(scene, portals);
    if (demos.dispose) scene.onDisposeObservable.addOnce(demos.dispose);
    const props = puzzle ? [] : await loadProps(scene);
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
    // La carte casse-tête déplace son point de reprise (le vecteur est relu à chaque réapparition).
    const player = createPlayerController(scene, demos.spawn ?? spawnPoint, gravity, shouldRespawn);
    scene.onDisposeObservable.addOnce(player.dispose);
    const crates = demos.crates;
    for (const crate of crates) scene.onDisposeObservable.addOnce(crate.dispose);
    const bones = visual.root.getChildMeshes();
    // Mesuré au repos, avant la première image animée.
    const firstPersonFit = measureFirstPerson(visual.root, bones, character.firstPerson);
    const propCasters = props.flatMap((prop) => prop.casters);
    for (const mesh of [...casters, ...demos.casters, ...propCasters, ...bones]) shadows.addShadowCaster(mesh, false);
    const playerTraveler = {
      name: "joueur", center: player.center,
      applyWarp(warp) {
        player.applyWarp(warp);
        camera.applyWarp(warp);
      },
      visual: {
        root: visual.root, materials: visual.materials, radius: () => 1.1 * player.state.scale,
        center: (out) => out.set(visual.root.position.x, visual.root.position.y + player.capsuleHeight / 2, visual.root.position.z),
      },
    };
    portals.addTraveler(playerTraveler);
    // Après un déplacement discontinu du joueur (réapparition, téléportation).
    function resetPlayerView(yaw) {
      portals.resetTraveler(playerTraveler);
      portals.resetHaze();
      camera.reset(yaw);
    }
    // À la première personne, le corps reste visible (pieds, reflets dans les portails) ; seule la tête
    // est coupée là où la caméra est dedans. Le plan de coupe ajoute des variantes de shader : on les
    // préchauffe, l’une après l’autre si on bascule plusieurs fois.
    const headCut = { height: firstPersonFit.headCutHeight, radius: CAMERA.headCutRadius };
    let warming = Promise.resolve();
    function setCameraView(view) {
      const firstPerson = view === "first";
      if (camera.firstPerson === firstPerson) return;
      camera.setFirstPerson(firstPerson, firstPersonFit);
      player.state.faceCamera = firstPerson;
      portals.setHeadCut(playerTraveler, firstPerson ? headCut : null);
      if (firstPerson) visual.setFade(1);
      warming = warming.then(() => portals.warmUp()).catch((error) => console.error(error));
    }
    const bindings = createBindings();
    const layout = createKeyboardLayout();
    scene.onDisposeObservable.addOnce(layout.dispose);
    const hud = createHud(bindings, layout, portals);
    scene.onDisposeObservable.addOnce(hud.dispose);
    const fpsMeter = createFpsMeter();
    scene.onDisposeObservable.addOnce(fpsMeter.dispose);
    let previousFrameTime = 0;
    let accumulatedTime = 0;
    const debugGame = {
      player, portals, timeScale: 1,
      characters: CHARACTERS.map(({ key, label }) => ({ key, label })),
      currentCharacter: character.key,
      maps: MAPS,
      currentMap: mapKey,
      selectMap(key) {
        if (key === mapKey) return;
        writePreference(MAP_PREFERENCE, key);
        const url = new URL(location.href);
        url.searchParams.delete("map");
        location.assign(url);
      },
      destinations: demos.destinations,
      // Le personnage est choisi au chargement : on mémorise et on recharge la page.
      selectCharacter(key) {
        if (key === character.key) return;
        writePreference(CHARACTER_PREFERENCE, key);
        location.reload();
      },
      get cameraView() { return camera.firstPerson ? "first" : "third"; },
      setCameraView,
      get hudVisible() { return hud.debugVisible; },
      setHudVisible(visible) {
        if (visible !== hud.debugVisible) hud.toggleDebug();
      },
      get fpsCounterVisible() { return fpsMeter.counterVisible; },
      setFpsCounterVisible: fpsMeter.setCounterVisible,
      get fpsGraphVisible() { return fpsMeter.graphVisible; },
      setFpsGraphVisible: fpsMeter.setGraphVisible,
      teleport(feet, yaw) {
        player.teleport(feet, yaw);
        resetPlayerView(yaw);
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
    // La carte peut ajouter les siens : même forme ({ spec: { name, interact }, root }) plus `onInteract`.
    const interactables = [...props.filter((prop) => prop.spec.interact), ...(demos.interactables ?? [])];
    let activeInteractable = null;
    function nearestInteractable(position) {
      let best = null;
      let bestDistance = Infinity;
      for (const prop of interactables) {
        const { x, z } = prop.root.position;
        const distance = Math.hypot(position.x - x, position.z - z);
        if (distance <= prop.spec.interact.radius && distance < bestDistance) {
          best = prop;
          bestDistance = distance;
        }
      }
      return best;
    }
    // Point d'extension : ce que déclenche un décor à l'appui sur « Interagir » à portée. Les éléments
    // de carte fournissent `onInteract` ; les décors de PROPS signalent seulement le déclenchement.
    function onPropInteraction(prop) {
      if (prop.onInteract) {
        prop.onInteract();
        return;
      }
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
      const shoulderDistance = camera.follow(dt, feet, state.scale, portals, state.position);
      if (!camera.firstPerson) {
        const fade = InverseLerp(CAMERA.fadeNear, CAMERA.fadeFar, shoulderDistance);
        visual.setFade(SmoothStep(CAMERA.minPlayerOpacity, 1, fade));
      }
      // Après le fondu : les fantômes reprennent l’opacité de l’image en même temps que la pose.
      portals.updateGhosts();
      hud.update(state, camera, visual.root);
      activeInteractable = nearestInteractable(state.position);
      hud.showInteraction(activeInteractable?.spec.interact.prompt ?? null);
      debugMenu.update();
    }
    camera.reset(SPAWN_YAW);
    present(0, 0);
    dev?.installDevHook({
      scene, player, playerTraveler, visual, camera, portals, input, crates, getEffects, firstPersonFit, world: demos,
      teleport: debugGame.teleport,
      presentPose: () => present(0, 1),
      syncFrameTime(now, restart) {
        previousFrameTime = now;
        if (restart) accumulatedTime = 0;
      },
    });
    // Sans rendu logiciel détecté, l’aide n’apparaît que si le jeu rame vraiment (Firefox peut rendre
    // l’affichage sans accélération en annonçant quand même le GPU).
    const slowFrames = graphicsWarning.hidden ? createSlowFrameMonitor() : null;
    let noticeTimer = 0;
    scene.onDisposeObservable.addOnce(() => clearTimeout(noticeTimer));
    scene.onAfterRenderObservable.add(() => {
      const fps = engine.getFps();
      hud.updatePortals(fps);
      fpsMeter.update(fps);
      if (!slowFrames) return;
      if (menu.isOpen) slowFrames.reset();
      else if (slowFrames.sample(fps, engine.getDeltaTime() / 1000)) {
        showGraphicsWarning("Le jeu ralentit. Vérifier l’accélération graphique");
        graphicsNotice.hidden = false;
        noticeTimer = setTimeout(() => { graphicsNotice.hidden = true; }, 8000);
      }
    });
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
        if (controls.interact && activeInteractable) onPropInteraction(activeInteractable);
        camera.look(controls.lookX, controls.lookY);
        for (let i = 0; i < steps; i++) {
          if (player.update(FIXED_STEP, controls, camera.yaw).respawned) resetPlayerView(SPAWN_YAW);
          demos.update?.(FIXED_STEP, player);
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
    // Toujours placée dans le menu : un ralentissement détecté en jeu n’aura qu’à l’afficher.
    document.querySelector("#pause-menu .commands").before(graphicsWarning);
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
  const message = document.querySelector("#status-message");
  if (error.message === "WebGL not supported") {
    message.textContent = "WebGL est indisponible. Le jeu ne peut pas afficher la scène 3D.";
    showGraphicsWarning("Vérifier l’accélération graphique", true);
  } else {
    message.textContent = "Impossible de charger la scène 3D. Rechargez la page pour réessayer.";
  }
  status.hidden = false;
});
