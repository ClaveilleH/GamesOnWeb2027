import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Clamp } from "@babylonjs/core/Maths/math.scalar.functions";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

// Le ciel n’est pas un maillage : le quad de fond du renderer le peint, pour la passe racine
// (après le décor, là où la profondeur est restée à 1) comme pour chaque passe de portail (étape 2a).
// Ce module ne garde que ses paramètres et le GLSL partagé.

export const clearFogEnd = 1e9;

export const skyColorGlsl = `
vec4 computePortalSky(vec3 direction) {
  vec3 d = normalize(direction);
  float above = smoothstep(-0.12, 0.08, d.y);
  float elev = smoothstep(-0.02, 0.85, d.y);
  float glow = pow(max(dot(d, sunDirection), 0.0), sunExponent) * above;
  float t = clamp(above * (0.20 + 0.80 * elev) + sunStrength * glow, 0.0, 1.0);
  vec3 sky = t < 0.5
    ? mix(horizonColor, midColor, t * 2.0)
    : mix(midColor, zenithColor, (t - 0.5) * 2.0);
  return vec4(mix(sky, veilColor, veilFactor), 1.0);
}
`;

export function skyVeilFactor(scene, maxZ) {
  if (scene.fogEnabled && scene.fogMode === Scene.FOGMODE_LINEAR && Number.isFinite(scene.fogEnd) && scene.fogEnd < clearFogEnd) {
    const range = scene.fogEnd - scene.fogStart;
    return range > 0 ? Clamp((maxZ - scene.fogStart) / range, 0, 1) : (maxZ >= scene.fogEnd ? 1 : 0);
  }
  return 0;
}

function toColor3(value, fallback) {
  if (!value) return Color3.FromHexString(fallback);
  return typeof value === "string" ? Color3.FromHexString(value) : value.clone();
}

function toUnitVector3(value, fallback) {
  const vector = value ? new Vector3(value.x, value.y, value.z) : fallback.clone();
  return vector.lengthSquared() > 0 ? vector.normalize() : fallback.clone();
}

export function createPortalSky(options = {}) {
  const { sunExponent = 5.5, sunStrength = 0.68 } = options;
  const zenithColor = toColor3(options.zenithColor, "#e1dfbd");
  const midColor = toColor3(options.midColor, "#adc2b2");
  const horizonColor = toColor3(options.horizonColor, "#789b95");
  const sunDirection = toUnitVector3(options.sunDirection, new Vector3(0.28, 0.24, 0.93).normalize());
  const params = Object.freeze({ zenithColor, midColor, horizonColor, sunDirection, sunExponent, sunStrength });
  let disposed = false;
  return {
    params,
    get disposed() { return disposed; },
    dispose() { disposed = true; },
  };
}
