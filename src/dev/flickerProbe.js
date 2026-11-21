import { Matrix, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import { apertureCorners } from "../portals/math.js";
import { countIsolatedChanges, outlineMask, segmentDistanceSquared } from "./frameProbe.js";

const sides = ["bottom", "right", "top", "left"];

export function createFlickerProbe(engine, camera, registry, { portals, band = 4, threshold = 60, returnThreshold = 24 }) {
  const byPortal = Object.create(null);
  const openings = Array.from(new Set(portals), (name) => {
    const portal = registry.find((p) => p.name === name);
    if (!portal) throw new Error("Portail inconnu : " + name);
    const counts = byPortal[name] = { bottom: 0, right: 0, top: 0, left: 0 };
    const edges = sides.map((side) => ({ ax: 0, ay: 0, bx: 0, by: 0, side, counts }));
    return { corners: apertureCorners(portal), edges };
  });
  const transform = new Matrix();
  const clip = Array.from({ length: 4 }, () => new Vector4());
  const segments = [];
  const perFrame = [];
  let width, height, images, mask, indices;
  let consecutive = 0;
  let frames = 0;
  let spikes = 0;
  let maxPerFrame = 0;

  function resize(w, h) {
    width = w;
    height = h;
    images = Array.from({ length: 3 }, () => new Uint8Array(4 * w * h));
    mask = new Uint8Array(w * h);
    indices = new Uint32Array(w * h);
    consecutive = 0;
  }
  resize(engine.getRenderWidth(), engine.getRenderHeight());

  function projectOutline() {
    camera.getViewMatrix().multiplyToRef(camera.getProjectionMatrix(), transform);
    const viewport = camera.viewport;
    let count = 0;
    for (let i = 0; i < openings.length; i++) {
      const { corners, edges } = openings[i];
      let j = 0;
      for (; j < 4; j++) {
        const p = Vector4.TransformCoordinatesToRef(corners[j], transform, clip[j]);
        if (p.w <= 0) break;
        p.x = width * (viewport.x + viewport.width * (1 + p.x / p.w) / 2);
        p.y = height * (1 - viewport.y - viewport.height * (1 - p.y / p.w) / 2);
      }
      if (j < 4) continue;
      for (let k = 0; k < 4; k++) {
        const edge = edges[k];
        const a = clip[k];
        const b = clip[(k + 1) % 4];
        edge.ax = a.x;
        edge.ay = a.y;
        edge.bx = b.x;
        edge.by = b.y;
        segments[count++] = edge;
      }
    }
    segments.length = count;
    outlineMask(segments, width, height, band, mask);
  }

  function attribute(pixel) {
    const x = pixel % width + 0.5;
    const y = Math.floor(pixel / width) + 0.5;
    let nearest = segments[0];
    let distance = segmentDistanceSquared(x, y, nearest);
    for (let i = 1; i < segments.length; i++) {
      const d = segmentDistanceSquared(x, y, segments[i]);
      if (d < distance) {
        distance = d;
        nearest = segments[i];
      }
    }
    nearest.counts[nearest.side]++;
  }

  return {
    capture() {
      const w = engine.getRenderWidth();
      const h = engine.getRenderHeight();
      if (w !== width || h !== height) resize(w, h);
      const i = consecutive % 3;
      // WebGL remplit le tampon avant le retour de readPixels.
      engine.readPixels(0, 0, width, height, true, false, images[i]);
      if (consecutive >= 2) {
        // Le masque et les segments sont encore ceux de l’image du milieu.
        const count = countIsolatedChanges(images[(i + 1) % 3], images[(i + 2) % 3], images[i],
          mask, threshold, returnThreshold, indices);
        for (let j = 0; j < count; j++) attribute(indices[j]);
        perFrame.push(count);
        spikes += count;
        maxPerFrame = Math.max(maxPerFrame, count);
      }
      projectOutline();
      frames++;
      consecutive++;
    },
    report() {
      return { frames, spikes, maxPerFrame, perFrame: perFrame.slice(),
        byPortal: Object.fromEntries(Object.entries(byPortal).map(([name, counts]) => [name, { ...counts }])) };
    },
  };
}
