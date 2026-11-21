import HavokPhysics from "@babylonjs/havok";
import wasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Physics/physicsEngineComponent";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { GRAVITY } from "../config.js";

export const collisionLayer = Object.freeze({ terrain: 1, player: 2, dynamic: 4 });

export async function initPhysics(scene) {
  const havok = await HavokPhysics({ locateFile: () => wasmUrl });
  const gravity = new Vector3(0, GRAVITY, 0);
  scene.enablePhysics(gravity, new HavokPlugin(true, havok));
  return gravity;
}
