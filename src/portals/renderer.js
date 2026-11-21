import { Camera } from "@babylonjs/core/Cameras/camera";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";
import { Scene } from "@babylonjs/core/scene";
import { PortalLayers } from "./layers.js";
import { aperturePyramidPlanes, applyObliqueNearPlane, distanceToAperture, intersectRects, projectAperture } from "./math.js";

const clearFogStart = 1e8;
const clearFogEnd = 1e9;
const byDistance = (a, b) => a.distance - b.distance;

function createNode() {
  return {
    level: 0, camera: null, portal: null, dest: null, subtree: null, fallback: false,
    scale: 1, distance: 0, fogStart: 0, fogEnd: Infinity,
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
  quad.material = new ShaderMaterial("fond des portails", scene, {
    vertexSource: `
      attribute vec3 position;
      void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }
    `,
    fragmentSource: `
      precision highp float;
      uniform vec4 color;
      void main() { gl_FragColor = color; }
    `,
  }, { attributes: ["position"], uniforms: ["color"] });
  quad.material.backFaceCulling = false;
  quad.material.depthFunction = Constants.ALWAYS;
  return quad;
}

export function createPortalRenderer(scene, system) {
  const engine = scene.getEngine();
  const { camera, settings, stats } = system;
  const previousMask = camera.layerMask;
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

  const root = createNode();
  root.camera = camera;
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
  const quad = createScreenQuad(scene);
  const clearColor = new Color4(0, 0, 0, 0);
  const fillColor = new Color4();
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
    dest.normal.scaleToRef(dest.signedDistance(child.eye) > 0 ? -1 : 1, normal);
    normal.scaleToRef(-settings.clipBias * child.scale, planePoint).addInPlace(dest.origin);
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
      if (!mesh.isInFrustum(node.planes)) continue;
      // BoundingInfo.isInFrustum ne lit que six plans.
      if (node !== root && outsidePlanes(mesh.getBoundingInfo().boundingBox.vectorsWorld, node.pyramid)) continue;
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
    if (subtree && settings.haze && Number.isFinite(subtree.fogEnd)) {
      // Le voile ne couvre que la bande qui précède le repli : le reste de la vue garde ses couleurs.
      const end = Math.max(subtree.fogEnd, subtree.fogStart + settings.hazeMinRange);
      scene.fogStart = Math.max(subtree.fogStart, end - settings.hazeRange) * node.scale;
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

  function drawChildren(parent) {
    for (const child of parent.children) {
      scissor(child);
      drawAperture(child, parent, false);
      stencil(child.level);
      quad.material.setColor4("color", child.fallback ? fillColor : clearColor);
      singleMesh[0] = quad;
      draw(singleMesh, parent.camera);
      if (!child.fallback) {
        setFog(child);
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
    async warmUp() {
      await scene.whenReadyAsync(true);
      // Toutes les vues partagent ce renderPassId, y compris celles qui seront créées plus tard.
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
