import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

// Teintes du ciel peint par le système de portails (docs/PORTALS.md § 12.1), reprises du
// dégradé CSS affiché pendant le chargement (src/style.css), lueur calibrée sur la vue de départ.
export const skyPalette = Object.freeze({
  zenithColor: "#e1dfbd",
  midColor: "#adc2b2",
  horizonColor: "#789b95",
  sunDirection: new Vector3(0.28, 0.24, 0.93),
});

// Lumière d'ambiance, soleil et son unique générateur d'ombres (règles d'éclairage : docs/PORTALS.md § 11).
export function createLighting(scene) {
  const ambient = new HemisphericLight("ciel", Vector3.Up(), scene);
  ambient.intensity = 0.72;
  ambient.groundColor = Color3.FromHexString("#76918b");
  const sun = new DirectionalLight("soleil", new Vector3(-0.58, -1, 0.48), scene);
  // Le volume fixe englobe la dalle et les intérieurs cachés à −20 m, même hors champ.
  sun.direction.scaleToRef(-90, sun.position);
  sun.shadowFrustumSize = 150;
  sun.intensity = 0.78;
  sun.diffuse = Color3.FromHexString("#ffecd3");
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 200;
  // 4096 texels sur 150 m : environ 3,7 cm par texel, comme l'ancienne carte sur la seule zone d'entraînement.
  const shadows = new ShadowGenerator(4096, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  // Le personnage continue de projeter son ombre pendant le fondu de proximité.
  shadows.transparencyShadow = true;
  // Seules les faces arrière, dans l'ombre de toute façon, s'écrivent dans la carte : pas d'acné sur les faces éclairées.
  shadows.forceBackFacesOnly = true;
  shadows.bias = 0.00015;
  shadows.normalBias = 0.006;
  shadows.setDarkness(0.2);
  return { sun, shadows };
}
