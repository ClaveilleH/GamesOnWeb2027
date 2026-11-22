import { Light } from "@babylonjs/core/Lights/light";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observable } from "@babylonjs/core/Misc/observable";
import { PortalLayers } from "./layers.js";
import {
  discardPlane, insideAperture, secondaryGhostClipPlane, segmentCrossing, shadowPortalCrossing,
  shadowPrismPlanes, toLocal,
} from "./math.js";

// Babylon rejette le demi-espace positif, ici seulement sous y = −10⁶ m.
const idlePlane = new Plane(0, -1, 0, -1e6);
// Distance du rayon de visibilité vers la lumière directionnelle avant d’activer un projecteur d’ombre.
const lightBlockDistance = 150;

const local = new Vector3();
const nearestResult = [];

function copyPlane(target, source) {
  target.normal.copyFrom(source.normal);
  target.d = source.d;
}

const filteredShadowMaps = new WeakSet();

// Les clones des fantômes et des projecteurs restent dans la liste de la carte d’ombre pour que
// warmUp compile leurs variantes. Babylon appelle pourtant isReady() sur chaque élément de la liste
// avant de tester isEnabled() : la carte ne reçoit donc que les projecteurs activés (getCustomRenderList,
// API publique de RenderTargetTexture), dans un tableau réutilisé.
function addShadowCaster(generator, copy) {
  generator.addShadowCaster(copy, false);
  const map = generator.getShadowMap();
  if (!map || filteredShadowMaps.has(map)) return;
  filteredShadowMaps.add(map);
  const previous = map.getCustomRenderList;
  const enabled = [];
  map.getCustomRenderList = (layerOrFace, renderList, renderListLength) => {
    const source = previous?.(layerOrFace, renderList, renderListLength) ?? renderList;
    if (!source) return null;
    const length = source === renderList ? renderListLength : source.length;
    let count = 0;
    for (let i = 0; i < length; i++) {
      const mesh = source[i];
      if (mesh.isEnabled()) enabled[count++] = mesh;
    }
    enabled.length = count;
    return enabled;
  };
}

function syncHierarchyPose(root, sources, copies, warp, position) {
  const clone = copies[0];
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
}

export function straddlingPortals(portals, adapter, position, radius, out = []) {
  let first = null;
  let second = null;
  let d0 = Infinity;
  let d1 = Infinity;
  for (let i = 0; i < portals.length; i++) {
    const portal = portals[i];
    if (!portal.warp) continue;
    toLocal(portal, position, local);
    const z = local.z;
    if (Math.abs(z) >= radius || !insideAperture(portal, local, radius)) continue;
    if (adapter.canTraverse && !adapter.canTraverse(portal)) continue;
    const dx = Math.max(0, Math.abs(local.x) - portal.width / 2);
    const dy = Math.max(0, -local.y, local.y - portal.height);
    const distanceSq = dx * dx + dy * dy + z * z;
    if (distanceSq >= d1) continue;
    if (distanceSq < d0) {
      second = first;
      d1 = d0;
      first = portal;
      d0 = distanceSq;
    } else {
      second = portal;
      d1 = distanceSq;
    }
  }
  if (first) {
    out[0] = first;
    if (second) {
      out[1] = second;
      out.length = 2;
    } else {
      out.length = 1;
    }
  } else {
    out.length = 0;
  }
  return out;
}

export function straddlingPortal(portals, adapter, position, radius) {
  return straddlingPortals(portals, adapter, position, radius, nearestResult)[0] ?? null;
}

