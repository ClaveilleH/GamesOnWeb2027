import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { collisionLayer } from "../core/physics.js";

// Le tunnel longe l'axe Z. Vu de dehors il mesure 14 m, mais seuls ses 3 derniers mètres
// existent pour qui le traverse : l'entrée sud est un portail qui saute directement au
// plan situé 3 m avant la sortie nord. Les 11 m intermédiaires ne sont jamais parcourus.
export const TUNNEL = Object.freeze({
  x: -16.5,
  south: -12,
  outerLength: 14,
  innerLength: 3,
  width: 2.4,
  height: 2.8,
  wall: 0.4,
});

const south = TUNNEL.south;
const north = TUNNEL.south + TUNNEL.outerLength;
const inner = north - TUNNEL.innerLength;
const skipped = inner - south;
const portalDepth = 0.15;

// `facing` indique le sens de traversée qui déclenche le saut, `translation` l'applique.
// Le plan de découpe ne garde, dans la vue à travers le portail, que ce qui est au-delà
// du portail d'arrivée.
const portals = [
  {
    name: "entrée sud", plane: south, facing: 1, translation: new Vector3(0, 0, skipped),
    clip: new Plane(0, 0, -1, inner),
  },
  {
    name: "retour", plane: inner, facing: -1, translation: new Vector3(0, 0, -skipped),
    clip: new Plane(0, 0, 1, -south),
  },
];

function inAperture(point, margin = 0) {
  return Math.abs(point.x - TUNNEL.x) <= TUNNEL.width / 2 + margin
    && point.y >= -margin && point.y <= TUNNEL.height + margin;
}

// Premier portail franchi dans le sens actif par le segment [from, to], ou null.
export function crossPortal(from, to) {
  for (const portal of portals) {
    const a = (from.z - portal.plane) * portal.facing;
    const b = (to.z - portal.plane) * portal.facing;
    if (a > 0 || b <= 0) continue;
    const s = a / (a - b);
    const point = Vector3.Lerp(from, to, s);
    if (inAperture(point)) return { portal, s, point, translation: portal.translation };
  }
  return null;
}

// Translation du double à afficher quand le corps chevauche un portail, ou null.
export function straddledPortal(position, reach) {
  for (const portal of portals) {
    const a = (position.z - portal.plane) * portal.facing;
    if (a <= 0 && a > -reach && inAperture(position, reach)) return portal.translation;
  }
  return null;
}

function material(scene, name, color, emissive = "#000000") {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(color);
  mat.emissiveColor = Color3.FromHexString(emissive);
  mat.specularColor = Color3.Black();
  return mat;
}

