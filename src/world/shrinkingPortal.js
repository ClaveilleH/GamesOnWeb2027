import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { collisionLayer } from "../core/physics.js";

// Couloir fermé orienté vers +Z. Au fond (z = back), une petite porte décorative ; à l'autre
// bout (z = portal), un portail de la taille du couloir. Derrière le portail, on voit le
// couloir agrandi `ratio` fois : la petite porte agrandie coïncide exactement avec le portail.
// Le franchir applique l'homothétie inverse : le joueur se retrouve, à taille normale, devant
// la petite porte, et le portail est de nouveau devant lui. On peut recommencer sans fin.
export const SHRINK = Object.freeze({
  x: 14,
  back: -17,
  portal: -7,
  width: 3.2,
  height: 3.4,
  wall: 0.4,
  frame: 0.25,
  ratio: 2,
  levels: 5,
});

const opening = {
  width: SHRINK.width - 2 * SHRINK.frame,
  height: SHRINK.height - SHRINK.frame,
};
// Centre de l'homothétie T (rapport `ratio`) qui envoie le plan de la petite porte sur celui du portail.
const center = new Vector3(SHRINK.x, 0, (SHRINK.ratio * SHRINK.back - SHRINK.portal) / (SHRINK.ratio - 1));
// Profondeur du volume du portail derrière son plan : la caméra peut l'approcher sans que son
// plan proche ne le coupe.
const portalDepth = 0.3;
// Le couloir se prolonge derrière le portail pour que la capsule n'y heurte rien avant de passer.
const endGap = 0.7;
// Plan de coupe des vues : on ne garde que ce qui est devant la petite porte, dans le couloir.
const clipZ = SHRINK.back + 0.03;
const portalLayerShift = 21;
const portalLayers = ((1 << (SHRINK.levels + 1)) - 1) << (portalLayerShift + 1);
export const mainCameraLayerMask = (0x0fffffff & ~portalLayers) | (1 << (portalLayerShift + 1));

// T^n(p) : n > 0 agrandit (espace du joueur → espace vu à travers le portail), n < 0 réduit.
export function scaleAround(point, power, out = new Vector3()) {
  const factor = SHRINK.ratio ** power;
  out.set(
    center.x + (point.x - center.x) * factor,
    center.y + (point.y - center.y) * factor,
    center.z + (point.z - center.z) * factor,
  );
  return out;
}

export function inOpening(point, margin = 0) {
  return Math.abs(point.x - SHRINK.x) <= opening.width / 2 + margin
    && point.y >= -margin && point.y <= opening.height + margin;
}

// Vrai si le segment [from, to] traverse le portail dans le sens +Z, dans son ouverture.
export function crossesPortal(from, to) {
  return from.z < SHRINK.portal && to.z >= SHRINK.portal && inOpening(to, 0.05);
}

function material(scene, name, color, emissive = false) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(color);
  mat.specularColor = Color3.Black();
  if (emissive) {
    mat.emissiveColor = Color3.FromHexString(color);
    mat.disableLighting = true;
  }
  return mat;
}