function shadowPortal(portals, adapter, center, radius, lightDir, straddling, straddleSide, out) {
  let nearest = null;
  let nearestDistance = Infinity;
  let nearestSide = 1;
  for (let i = 0; i < portals.length; i++) {
    const portal = portals[i];
    if (!portal.warp) continue;
    if (adapter.canTraverse && !adapter.canTraverse(portal)) continue;
    const sideOverride = portal === straddling ? straddleSide : 0;
    if (!shadowPortalCrossing(portal, center, radius, lightDir, out, sideOverride)) continue;
    if (out.distance < nearestDistance) {
      nearest = portal;
      nearestDistance = out.distance;
      nearestSide = out.side;
    }
  }
  if (!nearest) return null;
  out.portal = nearest;
  out.distance = nearestDistance;
  out.side = nearestSide;
  return out;
}

function sceneShadowGenerators(scene) {
  return scene.lights.flatMap((light) => [...(light.getShadowGenerators()?.values() ?? [])]);
}

// Copie d’un visuel de voyageur pour un fantôme ou un projecteur d’ombre : racine détachée et masquée,
// géométrie partagée, matériaux clonés, et chaque maillage inscrit dans les cartes d’ombre qui contiennent
// sa source (parmi `generators`, ou tous les générateurs de la scène).
function createVisualCopy({ root, materials }, sources, suffix, { layerMask, receiveShadows, generators }) {
  const clone = root.clone(root.name + suffix, null);
  clone.parent = null;
  clone.rotationQuaternion ??= Quaternion.Identity();
  clone.setEnabled(false);
  const copies = [clone, ...clone.getDescendants()];
  const duplicates = materials.map((material) => material.clone(material.name + suffix));
  const targets = generators ?? sceneShadowGenerators(root.getScene());
  const meshes = [];
  const registered = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const copy = copies[i];
    if (i > 0) copy.rotationQuaternion ??= Quaternion.Identity();
    if (!source.subMeshes) continue;
    copy.layerMask = layerMask;
    copy.isPickable = false;
    if (receiveShadows !== undefined) copy.receiveShadows = receiveShadows;
    copy.material = duplicates[materials.indexOf(source.material)];
    meshes.push({ source, copy });
    for (const generator of targets) {
      if (generator.getShadowMap()?.renderList?.includes(source)) {
        addShadowCaster(generator, copy);
        registered.push({ generator, copy });
      }
    }
  }

  return {
    clone, copies, materials: duplicates,
    syncAppearance() {
      for (let i = 0; i < materials.length; i++) duplicates[i].alpha = materials[i].alpha;
      for (let i = 0; i < meshes.length; i++) {
        const { source, copy } = meshes[i];
        copy.visibility = source.visibility;
        copy.isVisible = source.isVisible;
        // Un original retiré des vues (calque 0, ex. corps à la première personne) garde son ombre : sa copie aussi.
        copy.layerMask = source.layerMask === 0 ? 0 : layerMask;
      }
    },
    dispose() {
      for (const { generator, copy } of registered) generator.removeShadowCaster(copy, false);
      clone.dispose();
      for (const material of duplicates) material.dispose();
    },
  };
}

function createGhostClone(visual, sources, index) {
  const copy = createVisualCopy(visual, sources, " · fantôme " + index, { layerMask: PortalLayers.late });
  const { clone } = copy;
  const targetPlane = idlePlane.clone();
  const secondaryPlane = idlePlane.clone();
  // Deux plans toujours définis pour partager les defines shader de l’original dès le préchauffage.
  for (const material of copy.materials) {
    material.clipPlane = targetPlane;
    material.clipPlane2 = secondaryPlane;
  }

  function hide() {
    if (!clone.isEnabled()) return;
    copyPlane(targetPlane, idlePlane);
    copyPlane(secondaryPlane, idlePlane);
    clone.setEnabled(false);
  }

  function show(portal, side, otherPortal, otherSide, position) {
    discardPlane(portal.target, -side, targetPlane);
    if (!otherPortal || !secondaryGhostClipPlane(portal, side, otherPortal, otherSide, secondaryPlane)) {
      copyPlane(secondaryPlane, idlePlane);
    }
    syncHierarchyPose(visual.root, sources, copy.copies, portal.warp, position);
    copy.syncAppearance();
    clone.setEnabled(true);
  }

  return {
    show, hide, syncAppearance: copy.syncAppearance,
    get active() { return clone.isEnabled(); },
    dispose: copy.dispose,
  };
}

