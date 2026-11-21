import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { PortalLayers } from "./layers.js";
import { apertureCorners, insideAperture, portalBasis, signedDistance } from "./math.js";

const apertureShader = Object.freeze({
  vertexSource: `
    attribute vec3 position;
    uniform mat4 world;
    uniform mat4 viewProjection;
    void main() { gl_Position = viewProjection * world * vec4(position, 1.0); }
  `,
  fragmentSource: `
    precision highp float;
    void main() { gl_FragColor = vec4(0.0); }
  `,
});

export function createPortal(scene, { name, origin, yaw, width, height, sides = "front", apertureMargin = 0.03 }) {
  if (!(width > 0 && height > 0) || !["front", "both"].includes(sides)) {
    throw new Error("Ouverture ou faces de portail invalides.");
  }
  const position = new Vector3(origin.x, origin.y, origin.z);
  const portal = {
    name, origin: position, yaw, width, height, sides, ...portalBasis(yaw),
    target: null, warp: null,
    signedDistance(point) { return signedDistance(portal, point); },
    contains(localPoint) { return insideAperture(portal, localPoint); },
  };
  const aperture = CreatePlane(name + " · ouverture", { size: 1 }, scene);
  aperture.layerMask = PortalLayers.internal;
  aperture.isPickable = false;
  aperture.position.copyFrom(origin);
  aperture.position.y += height / 2;
  aperture.rotation.y = yaw;
  aperture.material = new ShaderMaterial(name + " · masque", scene, apertureShader, {
    attributes: ["position"], uniforms: ["world", "viewProjection"],
  });
  aperture.material.backFaceCulling = false;
  aperture.material.disableColorWrite = true;
  const corners = apertureCorners(portal);
  const outline = CreateLines(name + " · contour", { points: [...corners, corners[0]], useVertexAlpha: false }, scene);
  outline.isPickable = false;
  outline.layerMask = PortalLayers.world;
  outline.setEnabled(false);

  function setMargin(margin) {
    aperture.scaling.set(width + margin * 2, height + margin * 2, 1);
    aperture.computeWorldMatrix(true);
    apertureCorners(portal, margin, corners);
  }
  setMargin(apertureMargin);
  return Object.assign(portal, { aperture, outline, corners, setMargin });
}
