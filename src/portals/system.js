import { Light } from "@babylonjs/core/Lights/light";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { createViewResult, nearestPortalDistance, traceView } from "./cameraPath.js";
import { createWarp, hasWarpRotation } from "./math.js";
import { createPortal } from "./portal.js";
import { createPortalRenderer } from "./renderer.js";
import { createPortalSky } from "./sky.js";
import { createTravelerRegistry } from "./travelers.js";

const linkColors = Object.freeze(["#ffb574", "#87e5e1", "#cec1ff", "#fcda81", "#9ad6a9"]);

function hasDirectionalShadowLight(scene) {
  for (const light of scene.lights) {
    if (light.getTypeID() !== Light.LIGHTTYPEID_DIRECTIONALLIGHT) continue;
    const generators = light.getShadowGenerators();
    if (generators && generators.size > 0) return true;
  }
  return false;
}

function formatRotation(angle) {
  const abs = Math.abs(angle);
  if (abs < 1e-3) return `${angle.toExponential(2)} rad`;
  const degrees = Math.round(abs * 1800 / Math.PI) / 10;
  return `${angle.toFixed(3)} rad (${degrees}°)`;
}

export function createPortalSystem(scene, options = {}) {
  let registry = Object.freeze([]);
  const view = createViewResult();
  let debugVisible = false;
  let nextColor = 0;
  let maxDepth = 4;
  let maxPasses = 48;
  let apertureMargin = 0.03;
  const settings = {
    get maxDepth() { return maxDepth; },
    set maxDepth(n) { maxDepth = Math.max(0, Math.min(8, Math.floor(n) || 0)); },
    get maxPasses() { return maxPasses; },
    set maxPasses(n) { maxPasses = Math.max(0, Math.floor(n) || 0); },
    get apertureMargin() { return apertureMargin; },
    set apertureMargin(n) {
      apertureMargin = Math.max(0, n);
      for (const portal of registry) portal.setMargin(apertureMargin);
    },
    fallbackColor: options.fallbackColor ?? Color3.FromHexString("#9fb8ad"),
    haze: options.haze ?? true,
    hazeRange: options.hazeRange ?? 12,
    hazeMinRange: options.hazeMinRange ?? 4,
    hazeSmoothing: options.hazeSmoothing ?? 8,
    // Nombre de niveaux de récursion voilés, en partant du plus profond (§ 6.6).
    hazeLevels: Math.max(1, Math.floor(options.hazeLevels ?? 2)),
    clipBias: options.clipBias ?? 0.01,
    portalShadows: options.portalShadows ?? true,
  };
  settings.maxDepth = options.maxDepth ?? maxDepth;
  settings.maxPasses = options.maxPasses ?? maxPasses;
  settings.apertureMargin = options.apertureMargin ?? apertureMargin;
  const isLightBlocked = typeof options.isLightBlocked === "function" ? options.isLightBlocked : null;
  const travelers = createTravelerRegistry(() => registry, settings, isLightBlocked);
  const warnedRotationLinks = new WeakMap();

  function hasWarnedRotation(a, b) {
    return warnedRotationLinks.get(a)?.has(b) === true;
  }

  function markWarnedRotation(a, b) {
    for (const [first, second] of [[a, b], [b, a]]) {
      let peers = warnedRotationLinks.get(first);
      if (!peers) {
        peers = new WeakSet();
        warnedRotationLinks.set(first, peers);
      }
      peers.add(second);
    }
  }

  function unlink(portal) {
    if (!portal.target) return;
    portal.target.warp = null;
    portal.target.target = null;
    portal.target = null;
    portal.warp = null;
  }

  const system = {
    camera: options.camera ?? scene.activeCamera,
    get portals() { return registry; },
    settings,
    stats: { passes: 1, depthReached: 0, fallbacks: 0, visiblePortals: 0, haze: [] },
    addTraveler: travelers.addTraveler,
    resetTraveler: travelers.resetTraveler,
    updateTravelers: travelers.updateTravelers,
    updateGhosts: travelers.updateGhosts,
    syncGhostAppearance: travelers.syncAppearance,
    isGhostActive: travelers.isGhostActive,
    ghostCount: travelers.ghostCount,
    isShadowCasterActive: travelers.isShadowCasterActive,
    onTraverseObservable: travelers.onTraverseObservable,
    get activeGhosts() { return travelers.activeGhosts; },
    get activeShadowCasters() { return travelers.activeShadowCasters; },
    createPortal(options) {
      const portal = createPortal(scene, { ...options, apertureMargin });
      portal.outline.setEnabled(debugVisible);
      registry = Object.freeze([...registry, portal]);
      return portal;
    },
    removePortal(portal) {
      if (!registry.includes(portal)) return;
      unlink(portal);
      warnedRotationLinks.delete(portal);
      registry = Object.freeze(registry.filter((other) => other !== portal));
      renderer.removePortal(portal);
      portal.aperture.dispose(false, true);
      portal.outline.dispose();
      travelers.linksChanged();
      travelers.updateGhosts();
    },
    link(a, b, options = {}) {
      if (a === b || !registry.includes(a) || !registry.includes(b)) {
        throw new Error("Le lien exige deux portails distincts du système.");
      }
      const warp = createWarp(a, b);
      unlink(a);
      unlink(b);
      a.target = b;
      b.target = a;
      a.warp = warp;
      b.warp = warp.inverse();
      a.outline.color = Color3.FromHexString(linkColors[nextColor++ % linkColors.length]);
      b.outline.color.copyFrom(a.outline.color);
      travelers.linksChanged();
      if (!options?.allowRotation && hasWarpRotation(warp) && hasDirectionalShadowLight(scene) && !hasWarnedRotation(a, b)) {
        markWarnedRotation(a, b);
        console.warn(
          `Portails : le lien « ${a.name} » ↔ « ${b.name} » applique une rotation (Δ = ${formatRotation(warp.rotationY)}). `
          + "Avec une lumière directionnelle à ombres, la direction relative du soleil change d’un côté à l’autre : "
          + "les taches de lumière et les ombres ne se raccordent pas au bord de l’ouverture. "
          + "Orientez les portails avec yaw_B = yaw_A − π (lien translatif), "
          + "ou passez { allowRotation: true } à link() pour assumer la rotation.",
        );
      }
    },
    unlink(portal) {
      unlink(portal);
      travelers.linksChanged();
    },
    setDebugVisible(visible) {
      debugVisible = visible;
      for (const portal of registry) portal.outline.setEnabled(visible);
    },
    traceView(origin, direction, distance, options, out = view) {
      return traceView(registry, origin, direction, distance, options, out);
    },
    nearestPortalDistance(point) { return nearestPortalDistance(registry, point); },
    resetHaze() { renderer.resetHaze(); },
    createSky(skyOptions) {
      sky?.dispose();
      sky = createPortalSky(skyOptions);
      renderer.setSky(sky);
      return sky;
    },
    async warmUp() {
      // Deux passes : variantes des voyageurs avec plans de coupe, puis sans plan (état de repos).
      travelers.setRestAtIdle(false);
      await renderer.warmUp();
      travelers.setRestAtIdle(true);
      await renderer.warmUp();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sky?.dispose();
      sky = null;
      renderer.setSky(null);
      travelers.dispose();
      renderer.dispose();
      for (const portal of registry) {
        unlink(portal);
        warnedRotationLinks.delete(portal);
        portal.aperture.dispose(false, true);
        portal.outline.dispose();
      }
      registry = Object.freeze([]);
    },
  };
  const renderer = createPortalRenderer(scene, system);
  let sky = null;
  let disposed = false;
  return system;
}