export function createShrinkingCorridor(scene) {
  const { x, back, portal, width, height, wall, frame } = SHRINK;
  const concrete = material(scene, "béton du couloir", "#5b7f78");
  const trim = material(scene, "cadre orange", "#e59a5e");
  const door = material(scene, "porte minuscule", "#2a3f41");
  const lamp = material(scene, "applique", "#ffe2b0", true);
  const meshes = [];

  function box(name, cx, cy, cz, w, h, d, mat, solid = true) {
    const mesh = CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(cx, cy, cz);
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    if (solid) {
      const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
      aggregate.shape.filterMembershipMask = collisionLayer.terrain;
    }
    meshes.push(mesh);
    return mesh;
  }

  const front = portal + endGap;
  const length = front - back;
  const midZ = (back + front) / 2;
  const outerWidth = width + 2 * wall;
  // Mur est, plein.
  box("couloir · mur est", x + (width + wall) / 2, height / 2, midZ, wall, height, length, concrete);
  // Mur ouest, percé d'une entrée près du fond, côté départ.
  const doorZ = [back + 0.8, back + 2.3];
  const doorHeight = 2.45;
  const westX = x - (width + wall) / 2;
  box("couloir · mur ouest arrière", westX, height / 2, (back + doorZ[0]) / 2, wall, height, doorZ[0] - back, concrete);
  box("couloir · mur ouest avant", westX, height / 2, (doorZ[1] + front) / 2, wall, height, front - doorZ[1], concrete);
  box("couloir · linteau ouest", westX, (doorHeight + height) / 2, (doorZ[0] + doorZ[1]) / 2,
    wall, height - doorHeight, doorZ[1] - doorZ[0], concrete);
  box("couloir · toit", x, height + wall / 2, midZ, outerWidth, wall, length + 2 * wall, concrete);
  box("couloir · fond", x, height / 2, back - wall / 2, outerWidth, height, wall, concrete);
  box("couloir · bout", x, height / 2, front + wall / 2, outerWidth, height, wall, concrete);

  // Cadre du portail : montants et linteau, en avant de son plan.
  const frameDepth = 0.3;
  const frameZ = portal - frameDepth / 2;
  for (const side of [-1, 1]) {
    box("portail · montant", x + side * (width - frame) / 2, height / 2, frameZ, frame, height, frameDepth, trim);
  }
  box("portail · linteau", x, height - frame / 2, frameZ, width - 2 * frame, frame, frameDepth, trim);

  // La même porte réduite de moitié, plaquée sur le mur du fond. Mince, elle reste derrière le
  // plan de coupe des vues et ne masque donc pas ce qu'on voit à travers le portail.
  const r = SHRINK.ratio;
  const plate = 0.02;
  const doorFrontZ = back + plate / 2;
  for (const side of [-1, 1]) {
    box("petite porte · montant", x + side * (width - frame) / (2 * r), height / (2 * r), doorFrontZ,
      frame / r, height / r, plate, trim, false);
  }
  box("petite porte · linteau", x, (height - frame / 2) / r, doorFrontZ, (width - 2 * frame) / r, frame / r, plate, trim, false);
  box("petite porte · battant", x, opening.height / (2 * r), doorFrontZ, opening.width / r, opening.height / r, plate / 2, door, false);

  // Appliques régulières : à travers le portail, leur espacement double et trahit l'agrandissement.
  for (let z = back + 1.5; z < portal - 0.5; z += 1.5) {
    for (const side of [-1, 1]) {
      box("applique", x + side * (width / 2 - 0.04), 2.5, z, 0.08, 0.32, 0.5, lamp, false);
    }
  }
  return meshes;
}