function createGhostSet(visual) {
  const { root, materials } = visual;
  const sources = [root, ...root.getDescendants()];
  const previousPlanes = materials.map((material) => ({
    clipPlane: material.clipPlane, clipPlane2: material.clipPlane2,
  }));
  const originalPlanes = [idlePlane.clone(), idlePlane.clone()];
  // Deux variantes seulement pour l’original : sans plan au repos, avec les deux plans dès qu’un
  // fantôme est affiché. warmUp les compile toutes deux (restAtIdle), si bien qu’une traversée ne
  // fait que changer de variante, déjà présente dans le cache d’effets du moteur. Au repos, sans plan,
  // la carte d’ombre ne reconstruit pas à chaque image les defines de plans de coupe du voyageur.
  let restAtIdle = false;
  let planesOn = null;
  function setOriginalPlanes(on) {
    if (planesOn === on) return;
    planesOn = on;
    for (let i = 0; i < materials.length; i++) {
      materials[i].clipPlane = on ? originalPlanes[0] : null;
      materials[i].clipPlane2 = on ? originalPlanes[1] : null;
    }
  }
  setOriginalPlanes(true);
  const ghosts = [
    createGhostClone(visual, sources, 1),
    createGhostClone(visual, sources, 2),
  ];

  function update(straddling, sides, position) {
    const count = straddling.length;
    if (count === 0) {
      copyPlane(originalPlanes[0], idlePlane);
      copyPlane(originalPlanes[1], idlePlane);
      setOriginalPlanes(!restAtIdle);
      ghosts[0].hide();
      ghosts[1].hide();
      return;
    }
    setOriginalPlanes(true);
    const first = straddling[0];
    const firstSide = sides[0];
    discardPlane(first, -firstSide, originalPlanes[0]);
    if (count === 1) {
      copyPlane(originalPlanes[1], idlePlane);
      ghosts[0].show(first, firstSide, null, 0, position);
      ghosts[1].hide();
      return;
    }
    const second = straddling[1];
    const secondSide = sides[1];
    discardPlane(second, -secondSide, originalPlanes[1]);
    ghosts[0].show(first, firstSide, second, secondSide, position);
    ghosts[1].show(second, secondSide, first, firstSide, position);
  }

  function syncAppearance() {
    for (let i = 0; i < ghosts.length; i++) {
      if (ghosts[i].active) ghosts[i].syncAppearance();
    }
  }

  return {
    update, syncAppearance,
    // false : plans toujours posés (préchauffage de la variante à plans) ; true : plans nuls au repos.
    setRestAtIdle(value) {
      restAtIdle = value;
      if (!ghosts[0].active && !ghosts[1].active) setOriginalPlanes(!value);
    },
    get activeCount() { return (ghosts[0].active ? 1 : 0) + (ghosts[1].active ? 1 : 0); },
    dispose() {
      for (let i = 0; i < materials.length; i++) {
        materials[i].clipPlane = previousPlanes[i].clipPlane;
        materials[i].clipPlane2 = previousPlanes[i].clipPlane2;
      }
      ghosts[0].dispose();
      ghosts[1].dispose();
    },
  };
}

