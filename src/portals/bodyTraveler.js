import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsPrestepType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape";

function exclusiveMaterials(root) {
  const meshes = root.getChildMeshes();
  if ("material" in root) meshes.push(root);
  const replacements = new Map();
  for (const mesh of meshes) {
    const source = mesh.material ?? root.getScene().defaultMaterial;
    if (!replacements.has(source)) {
      const shared = !mesh.material || source.getBindedMeshes().some((other) => !meshes.includes(other));
      replacements.set(source, shared ? source.clone(root.name + " · " + source.name) : source);
    }
    mesh.material = replacements.get(source);
  }
  return [...replacements.values()];
}

export function createBodyTraveler(portals, { body, visual, size, scale = 1, name = visual.name }) {
  const node = body.transformNode;
  const scene = node.getScene();
  const physics = scene.getPhysicsEngine();
  const plugin = physics.getPhysicsPlugin();
  const dimensions = typeof size === "number" ? new Vector3(size, size, size) : size.clone();
  const radius = dimensions.length() / 2;
  const baseMass = body.getMassProperties().mass;
  const materials = exclusiveMaterials(visual);
  const previousPosition = new Vector3();
  const previousRotation = Quaternion.Identity();
  const position = new Vector3();
  const rotation = Quaternion.Identity();
  const parentRotation = Quaternion.Identity();
  const baseVisualScale = visual.scaling.clone();
  const linear = new Vector3();
  const angular = new Vector3();
  const extents = new Vector3();
  const identity = Quaternion.Identity();
  visual.rotationQuaternion ??= Quaternion.Identity();
  let currentScale = 1;
  let shape = body.shape;
  let disposed = false;

  function center(out) {
    if (node.parent) return node.computeWorldMatrix(true).getTranslationToRef(out);
    return out.copyFrom(node.position);
  }

  function readPose(pos, rot) {
    center(pos);
    rot.copyFrom(node.parent ? node.absoluteRotationQuaternion : node.rotationQuaternion);
  }

  function writePose(target, pos, rot) {
    if (target.parent) {
      target.parent.computeWorldMatrix(true).decompose(undefined, parentRotation);
      parentRotation.conjugateInPlace().multiplyToRef(rot, target.rotationQuaternion);
      target.setAbsolutePosition(pos);
    } else {
      target.position.copyFrom(pos);
      target.rotationQuaternion.copyFrom(rot);
    }
  }

  function releaseShape(shape) {
    if (!physics.getBodies().some((other) => other.shape === shape)) shape.dispose();
  }

  function setScale(value) {
    if (value === currentScale) return;
    const old = shape;
    shape = new PhysicsShapeBox(Vector3.ZeroReadOnly, identity, dimensions.scaleToRef(value, extents), scene);
    shape.material = old.material;
    shape.filterMembershipMask = old.filterMembershipMask;
    shape.filterCollideMask = old.filterCollideMask;
    shape.density = old.density;
    body.shape = shape;
    body.setMassProperties({ mass: baseMass * value ** 3 });
    body.setGravityFactor(value);
    baseVisualScale.scaleToRef(value, visual.scaling);
    currentScale = value;
    releaseShape(old);
  }

  function teleportBody() {
    // Havok ne lit le nœud qu'en mode TELEPORT. Entre deux placements, la simulation le pilote.
    const prestep = body.getPrestepType();
    body.setPrestepType(PhysicsPrestepType.TELEPORT);
    try {
      plugin.setPhysicsBodyTransformation(body, node);
    } finally {
      body.setPrestepType(prestep);
    }
  }

  function applyWarp(warp) {
    body.getLinearVelocityToRef(linear);
    body.getAngularVelocityToRef(angular);
    warp.direction(linear, linear);
    warp.direction(angular, angular).scaleInPlace(1 / warp.scale);
    readPose(position, rotation);
    warp.point(position, position);
    warp.quaternion(rotation, rotation);
    writePose(node, position, rotation);
    warp.point(previousPosition, previousPosition);
    warp.quaternion(previousRotation, previousRotation);
    setScale(currentScale * warp.scale);
    teleportBody();
    body.setLinearVelocity(linear);
    body.setAngularVelocity(angular);
  }

  function capturePose() {
    readPose(previousPosition, previousRotation);
  }

  function present(alpha) {
    readPose(position, rotation);
    Vector3.LerpToRef(previousPosition, position, alpha, position);
    Quaternion.SlerpToRef(previousRotation, rotation, alpha, rotation);
    writePose(visual, position, rotation);
  }

  setScale(scale);
  capturePose();
  present(1);
  const traveler = {
    name, center, applyWarp,
    visual: { root: visual, materials, radius: () => radius * currentScale },
  };
  const unregister = portals.addTraveler(traveler);

  return {
    traveler, body, visual, capturePose, present,
    get scale() { return currentScale; },
    place({ x, y, z, yaw = 0 }) {
      position.set(x, y, z);
      Quaternion.FromEulerAnglesToRef(0, yaw, 0, rotation);
      writePose(node, position, rotation);
      teleportBody();
      body.setLinearVelocity(Vector3.ZeroReadOnly);
      body.setAngularVelocity(Vector3.ZeroReadOnly);
      capturePose();
      present(1);
      portals.resetTraveler(traveler);
    },
    push({ x, y, z }) {
      // La poussée est donnée en m/s et agit au centre, sans couple.
      linear.set(x, y, z).scaleInPlace(baseMass * currentScale ** 3);
      body.applyImpulse(linear, center(position));
    },
    state() {
      readPose(position, rotation);
      const { x, y, z } = position;
      body.getLinearVelocityToRef(linear);
      return { x, y, z, yaw: rotation.toEulerAngles().y, scale: currentScale,
        velocity: { x: linear.x, y: linear.y, z: linear.z } };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unregister();
      body.dispose();
      releaseShape(shape);
      node.dispose();
      visual.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
