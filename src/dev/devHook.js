import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PerfCounter } from "@babylonjs/core/Misc/perfCounter";
import { createFlickerProbe } from "./flickerProbe.js";

function coordinates({ x, y, z }) {
  return { x, y, z };
}

function timingStats(samples) {
  samples.sort();
  const count = samples.length;
  return {
    mean: samples.reduce((sum, ms) => sum + ms, 0) / count,
    p95: samples[Math.ceil(count * 0.95) - 1],
    max: samples[count - 1],
  };
}

export function observeDevEffects(engine) {
  if (!import.meta.env.DEV && !new URLSearchParams(location.search).has("dev")) return;
  let count = 0;
  const observer = engine.onAfterShaderCompilationObservable.add(() => count++);
  engine.onDisposeObservable.addOnce(() => engine.onAfterShaderCompilationObservable.remove(observer));
  return () => count;
}

export function installDevHook({
  scene, player, playerTraveler, visual, camera, portals, input, crates, presentPose, getEffects, syncFrameTime,
}) {
  if (!getEffects) return;
  const engine = scene.getEngine();
  const canvas = engine.getRenderingCanvas();
  const mainCamera = camera.camera;
  const history = Array.from({ length: 32 }, () => ({ traveler: "", portal: "", frame: 0 }));
  let traversalCount = 0;
  let benchmarking = false;
  let manual = null;
  const observer = portals.onTraverseObservable.add(({ traveler, portal }) => {
    const event = history[traversalCount++ % history.length];
    event.traveler = traveler.name;
    event.portal = portal.name;
    event.frame = scene.getFrameId();
  });

  function resumeLoops(loops) {
    if (!engine.isDisposed && !scene.isDisposed) {
      for (const render of loops) engine.runRenderLoop(render);
    }
  }

  function syncClock(restart) {
    syncFrameTime(performance.now(), restart);
    engine.performanceMonitor.reset();
    engine.performanceMonitor.sampleFrame();
  }

  const dev = {
    state() {
      const { stats, settings } = portals;
      return {
        player: { ...coordinates(player.state.position), yaw: player.state.yaw, scale: player.state.scale,
          grounded: player.state.grounded, capsuleHeight: player.capsuleHeight },
        camera: { ...coordinates(mainCamera.position), yaw: camera.yaw, pitch: camera.pitch,
          minZ: mainCamera.minZ, warped: camera.warped },
        portals: { depth: stats.depthReached, maxDepth: settings.maxDepth, passes: stats.passes, fallbacks: stats.fallbacks,
          haze: stats.haze.map((range) => ({ ...range })) },
        fps: engine.getFps(), ghosts: portals.activeGhosts, shadowCasters: portals.activeShadowCasters,
        effects: getEffects(),
        traversals: Array.from({ length: Math.min(history.length, traversalCount) }, (_, i) =>
          ({ ...history[(Math.max(0, traversalCount - history.length) + i) % history.length] })),
      };
    },
    teleportPlayer({ x, y, z, yaw = 0 }) {
      player.teleport({ x, y, z }, yaw);
      portals.resetTraveler(playerTraveler);
      portals.resetHaze();
      camera.reset(yaw);
      presentPose();
    },
    setControls: input.setControls,
    // Animations du modèle chargé (null avec le squelette procédural) et leurs poids actuels.
    character() {
      return { animations: visual.animations ?? null, weights: visual.weights?.() ?? null };
    },
    setPlayerVisible(visible) {
      playerTraveler.visual.root.setEnabled(visible);
      portals.updateGhosts();
    },
    look(dx, dy) {
      camera.look(dx, dy);
      camera.follow(0, playerTraveler.visual.root.position, player.state.scale, portals, player.state.position);
    },
    manualClock() {
      if (manual || benchmarking) throw new Error("La boucle de rendu est déjà pilotée.");
      const loops = engine.activeRenderLoops.slice();
      const original = Object.getOwnPropertyDescriptor(performance, "now");
      let now = 0;
      performance.now = () => now;
      engine.stopRenderLoop();
      syncClock(true);
      const clock = {
        step(ms = 1000 / 60) {
          if (manual !== clock) throw new Error("L’horloge a été libérée.");
          if (!Number.isFinite(ms) || ms < 0) throw new RangeError("La durée doit être finie et positive ou nulle.");
          const next = now + ms;
          // Arrondit vers l’avant si l’addition a perdu une fraction du pas demandé.
          now = next - now < ms ? next + Number.EPSILON * next : next;
          engine.beginFrame();
          try {
            scene.render();
          } finally {
            engine.endFrame();
          }
        },
        release() {
          if (manual !== clock) return;
          if (original) Object.defineProperty(performance, "now", original);
          else delete performance.now;
          manual = null;
          syncClock(false);
          resumeLoops(loops);
        },
      };
      manual = clock;
      return clock;
    },
    flickerProbe(options) { return createFlickerProbe(engine, mainCamera, portals.portals, options); },
    portalSystem: portals,
    crate(name) {
      const crate = crates.find((item) => item.traveler.name === name);
      if (!crate) return null;
      return {
        state() {
          const { extendSize } = crate.body.shape.getBoundingBox();
          return { ...crate.state(), boxSize: coordinates(extendSize.scale(2)),
            mass: crate.body.getMassProperties().mass, gravityFactor: crate.body.getGravityFactor() };
        },
        visual() {
          const root = crate.visual;
          root.computeWorldMatrix(true);
          const q = root.absoluteRotationQuaternion;
          // Angle entre la verticale du visuel et celle du monde, indépendant du lacet.
          const tilt = 2 * Math.asin(Math.min(1, Math.hypot(q.x, q.z)));
          const ghosts = portals.ghostCount(crate.traveler);
          return { ...coordinates(root.absolutePosition), yaw: q.toEulerAngles().y, tilt,
            ghost: ghosts > 0, ghosts };
        },
        ghosts() {
          const serializePlane = (plane) => (plane ? { normal: coordinates(plane.normal), d: plane.d } : null);
          const readPlanes = (mesh) => ({
            clipPlane: serializePlane(mesh.material?.clipPlane),
            clipPlane2: serializePlane(mesh.material?.clipPlane2),
          });
          const prefix = crate.visual.name + " · fantôme ";
          const copies = scene.meshes
            .filter((mesh) => mesh.name.startsWith(prefix))
            .map((mesh) => {
              mesh.computeWorldMatrix(true);
              const q = mesh.absoluteRotationQuaternion;
              return {
                name: mesh.name, active: mesh.isEnabled(),
                ...coordinates(mesh.absolutePosition),
                yaw: q.toEulerAngles().y,
                scaling: coordinates(mesh.absoluteScaling),
                ...readPlanes(mesh),
              };
            });
          return { original: readPlanes(crate.visual), ghosts: copies };
        },
        push: crate.push,
        place(pose) {
          crate.place(pose);
          portals.updateGhosts();
        },
      };
    },
    portal(name) {
      const portal = portals.portals.find((p) => p.name === name);
      if (!portal) return null;
      return { origin: coordinates(portal.origin), yaw: portal.yaw, width: portal.width, height: portal.height,
        sides: portal.sides, target: portal.target?.name ?? null, scale: portal.warp?.scale ?? null };
    },
    setMaxDepth(n) { portals.settings.maxDepth = n; },
    setPortalShadows(enabled) {
      portals.settings.portalShadows = Boolean(enabled);
      portals.updateGhosts();
    },
    async benchmark({ frames = 120, warmup = 10 } = {}) {
      if (!Number.isSafeInteger(frames) || frames < 1 || !Number.isSafeInteger(warmup) || warmup < 0) {
        throw new RangeError("La mesure exige au moins une image et un nombre entier positif ou nul d’images de préchauffage.");
      }
      if (benchmarking || manual) throw new Error("La boucle de rendu est déjà pilotée.");
      const renderLoops = engine.activeRenderLoops.slice();
      const cpuTimes = new Float64Array(frames);
      const frameTimes = new Float64Array(frames);
      const pixel = new Uint8Array(4);
      const syncGpu = () => engine.readPixels(0, 0, 1, 1, true, true, pixel);
      const instrumentation = new SceneInstrumentation(scene);
      const drawCounter = PerfCounter.Enabled ? instrumentation.drawCallsCounter : null;
      if (!drawCounter) instrumentation.dispose();
      let totalPasses = 0;
      let maxPasses = 0;
      let totalDrawCalls = 0;
      let maxDrawCalls = 0;
      benchmarking = true;
      try {
        engine.stopRenderLoop();
        for (let i = 0; i < warmup; i++) scene.render();
        // Écarte le travail GPU déjà soumis, même quand le préchauffage est à zéro.
        await syncGpu();
        for (let i = 0; i < frames; i++) {
          const start = performance.now();
          scene.render();
          const submitted = performance.now();
          await syncGpu();
          frameTimes[i] = performance.now() - start;
          cpuTimes[i] = submitted - start;
          const passes = portals.stats.passes;
          totalPasses += passes;
          maxPasses = Math.max(maxPasses, passes);
          if (drawCounter) {
            const calls = drawCounter.current;
            totalDrawCalls += calls;
            maxDrawCalls = Math.max(maxDrawCalls, calls);
          }
        }
        return {
          frames, cpuMs: timingStats(cpuTimes), frameMs: timingStats(frameTimes),
          passes: { mean: totalPasses / frames, max: maxPasses },
          drawCalls: drawCounter ? { mean: totalDrawCalls / frames, max: maxDrawCalls } : null,
          renderWidth: engine.getRenderWidth(), renderHeight: engine.getRenderHeight(),
        };
      } finally {
        instrumentation.dispose();
        benchmarking = false;
        resumeLoops(renderLoops);
      }
    },
    project({ x, y, z }) {
      const { width, height } = canvas.getBoundingClientRect();
      const viewport = mainCamera.viewport.toGlobal(width, height);
      const transform = mainCamera.getViewMatrix().multiply(mainCamera.getProjectionMatrix());
      const point = Vector3.Project(new Vector3(x, y, z), Matrix.IdentityReadOnly, transform, viewport);
      return { x: point.x, y: point.y };
    },
    samplePixel(x, y) {
      return new Promise((resolve, reject) => {
        scene.onAfterRenderObservable.addOnce(() => {
          const width = engine.getRenderWidth();
          const height = engine.getRenderHeight();
          const bounds = canvas.getBoundingClientRect();
          const px = Math.floor(x * width / bounds.width);
          const py = height - 1 - Math.floor(y * height / bounds.height);
          if (!(px >= 0 && px < width && py >= 0 && py < height)) {
            reject(new RangeError("Le point est hors du canevas."));
            return;
          }
          resolve(engine.readPixels(px, py, 1, 1).then((rgba) => Array.from(rgba)));
        });
      });
    },
  };
  window.gowDev = dev;
  scene.onDisposeObservable.addOnce(() => {
    manual?.release();
    portals.onTraverseObservable.remove(observer);
    if (window.gowDev === dev) delete window.gowDev;
  });
}
