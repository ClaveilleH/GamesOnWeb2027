import { Camera } from "@babylonjs/core/Cameras/camera";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Clamp } from "@babylonjs/core/Maths/math.scalar.functions";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";
import { Scene } from "@babylonjs/core/scene";
import { PortalLayers } from "./layers.js";
import { aperturePyramidPlanes, applyObliqueNearPlane, distanceToAperture, intersectRects, projectAperture } from "./math.js";
import { clearFogEnd, skyColorGlsl, skyVeilFactor } from "./sky.js";

const clearFogStart = 1e8;
export { clearFogEnd };
const byDistance = (a, b) => a.distance - b.distance;

function createNode() {
  return {
    level: 0, camera: null, portal: null, dest: null, subtree: null, fallback: false,
    hazeAnchor: null, hazeFloor: 0,
    scale: 1, distance: 0, fogStart: 0, fogEnd: Infinity,
    haze: { portal: "", start: Infinity, end: Infinity },
    rect: { x: 0, y: 0, width: 0, height: 0 },
    projection: new Matrix(), viewProjection: new Matrix(),
    planes: Array.from({ length: 6 }, () => new Plane(0, 0, 0, 0)),
    pyramid: Array.from({ length: 4 }, () => new Plane(0, 0, 0, 0)),
    rotation: Quaternion.Identity(), eye: new Vector3(), children: [],
  };
}

function outsidePlanes(points, planes) {
  for (const plane of planes) {
    let i = 0;
    while (i < points.length && plane.dotCoordinate(points[i]) < 0) i++;
    if (i === points.length) return true;
  }
  return false;
}

function createScreenQuad(scene) {
  const quad = CreatePlane("portails · fond", { size: 2 }, scene);
  quad.isPickable = false;
  quad.layerMask = PortalLayers.internal;
  // Un seul ShaderMaterial pour le vidage/repli uni (useSky = 0) et le ciel des passes enfants (useSky = 1).
  const material = new ShaderMaterial("fond des portails", scene, {
    vertexSource: `
      precision highp float;
      attribute vec3 position;
      uniform mat4 invViewProjection;
      uniform vec3 eyePosition;
      varying vec3 vDirection;
      void main() {
        gl_Position = vec4(position.xy, 1.0, 1.0);
        vec4 world = invViewProjection * vec4(position.xy, 1.0, 1.0);
        // Évite la division par world.w : le plan lointain oblique peut passer derrière l’œil (world.w ≤ 0).
        vDirection = world.xyz - world.w * eyePosition;
      }
    `,
    fragmentSource: `
      precision highp float;
      uniform vec4 color;
      uniform float useSky;
      uniform vec3 zenithColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDirection;
      uniform float sunExponent;
      uniform float sunStrength;
      uniform vec3 veilColor;
      uniform float veilFactor;
      varying vec3 vDirection;
      ${skyColorGlsl}
      void main() {
        if (useSky < 0.5) {
          gl_FragColor = color;
          return;
        }
        gl_FragColor = computePortalSky(vDirection);
      }
    `,
  }, {
    attributes: ["position"],
    uniforms: [
      "color", "useSky", "invViewProjection", "eyePosition",
      "zenithColor", "midColor", "horizonColor",
      "sunDirection", "sunExponent", "sunStrength",
      "veilColor", "veilFactor",
    ],
    useClipPlane: false,
  });
  material.backFaceCulling = false;
  material.depthFunction = Constants.ALWAYS;
  material.setColor4("color", new Color4(0, 0, 0, 0));
  material.setFloat("useSky", 0);
  material.setMatrix("invViewProjection", Matrix.Identity());
  material.setVector3("eyePosition", Vector3.Zero());
  material.setColor3("zenithColor", Color3.Black());
  material.setColor3("midColor", Color3.Black());
  material.setColor3("horizonColor", Color3.Black());
  material.setVector3("sunDirection", Vector3.Up());
  material.setFloat("sunExponent", 1);
  material.setFloat("sunStrength", 0);
  material.setColor3("veilColor", Color3.Black());
  material.setFloat("veilFactor", 0);
  quad.material = material;
  return quad;
}

