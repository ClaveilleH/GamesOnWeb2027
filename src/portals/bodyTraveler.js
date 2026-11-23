import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsActivationControl, PhysicsMotionType, PhysicsPrestepType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape";
import { straddlingPortal } from "./travelers.js";

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

export function createBodyTraveler(portals, { body, visual, size, scale = 1, name = visual.name,
  straddleIgnoreMask = 0, proxy = null }) {
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
  let ignoredBits = 0;
  let straddling = null;
  let inverseWarp = null;
  const proxyNode = proxy ? new TransformNode(name + " · doublure", scene) : null;
  const proxyBody = proxy ? new PhysicsBody(proxyNode, PhysicsMotionType.DYNAMIC, false, scene) : null;
  let proxyScale = 0;
  const referenceLinear = new Vector3();
  const referenceAngular = new Vector3();
  const delta = new Vector3();
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

  function resizeShape(value) {
    const old = shape;
    shape = new PhysicsShapeBox(Vector3.ZeroReadOnly, identity, dimensions.scaleToRef(value, extents), scene);
    shape.material = old.material;
    shape.filterMembershipMask = old.filterMembershipMask;
    shape.filterCollideMask = old.filterCollideMask;
    shape.density = old.density;
    shape.isTrigger = old.isTrigger;
    body.shape = shape;
    releaseShape(old);
  }

  function setScale(value) {
    if (value === currentScale) return;
    resizeShape(value);
    body.setMassProperties({ mass: baseMass * value ** 3 });
    body.setGravityFactor(value);
    baseVisualScale.scaleToRef(value, visual.scaling);
    currentScale = value;
  }

  function teleportBody(target) {
    // Havok ne lit le nœud qu'en mode TELEPORT. Entre deux placements, la simulation le pilote.
    const prestep = target.getPrestepType();
    target.setPrestepType(PhysicsPrestepType.TELEPORT);
    try {
      plugin.setPhysicsBodyTransformation(target, target.transformNode);
    } finally {
      target.setPrestepType(prestep);
    }
  }

  // Vitesses du corps vues à travers `warp` : la rotation angulaire tourne sans changer d’échelle.
  function warpVelocities(warp, linearOut, angularOut) {
    body.getLinearVelocityToRef(linear);
    body.getAngularVelocityToRef(angular);
    warp.direction(linear, linearOut);
    warp.direction(angular, angularOut).scaleInPlace(1 / warp.scale);
  }

  function applyWarp(warp) {
    warpVelocities(warp, linear, angular);
    readPose(position, rotation);
    warp.point(position, position);
    warp.quaternion(rotation, rotation);
    writePose(node, position, rotation);
    warp.point(previousPosition, previousPosition);
    warp.quaternion(previousRotation, previousRotation);
    setScale(currentScale * warp.scale);
    teleportBody(body);
    body.setLinearVelocity(linear);
    body.setAngularVelocity(angular);
  }

  function resizeProxy(value) {
    if (value === proxyScale) return;
    const old = proxyBody.shape;
    const box = new PhysicsShapeBox(Vector3.ZeroReadOnly, identity, dimensions.scaleToRef(value, extents), scene);
    box.density = shape.density;
    box.material = { friction: 0, restitution: 0 };
    box.filterMembershipMask = 0;
    box.filterCollideMask = 0;
    proxyBody.shape = box;
    proxyBody.setMassProperties({ mass: baseMass * value ** 3 });
    old?.dispose();
    proxyScale = value;
  }

  function syncProxy() {
    if (!straddleIgnoreMask && !proxy) return;
    readPose(position, rotation);
    const previous = straddling;
    straddling = straddlingPortal(portals.portals, traveler, position, radius * currentScale);
    if (straddleIgnoreMask && !previous && straddling) {
      const mask = shape.filterCollideMask;
      ignoredBits = mask & straddleIgnoreMask;
      shape.filterCollideMask = mask & ~ignoredBits;
    } else if (previous && !straddling && ignoredBits) {
      shape.filterCollideMask |= ignoredBits;
      ignoredBits = 0;
    }
    if (!proxyBody) return;
    if (!straddling) {
      if (previous) {
        proxyBody.shape.filterMembershipMask = 0;
        proxyBody.shape.filterCollideMask = 0;
        proxyBody.setLinearVelocity(Vector3.ZeroReadOnly);
        proxyBody.setAngularVelocity(Vector3.ZeroReadOnly);
        // Hors chevauchement, la doublure dort : Havok ne l’intègre plus à chaque pas.
        plugin.setActivationControl(proxyBody, PhysicsActivationControl.ALWAYS_INACTIVE);
      }
      inverseWarp = null;
      return;
    }
    const warp = straddling.warp;
    const targetScale = currentScale * warp.scale;
    if (!previous) plugin.setActivationControl(proxyBody, PhysicsActivationControl.ALWAYS_ACTIVE);
    if (targetScale !== proxyScale || !previous) {
      resizeProxy(targetScale);
      proxyBody.shape.filterMembershipMask = proxy.membership;
      proxyBody.shape.filterCollideMask = proxy.collideMask;
    }
    warp.point(position, proxyNode.position);
    warp.quaternion(rotation, proxyNode.rotationQuaternion);
    teleportBody(proxyBody);
    warpVelocities(warp, referenceLinear, referenceAngular);
    proxyBody.setLinearVelocity(referenceLinear);
    proxyBody.setAngularVelocity(referenceAngular);
    inverseWarp = warp.inverse();
  }

  function afterStep() {
    if (!inverseWarp) return;
    // Le contrôleur peut avoir poussé la doublure avant même le pas Havok.
    proxyBody.getLinearVelocityToRef(delta);
    delta.subtractInPlace(referenceLinear);
    inverseWarp.direction(delta, delta);
    body.getLinearVelocityToRef(linear);
    body.setLinearVelocity(linear.addInPlace(delta));

    proxyBody.getAngularVelocityToRef(delta);
    delta.subtractInPlace(referenceAngular);
    inverseWarp.direction(delta, delta).scaleInPlace(1 / inverseWarp.scale);
    body.getAngularVelocityToRef(angular);
    body.setAngularVelocity(angular.addInPlace(delta));
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

  if (proxyBody) {
    proxyNode.rotationQuaternion = Quaternion.Identity();
    resizeProxy(scale);
    proxyBody.setGravityFactor(0);
    proxyBody.setLinearDamping(0);
    proxyBody.setAngularDamping(0);
    plugin.setActivationControl(proxyBody, PhysicsActivationControl.ALWAYS_INACTIVE);
  }
  // Le masque appartient à la forme. Un autre corps qui la partage garde ses collisions.
  if (straddleIgnoreMask && scale === 1 && physics.getBodies().some((other) => other !== body && other.shape === shape)) {
    resizeShape(1);
  }
  setScale(scale);
  capturePose();
  present(1);
  const traveler = {
    name, center, applyWarp,
    visual: { root: visual, materials, radius: () => radius * currentScale },
  };
  const unregister = portals.addTraveler(traveler);
  syncProxy();

  return {
    traveler, body, visual, capturePose, afterStep, syncProxy, present,
    place({ x, y, z, yaw = 0 }) {
      position.set(x, y, z);
      Quaternion.FromEulerAnglesToRef(0, yaw, 0, rotation);
      writePose(node, position, rotation);
      teleportBody(body);
      body.setLinearVelocity(Vector3.ZeroReadOnly);
      body.setAngularVelocity(Vector3.ZeroReadOnly);
      capturePose();
      present(1);
      portals.resetTraveler(traveler);
      syncProxy();
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
        velocity: { x: linear.x, y: linear.y, z: linear.z }, straddling: straddling?.name ?? null,
        proxy: straddling && proxyNode ? { x: proxyNode.position.x, y: proxyNode.position.y, z: proxyNode.position.z } : null };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unregister();
      if (proxyBody) {
        const box = proxyBody.shape;
        proxyBody.dispose();
        box.dispose();
        proxyNode.dispose();
      }
      body.dispose();
      releaseShape(shape);
      node.dispose();
      visual.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