function createShadowCaster(visual) {
  const { root } = visual;
  const sources = [root, ...root.getDescendants()];
  const scene = root.getScene();
  const generators = [];
  let primaryLight = null;
  const primaryDirection = new Vector3();
  const candidateDirection = new Vector3();

  // Seules les lumières directionnelles avec générateur d’ombres sont traitées (première direction rencontrée).
  for (const light of scene.lights) {
    if (light.getTypeID() !== Light.LIGHTTYPEID_DIRECTIONALLIGHT) continue;
    const lightGenerators = light.getShadowGenerators();
    if (!lightGenerators) continue;
    const matching = [];
    for (const generator of lightGenerators.values()) {
      const renderList = generator.getShadowMap()?.renderList;
      if (!renderList) continue;
      if (sources.some((source) => source.subMeshes && renderList.includes(source))) matching.push(generator);
    }
    if (!matching.length) continue;
    light.computeTransformedInformation();
    const raw = light.getShadowDirection();
    if (raw.lengthSquared() <= 1e-12) continue;
    Vector3.NormalizeToRef(raw, candidateDirection);
    if (!primaryLight) {
      primaryLight = light;
      primaryDirection.copyFrom(candidateDirection);
      generators.push(...matching);
    } else if (Vector3.Dot(candidateDirection, primaryDirection) >= 1 - 1e-6) {
      generators.push(...matching);
    }
  }
  if (!primaryLight) return null;

  // Calque 0 : ignoré par les caméras et les passes de portail, mais dessiné par la carte d’ombre (renderList sans forceLayerMaskCheck).
  const copy = createVisualCopy(visual, sources, " · ombre", { layerMask: 0, receiveShadows: false, generators });
  const { clone } = copy;
  const clipPlane = idlePlane.clone();
  const prismPlanes = Array.from({ length: 4 }, () => idlePlane.clone());
  // Cinq plans toujours définis pour figer les defines shader dès le préchauffage.
  for (const material of copy.materials) {
    material.clipPlane = clipPlane;
    material.clipPlane2 = prismPlanes[0];
    material.clipPlane3 = prismPlanes[1];
    material.clipPlane4 = prismPlanes[2];
    material.clipPlane5 = prismPlanes[3];
    material.clipPlane6 = null;
  }

  function resetPlanes() {
    copyPlane(clipPlane, idlePlane);
    for (let i = 0; i < 4; i++) copyPlane(prismPlanes[i], idlePlane);
  }

  function hide() {
    if (!clone.isEnabled()) return;
    resetPlanes();
    clone.setEnabled(false);
  }

  function getLightDirection(out) {
    if (!primaryLight.isEnabled() || !primaryLight.shadowEnabled) return null;
    primaryLight.computeTransformedInformation();
    const raw = primaryLight.getShadowDirection();
    if (raw.lengthSquared() <= 1e-12) return null;
    return Vector3.NormalizeToRef(raw, out);
  }

  function show(portal, side, position, lightDir, margin) {
    const dest = portal.target;
    discardPlane(dest, side, clipPlane);
    if (!shadowPrismPlanes(dest, lightDir, margin, prismPlanes)) {
      hide();
      return;
    }
    syncHierarchyPose(root, sources, copy.copies, portal.warp, position);
    copy.syncAppearance();
    clone.setEnabled(true);
  }

  return {
    show, hide, syncAppearance: copy.syncAppearance, getLightDirection,
    get active() { return clone.isEnabled(); },
    dispose: copy.dispose,
  };
}