export function createPortalRenderer(scene, system) {
  const engine = scene.getEngine();
  const { camera, settings, stats } = system;
  const previousMask = camera.layerMask;
  const previousCandidates = scene.getActiveMeshCandidates;
  const previousFog = { mode: scene.fogMode, enabled: scene.fogEnabled, start: scene.fogStart, end: scene.fogEnd, color: scene.fogColor };
  const groupStates = [];
  for (let i = 1; i <= 3; i++) {
    groupStates[i] = scene.getAutoClearDepthStencilSetup(i);
    scene.setRenderingAutoClearDepthStencil(i, false);
  }
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogEnabled = true;
  scene.fogStart = clearFogStart;
  scene.fogEnd = clearFogEnd;
  camera.layerMask = PortalLayers.world;
  const mainCandidates = { data: [], length: 0 };
  // Évite à Scene._evaluateActiveMeshes d'appeler isReady() sur les maillages late, internes, d'ombre (calque 0) ou désactivés.
  scene.getActiveMeshCandidates = () => {
    if (scene.activeCamera !== camera) return previousCandidates.call(scene);
    const mask = camera.layerMask;
    const meshes = scene.meshes;
    const data = mainCandidates.data;
    let count = 0;
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      if ((mesh.layerMask & mask) !== 0 && mesh.isEnabled()) data[count++] = mesh;
    }
    mainCandidates.length = count;
    if (data.length > count) data.length = count;
    return mainCandidates;
  };

  const root = createNode();
  root.camera = camera;
  const hazeHistory = new Map();
  const nodes = [];
  const cameras = [];
  let usedNodes = 0;
  let aspect = 1;
  let rootFogColor = scene.fogColor;
  const projected = {};
  const normal = new Vector3();
  const planePoint = new Vector3();
  const crop = new Matrix();
  const croppedViewProjection = new Matrix();
  const invViewProjection = new Matrix();
  const quad = createScreenQuad(scene);
  const clearColor = new Color4(0, 0, 0, 0);
  const fillColor = new Color4();
  let sky = null;
  const worldMeshes = [];
  const lateMeshes = [];
  const visible = [];
  const singleMesh = [quad];
  let renderList = singleMesh;
  let drawingCamera = null;
  const renderer = new ObjectRenderer("portails", scene);
  renderer.getCustomRenderList = () => renderList;
  renderer.renderParticles = false;
  renderer.activeCamera = camera;

  function prepareCamera(child, parent) {
    const { portal, dest, rect } = child;
    const index = stats.passes - 1;
    if (!cameras[index]) {
      const virtual = new TargetCamera("portails · vue " + index, Vector3.Zero(), scene, false);
      virtual.rotationQuaternion = Quaternion.Identity();
      virtual.updateUpVectorFromRotation = true;
      cameras.push(virtual);
    }
    const virtual = cameras[index];
    child.camera = virtual;
    portal.warp.point(parent.eye, child.eye);
    portal.warp.quaternion(parent.rotation, child.rotation);
    virtual.position.copyFrom(child.eye);
    virtual.rotationQuaternion.copyFrom(child.rotation);
    virtual.minZ = camera.minZ * child.scale;
    virtual.maxZ = camera.maxZ * child.scale;
    const view = virtual.getViewMatrix();
    Matrix.PerspectiveFovLHToRef(camera.fov, aspect, virtual.minZ, virtual.maxZ, child.projection,
      camera.fovMode === Camera.FOVMODE_VERTICAL_FIXED);
    const eyeDistance = dest.signedDistance(child.eye);
    dest.normal.scaleToRef(eyeDistance > 0 ? -1 : 1, normal);
    const bias = Math.min(settings.clipBias * child.scale, Math.abs(eyeDistance) / 2);
    normal.scaleToRef(-bias, planePoint).addInPlace(dest.origin);
    if (!applyObliqueNearPlane(child.projection, view, normal, planePoint, child.projection)) return false;
    virtual.freezeProjectionMatrix(child.projection);
    view.multiplyToRef(child.projection, child.viewProjection);

    // Les quatre côtés du scissor resserrent le frustum sans déplacer les plans proche et lointain.
    const sx = root.rect.width / rect.width;
    const sy = root.rect.height / rect.height;
    Matrix.FromValuesToRef(sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0,
      sx - 1 - 2 * rect.x / rect.width, sy - 1 - 2 * rect.y / rect.height, 0, 1, crop);
    child.viewProjection.multiplyToRef(crop, croppedViewProjection);
    Frustum.GetPlanesToRef(croppedViewProjection, child.planes);
    aperturePyramidPlanes(dest, child.eye, settings.apertureMargin, child.pyramid);
    return true;
  }

  function buildChildren(parent) {
    const children = parent.children;
    children.length = 0;
    for (const portal of system.portals) {
      if (!portal.target || portal === parent.dest) continue;
      const side = portal.signedDistance(parent.eye);
      if (Math.abs(side) < 1e-5 || (side <= 0 && portal.sides === "front")) continue;
      if (outsidePlanes(portal.corners, parent.planes) ||
          (parent.level && outsidePlanes(portal.corners, parent.pyramid))) continue;
      if (!projectAperture(portal, parent.viewProjection, root.rect.width, root.rect.height, settings.apertureMargin, projected)) continue;
      const child = nodes[usedNodes] ?? (nodes[usedNodes] = createNode());
      if (!intersectRects(parent.rect, projected, child.rect)) continue;
      usedNodes++;
      child.portal = portal;
      child.dest = portal.target;
      child.level = parent.level + 1;
      child.scale = parent.scale * portal.warp.scale;
      child.distance = distanceToAperture(portal, parent.eye);
      child.subtree = parent.subtree ?? child;
      // Seules les passes des hazeLevels derniers niveaux sont voilées. Le voile part au plus tôt du coin
      // le plus lointain de l’ouverture du premier niveau voilé : il y est nul, donc continu avec le parent.
      const firstHazed = Math.max(1, settings.maxDepth - settings.hazeLevels + 1);
      if (child.level === firstHazed) {
        child.hazeAnchor = child;
        child.hazeFloor = 0;
        for (const corner of portal.corners) {
          child.hazeFloor = Math.max(child.hazeFloor, Vector3.Distance(parent.eye, corner) / parent.scale);
        }
      } else {
        child.hazeAnchor = child.level > firstHazed ? parent.hazeAnchor : null;
      }
      children.push(child);
    }
    children.sort(byDistance);
    let count = 0;
    for (const child of children) {
      const subtree = child.subtree;
      if (child === subtree) {
        child.fogStart = 0;
        for (const corner of child.portal.corners) {
          child.fogStart = Math.max(child.fogStart, Vector3.Distance(root.eye, corner));
        }
        child.fogEnd = Infinity;
      }
      child.fallback = child.level > settings.maxDepth || stats.passes - 1 >= settings.maxPasses;
      if (child.fallback) {
        child.children.length = 0;
        subtree.fogEnd = Math.min(subtree.fogEnd, child.distance / parent.scale);
        stats.fallbacks++;
      } else {
        if (!prepareCamera(child, parent)) continue;
        stats.passes++;
        stats.depthReached = Math.max(stats.depthReached, child.level);
        buildChildren(child);
      }
      children[count++] = child;
    }
    children.length = count;
  }

  function updateHaze() {
    const frame = scene.getFrameId();
    const dt = Clamp(engine.getDeltaTime() / 1000, 0, 0.1);
    const { hazeSmoothing, hazeRange } = settings;
    const blend = -Math.expm1(-hazeSmoothing * dt);
    // v = 0,5 × taux × largeur (48 m/s par défaut), soit au plus v × dt par image.
    const maxStep = 0.5 * hazeSmoothing * hazeRange * dt;
    // Une largeur de réserve laisse le début de la bande franchir maxZ en temps fini.
    const clearTarget = camera.maxZ + 2 * hazeRange;
    stats.haze.length = root.children.length;
    for (let i = 0; i < root.children.length; i++) {
      const child = root.children[i];
      const target = Number.isFinite(child.fogEnd) ? child.fogEnd : clearTarget;
      let state = hazeHistory.get(child.portal);
      if (!state) {
        state = { frame, end: target };
        hazeHistory.set(child.portal, state);
      }
      state.end = hazeSmoothing > 0 && state.frame === frame - 1
        ? state.end + Clamp((target - state.end) * blend, -maxStep, maxStep) : target;
      state.frame = frame;
      const range = child.haze;
      range.portal = child.portal.name;
      const end = Math.max(state.end, child.fogStart + settings.hazeMinRange);
      if (settings.haze && !child.fallback && end - hazeRange < camera.maxZ) {
        range.end = end;
        range.start = Math.max(child.fogStart, end - hazeRange);
      } else {
        range.start = range.end = Infinity;
      }
      stats.haze[i] = range;
    }
  }

  function buildTree(activeCamera) {
    if (activeCamera !== camera) return;
    usedNodes = 0;
    stats.passes = 1;
    stats.fallbacks = stats.depthReached = 0;
    root.rect.width = engine.getRenderWidth();
    root.rect.height = engine.getRenderHeight();
    aspect = engine.getAspectRatio(camera);
    camera.getWorldMatrix().decompose(undefined, root.rotation, root.eye);
    camera.getViewMatrix().multiplyToRef(camera.getProjectionMatrix(), root.viewProjection);
    Frustum.GetPlanesToRef(root.viewProjection, root.planes);
    rootFogColor = scene.fogColor;
    root.fogStart = scene.fogStart;
    root.fogEnd = scene.fogEnd;
    buildChildren(root);
    stats.visiblePortals = root.children.length;
    updateHaze();
  }

  function collectMeshes() {
    let worldCount = 0;
    let lateCount = 0;
    for (const mesh of scene.meshes) {
      // Le masque Babylon par défaut contient aussi le bit late. Le monde opaque a priorité.
      const world = (mesh.layerMask & PortalLayers.world) !== 0;
      if (world ? stats.passes === 1 : !(mesh.layerMask & PortalLayers.late)) continue;
      if (!mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0 || !mesh.subMeshes?.length) continue;
      mesh.computeWorldMatrix();
      if (world) worldMeshes[worldCount++] = mesh;
      else lateMeshes[lateCount++] = mesh;
    }
    worldMeshes.length = worldCount;
    lateMeshes.length = lateCount;
  }

  function drawVisible(node, meshes) {
    let count = 0;
    for (const mesh of meshes) {
      if (!mesh.alwaysSelectAsActiveMesh) {
        if (!mesh.isInFrustum(node.planes)) continue;
        // BoundingInfo.isInFrustum ne lit que six plans.
        if (node !== root && outsidePlanes(mesh.getBoundingInfo().boundingBox.vectorsWorld, node.pyramid)) continue;
      }
      visible[count++] = mesh;
    }
    if (!count) return;
    visible.length = count;
    draw(visible, node.camera);
  }

  function draw(meshes, activeCamera) {
    renderList = meshes;
    // Le marquage et le remplissage consécutifs partagent la même vue et son tampon d'uniformes.
    if (drawingCamera !== activeCamera) {
      if (drawingCamera) renderer.finishRender();
      renderer.activeCamera = activeCamera;
      renderer.initRender(root.rect.width, root.rect.height);
      drawingCamera = activeCamera;
    } else {
      scene.resetCachedMaterial();
    }
    renderer.render();
  }

  function stencil(reference, operation = Constants.KEEP) {
    engine.setStencilFunctionReference(reference);
    engine.setStencilMask(operation === Constants.KEEP ? 0 : 0xff);
    // WebGL règle séparément les opérations des deux faces, même sur un rectangle sans culling.
    engine.setStencilOperationPass(operation);
    engine.setStencilBackOperationPass(operation);
  }

  function drawAperture(child, parent, restore) {
    const mesh = child.portal.aperture;
    mesh.material.disableDepthWrite = !restore;
    mesh.material.depthFunction = restore ? Constants.ALWAYS : Constants.LEQUAL;
    stencil(restore ? child.level : parent.level, restore ? Constants.DECR : Constants.INCR);
    singleMesh[0] = mesh;
    draw(singleMesh, parent.camera);
  }

  function setFog(node) {
    const subtree = node.subtree;
    scene.fogColor = subtree ? settings.fallbackColor : rootFogColor;
    const anchor = node.hazeAnchor;
    if (subtree && anchor && Number.isFinite(subtree.haze.end)) {
      // Fin lissée du sous-arbre (§ 6.6), début ramené après l’ouverture du premier niveau voilé.
      const end = Math.max(subtree.haze.end, anchor.hazeFloor + settings.hazeMinRange);
      scene.fogStart = Math.max(anchor.hazeFloor, end - settings.hazeRange) * node.scale;
      scene.fogEnd = end * node.scale;
    } else {
      scene.fogStart = subtree ? clearFogStart : root.fogStart;
      scene.fogEnd = subtree ? clearFogEnd : root.fogEnd;
    }
  }

  function scissor(node) {
    if (node === root) engine.disableScissor();
    else engine.enableScissor(node.rect.x, node.rect.y, node.rect.width, node.rect.height);
  }

  function hasSky() {
    return sky !== null && !sky.disposed;
  }

  // Le quad de fond peint le ciel vu par la caméra du nœud : direction de chaque pixel tirée de
  // l’inverse de sa vue-projection, voile de la passe (setFog doit précéder le calcul du facteur).
  function prepareSky(node) {
    setFog(node);
    node.viewProjection.invertToRef(invViewProjection);
    quad.material.setFloat("useSky", 1);
    quad.material.setMatrix("invViewProjection", invViewProjection);
    quad.material.setVector3("eyePosition", node.eye);
    quad.material.setFloat("veilFactor", skyVeilFactor(scene, node.camera.maxZ, clearFogEnd));
    quad.material.setColor3("veilColor", scene.fogColor);
  }

  // Ciel de la passe racine : après le décor de la racine, seulement là où la profondeur vaut encore 1.
  function drawRootSky() {
    prepareSky(root);
    const material = quad.material;
    material.depthFunction = Constants.LEQUAL;
    material.disableDepthWrite = true;
    stencil(0);
    singleMesh[0] = quad;
    try {
      draw(singleMesh, root.camera);
    } finally {
      material.depthFunction = Constants.ALWAYS;
      material.disableDepthWrite = false;
    }
  }

  function drawChildren(parent) {
    for (const child of parent.children) {
      scissor(child);
      drawAperture(child, parent, false);
      stencil(child.level);
      const drawSky = !child.fallback && hasSky();
      if (drawSky) {
        prepareSky(child);
      } else {
        quad.material.setFloat("useSky", 0);
        quad.material.setColor4("color", child.fallback ? fillColor : clearColor);
      }
      singleMesh[0] = quad;
      draw(singleMesh, parent.camera);
      if (!child.fallback) {
        if (!drawSky) setFog(child);
        drawVisible(child, worldMeshes);
        drawChildren(child);
        stencil(child.level);
        setFog(child);
        drawVisible(child, lateMeshes);
      }
      drawAperture(child, parent, true);
      scissor(parent);
    }
  }

  function drawPortals() {
    if (scene.activeCamera !== camera) return;
    const color = settings.fallbackColor;
    fillColor.set(color.r, color.g, color.b, 1);
    collectMeshes();
    engine.setStencilBuffer(true);
    engine.setStencilFunction(Constants.EQUAL);
    engine.setStencilBackFunction(Constants.EQUAL);
    engine.setStencilFunctionMask(0xff);
    engine.setStencilOperationFail(Constants.KEEP);
    engine.setStencilBackOperationFail(Constants.KEEP);
    engine.setStencilOperationDepthFail(Constants.KEEP);
    engine.setStencilBackOperationDepthFail(Constants.KEEP);
    try {
      if (hasSky()) drawRootSky();
      drawChildren(root);
      stencil(0);
      setFog(root);
      drawVisible(root, lateMeshes);
    } finally {
      if (drawingCamera) renderer.finishRender();
      drawingCamera = null;
      engine.setStencilBuffer(false);
      engine.setStencilFunction(Constants.ALWAYS);
      engine.setStencilBackFunction(Constants.ALWAYS);
      stencil(0);
      engine.setStencilMask(0xff);
      engine.setDepthBuffer(true);
      engine.setDepthFunction(Constants.LEQUAL);
      engine.setDepthWrite(true);
      engine.setColorWrite(true);
      engine.disableScissor();
      setFog(root);
    }
  }

  const before = scene.onBeforeCameraRenderObservable.add(buildTree);
  const after = scene.onAfterDrawPhaseObservable.add(drawPortals);
  return {
    resetHaze() { hazeHistory.clear(); },
    setSky(portalSky) {
      sky = portalSky ?? null;
      if (!sky || sky.disposed) return;
      const { zenithColor, midColor, horizonColor, sunDirection, sunExponent, sunStrength } = sky.params;
      quad.material.setColor3("zenithColor", zenithColor);
      quad.material.setColor3("midColor", midColor);
      quad.material.setColor3("horizonColor", horizonColor);
      quad.material.setVector3("sunDirection", sunDirection);
      quad.material.setFloat("sunExponent", sunExponent);
      quad.material.setFloat("sunStrength", sunStrength);
    },
    removePortal(portal) {
      hazeHistory.delete(portal);
      for (const node of nodes) {
        if (node.portal === portal) node.portal = null;
        if (node.dest === portal) node.dest = null;
      }
    },
    async warmUp() {
      await scene.whenReadyAsync(true);
      // Toutes les vues partagent ce renderPassId, y compris celles qui seront créées plus tard.
      // mesh.isReady(true) vérifie également les sous-maillages dans les passes d’ombre de Babylon.
      while (!scene.isDisposed) {
        renderList = scene.meshes;
        renderer.activeCamera = camera;
        if (renderer.isReadyForRendering(engine.getRenderWidth(), engine.getRenderHeight())) return;
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
    },
    dispose() {
      scene.onBeforeCameraRenderObservable.remove(before);
      scene.onAfterDrawPhaseObservable.remove(after);
      renderer.dispose();
      for (const virtual of cameras) virtual.dispose();
      quad.dispose(false, true);
      scene.getActiveMeshCandidates = previousCandidates;
      camera.layerMask = previousMask;
      scene.fogMode = previousFog.mode;
      scene.fogEnabled = previousFog.enabled;
      scene.fogStart = previousFog.start;
      scene.fogEnd = previousFog.end;
      scene.fogColor = previousFog.color;
      for (let i = 1; i <= 3; i++) {
        const { autoClear, depth, stencil } = groupStates[i];
        scene.setRenderingAutoClearDepthStencil(i, autoClear, depth, stencil);
      }
    },
  };
}
