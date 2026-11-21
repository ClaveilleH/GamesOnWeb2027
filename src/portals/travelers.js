import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observable } from "@babylonjs/core/Misc/observable";
import { PortalLayers } from "./layers.js";
import { discardPlane, insideAperture, segmentCrossing, toLocal } from "./math.js";

function createGhost({ root, materials }) {
  const clone = root.clone(root.name + " · fantôme", null);
  clone.parent = null;
  clone.rotationQuaternion ??= Quaternion.Identity();
  clone.setEnabled(false);
  const sources = [root, ...root.getDescendants()];
  const copies = [clone, ...clone.getDescendants()];
  const duplicates = materials.map((material) => material.clone(material.name + " · fantôme"));
  const meshes = [];
  const shadowCasters = [];
  const sourcePlane = new Plane(0, 0, 0, 0);
  const targetPlane = new Plane(0, 0, 0, 0);
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const copy = copies[i];
    if (i > 0) copy.rotationQuaternion ??= Quaternion.Identity();
    if (!source.subMeshes) continue;
    copy.layerMask = PortalLayers.late;
    copy.isPickable = false;
    copy.material = duplicates[materials.indexOf(source.material)];
    meshes.push({ source, copy });
    for (const light of root.getScene().lights) {
      const generators = light.getShadowGenerators();
      if (!generators) continue;
      for (const generator of generators.values()) {
        if (generator.getShadowMap()?.renderList?.includes(source)) {
          generator.addShadowCaster(copy, false);
          shadowCasters.push({ generator, copy });
        }
      }
    }
  }

  function setPlanes(original, ghost) {
    for (let i = 0; i < materials.length; i++) {
      materials[i].clipPlane = original;
      duplicates[i].clipPlane = ghost;
    }
  }

  function hide() {
    if (!clone.isEnabled()) return;
    setPlanes(null, null);
    clone.setEnabled(false);
  }

  function syncAppearance() {
    for (let i = 0; i < materials.length; i++) duplicates[i].alpha = materials[i].alpha;
    for (let i = 0; i < meshes.length; i++) {
      const { source, copy } = meshes[i];
      copy.visibility = source.visibility;
      copy.isVisible = source.isVisible;
    }
  }

  function show(portal, side, position) {
    const warp = portal.warp;
    discardPlane(portal, -side, sourcePlane);
    discardPlane(portal.target, -side, targetPlane);
    setPlanes(sourcePlane, targetPlane);
    warp.point(position, clone.position);
    if (!root.parent) root.computeWorldMatrix(true);
    warp.quaternion(root.absoluteRotationQuaternion, clone.rotationQuaternion);
    root.absoluteScaling.scaleToRef(warp.scale, clone.scaling);
    for (let i = 1; i < sources.length; i++) {
      const source = sources[i];
      const copy = copies[i];
      copy.position.copyFrom(source.position);
      copy.scaling.copyFrom(source.scaling);
      if (source.rotationQuaternion) copy.rotationQuaternion.copyFrom(source.rotationQuaternion);
      else Quaternion.FromEulerAnglesToRef(source.rotation.x, source.rotation.y, source.rotation.z, copy.rotationQuaternion);
      copy.setEnabled(source.isEnabled(false));
    }
    syncAppearance();
    clone.setEnabled(true);
  }

  return {
    show, hide, syncAppearance,
    get active() { return clone.isEnabled(); },
    dispose() {
      hide();
      for (const { generator, copy } of shadowCasters) generator.removeShadowCaster(copy, false);
      clone.dispose();
      for (const material of duplicates) material.dispose();
    },
  };
}

export function createTravelerRegistry(getPortals) {
  let entries = [];
  const onTraverseObservable = new Observable();
  const simulatedCenter = new Vector3();
  const worldPosition = new Vector3();
  const local = new Vector3();
  const hit = { t: 0, side: null, point: new Vector3() };

  function crossingsFor(traveler) {
    return getPortals().filter((p) => p.warp).map((portal) => ({ traveler, portal, warp: portal.warp }));
  }

  function entryFor(adapter) {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].adapter === adapter) return entries[i];
    }
    return null;
  }

  function resetTraveler(adapter) {
    const entry = entryFor(adapter);
    if (!entry) return;
    adapter.center(entry.previous);
    entry.arrival = null;
  }

  function addTraveler(adapter) {
    const entry = {
      adapter, previous: new Vector3(), current: new Vector3(), crossings: crossingsFor(adapter),
      ghost: adapter.visual ? createGhost(adapter.visual) : null, arrival: null, arrivalSide: 1,
    };
    adapter.center(entry.previous);
    entries = [...entries, entry];
    return () => {
      if (!entries.includes(entry)) return;
      entries = entries.filter((other) => other !== entry);
      entry.ghost?.dispose();
    };
  }

  function updateTravelers() {
    const list = entries;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const { adapter, previous, current, crossings } = entry;
      adapter.center(current);
      let first = null;
      let firstT = Infinity;
      for (let j = 0; j < crossings.length; j++) {
        const { portal } = crossings[j];
        if (adapter.canTraverse && !adapter.canTraverse(portal)) continue;
        if (segmentCrossing(portal, previous, current, hit) && hit.t < firstT) {
          first = crossings[j];
          firstT = hit.t;
          entry.arrivalSide = hit.side === "front" ? 1 : -1;
        }
      }
      if (first) {
        entry.arrival = first.portal.target;
        first.traveler.applyWarp(first.warp, first.portal);
        onTraverseObservable.notifyObservers(first);
        first.warp.point(current, previous);
      } else {
        previous.copyFrom(current);
      }
    }
  }

  function updateGhosts() {
    for (let i = 0; i < entries.length; i++) {
      const { adapter, ghost, crossings, arrival, arrivalSide } = entries[i];
      if (!ghost) continue;
      const { root } = adapter.visual;
      const position = root.parent ? root.computeWorldMatrix(true).getTranslationToRef(worldPosition) : root.position;
      const r = adapter.visual.radius();
      let nearest = null;
      let distance = r;
      if (root.isEnabled()) {
        for (let j = 0; j < crossings.length; j++) {
          const { portal } = crossings[j];
          toLocal(portal, position, local);
          const d = Math.abs(local.z);
          if (d >= distance || !insideAperture(portal, local, r)) continue;
          if (adapter.canTraverse && !adapter.canTraverse(portal)) continue;
          nearest = portal;
          distance = d;
        }
      }
      if (nearest) {
        // Juste après le warp, l'interpolation peut encore présenter la pose d'avant le plan.
        adapter.center(simulatedCenter);
        const side = Math.sign(nearest.signedDistance(simulatedCenter)) || (nearest === arrival ? arrivalSide : 1);
        ghost.show(nearest, side, position);
      } else {
        ghost.hide();
      }
    }
  }

  return {
    addTraveler, resetTraveler, updateTravelers, updateGhosts, onTraverseObservable,
    get activeGhosts() { return entries.reduce((n, entry) => n + (entry.ghost?.active ? 1 : 0), 0); },
    linksChanged() {
      for (const entry of entries) entry.crossings = crossingsFor(entry.adapter);
    },
    syncAppearance(adapter) {
      const entry = entryFor(adapter);
      if (entry?.ghost?.active) entry.ghost.syncAppearance();
    },
    dispose() {
      for (const entry of entries) entry.ghost?.dispose();
      entries = [];
      onTraverseObservable.clear();
    },
  };
}
