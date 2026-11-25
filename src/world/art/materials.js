import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";

// Fabriques de matériaux des salles de direction artistique. Les salles comptent jusqu'à sept
// lumières propres : on relève la limite par défaut (quatre).
export const MAX_LIGHTS = 8;

const color = (value) => (value instanceof Color3 ? value : Color3.FromHexString(value));

// StandardMaterial (Blinn-Phong) : `diffuse`, `specular`, `power`, `emissive`, `alpha`, `texture`,
// `emissiveTexture`, `unlit` (couleur seule, sans éclairage), `uvScale`.
export function std(scene, name, options = {}) {
  const mat = new StandardMaterial(name, scene);
  mat.maxSimultaneousLights = MAX_LIGHTS;
  mat.diffuseColor = color(options.diffuse ?? "#808080");
  mat.specularColor = color(options.specular ?? "#000000");
  mat.specularPower = options.power ?? 64;
  if (options.emissive) mat.emissiveColor = color(options.emissive);
  if (options.alpha !== undefined) mat.alpha = options.alpha;
  if (options.texture) {
    mat.diffuseTexture = options.texture;
    if (options.uvScale) Object.assign(options.texture, { uScale: options.uvScale[0], vScale: options.uvScale[1] });
  }
  if (options.emissiveTexture) mat.emissiveTexture = options.emissiveTexture;
  if (options.unlit) mat.disableLighting = true;
  return mat;
}

// PBRMaterial (métal / rugosité) : `albedo`, `metallic`, `roughness`, `emissive`, `alpha`, `texture`.
export function pbr(scene, name, options = {}) {
  const mat = new PBRMaterial(name, scene);
  mat.maxSimultaneousLights = MAX_LIGHTS;
  mat.albedoColor = color(options.albedo ?? "#808080");
  mat.metallic = options.metallic ?? 0;
  mat.roughness = options.roughness ?? 0.6;
  if (options.emissive) mat.emissiveColor = color(options.emissive);
  if (options.emissiveIntensity) mat.emissiveIntensity = options.emissiveIntensity;
  if (options.alpha !== undefined) mat.alpha = options.alpha;
  if (options.texture) mat.albedoTexture = options.texture;
  if (options.emissiveTexture) mat.emissiveTexture = options.emissiveTexture;
  // Sans environnement HDR, la lumière d'ambiance de la salle reste le seul éclairage indirect.
  mat.environmentIntensity = options.environment ?? 1;
  if (options.unlit) mat.unlit = true;
  return mat;
}

// Texture peinte au canevas, `width` × `height` pixels.
export function paintedTexture(scene, name, width, height, paint, { pixelated = false, mipmaps = true } = {}) {
  const texture = new DynamicTexture(name, { width, height }, scene, mipmaps,
    pixelated ? Texture.NEAREST_SAMPLINGMODE : Texture.TRILINEAR_SAMPLINGMODE);
  paint(texture.getContext(), width, height);
  texture.update();
  // DynamicTexture borne ses UV par défaut : une texture répétée (uScale > 1) doit boucler.
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

// Enseigne : texte centré sur fond uni (transparent si `background` est null).
export function signTexture(scene, name, text, { width = 512, height = 128, color: ink = "#ffffff", background = "#000000",
  font = "bold 72px sans-serif", glow = 0 } = {}) {
  return paintedTexture(scene, name, width, height, (ctx) => {
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = ink;
    ctx.shadowBlur = glow;
    ctx.fillStyle = ink;
    ctx.fillText(text, width / 2, height / 2, width * 0.94);
  });
}