function sign(scene, lines, x, y, z, width, rotationY = 0) {
  const height = width / 2;
  const plane = CreatePlane("panneau " + lines[0], { width, height }, scene);
  plane.position.set(x, y, z);
  plane.rotation.y = rotationY;
  const texture = new DynamicTexture("panneau " + lines[0], { width: 512, height: 256 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#253e40";
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = "#f4b783";
  ctx.fillRect(20, 26, 8, 204);
  ctx.font = "bold 64px sans-serif";
  ctx.fillStyle = "#f6f0d9";
  ctx.fillText(lines[0], 50, 96);
  ctx.font = "30px sans-serif";
  ctx.fillStyle = "#bdcec0";
  lines.slice(1).forEach((line, i) => ctx.fillText(line, 52, 158 + i * 44));
  texture.update();
  plane.material = material(scene, "panneau " + lines[0], "#ffffff");
  plane.material.diffuseTexture = texture;
  plane.material.backFaceCulling = false;
  plane.isPickable = false;
  return plane;
}

function wallMarker(scene, text, z) {
  const plane = CreatePlane("borne " + text, { width: 0.7, height: 0.35 }, scene);
  plane.position.set(TUNNEL.x - TUNNEL.width / 2 + 0.01, 1.5, z);
  plane.rotation.y = -Math.PI / 2;
  const texture = new DynamicTexture("borne " + text, { width: 256, height: 128 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#e9b07c";
  ctx.fillRect(0, 0, 256, 128);
  ctx.font = "bold 72px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#253e40";
  ctx.fillText(text, 128, 92);
  texture.update();
  plane.material = material(scene, "borne " + text, "#ffffff", "#5a4a3a");
  plane.material.diffuseTexture = texture;
  plane.isPickable = false;
}

export function createTunnelGeometry(scene) {
  const concrete = material(scene, "béton du tunnel", "#5b7d77", "#1c2b29");
  const lamp = material(scene, "néon", "#ffffff", "#fff1cf");
  const casters = [];
  const { x, width, height, wall } = TUNNEL;
  const length = TUNNEL.outerLength;
  const midZ = south + length / 2;

  function solid(name, cx, cy, cz, w, h, d) {
    const mesh = CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(cx, cy, cz);
    mesh.material = concrete;
    mesh.receiveShadows = true;
    const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
    aggregate.shape.filterMembershipMask = collisionLayer.terrain;
    casters.push(mesh);
  }

  for (const side of [-1, 1]) {
    solid("paroi du tunnel", x + side * (width + wall) / 2, (height + wall) / 2, midZ, wall, height + wall, length);
  }
  solid("voûte du tunnel", x, height + wall / 2, midZ, width + 2 * wall, wall, length);

  // Seule la partie réellement traversée est éclairée.
  for (const z of [inner + 0.75, inner + 2.25]) {
    const strip = CreateBox("néon", { width: 0.12, height: 0.04, depth: 1 }, scene);
    strip.position.set(x, height - 0.02, z);
    strip.material = lamp;
    strip.isPickable = false;
  }
  wallMarker(scene, "1 m", inner + 1);
  wallMarker(scene, "2 m", inner + 2);
  sign(scene, ["TUNNEL", "Longueur : 14 m", "Traversée : 3 pas ?"], x + 2.9, 1.6, south - 0.6, 1.9, -0.35);
  sign(scene, ["SORTIE", "Vous avez parcouru 14 m", "en 3 m."], x + 2.9, 1.6, north + 3.5, 1.9, 0.35);
  return casters;
}

Effect.ShadersStore.portalVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
void main() {
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

// La vue rendue à travers le portail est projetée en espace écran. Là où elle est vide,
// on redessine le dégradé CSS du ciel pour que le portail reste opaque.
Effect.ShadersStore.portalFragmentShader = `
precision highp float;
uniform sampler2D view;
uniform vec2 screen;
void main() {
  vec2 uv = gl_FragCoord.xy / screen;
  vec4 seen = texture2D(view, uv);
  float t = clamp((1.0 - uv.y - 0.02) / 0.98, 0.0, 1.0);
  vec3 top = vec3(0.882, 0.875, 0.741);
  vec3 middle = vec3(0.678, 0.761, 0.698);
  vec3 bottom = vec3(0.471, 0.608, 0.584);
  vec3 sky = t < 0.43 ? mix(top, middle, t / 0.43) : mix(middle, bottom, clamp((t - 0.43) / 0.42, 0.0, 1.0));
  gl_FragColor = vec4(mix(sky, seen.rgb, seen.a), 1.0);
}`;

// Chaque portail est une fine boîte dont toutes les faces affichent, en espace écran,
// ce que voit une caméra décalée de la translation du portail. L'épaisseur garde le
// portail visible quand la caméra le touche presque.
export function createPortalViews(scene, mainCamera) {
  const engine = scene.getEngine();
  const views = [];
  const portalMeshes = new Set();
  const screen = { x: engine.getRenderWidth(), y: engine.getRenderHeight() };
  const target = Vector3.Zero();
  const shifted = Vector3.Zero();
  const viewProjection = Matrix.Identity();
  const frustum = Frustum.GetPlanes(viewProjection);

  for (const portal of portals) {
    const mesh = CreateBox("portail " + portal.name, {
      width: TUNNEL.width + 0.1, height: TUNNEL.height + 0.1, depth: portalDepth,
    }, scene);
    mesh.position.set(TUNNEL.x, TUNNEL.height / 2, portal.plane + portal.facing * portalDepth / 2);
    mesh.isPickable = false;
    portalMeshes.add(mesh);

    const camera = new TargetCamera("caméra " + portal.name, Vector3.Zero(), scene, false);
    const view = new RenderTargetTexture("vue " + portal.name, { width: screen.x, height: screen.y }, scene, false, true);
    view.activeCamera = camera;
    view.clearColor = new Color4(0, 0, 0, 0);
    view.renderListPredicate = (candidate) => !portalMeshes.has(candidate);
    view.onBeforeRenderObservable.add(() => { scene.clipPlane = portal.clip; });
    view.onAfterRenderObservable.add(() => { scene.clipPlane = null; });

    const mat = new ShaderMaterial("matière " + portal.name, scene, "portal", {
      attributes: ["position"],
      uniforms: ["worldViewProjection", "screen"],
      samplers: ["view"],
    });
    mat.setTexture("view", view);
    mat.setVector2("screen", screen);
    mat.backFaceCulling = false;
    mesh.material = mat;
    views.push({ portal, mesh, camera, view, mat, active: false });
  }

  const onResize = engine.onResizeObservable.add(() => {
    screen.x = engine.getRenderWidth();
    screen.y = engine.getRenderHeight();
    for (const { view, mat } of views) {
      view.resize({ width: screen.x, height: screen.y });
      mat.setVector2("screen", screen);
    }
  });

  // Appelé à chaque image, menu ouvert compris, après le placement de la caméra : une vue
  // de portail coûte un rendu complet de la scène et n'est calculée que si le portail est visible.
  function update() {
    mainCamera.getViewMatrix(true).multiplyToRef(mainCamera.getProjectionMatrix(true), viewProjection);
    Frustum.GetPlanesToRef(viewProjection, frustum);
    mainCamera.getTarget().subtractToRef(mainCamera.position, target);
    for (const entry of views) {
      const { portal, mesh, camera, view } = entry;
      const side = (mainCamera.position.z - portal.plane) * portal.facing;
      mesh.computeWorldMatrix();
      const visible = side < portalDepth && mesh.isInFrustum(frustum);
      if (visible) {
        camera.fov = mainCamera.fov;
        camera.minZ = mainCamera.minZ;
        camera.maxZ = mainCamera.maxZ;
        mainCamera.position.addToRef(portal.translation, camera.position);
        camera.position.addToRef(target, shifted);
        camera.setTarget(shifted);
      }
      if (visible !== entry.active) {
        entry.active = visible;
        const list = scene.customRenderTargets;
        if (visible) list.push(view);
        else list.splice(list.indexOf(view), 1);
      }
    }
  }

  return {
    update,
    dispose() {
      onResize.remove();
      for (const { view } of views) view.dispose();
    },
  };
}