Effect.ShadersStore.shrinkPortalVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
void main() {
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

// Chaque niveau affiche, en espace écran, la vue rendue depuis la caméra réduite d'un cran de plus.
Effect.ShadersStore.shrinkPortalFragmentShader = `
precision highp float;
uniform sampler2D view;
uniform vec2 screen;
void main() {
  gl_FragColor = texture2D(view, gl_FragCoord.xy / screen);
}`;

// Rendu du portail sur `levels` niveaux : la vue n est rendue depuis T^-n(caméra principale),
// coupée au plan de la petite porte. Le volume du portail est dupliqué par niveau sur des
// calques distincts, chaque caméra ne voyant que celui qui affiche la vue suivante. Au-delà du
// dernier niveau, le portail, devenu minuscule, prend une teinte unie.
export function createPortalViews(scene, mainCamera) {
  const engine = scene.getEngine();
  const screen = new Vector2(engine.getRenderWidth(), engine.getRenderHeight());
  const clip = new Plane(0, 0, -1, clipZ);
  const viewProjection = Matrix.Identity();
  const frustum = Frustum.GetPlanes(viewProjection);
  const target = Vector3.Zero();
  const levels = [];
  const portalMeshes = [];

  function portalMesh(level) {
    const mesh = CreateBox(`portail · niveau ${level}`, {
      width: opening.width, height: opening.height, depth: portalDepth,
    }, scene);
    mesh.position.set(SHRINK.x, opening.height / 2, SHRINK.portal + portalDepth / 2);
    mesh.layerMask = 1 << (portalLayerShift + level);
    mesh.isPickable = false;
    portalMeshes.push(mesh);
    return mesh;
  }

  for (let level = 1; level <= SHRINK.levels; level++) {
    const camera = new TargetCamera(`caméra du portail ${level}`, Vector3.Zero(), scene, false);
    camera.layerMask = (0x0fffffff & ~portalLayers) | (1 << (portalLayerShift + level + 1));
    const view = new RenderTargetTexture(`vue du portail ${level}`,
      { width: screen.x, height: screen.y }, scene, false, true);
    view.activeCamera = camera;
    view.clearColor = new Color4(0, 0, 0, 0);
    view.renderList = null;
    if (level === 1) view.samples = 4;
    view.onBeforeRenderObservable.add(() => { scene.clipPlane = clip; });
    view.onAfterRenderObservable.add(() => { scene.clipPlane = null; });

    const mat = new ShaderMaterial(`matière du portail ${level}`, scene, "shrinkPortal", {
      attributes: ["position"],
      uniforms: ["worldViewProjection", "screen"],
      samplers: ["view"],
    });
    mat.setTexture("view", view);
    mat.setVector2("screen", screen);
    mat.backFaceCulling = false;
    portalMesh(level).material = mat;
    levels.push({ camera, view, mat });
  }
  const deepest = portalMesh(SHRINK.levels + 1);
  const fog = new StandardMaterial("fond du portail", scene);
  fog.disableLighting = true;
  fog.emissiveColor = Color3.FromHexString("#3d5955");
  fog.backFaceCulling = false;
  deepest.material = fog;

  const onResize = engine.onResizeObservable.add(() => {
    screen.set(engine.getRenderWidth(), engine.getRenderHeight());
    for (const { view, mat } of levels) {
      view.resize({ width: screen.x, height: screen.y });
      mat.setVector2("screen", screen);
    }
  });

  let active = false;
  // À appeler après le placement de la caméra principale : les vues ne sont rendues que si le
  // portail est dans son champ, devant elle.
  function update() {
    mainCamera.getViewMatrix(true).multiplyToRef(mainCamera.getProjectionMatrix(true), viewProjection);
    Frustum.GetPlanesToRef(viewProjection, frustum);
    const first = portalMeshes[0];
    first.computeWorldMatrix();
    const visible = mainCamera.position.z < SHRINK.portal + portalDepth && first.isInFrustum(frustum);
    if (visible) {
      const look = mainCamera.getTarget();
      levels.forEach(({ camera }, index) => {
        const power = -(index + 1);
        camera.fov = mainCamera.fov;
        camera.minZ = mainCamera.minZ * SHRINK.ratio ** power;
        camera.maxZ = mainCamera.maxZ;
        scaleAround(mainCamera.position, power, camera.position);
        camera.setTarget(scaleAround(look, power, target));
      });
    }
    if (visible !== active) {
      active = visible;
      const list = scene.customRenderTargets;
      // Les niveaux profonds d'abord : chacun échantillonne la vue du niveau suivant.
      for (let i = levels.length - 1; i >= 0; i--) {
        if (visible) list.push(levels[i].view);
        else list.splice(list.indexOf(levels[i].view), 1);
      }
    }
  }

  return {
    update,
    get active() { return active; },
    dispose() {
      onResize.remove();
      for (const { view, camera } of levels) {
        view.dispose();
        camera.dispose();
      }
    },
  };
}
