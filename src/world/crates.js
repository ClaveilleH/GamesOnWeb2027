import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape";
import { collisionLayer } from "../core/physics.js";
import { createBodyTraveler, PortalLayers } from "../portals/index.js";
import { terrainMaterial } from "./testTerrain.js";

export function createCrate(scene, portals, { name, position, size = 1, scale = 1, yaw = 0, color = "#ad7850" }) {
  const node = new TransformNode(name + " · corps", scene);
  node.position.copyFrom(position);
  node.rotationQuaternion = Quaternion.FromEulerAngles(0, yaw, 0);
  const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
  body.shape = new PhysicsShapeBox(Vector3.ZeroReadOnly, Quaternion.Identity(), new Vector3(size, size, size), scene);
  body.shape.material = { friction: 0.6, restitution: 0 };
  body.shape.density = 40;
  body.shape.filterMembershipMask = collisionLayer.dynamic;
  body.setMassProperties({ mass: 40 * size ** 3 });

  const visual = CreateBox(name, { size }, scene);
  visual.material = terrainMaterial(scene, name + " · bois", color);
  visual.layerMask = PortalLayers.world;
  visual.receiveShadows = true;
  for (const light of scene.lights) {
    const generators = light.getShadowGenerators();
    if (generators) for (const generator of generators.values()) generator.addShadowCaster(visual, false);
  }
  return createBodyTraveler(portals, {
    body, visual, size, scale,
    straddleIgnoreMask: collisionLayer.portalBack,
    proxy: { membership: collisionLayer.proxy, collideMask: collisionLayer.player | collisionLayer.dynamic | collisionLayer.terrain },
  });
}
