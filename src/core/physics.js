import HavokPhysics from "@babylonjs/havok";
import wasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import "@babylonjs/core/Physics/physicsEngineComponent";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { GRAVITY } from "../config.js";

export const collisionLayer = Object.freeze({ terrain: 1, player: 2, dynamic: 4, proxy: 8, portalBack: 16, portalFrame: 32 });
// Calques qui arrêtent la vue de la caméra et la lumière du soleil (ni joueur, ni caisses, ni doublures).
const sightBlockers = collisionLayer.terrain | collisionLayer.portalBack | collisionLayer.portalFrame;

// Rayon Havok réutilisé : distance du premier obstacle entre from et to, ou null si la ligne est libre.
export function createSightTest(physics) {
  const query = { collideWith: sightBlockers };
  const hit = new PhysicsRaycastResult();
  return (from, to) => {
    physics.raycastToRef(from, to, hit, query);
    return hit.hasHit ? hit.hitDistance : null;
  };
}

export async function initPhysics(scene) {
  const havok = await HavokPhysics({ locateFile: () => wasmUrl });
  const gravity = new Vector3(0, GRAVITY, 0);
  scene.enablePhysics(gravity, new HavokPlugin(true, havok));
  return gravity;
}