export function createTravelerRegistry(getPortals, settings, isLightBlocked = null) {
  let entries = [];
  const onTraverseObservable = new Observable();
  const simulatedCenter = new Vector3();
  const worldPosition = new Vector3();
  const visualCenter = new Vector3();
  const shadowDirection = new Vector3();
  const towardLight = new Vector3();
  const straddling = [];
  const straddleSides = [0, 0];
  const hit = { t: 0, side: null, point: new Vector3() };
  const shadowHit = { portal: null, distance: 0, side: 1 };

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
      ghosts: adapter.visual ? createGhostSet(adapter.visual) : null,
      shadowCaster: adapter.visual ? createShadowCaster(adapter.visual) : null,
      arrival: null, arrivalSide: 1,
    };
    adapter.center(entry.previous);
    entries = [...entries, entry];
    return () => {
      if (!entries.includes(entry)) return;
      entries = entries.filter((other) => other !== entry);
      entry.ghosts?.dispose();
      entry.shadowCaster?.dispose();
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
    const portals = getPortals();
    const shadowsEnabled = settings.portalShadows !== false;
    const margin = settings.apertureMargin;
    for (let i = 0; i < entries.length; i++) {
      const { adapter, ghosts, shadowCaster, arrival, arrivalSide } = entries[i];
      if (!ghosts) continue;
      const { root } = adapter.visual;
      const enabled = root.isEnabled();
      const position = root.parent ? root.computeWorldMatrix(true).getTranslationToRef(worldPosition) : root.position;
      const radius = adapter.visual.radius();
      if (enabled) straddlingPortals(portals, adapter, position, radius, straddling);
      else straddling.length = 0;
      if (straddling.length > 0) {
        // Juste après le warp, l'interpolation peut encore présenter la pose d'avant le plan.
        adapter.center(simulatedCenter);
        for (let k = 0; k < straddling.length; k++) {
          const portal = straddling[k];
          straddleSides[k] = Math.sign(portal.signedDistance(simulatedCenter)) || (portal === arrival ? arrivalSide : 1);
        }
      }
      ghosts.update(straddling, straddleSides, position);
      if (!shadowCaster) continue;
      if (!enabled || !shadowsEnabled) {
        shadowCaster.hide();
        continue;
      }
      const lightDir = shadowCaster.getLightDirection(shadowDirection);
      if (!lightDir) {
        shadowCaster.hide();
        continue;
      }
      // Le projecteur d’ombre continue d’utiliser le portail chevauché le plus proche.
      const nearest = straddling[0] ?? null;
      const straddleSide = straddling.length > 0 ? straddleSides[0] : 0;
      const center = adapter.visual.center ? adapter.visual.center(visualCenter) : position;
      const crossing = shadowPortal(portals, adapter, center, radius, lightDir, nearest, straddleSide, shadowHit);
      if (crossing && (!isLightBlocked || !isLightBlocked(center, lightDir.scaleToRef(-1, towardLight), lightBlockDistance))) {
        shadowCaster.show(crossing.portal, crossing.side, position, lightDir, margin);
      } else {
        shadowCaster.hide();
      }
    }
  }

  function ghostCount(adapter) {
    return entryFor(adapter)?.ghosts?.activeCount ?? 0;
  }

  return {
    addTraveler, resetTraveler, updateTravelers, updateGhosts, onTraverseObservable,
    ghostCount,
    isGhostActive(adapter) { return ghostCount(adapter) > 0; },
    isShadowCasterActive(adapter) { return entryFor(adapter)?.shadowCaster?.active ?? false; },
    get activeGhosts() { return entries.reduce((n, entry) => n + (entry.ghosts?.activeCount ?? 0), 0); },
    get activeShadowCasters() { return entries.reduce((n, entry) => n + (entry.shadowCaster?.active ? 1 : 0), 0); },
    linksChanged() {
      for (const entry of entries) {
        entry.crossings = crossingsFor(entry.adapter);
        if (entry.arrival && !entry.arrival.warp) entry.arrival = null;
      }
    },
    // Voir createGhostSet : appelé par warmUp pour compiler les deux variantes de l’original. Un voyageur
    // enregistré après warmUp garde ses plans permanents : sa variante sans plan n’a pas été préparée.
    setRestAtIdle(value) {
      for (const entry of entries) entry.ghosts?.setRestAtIdle(value);
    },
    syncAppearance(adapter) {
      const entry = entryFor(adapter);
      entry?.ghosts?.syncAppearance();
      if (entry?.shadowCaster?.active) entry.shadowCaster.syncAppearance();
    },
    dispose() {
      for (const entry of entries) {
        entry.ghosts?.dispose();
        entry.shadowCaster?.dispose();
      }
      entries = [];
      onTraverseObservable.clear();
    },
  };
}
