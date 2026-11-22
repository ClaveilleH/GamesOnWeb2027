import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CAMERA } from "../config.js";

// Réglages de la première personne mesurés sur la géométrie du personnage, dans le repère de sa
// racine (pieds à l'origine, face vers +Z, échelle 1), au repos, avant toute animation :
//   headCutHeight : haut des épaules. En descendant depuis le sommet du crâne, première tranche
//                   horizontale nettement plus large que la tête déjà parcourue. Un cou pincé ne se
//                   détecte pas toujours (crâne fait de pièces disjointes, personnage sans cou, oreilles
//                   larges). Au-dessus, tout est coupé dans les vues dont la caméra est dans la tête ;
//   eyeHeight     : à mi-hauteur entre le cou et le sommet du crâne ;
//   eyeForward    : avancée de l'œil devant l'axe du corps, pour qu'en regardant en bas on voie le
//                   corps et les pieds plutôt que l'intérieur des épaules : l'avant du haut du torse,
//                   plus ce que le champ de vision s'évase entre l'œil et les épaules. Devant un mur,
//                   la caméra recule l'œil (test de collision), quelle que soit cette avancée.
// `overrides` (CONFIG `CHARACTERS[].firstPerson`) remplace une mesure qui ne convient pas.
const slices = 40;
const neckBand = [0.6, 1];
const shoulderRatio = 1.4;
// Le crâne s’arrondit en haut : sa largeur se lit sur ce dixième supérieur avant de chercher les épaules.
const crownDepth = 0.1;
const chestDepth = 0.15;

export function measureFirstPerson(root, meshes, overrides = {}) {
  root.computeWorldMatrix(true);
  const toRoot = root.getWorldMatrix().clone().invert();
  const transform = new Matrix();
  const point = new Vector3();
  const points = [];
  for (const mesh of meshes) {
    const data = mesh.getPositionData?.(true, true) ?? mesh.getVerticesData("position");
    if (!data?.length) continue;
    mesh.computeWorldMatrix(true).multiplyToRef(toRoot, transform);
    for (let i = 0; i < data.length; i += 3) {
      Vector3.TransformCoordinatesFromFloatsToRef(data[i], data[i + 1], data[i + 2], transform, point);
      points.push(point.x, point.y, point.z);
    }
  }
  return { ...fitFromPoints(points), ...overrides };
}

// `points` : x, y, z à la suite. Exporté pour les tests.
export function fitFromPoints(points) {
  let top = 0;
  for (let i = 1; i < points.length; i += 3) top = Math.max(top, points[i]);
  if (!(top > 0)) return { eyeHeight: 0, eyeForward: 0, headCutHeight: 0 };

  // Largeur (x) de chaque tranche de la bande du cou ; une tranche vide (os disjoints) compte pour 0.
  const low = neckBand[0] * top;
  const step = (neckBand[1] - neckBand[0]) * top / slices;
  const min = new Array(slices).fill(Infinity);
  const max = new Array(slices).fill(-Infinity);
  for (let i = 0; i < points.length; i += 3) {
    const slice = Math.floor((points[i + 1] - low) / step);
    if (slice < 0 || slice >= slices) continue;
    min[slice] = Math.min(min[slice], points[i]);
    max[slice] = Math.max(max[slice], points[i]);
  }
  // Sans épaules détectées, coupe à 82 % de la hauteur (proportions humaines).
  let headCutHeight = 0.82 * top;
  const crown = (1 - crownDepth) * top;
  for (let s = slices - 1, head = 0; s >= 0; s--) {
    const width = max[s] >= min[s] ? max[s] - min[s] : 0;
    if (low + (s + 1) * step <= crown && head > 0 && width > shoulderRatio * head) {
      headCutHeight = low + (s + 1) * step;
      break;
    }
    head = Math.max(head, width);
  }
  const eyeHeight = (headCutHeight + top) / 2;

  let chestFront = 0;
  for (let i = 0; i < points.length; i += 3) {
    const y = points[i + 1];
    if (y <= headCutHeight && y >= headCutHeight - chestDepth * top) chestFront = Math.max(chestFront, points[i + 2]);
  }
  const spread = Math.tan(CAMERA.fov / 2) * (eyeHeight - headCutHeight);
  return { eyeHeight, eyeForward: chestFront + spread, headCutHeight };
}
