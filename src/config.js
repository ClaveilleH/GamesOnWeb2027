export const GRAVITY = -19;
export const FIXED_STEP = 1 / 60;
export const MAX_ACCUMULATED_TIME = 0.25;
export const SPAWN_YAW = 0;

export const PLAYER = Object.freeze({
  height: 1.92,
  radius: 0.32,
  mass: 75,
  strength: 1200,
  contactDistance: 0.025,
  contactTolerance: 0.03,
  walkSpeed: 3.6,
  runSpeed: 6.4,
  acceleration: 23,
  braking: 29,
  airAcceleration: 9,
  jumpSpeed: 6.8,
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  maxSlope: 45 * Math.PI / 180,
  maxStepHeight: 0.23,
  turnRate: 14,
  respawnBelow: -7,
  // Dans un intérieur caché (sol à y = −20), seule cette limite s'applique.
  interiorRespawnBelow: -30,
});

export const CAMERA = Object.freeze({
  shoulderHeight: 1.46,
  distance: 4.6,
  initialPitch: 0.18,
  minPitch: -0.34,
  maxPitch: 1.16,
  sensitivity: 0.0023,
  followRate: 14,
  releaseRate: 8,
  wallClearance: 0.18,
  fadeNear: 0.5,
  fadeFar: 1.2,
  minPlayerOpacity: 0.03,
  fov: 0.82,
  // Première personne (menu debug). Œil et cou dépendent du modèle (src/player/firstPersonFit.js,
  // `CHARACTERS[].firstPerson`). Le corps reste visible : la tête est coupée dans les vues dont la caméra
  // est à moins de `headCutRadius` (échelle 1) du cou (vue directe, fantôme à cheval sur un portail).
  headCutRadius: 0.6,
  // Recul de l'œil devant un mur (le plan proche et ses coins restent hors du mur).
  eyeWallClearance: 0.08,
  firstPersonPitch: 0,
  firstPersonMinPitch: -1.48,
  firstPersonMaxPitch: 1.48,
  // Plan proche hors portail (réduit près d'une ouverture, docs/PORTALS.md § 9.3) et plan lointain.
  minZ: 0.04,
  maxZ: 500,
});

// Personnages jouables. `model` à null garde le squelette procédural ; sinon un
// fichier glTF/GLB de `public/models/`. On choisit dans le menu debug (Ctrl+D), le
// choix est mémorisé. `?character=<clé>` ou `?model=<url>` force un personnage.
//   yawOffset        : rotation (radians) à ajouter si le modèle ne regarde pas vers +Z.
//   animation        : "clips" joue les clips du fichier ; "procedural" pilote les os avec la démarche
//                      du squelette ; "baked" fige cette démarche en clips keyframés. Sans rig reconnu,
//                      les deux derniers reviennent aux clips du fichier.
//   animations       : noms exacts des clips du fichier ; null = détection par mots-clés
//                      (idle, walk, run, jump, fall…). Un modèle à un seul clip le joue partout.
//   walk/runAnimationSpeed : vitesses (m/s) où marche et course tournent à vitesse normale.
//   blendRate        : vitesse de fondu entre deux animations (1/s).
//   firstPerson      : facultatif, { eyeHeight, eyeForward, headCutHeight } en mètres à l'échelle 1,
//                      pour remplacer la mesure automatique de la première personne (yeux, avancée
//                      de l'œil devant l'axe du corps, hauteur de coupe de la tête).
const modelDefaults = Object.freeze({
  yawOffset: 0, animation: "clips",
  animations: Object.freeze({ idle: null, walk: null, run: null, jump: null, fall: null }),
  walkAnimationSpeed: 1.6, runAnimationSpeed: 4.5, blendRate: 10,
});
export const CHARACTERS = Object.freeze([
  // Le squelette n'utilise pas les réglages de modèle, mais `?model=<url>` les reprend de sa base (main.js).
  Object.freeze({ ...modelDefaults, key: "squelette", label: "Squelette", model: null }),
  Object.freeze({
    ...modelDefaults, key: "shrek", label: "Shrek", model: "/models/shrek_2001_xbox_doing_toothless_dancing.glb",
    // Pilote les os avec la démarche du squelette (marche/course/idle/saut) au lieu de la danse.
    animation: "procedural",
  }),
  Object.freeze({
    ...modelDefaults, key: "shrek-clips", label: "Shrek (clips)", model: "/models/shrek_2001_xbox_doing_toothless_dancing.glb",
    // Même démarche, mais figée en vrais clips keyframés (idle/walk/run/jump/fall) et mélangée.
    animation: "baked",
  }),
]);

// Personnage par défaut en jeu. Les tests automatisés gardent le squelette (léger et stable).
export const DEFAULT_CHARACTER = "shrek";

export function characterByKey(key) {
  return CHARACTERS.find((character) => character.key === key) ?? null;
}

// URL des maps glTF/GLB par clé (docs/MAPS.md). Une map demandée par `?map=<clé>` ou `?map=<url>`
// remplace le terrain, les démos de portails et les décors `PROPS`. Sans map ou en cas d'échec,
// le jeu charge le terrain d'entraînement.
export const MAPS = Object.freeze({ arcade: "/models/maps/arcade.glb" });

// Décors fixes chargés depuis des fichiers glTF/GLB/OBJ déposés dans `public/models/`
// (voir `src/world/props.js`). Un fichier absent ou illisible est ignoré sans empêcher
// de jouer. `yaw`/`pitch` orientent le modèle (radians ; +Z du fichier vers +Z du monde
// à 0). `height` le met à l'échelle sur une hauteur en mètres (null : échelle du fichier).
// `color` applique un matériau uni (utile pour un OBJ sans .mtl). `collision: false`
// retire la boîte de collision statique. `interact` ajoute une zone d'interaction :
// `prompt` (verbe affiché « Appuyez sur E pour … »), `radius` (mètres) ; l'appui sur
// « Interagir » à portée déclenche le décor (voir `onPropInteraction` dans main.js).
export const PROPS = Object.freeze([
  Object.freeze({
    name: "borne d’arcade",
    url: "/models/borne-arcade.obj",
    position: Object.freeze({ x: 6, y: 0, z: -6 }),
    yaw: Math.PI,
    pitch: 0,
    height: 1.8,
    color: "#6b7280",
    collision: true,
    interact: Object.freeze({ prompt: "jouer", radius: 2.2 }),
  }),
]);
