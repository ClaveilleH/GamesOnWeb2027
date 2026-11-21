import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { PLAYER } from "../config.js";
import { PortalLayers } from "../portals/layers.js";

export function createSkeletonVisual(scene) {
  const ivory = new StandardMaterial("os ivoire", scene);
  ivory.diffuseColor = Color3.FromHexString("#efe2bf");
  ivory.specularColor = Color3.FromHexString("#302c24");
  const dark = new StandardMaterial("cavités du crâne", scene);
  dark.diffuseColor = Color3.FromHexString("#282d2c");
  dark.specularColor = Color3.Black();

  function pivot(name, parent, x = 0, y = 0, z = 0) {
    const node = new TransformNode(name, scene);
    node.parent = parent;
    node.position.set(x, y, z);
    return node;
  }

  function oval(x, y, z, width, height, depth, tilt = 0) {
    const mesh = CreateSphere("relief", { segments: 10, diameterX: width, diameterY: height, diameterZ: depth }, scene);
    mesh.position.set(x, y, z);
    mesh.rotation.z = tilt;
    return mesh;
  }

  function bone(start, end, radius) {
    const a = Vector3.FromArray(start);
    const b = Vector3.FromArray(end);
    const axis = b.subtract(a);
    const mesh = CreateCapsule("os", {
      height: axis.length(), radius, tessellation: 8, capSubdivisions: 3, subdivisions: 1,
    }, scene);
    Vector3.CenterToRef(a, b, mesh.position);
    mesh.rotationQuaternion = Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, axis.normalize(), mesh.rotationQuaternion);
    return mesh;
  }

  function arc(path, radius) {
    return CreateTube("arc osseux", { path, radius, tessellation: 8, cap: Mesh.CAP_ALL }, scene);
  }

  // Toutes les pièces rigides d'une articulation partagent un seul appel de dessin par matériau.
  function assemble(parent, pieces, mat = ivory) {
    const mesh = pieces.length === 1 ? pieces[0] : Mesh.MergeMeshes(pieces, true);
    mesh.name = parent.name + " · " + mat.name;
    mesh.parent = parent;
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.layerMask = PortalLayers.late;
  }

  const root = pivot("squelette", null);
  const hips = pivot("bassin", root, 0, 0.94, 0);
  const chest = pivot("thorax", hips, 0, 0.08, 0);
  const head = pivot("crâne", chest, 0, 0.56, 0);

  const pelvis = [oval(0, 0.015, -0.045, 0.12, 0.18, 0.12)];
  const ribs = [];
  for (let i = 0; i < 9; i++) {
    ribs.push(oval(0, -0.03 + i * 0.068, -0.04 - 0.03 * Math.sin(i * 0.5),
      0.085, 0.057, 0.1));
  }
  ribs.push(bone([0, 0.25, 0.106], [0, 0.48, 0.1], 0.025));
  for (const side of [-1, 1]) {
    pelvis.push(oval(side * 0.117, 0.044, -0.011, 0.145, 0.19, 0.15, -side * 0.48));
    pelvis.push(bone([side * 0.15, 0.015, 0], [side * 0.035, -0.075, 0.045], 0.034));
    ribs.push(bone([0, 0.48, 0.09], [side * 0.26, 0.48, 0], 0.027));
    ribs.push(oval(side * 0.13, 0.41, -0.087, 0.145, 0.11, 0.055, side * 0.4));
    for (let row = 0; row < 5; row++) {
      const path = [];
      const width = 0.164 + 0.044 * Math.sin(row * Math.PI / 5);
      for (let i = 0; i <= 10; i++) {
        const angle = i * Math.PI / 10;
        path.push(new Vector3(side * (0.018 + width * Math.sin(angle)),
          0.19 + row * 0.063 - 0.049 * Math.sin(angle) - 0.018 * i / 10,
          -0.116 * Math.cos(angle)));
      }
      ribs.push(arc(path, 0.0175));
    }
  }
  assemble(hips, pelvis);
  assemble(chest, ribs);

  const skull = [
    oval(0, 0.205, -0.012, 0.37, 0.34, 0.32),
    oval(0, 0.115, 0.08, 0.29, 0.17, 0.17),
    oval(0, 0.016, 0.065, 0.225, 0.066, 0.155),
  ];
  const sockets = [oval(0, 0.105, 0.168, 0.042, 0.051, 0.018)];
  for (const side of [-1, 1]) {
    skull.push(bone([side * 0.139, 0.12, 0.012], [side * 0.097, 0.014, 0.072], 0.025));
    skull.push(oval(side * 0.098, 0.222, 0.117, 0.148, 0.052, 0.087, side * 0.12));
    skull.push(oval(side * 0.135, 0.118, 0.098, 0.066, 0.061, 0.092));
    const socket = oval(side * 0.086, 0.165, 0.13, 0.127, 0.106, 0.072, side * 0.13);
    socket.rotation.y = side * 0.35;
    sockets.push(socket);
  }
  for (let i = -2; i <= 2; i++) {
    const tooth = CreateBox("dent", { width: 0.029, height: 0.039, depth: 0.041 }, scene);
    tooth.position.set(i * 0.034, 0.052, 0.139 - 0.005 * i * i);
    skull.push(tooth);
  }
  assemble(head, skull);
  assemble(head, sockets, dark);

  function makeLimbs(side) {
    const hip = pivot("hanche", hips, side * 0.137, -0.012, 0);
    const knee = pivot("genou", hip, 0, -0.423, 0);
    const ankle = pivot("cheville", knee, 0, -0.426, 0);
    const shoulder = pivot("épaule", chest, side * 0.272, 0.475, 0);
    const elbow = pivot("coude", shoulder, side * 0.013, -0.283, 0);
    assemble(hip, [
      oval(0, 0, 0, 0.115, 0.113, 0.116),
      bone([0, 0, 0], [0, -0.417, 0], 0.047),
      oval(0, -0.397, 0, 0.115, 0.087, 0.1),
    ]);
    assemble(knee, [
      oval(0, 0, 0.018, 0.113, 0.1, 0.106),
      bone([-side * 0.012, -0.02, 0.014], [0, -0.424, 0], 0.035),
      bone([side * 0.041, -0.06, -0.018], [side * 0.029, -0.405, -0.01], 0.017),
    ]);
    assemble(ankle, [
      oval(0, 0, -0.012, 0.083, 0.08, 0.1),
      oval(0, -0.029, 0.058, 0.116, 0.09, 0.225),
      oval(0, -0.046, 0.145, 0.124, 0.059, 0.085),
    ]);
    assemble(shoulder, [
      oval(0, 0, 0, 0.101, 0.107, 0.107),
      bone([0, 0, 0], [side * 0.013, -0.283, 0], 0.033),
    ]);
    assemble(elbow, [
      oval(0, 0, 0, 0.075, 0.071, 0.077),
      bone([-side * 0.016, -0.014, 0], [-side * 0.014, -0.243, 0.016], 0.023),
      bone([side * 0.022, -0.01, 0], [side * 0.018, -0.236, 0.003], 0.018),
      oval(0, -0.267, 0.014, 0.071, 0.104, 0.054),
      ...[-1, 0, 1].map((i) => bone([i * 0.021, -0.281, 0.016], [i * 0.022, -0.35, 0.025], 0.009)),
    ]);
    return { side, hip, knee, ankle, shoulder, elbow };
  }
  const limbs = [-1, 1].map(makeLimbs);
  let stride = 0;
  let breath = 0;

  function update(dt, speed, grounded, verticalSpeed) {
    const gait = grounded
      ? (speed < 0.12 ? "idle" : speed > PLAYER.walkSpeed + 0.4 ? "run" : "walk")
      : (verticalSpeed > 0.15 ? "jump" : "fall");
    const running = gait === "run";
    const walking = gait === "walk" || running;
    const strength = walking ? Math.min(speed / PLAYER.walkSpeed, 1) : 0;
    const blend = -Math.expm1(-13 * dt);
    const ease = (value, target) => value + (target - value) * blend;
    breath += dt * 2.2;
    if (walking) stride += dt * Math.PI * 2 * (0.6 + 0.23 * speed);
    const wave = Math.sin(stride);
    const swing = strength * (running ? 0.92 : 0.59);
    const bob = strength * Math.cos(stride * 2) * (running ? 0.032 : 0.018);
    hips.position.y = ease(hips.position.y, 0.94 + bob);
    hips.rotation.y = ease(hips.rotation.y, wave * strength * 0.105);
    chest.position.y = ease(chest.position.y, 0.08 + 0.008 * Math.sin(breath));
    chest.rotation.z = ease(chest.rotation.z, 0.014 * Math.cos(breath) + wave * strength * 0.043);
    chest.rotation.x = ease(chest.rotation.x, running ? 0.16 : walking ? 0.06 : 0.012 * Math.sin(breath));
    head.rotation.y = ease(head.rotation.y, gait === "idle" ? 0.09 * Math.sin(breath * 0.6) : -hips.rotation.y * 0.6);

    for (const { side, hip, knee, ankle, shoulder, elbow } of limbs) {
      const step = side * wave;
      let thigh = -step * swing;
      let shin = strength * Math.max(0, -step) * (running ? 1.05 : 0.65);
      let arm = step * swing * 0.88;
      let spread = 0.075;
      let forearm = running ? -0.92 : -0.18 - 0.2 * strength;
      if (gait === "jump") {
        thigh = side === 1 ? -0.83 : -0.32;
        shin = side === 1 ? 1.05 : 0.69;
        arm = -0.56 + side * 0.28;
        spread = 0.32;
        forearm = -0.76;
      } else if (gait === "fall") {
        thigh = -0.17 + side * 0.11;
        shin = 0.37;
        arm = 0.04;
        spread = 0.56;
        forearm = -0.28;
      }
      hip.rotation.x = ease(hip.rotation.x, thigh);
      knee.rotation.x = ease(knee.rotation.x, shin);
      ankle.rotation.x = ease(ankle.rotation.x, -0.45 * (thigh + shin));
      shoulder.rotation.x = ease(shoulder.rotation.x, arm);
      shoulder.rotation.z = ease(shoulder.rotation.z, side * spread);
      elbow.rotation.x = ease(elbow.rotation.x, forearm);
    }
  }

  return {
    root, update, materials: [ivory, dark],
    setFade(alpha) {
      if (ivory.alpha === alpha) return false;
      ivory.alpha = alpha;
      dark.alpha = alpha;
      return true;
    },
    dispose() {
      root.dispose();
      ivory.dispose();
      dark.dispose();
    },
  };
}
