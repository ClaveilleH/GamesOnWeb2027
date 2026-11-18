import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import "@babylonjs/core/Physics/physicsEngineComponent";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsEventType, PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import HavokPhysics from "@babylonjs/havok";
import wasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

const canvas = document.querySelector("#scene");
const status = document.querySelector("#status");
const dropButton = document.querySelector("#drop");
const bounces = document.querySelector("#bounces");

async function start() {
  const engine = new Engine(canvas, true, { alpha: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  const havok = await HavokPhysics({ locateFile: () => wasmUrl });
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));

  const camera = new FreeCamera("camera", new Vector3(8, 7, -11), scene);
  camera.setTarget(new Vector3(0, 1.4, 0));
  camera.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;
  function resize() {
    engine.resize();
    const aspect = canvas.clientWidth / canvas.clientHeight;
    camera.orthoTop = Math.max(3.5, 4.1 / aspect);
    camera.orthoBottom = -camera.orthoTop;
    camera.orthoRight = camera.orthoTop * aspect;
    camera.orthoLeft = -camera.orthoRight;
  }
  resize();
  new ResizeObserver(resize).observe(canvas);
  new HemisphericLight("ambient", Vector3.Up(), scene).intensity = 0.85;
  new DirectionalLight("sun", new Vector3(0.6, -1, 0.5), scene).intensity = 0.85;

  function material(name, color) {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = Color3.FromHexString(color);
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    return mat;
  }

  const platform = CreateCylinder("platform", { diameter: 6.3, height: 0.28, tessellation: 96 }, scene);
  platform.position.y = -0.14;
  platform.material = material("slate", "#34585b");
  new PhysicsAggregate(platform, PhysicsShapeType.CYLINDER, { mass: 0, restitution: 0.85 }, scene);

  const markings = material("markings", "#8bbbb0");
  for (const diameter of [2.1, 5.9]) {
    const ring = CreateTorus("marking", { diameter, thickness: 0.025, tessellation: 96 }, scene);
    ring.material = markings;
  }

  const ball = CreateSphere("ball", { diameter: 1.1, segments: 32 }, scene);
  ball.material = material("orange", "#f97b38");
  const seam = CreateTorus("seam", { diameter: 1.095, thickness: 0.024, tessellation: 80 }, scene);
  seam.material = material("seam", "#5c332b");
  seam.parent = ball;
  seam.rotation.z = 0.56;

  const shadow = CreateCylinder("shadow", { diameter: 1.2, height: 0.003, tessellation: 48 }, scene);
  shadow.position.y = 0.006;
  shadow.material = material("shadow", "#182e31");
  scene.onBeforeRenderObservable.add(() => {
    const height = Math.max(0, ball.position.y - 0.55);
    shadow.scaling.x = shadow.scaling.z = 1 + height * 0.13;
    shadow.material.alpha = 0.48 / (1 + height);
  });

  let aggregate;
  function drop() {
    aggregate?.dispose();
    ball.position.set(0, 3.9, 0);
    ball.computeWorldMatrix(true);
    aggregate = new PhysicsAggregate(ball, PhysicsShapeType.SPHERE, { mass: 1, restitution: 0.85 }, scene);
    let count = 0;
    bounces.textContent = "0";
    aggregate.body.setCollisionCallbackEnabled(true);
    aggregate.body.getCollisionObservable().add((event) => {
      if (event.type === PhysicsEventType.COLLISION_STARTED) {
        bounces.textContent = String(++count);
      }
    });
  }
  ball.position.y = 3.9;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) drop();
  dropButton.addEventListener("click", drop);
  engine.runRenderLoop(() => scene.render());
  status.hidden = true;
  dropButton.disabled = false;
}

start().catch((error) => {
  console.error(error);
  status.textContent = "Impossible de charger la scène 3D. Vérifiez que WebGL est activé et rechargez la page.";
});
