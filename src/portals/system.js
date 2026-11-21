import { Color3 } from "@babylonjs/core/Maths/math.color";
import { createViewResult, nearestPortalDistance, traceView } from "./cameraPath.js";
import { createWarp } from "./math.js";
import { createPortal } from "./portal.js";
import { createPortalRenderer } from "./renderer.js";
import { createTravelerRegistry } from "./travelers.js";

const linkColors = Object.freeze(["#ffb574", "#87e5e1", "#cec1ff", "#fcda81", "#9ad6a9"]);

export function createPortalSystem(scene, options = {}) {
  let registry = Object.freeze([]);
  const travelers = createTravelerRegistry(() => registry);
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
    clipBias: options.clipBias ?? 0.002,
  };
  settings.maxDepth = options.maxDepth ?? maxDepth;
  settings.maxPasses = options.maxPasses ?? maxPasses;
  settings.apertureMargin = options.apertureMargin ?? apertureMargin;

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
    stats: { passes: 1, depthReached: 0, fallbacks: 0, visiblePortals: 0 },
    addTraveler: travelers.addTraveler,
    resetTraveler: travelers.resetTraveler,
    updateTravelers: travelers.updateTravelers,
    updateGhosts: travelers.updateGhosts,
    syncGhostAppearance: travelers.syncAppearance,
    onTraverseObservable: travelers.onTraverseObservable,
    get activeGhosts() { return travelers.activeGhosts; },
    createPortal(options) {
      const portal = createPortal(scene, { ...options, apertureMargin });
      portal.outline.setEnabled(debugVisible);
      registry = Object.freeze([...registry, portal]);
      return portal;
    },
    link(a, b) {
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
    warmUp() { return renderer.warmUp(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      travelers.dispose();
      renderer.dispose();
      for (const portal of registry) {
        unlink(portal);
        portal.aperture.dispose(false, true);
        portal.outline.dispose();
      }
      registry = Object.freeze([]);
    },
  };
  const renderer = createPortalRenderer(scene, system);
  let disposed = false;
  return system;
}
