# Portails non euclidiens

Ce document décrit le système de portails du moteur : architecture, API, flux de rendu, traversée, échelle, intégration au joueur et à la caméra, règles de conception des niveaux, démos et limites connues. Il sert de référence à chaque tâche de développement. Toute évolution de l’architecture doit y être reportée.

## 1. Objectif et périmètre

Le module `src/portals/` est générique. Il ne contient rien de propre aux démos : il expose une API pour créer des portails, les lier deux à deux, régler la récursion et rendre un objet capable de les traverser. Les démos (`src/world/portalDemos.js`) utilisent seulement cette API publique.

Contraintes retenues :

- Babylon.js 9.37, WebGL 2, Havok, JavaScript ES modules, Vite.
- Rendu par stencil buffer, avec une récursion bornée et une projection oblique qui coupe tout ce qui se trouve derrière le plan du portail de destination.
- Profondeur de récursion configurable (4 par défaut, 3 à 5 recommandé). Au-delà, on remplit le portail avec une couleur de repli et on applique un voile de brouillard continu, sans trou ni artefact.
- Traversée par le joueur, la caméra à la troisième personne (indépendamment du joueur) et les corps dynamiques Havok. Un objet en pleine traversée n’est jamais visiblement coupé en deux.
- Un portail peut changer l’échelle. Pour le joueur, l’échelle est réelle : capsule Havok, vitesses, hauteur de saut et distance de caméra suivent.
- Éclairage et ombres cohérents à travers les portails (voir § 11).

## 2. Référence : HackerPoet/NonEuclidean

Ce qu’on reprend du projet C++ de HackerPoet :

- Un portail est un rectangle vertical avec un repère local. Un lien entre deux portails définit une transformation rigide avec échelle, le « warp » (`Portal::Connect`, `delta = A.LocalToWorld × B.WorldToLocal`).
- La caméra virtuelle d’un portail est la caméra courante composée avec le warp. Sa projection est rendue oblique (méthode de Lengyel, `Camera::ClipOblique`) pour couper ce qui se trouve entre la caméra virtuelle et le portail de destination.
- La récursion est limitée (`GH_MAX_RECURSION = 4`). Le portail de destination est exclu des candidats de la passe suivante (`skipPortal`). En fin de chaîne, on dessine une couleur de repli (le rose de `DrawPink`).
- La traversée se détecte par le segment entre la position précédente et la position courante qui coupe le plan à l’intérieur du rectangle (`Portal::Intersects`). La position, la vitesse et l’orientation sont alors transformées par le warp, et l’échelle est multipliée par celle du warp (`Physical::TryPortal`).
- Le plan proche de la caméra s’adapte à la distance au portail le plus proche (`NearestPortalDist() * 0.5`, borné). Un léger décalage, le « bump », évite qu’un objet reste exactement sur le plan.

Ce qui diffère :

- HackerPoet rend chaque niveau de récursion dans un FBO (texture plein écran) lu en espace écran. Ici, on utilise le stencil du framebuffer principal, comme demandé. On évite ainsi la mémoire et les copies des FBO, et le résultat reste à la résolution native.
- HackerPoet n’a pas de troisième personne, d’ombres portées, de physique rigide ni de fantômes d’objets à cheval. Ces parties sont propres à ce moteur.

## 3. Conventions

### 3.1 Repères et unités

- Babylon est en main gauche : +X à droite, +Y en haut, +Z vers l’avant. Le lacet (`yaw`) est `rotation.y`. La direction avant d’un lacet θ est `(sin θ, 0, cos θ)`. Le code existant suit déjà cette convention (`playerController`, `thirdPersonCamera`).
- Les distances sont en mètres et les angles en radians.
- Les portails sont **verticaux** : leur normale est horizontale et seul leur lacet varie. Les warps sont donc une rotation autour de Y, une translation et une échelle uniforme. La gravité et l’axe vertical sont préservés. C’est le même choix que HackerPoet (`assert(euler.x == 0 && euler.z == 0)`).

### 3.2 Repère d’un portail

- `origin` : centre du **bas** de l’ouverture, au niveau du sol.
- `yaw` : lacet du portail. Axes locaux : `right = (cos yaw, 0, −sin yaw)`, `up = (0, 1, 0)`, `normal = (sin yaw, 0, cos yaw)`.
- La normale pointe vers la **face avant**. Un point `p` est devant le portail si `d(p) = normal · (p − origin) > 0`.
- Ouverture : `width × height`. En local, un point est dans l’ouverture si `|x| ≤ width/2` et `0 ≤ y ≤ height`.
- `sides` : `"front"` (portail à sens unique) ou `"both"` (rendu et traversable des deux côtés).

### 3.3 Warp

Pour un lien A → B, entrer par la face avant de A fait sortir par la face avant de B. Le mouvement s’inverse donc par rapport à la normale (retournement de π autour de Y) :

```
Δ  = yaw_B + π − yaw_A                    (rotation de lacet)
s  = B.width / A.width                    (échelle uniforme ; B.height / A.height doit être égal, à 1e-6 près)
W(p)    = origin_B + s · R_y(Δ) · (p − origin_A)
W.dir(v) = s · R_y(Δ) · v                 (vitesses, déplacements)
W.yaw(θ) = θ + Δ
W⁻¹ = warp B → A
```

`R_y(Δ)` est la rotation Babylon `Matrix.RotationY(Δ)` (`Quaternion.RotationAxis(Y, Δ)`). Pour un lien purement translatif, `yaw_B = yaw_A − π` (les deux faces avant sont opposées), ce qui donne `Δ ≡ 0 (mod 2π)`.

Le même warp s’applique quand on traverse A par l’arrière (portail `"both"`) : un point derrière A arrive derrière B. Entrer par l’arrière de A fait donc sortir par l’arrière de B.

### 3.4 Matrices Babylon

Babylon utilise des vecteurs-lignes : `p' = p · M`, et `a.multiply(b)` applique `a` puis `b`. Dans le tableau `m[16]`, la translation est en `m[12..14]`. La « ligne i » de la convention colonne d’OpenGL correspond à la colonne `(m[i], m[4+i], m[8+i], m[12+i])` de Babylon. Le NDC de WebGL va de −1 à 1 en z (`engine.isNDCHalfZRange === false`). Le tampon de profondeur inversé n’est pas utilisé.

### 3.5 Plans de coupe de Babylon

`material.clipPlane = new Plane(a, b, c, d)` **rejette** les fragments où `a·x + b·y + c·z + d > 0` (`clipPlaneFragment` : `if (fClipDistance > 0.0) discard;`). Le plan est par matériau. Le générateur d’ombres en tient compte. La présence du plan active le define `CLIPPLANE`. Ses coefficients sont des uniformes que l’on peut changer à chaque image.

### 3.6 Modèle d’échelle relative

Une entité d’échelle `s` se comporte comme une copie homothétique d’elle-même : longueurs × s, vitesses × s, accélérations (gravité comprise) × s, masses × s³, durées inchangées. Un joueur réduit vit donc la scène comme un monde agrandi : sauts de même durée et de hauteur × s, marche de même cadence. Les scènes vues à travers un portail d’échelle restent ainsi cohérentes : la mini-scène vue par un mini-joueur ressemble à la scène normale vue par un joueur normal.

### 3.7 Calques (`layerMask`)

`src/portals/layers.js` exporte :

```js
export const PortalLayers = Object.freeze({ world: 0x1, late: 0x2, internal: 0x4 });
```

- `world` : géométrie opaque, dessinée avant les portails de la passe. Le `layerMask` par défaut des maillages Babylon (`0x0FFFFFFF`) contient ce bit. Rien à faire pour le décor.
- `late` : objets dessinés **après** les portails de la passe : le joueur (qui s’estompe), les fantômes, tout maillage transparent. Leur `layerMask` vaut exactement `PortalLayers.late`.
- `internal` : maillages internes au système (ouvertures, quad plein écran). Ils ne sont jamais dessinés par une caméra Babylon.
- La caméra principale reçoit `layerMask = PortalLayers.world`.

## 4. Modules et responsabilités

| Fichier | Responsabilité |
| --- | --- |
| `src/portals/math.js` | Fonctions pures, sans scène : warps (création, inverse, composition, détection de rotation `hasWarpRotation`, application à un point, une direction, un lacet, une matrice, un plan `warpPlane`), plans et second plan de fantôme (`secondaryGhostClipPlane`), distance signée, franchissement d’un segment, intersection rayon–ouverture, détection d’ombre portée à travers un portail, distance point–ouverture, projection oblique de Lengyel, rectangle écran d’une ouverture (découpée contre le plan proche), plans du frustum et du prisme lumineux d’ouverture. Seules les classes mathématiques de Babylon sont utilisées (`Vector3`, `Matrix`, `Quaternion`, `Plane`). Testable sous Node. |
| `src/portals/layers.js` | Constantes de calques (§ 3.7). |
| `src/portals/portal.js` | `createPortal(scene, options)` : données d’un portail (repère, ouverture, faces, lien, warp en cache), maillage d’ouverture interne, contour de debug. |
| `src/portals/renderer.js` | Rendu : arbre de passes de l’image, caméras virtuelles, projection oblique, opérations stencil, passes `ObjectRenderer`, repli, voile, statistiques. |
| `src/portals/sky.js` | `createPortalSky(options)` (appelée par `portals.createSky`) : paramètres du ciel (trois teintes, direction et force de la lueur solaire), GLSL du dégradé (`skyColorGlsl`) et calcul du voile (`skyVeilFactor`). Le ciel n’est pas un maillage : le quad de fond du renderer le peint dans la passe racine et dans chaque passe de portail (§ 6.4). |
| `src/portals/travelers.js` | Voyageurs : détection des franchissements (pas fixe), appel du warp, recherche des portails chevauchés (jusqu’à deux plus proches pour les fantômes, le plus proche pour les corps et les ombres), plans de coupe au rendu, double fantôme et projecteurs d’ombre traversants. |
| `src/portals/bodyTraveler.js` | Adaptateur générique pour un corps dynamique Havok (`PhysicsBody`) : téléportation, vitesses, échelle de la forme, de la masse et de la gravité, filtrage du corps à cheval, doublure physique facultative et interpolation du visuel. |
| `src/portals/cameraPath.js` | Chemin de vue à travers les portails pour la caméra à la troisième personne : segments, collisions, warp cumulé, garde ε, plan proche adaptatif. |
| `src/portals/system.js` | `createPortalSystem(scene, options)` : façade publique, registre des portails et des voyageurs, réglages, observables, branchement sur la boucle de rendu, `dispose`. |
| `src/portals/index.js` | Exports publics. |
| `src/dev/devHook.js` | Hook de pilotage réservé au mode dev (§ 10.3). |
| `src/core/physics.js`, `src/world/crates.js` | Calques de collision Havok du jeu et choix des masques du corps et de sa doublure (§ 7.4). |
| `src/world/portalDemos.js` | Les cinq zones de démonstration (§ 12), avec uniquement l’API publique. |

Intégration hors module : `src/main.js` (création du système, ordre de la boucle), `src/player/playerController.js` (échelle et `applyWarp`), `src/player/thirdPersonCamera.js` (chemin de vue, échelle), `src/player/skeletonVisual.js` (calque `late`, échelle), `src/ui/hud.js` (overlay F3), `src/world/testTerrain.js` (carte agrandie), `src/world/crates.js` (caisses), `src/world/lighting.js` (soleil, générateur d’ombres et palette du ciel).

## 5. API publique

```js
import { createPortalSystem, PortalLayers } from "./portals/index.js";

const portals = createPortalSystem(scene, {
  camera,                         // caméra principale (TargetCamera), déjà active dans la scène
  maxDepth: 4,                    // profondeur de récursion (bornée à [0, 8] ; 0 : les ouvertures montrent le repli)
  maxPasses: 48,                  // budget de passes de scène par image, hors passe racine
  fallbackColor: Color3,          // couleur de repli et du voile (défaut #9fb8ad, proche de l’horizon)
  haze: true,                     // voile continu vers la couleur de repli (§ 6.6)
  hazeRange: 12,                  // largeur de la bande voilée avant le repli, en mètres apparents
  hazeMinRange: 4,                // étendue minimale du voile, en mètres apparents
  hazeSmoothing: 8,               // taux de lissage de la distance de fin du voile (s⁻¹), 0 pour une réponse immédiate
  hazeLevels: 2,                  // nombre de niveaux de récursion voilés, en partant du plus profond (§ 6.6)
  apertureMargin: 0.03,           // débord de l’ouverture dessinée sur le cadre (anti-fissures)
  clipBias: 0.01,                 // recul × échelle cumulée, plafonné à la moitié de la distance œil–plan
  portalShadows: true,            // prolonge les ombres portées des voyageurs à travers les portails (§ 7.5)
  isLightBlocked: null,           // facultatif : (origin, towardLight, maxDistance) => boolean, coupe le projecteur d’ombre si la lumière est bloquée (§ 7.5)
});

const a = portals.createPortal({
  name: "arche nord",
  origin: new Vector3(0, 0, 31),  // centre du bas de l’ouverture (Vector3 ou { x, y, z })
  yaw: Math.PI,                   // normale avant = (sin yaw, 0, cos yaw)
  width: 2.4, height: 3,
  sides: "both",                  // "front" | "both"
});
const b = portals.createPortal({ /* … */ });
portals.link(a, b, {              // lien bidirectionnel ; l’échelle vient des tailles (B.width / A.width)
  allowRotation: false,           // true : assume un lien tourné (Δ ≢ 0 mod 2π) sans avertissement console.warn (§ 11.1)
});
portals.unlink(a);
portals.removePortal(a);          // délie, retire du registre, libère les maillages et met à jour les fantômes

portals.settings.maxDepth = 5;    // réglable à chaud, comme maxPasses, fallbackColor, haze, hazeSmoothing, hazeLevels et portalShadows
portals.stats;                    // { passes, depthReached, fallbacks, visiblePortals, haze } de la dernière image
portals.setDebugVisible(true);    // contours des portails
portals.resetHaze();              // après une téléportation directe ou une réapparition, avant le prochain rendu
const sky = portals.createSky({   // ciel voilable (§ 6.4, § 6.6) peint par le quad de fond, à la racine comme dans les passes de portail ; libéré par dispose()
  zenithColor: "#e1dfbd",         // teinte zénithale et de lueur (Color3 ou hexadécimal)
  midColor: "#adc2b2",            // teinte médiane
  horizonColor: "#789b95",        // teinte à l’horizon et au-dessous
  sunDirection: Vector3,          // direction de la lueur solaire (normalisée)
  sunExponent: 5.5,               // concentration angulaire de la lueur
  sunStrength: 0.68,              // intensité de la lueur
});

const unregister = portals.addTraveler(adapter);   // voir ci-dessous
portals.updateTravelers();        // à chaque pas fixe, après la physique : franchissements → adapter.applyWarp
portals.updateGhosts();           // à chaque image, après la pose des visuels : fantômes (jusqu’à 2), plans de coupe et projecteurs d’ombre
portals.onTraverseObservable;     // Observable<{ traveler, portal, warp }>
portals.resetTraveler(adapter);   // après un placement direct (réapparition, hook dev) : oublie la position précédente
portals.syncGhostAppearance(adapter);   // répercute tout de suite alpha et visibility sur tous les fantômes actifs et le projecteur d’ombre
portals.activeGhosts;             // nombre total de fantômes affichés (jusqu’à 2 par voyageur)
portals.isGhostActive(adapter);   // indique si au moins un fantôme de ce voyageur est affiché
portals.ghostCount(adapter);      // nombre de fantômes affichés pour ce voyageur (0, 1 ou 2)
portals.activeShadowCasters;      // nombre de projecteurs d’ombre traversants actifs
portals.isShadowCasterActive(adapter);   // indique si le projecteur d’ombre de ce voyageur est actif

portals.traceView(origin, direction, distance, options);   // § 9
portals.nearestPortalDistance(point);                      // distance à l’ouverture la plus proche
portals.dispose();
```

Objet `portal` : `{ name, origin, yaw, width, height, sides, target, warp, normal, right, signedDistance(p), contains(localPoint) }`. Le `warp` va de ce portail vers `target`, ou vaut `null` si le portail n’est pas lié. Changer le repère d’un portail après sa création n’est pas pris en charge en v1. Les portails sont statiques.

Objet `warp` (renvoyé par `math.js`) : `{ rotationY, scale, translation, matrix, point(p, out), direction(v, out), yaw(θ), quaternion(q, out), inverse() }`. `matrix` est la `Matrix` Babylon équivalente. `quaternion(q)` renvoie `R_y(Δ) ⊗ q`. `hasWarpRotation(warp, tolerance = 1e-6)` teste si `|normalizeYaw(warp.rotationY)| > tolerance` (`Δ ≢ 0 mod 2π`).

Option de `portals.link(a, b, options)` : si `hasWarpRotation(warp)` est vrai (tolérance `1e-6`) et qu’au moins une lumière directionnelle de la scène possède un générateur d’ombres, `link` crée le lien mais émet **une seule fois par paire de portails** (dans un sens ou dans l’autre) un avertissement `console.warn` qui explique la limite d’éclairage et la marche à suivre (orienter `yaw_B = yaw_A − π`, ou passer `{ allowRotation: true }` pour assumer la rotation, § 11.1). Avec `allowRotation: true`, ou dans une scène sans lumière directionnelle à ombres, aucun avertissement n’est émis.

### 5.1 Contrat d’un voyageur

```js
portals.addTraveler({
  name: "joueur",
  center(out) { /* écrit dans out le point simulé testé (centre de capsule, centre du corps) */ return out; },
  canTraverse(portal) { return true; },          // facultatif
  applyWarp(warp, portal) { /* transforme position, vitesse, orientation, échelle et la pose précédente d’interpolation */ },
  visual: {                                      // facultatif : active les fantômes et ombres traversantes
    root,                                        // TransformNode racine du visuel (pose interpolée de l’image)
    radius() { return 1.1 * scale; },            // rayon englobant du visuel, échelle comprise
    center(out) { /* facultatif : centre du visuel (défaut : position monde de root) */ return out; },
    materials,                                   // matériaux exclusifs au voyageur (le système les clone pour le fantôme et l’ombre)
  },
});
```

`addTraveler` exige des matériaux **exclusifs** : le plan de coupe est posé sur le matériau. L’adaptateur clone donc les matériaux partagés avant l’enregistrement. Le système synchronise à chaque image `alpha` et `visibility` des matériaux du fantôme avec ceux de l’original.

Les clones du fantôme et du projecteur d’ombre ne rejoignent que les cartes d’ombre qui contiennent **déjà** les maillages du visuel. Il faut donc inscrire le visuel auprès de ses générateurs d’ombres (`addShadowCaster`) **avant** `addTraveler`, comme le font `src/world/crates.js` et `src/main.js`. Sinon le voyageur n’a ni ombre de fantôme ni projecteur d’ombre traversante.

`createBodyTraveler(portals, { body, visual, size, scale, name, straddleIgnoreMask, proxy })` adapte un corps dynamique Havok de forme boîte (§ 7.4). `size` donne le côté ou les trois dimensions à l’échelle 1. `scale` vaut 1 par défaut et `name` reprend le nom du visuel.

- `straddleIgnoreMask` (0 par défaut) donne les bits à retirer du masque de collision du corps pendant le chevauchement.
- `proxy: { membership, collideMask }` active une doublure et définit ses collisions. Omettre cette option conserve le comportement d’un corps unique. Le module ne dépend d’aucun calque du jeu.
- L’objet renvoyé par `createBodyTraveler` expose `capturePose()`, `afterStep()`, `syncProxy()` et `present(alpha)`. Les trois premiers appels encadrent Havok et les franchissements dans l’ordre du § 7.1. `place(pose)` synchronise aussi la doublure avant de rendre la main. `state()` expose `straddling` et `proxy` (§ 10.3). `dispose()` libère le corps, la doublure, leurs formes et les nœuds associés.

## 6. Flux de rendu

### 6.1 Pourquoi `ObjectRenderer` plutôt que `scene.activeCameras`

`Scene.render` appelle `_processSubCameras(camera, cameraIndex > 0)`. Pour chaque caméra après la première, cela efface **la profondeur et le stencil** (`_bindFrameBuffer` → `_clearFrameBuffer` → `engine.clear(null, false, true, true)`), sans option pour l’éviter. Une liste `activeCameras` détruirait donc le stencil entre deux niveaux.

`ObjectRenderer` (public depuis Babylon 7) dessine une liste de maillages avec une caméra donnée dans le framebuffer **courant**, sans l’effacer. `initRender` règle les matrices et l’UBO de scène (un UBO par appel dans l’image). On l’utilise pour toutes les passes de portail. Ses limites : il ne fait pas de culling (on lui fournit la liste via `getCustomRenderList`), et il vide la profondeur et le stencil au début d’un groupe de rendu > 0 si la scène l’a configuré ainsi. Le système appelle donc `scene.setRenderingAutoClearDepthStencil(i, false)` pour i = 1 à 3.

### 6.2 Déroulé d’une image

1. `scene.onBeforeRenderObservable` (main.js) : logique du jeu au pas fixe, pose des visuels, `portals.updateGhosts()`, caméra (`traceView`).
2. `scene.onBeforeCameraRenderObservable` (caméra principale) : le renderer construit l’**arbre de passes** sur le CPU (§ 6.3) et règle la caméra principale (`layerMask = world`, brouillard neutre).
3. Babylon rend la caméra principale : évaluation des maillages actifs filtrée par un fournisseur `scene.getActiveMeshCandidates` dédié (propriété publique de Babylon, restaurée dans `dispose()`, tableau `{ data, length }` réutilisé sans allocation) qui ne soumet que les maillages actifs du calque `world` (`(layerMask & camera.layerMask) !== 0 && isEnabled()`), cartes d’ombre (une fois par image), puis maillages `world` visibles. Les maillages `late` et projecteurs d’ombre (calque 0), exclus de l’évaluation principale, gardent des matrices monde exactes dans la carte d’ombre : `ShadowGenerator` lit `effectiveMesh.getWorldMatrix()`, qui rappelle `computeWorldMatrix()` dès que `scene.getRenderId()` a progressé (incrémenté avant chaque cible de rendu). Le stencil vaut 0 partout (`autoClearDepthAndStencil`), et son test est désactivé pour la passe racine.
4. `scene.onAfterDrawPhaseObservable` (caméra principale) : le renderer parcourt l’arbre en profondeur d’abord (§ 6.4), puis dessine les maillages `late` de la racine avec la caméra principale (stencil `EQUAL 0`).
5. Le renderer restaure l’état du moteur : stencil désactivé, masque 0xFF, profondeur `LEQUAL` et écriture active, couleur active, scissor désactivé, brouillard de la scène restauré.

Les cartes d’ombre ne sont rendues qu’à l’étape 3. Les passes de portail les réutilisent, donc les ombres sont identiques dans toutes les passes.

### 6.3 Arbre de passes (CPU)

Un nœud contient : `level` (0 pour la racine), `camera` (caméra principale ou caméra virtuelle d’un pool de `TargetCamera`), `portal` (l’ouverture vue depuis le parent, `null` pour la racine), `dest` (le portail de destination, dont le plan est le plan oblique), `scale` (échelle cumulée σ depuis la racine), `rect` (rectangle de scissor en pixels), `planes` (plans de culling), `children`, `fallback` (booléen) et `subtree` (enfant de la racine dont il descend).

Les candidats enfants d’un nœud N sont les portails P liés, avec `P ≠ N.dest`, qui vérifient :

1. Bon côté : `d = P.signedDistance(eye_N)`. Si `P.sides === "front"` et `d ≤ 0`, ou si `|d| < 1e-5`, on ignore P.
2. Frustum : les 4 coins de l’ouverture de P ne sont pas tous hors d’un même plan de `N.planes` (convention Babylon : un point est dedans si `plane.dotCoordinate(p) ≥ 0`).
3. Rectangle : le polygone de l’ouverture est découpé en espace clip contre `z ≥ −w` (plan proche, oblique compris) et `w > 1e-6` (Sutherland–Hodgman), puis projeté en pixels. Son intersection avec `N.rect` doit faire au moins 1 px de côté. Le résultat devient `C.rect`.

Les enfants sont triés du plus proche au plus loin. Un enfant C devient un **nœud de repli** si `C.level > maxDepth` ou si le budget `maxPasses` est épuisé (parcours en profondeur d’abord, budget global). Un nœud de repli n’a pas d’enfants.

Caméra virtuelle de C, avec `W = P.warp` et `D = P.target` :

- `position = W.point(eye_N)` et `rotationQuaternion = W.quaternion(rotation_N)`. La rotation de N se déduit de sa matrice monde : `Matrix.decompose`, ou `rotationQuaternion` pour une caméra virtuelle. Le repère reste rigide : l’échelle n’entre pas dans la matrice de vue, la projection perspective étant invariante en x et y.
- Projection de base : `Matrix.PerspectiveFovLHToRef(fov, aspect, minZ·σ_C, maxZ·σ_C, out, fovMode === FOVMODE_VERTICAL_FIXED)`, avec `fov`, `aspect`, `minZ` et `maxZ` de la caméra principale.
- Le plan de coupe de D garde le demi-espace **opposé** à l’œil virtuel. Son recul vers l’œil est plafonné (§ 6.5). On fige la projection obtenue avec `camera.freezeProjectionMatrix(m)`.
- `planes` : les plans de `Frustum.GetPlanesToRef(view × projOblique)`, plus les 4 plans qui passent par l’œil virtuel et chaque bord de l’ouverture de D (marge `apertureMargin`), orientés vers l’intérieur. Seuls les maillages visibles à travers D sont donc dessinés.
- σ_C = σ_N × W.scale.

Liste de maillages d’une passe : `scene.meshes` filtrés par calque (`world` ou `late`), `isEnabled()`, `isVisible`, `visibility > 0`, présence de sous-maillages et `isInFrustum(planes)` (ainsi que la pyramide d’ouverture pour un nœud non racine). Les maillages marqués `alwaysSelectAsActiveMesh` contournent le culling de frustum et de pyramide.

### 6.4 Parcours stencil (pré-ordre)

Notation : N est un nœud de niveau k, C un enfant de niveau k + 1. Les références stencil valent le niveau. Le scissor du moteur vaut `C.rect` pendant tout le traitement de C, puis revient à `N.rect` (racine : pas de scissor).

| Étape | Liste dessinée | Caméra | Couleur | Profondeur | Stencil |
| --- | --- | --- | --- | --- | --- |
| 1. Marquer | ouverture de C | N | off | test `LEQUAL`, écriture off | `EQUAL k`, masque d’écriture 0xFF, `zpass INCR`, sinon `KEEP` |
| 2a. Fond (C normal) | quad plein écran, z = 1 | N | ciel de C (dégradé + lueur + voile) ou `(0, 0, 0, 0)` sans ciel | `ALWAYS`, écriture on (1.0) | `EQUAL k+1`, écriture 0 |
| 2b. Remplir (C repli) | quad plein écran | N | `fallbackColor` opaque | `ALWAYS`, écriture on | `EQUAL k+1`, écriture 0 |
| 3. Monde de C | maillages `world` de C | C | on | `LEQUAL`, écriture on | `EQUAL k+1`, écriture 0 |
| 4. Enfants de C | récursion (étapes 1 à 6 avec N := C) | | | | |
| 5. Tardifs de C | maillages `late` de C | C | on | `LEQUAL`, écriture on | `EQUAL k+1`, écriture 0 |
| 6. Restaurer | ouverture de C | N | off | `ALWAYS`, écriture on | `EQUAL k+1`, masque 0xFF, `zpass DECR` |

Pour un nœud de repli, on enchaîne 1, 2b et 6. Après l’étape 6, la région de C revient à la référence k, et sa profondeur est celle du plan de l’ouverture vu par N. Les frères suivants et les tardifs de N voient donc l’ouverture comme une surface opaque à cette profondeur. Les objets placés devant passent, ceux qui sont derrière sont masqués.

Pourquoi le pré-ordre (dessiner N avant ses enfants) plutôt que l’approche post-ordre « enfants d’abord » de Rinsma ? Le marquage de l’étape 1 teste la profondeur de N. Une ouverture cachée par un mur, ou par une autre ouverture déjà restaurée, ne marque donc rien. Deux portails qui se recouvrent à l’écran restent corrects, même avec du ciel dans leur destination.

Détails :

- **Maillage d’ouverture** : rectangle `(width + 2·margin) × (height + 2·margin)` dans le repère du portail, de `y = −margin` à `height + margin`, sans culling des faces arrière. Calque `internal`, `ShaderMaterial` réduit à la position (`world`, `viewProjection`). Les états de profondeur et de couleur passent par `disableColorWrite`, `disableDepthWrite` et `depthFunction` du matériau. Le stencil vient de l’état **global** du moteur (`engine.setStencilBuffer`, `setStencilFunction`, `setStencilFunctionReference`, `setStencilFunctionMask`, `setStencilMask`, `setStencilOperationPass/Fail/DepthFail`). Le matériau n’active jamais `material.stencil`.
- **Quad plein écran** : deux triangles en NDC, calque `internal`, un seul `ShaderMaterial` (`useClipPlane: false`, aucune variation de defines) dont le mode est choisi par l’uniforme `useSky` :
  - `useSky = 0` (repli 2b, ou étape 2a sans ciel) : remplit la région avec l’uniforme `color` (`fallbackColor` opaque en 2b, `(0, 0, 0, 0)` en 2a sans ciel) et écrit `z_ndc = 1.0`.
  - `useSky = 1` (étape 2a avec ciel) : réinitialise la profondeur à `1.0` **et** peint directement le ciel de la passe enfant `C` dans le même appel de dessin (qui partage encore l’`initRender` de la caméra parente `N` avec le marquage de l’étape 1). Le vertex shader projette `gl_Position = vec4(position.xy, 1.0, 1.0)` et calcule la direction de rayon à partir de l’inverse de `C.viewProjection` (matrice `invViewProjection` réutilisée) et de `C.eye` (`eyePosition`) : `world = invViewProjection * vec4(position.xy, 1.0, 1.0)` puis `vDirection = world.xyz - world.w * eyePosition`. La projection oblique (§ 6.5) ne modifiant que `z`, cette expression affine en NDC reste exacte sur le rayon du pixel et évite toute division par `world.w` (qui peut s’annuler ou changer de signe lorsque le plan lointain oblique bascule derrière l’œil). Le fragment shader exécute exactement la même formule (`skyColorGlsl`) que `sky.js` ; `setFog(child)` est appelé avant le dessin et `veilFactor` est calculé avec `skyVeilFactor(scene, child.camera.maxZ)` pour respecter l’échelle de la passe enfant.
- **Ciel de la passe racine** : juste après le décor de la racine et avant les portails (début de `drawPortals`), le même quad en mode `useSky = 1`, avec l’inverse de la vue-projection de la caméra principale, est dessiné avec `depthFunction = LEQUAL` et sans écriture de profondeur : il ne peint que les pixels où la profondeur vaut encore 1. Le ciel coûte donc un seul appel de dessin par image, quelle que soit la profondeur de récursion, sans maillage dans la scène. Conséquence : un maillage transparent du calque `world` seul devant le ciel serait recouvert (les maillages transparents vont au calque `late`, § 3.7).
- On ne coupe jamais l’écriture de couleur au niveau du moteur pendant l’évaluation des matériaux de scène. `PrepareDefinesForFrameBoundValues` lit `engine.getColorWrite()` pour le define `DEPTHPREPASS`, et créerait une variante parasite.
- **Préchauffage.** Au chargement, `warmUp()` attend `scene.whenReadyAsync(true)`, puis `ObjectRenderer.isReadyForRendering` sur la liste complète. Toutes les vues de portail partagent le `renderPassId` de cet `ObjectRenderer`. Babylon appelle `mesh.isReady(true)`, qui vérifie aussi chaque sous-maillage dans la passe de son générateur d’ombres. Le préchauffage se fait en deux temps : voyageurs avec leurs plans de coupe, puis sans plan, leur état de repos (§ 7.5).

### 6.5 Projection oblique (Lengyel), forme Babylon

La construction utilise la projection de base symétrique `P`, la matrice de vue virtuelle `V` et le plan monde `(n, o)` orienté vers le côté **gardé**. On recule ce plan vers l’œil virtuel de `min(clipBias · σ, 0,5 · |D.signedDistance(œil)|)`. Le centimètre par défaut assure un recouvrement sous le linteau. Le plafond garde l’œil du côté rejeté, même à la distance ε d’une ouverture (§ 9.3).

```
n_v = V.dir(n)                         (Vector3.TransformNormal)
o_v = V.point(o)                       (Vector3.TransformCoordinates)
C   = (n_v.x, n_v.y, n_v.z, −n_v·o_v)  (l’œil, à l’origine, est du côté négatif : C.w < 0)
q   = (sgn(C.x), sgn(C.y), 1, 1) · P⁻¹ (vecteur-ligne homogène, non divisé ; sgn(0) = 1)
a   = 2 / (C · q)                      (si C·q ≤ 1e-8 : portail dégénéré, on ignore le nœud)
C'  = a · C
P'[2]  = C'.x − P[3]
P'[6]  = C'.y − P[7]
P'[10] = C'.z − P[11]
P'[14] = C'.w − P[15]                  (les autres coefficients sont inchangés)
```

Le plan proche de `P'` est le plan de coupe : un point est gardé si `z_clip ≥ −w_clip`, soit `C'·v ≥ 0`. Le plan lointain s’incline de façon à couvrir au mieux le frustum d’origine. Avec `maxZ` grand devant la scène, l’effet est négligeable. Contrôle : si `C = (0, 0, 1, −near)`, on retrouve exactement `P`. Les tests unitaires vérifient ce cas, et le fait qu’un point du plan donne `z_ndc = −1`.

### 6.6 Repli et voile

- **Repli** : les régions des nœuds de repli reçoivent `fallbackColor`, opaque (étape 2b). Ce n’est jamais un trou : sans repli, la région montrerait le décor qui se trouve derrière le portail.
- **Voile** : pour que le repli ne laisse pas de bord visible, chaque sous-arbre (enfant de la racine) applique un brouillard linéaire vers `fallbackColor`, fonction de la **distance apparente** depuis l’œil principal. La distance apparente d’un point vu dans une passe σ vaut `distance(caméra virtuelle, point) / σ`. Elle est continue d’une passe à l’autre de part et d’autre d’une ouverture, donc le voile l’est aussi.
  - Pour chaque enfant T de la racine, `S_T` est la distance au coin le plus éloigné de son ouverture. Le voile reste nul sur le seuil. `E_T` est la plus petite distance apparente des ouvertures de repli de T, mesurée dans leur passe parente.
  - Le portail d’entrée de T identifie son historique. La distance cible vaut `E_T` en présence d’un repli. Sans repli, elle vaut `camera.maxZ + 2 · hazeRange` pour que toute la bande puisse franchir le plan lointain en temps fini. Un sous-arbre absent à l’image précédente démarre à sa cible.
  - Pour un sous-arbre déjà visible, `E += clamp((cible − E) · (1 − exp(−hazeSmoothing · dt)), −v · dt, +v · dt)`. Le moteur fournit `dt` en secondes, borné entre 0 et 0,1. La vitesse maximale vaut `v = 0,5 · hazeSmoothing · hazeRange`, soit 48 m/s par défaut et au plus un tiers de mètre par image à 144 Hz. Un taux nul applique la cible immédiatement.
  - Après le lissage, la fin du sous-arbre vaut `fin = max(E, S_T + hazeMinRange)`. Dès que `fin − hazeRange ≥ camera.maxZ`, le voile de T est désactivé.
  - **Seuls les `hazeLevels` derniers niveaux sont voilés** (2 par défaut, réglable) : une passe de niveau `ℓ` n’est voilée que si `ℓ ≥ L₀ = max(1, maxDepth − hazeLevels + 1)`. Chaque nœud de niveau `L₀` sert d’ancre à ses descendants : `A` est la distance apparente du coin le plus éloigné de son ouverture, mesurée depuis l’œil de sa passe parente. Ses passes utilisent la fin `fin_A = max(fin, A + hazeMinRange)` et le début `max(A, fin_A − hazeRange)`. Le voile est nul sur l’ouverture de l’ancre, donc continu avec la passe parente non voilée, et identique dans tous les niveaux qui suivent.
  - Pourquoi : avec un voile appliqué à tout le sous-arbre, un repli au bout d’une chaîne lointaine (par exemple les arches A ↔ B vues depuis le couloir) noyait dans la couleur de repli tout ce qui se trouvait au-delà de sa distance, ciel et relief compris. C’était visible dès que la caméra passait de l’autre côté d’un portail : l’écran entier était alors un seul sous-arbre.
  - Le franchissement d’un portail par la caméra conserve l’historique des sous-arbres encore visibles. Pour une téléportation directe du joueur ou une réapparition, le jeu appelle `portals.resetHaze()` avant le prochain rendu. Chaque sous-arbre repart alors de sa cible.
  - `scene.fogMode = Scene.FOGMODE_LINEAR` reste actif. Chaque passe du sous-arbre applique `fogStart = S·σ`, `fogEnd = fin·σ` et `fogColor = fallbackColor`. Un voile désactivé utilise `fogStart = 1e8` et `fogEnd = 1e9`. `StandardMaterial` lie ces uniformes à chaque dessin. Babylon mesure la longueur de la position en espace vue. La racine retrouve ses réglages de brouillard en fin d’image.
  - **Ciel voilable (`src/portals/sky.js` et quad de fond)** : le ciel étant dessiné dans la scène avec un alpha opaque (1,0), aucun pixel du canevas ne reste transparent après le premier rendu (le fond CSS de `src/style.css` n’apparaît plus que pendant le chargement). La fonction partagée `skyVeilFactor(scene, maxZ)` calcule `veilFactor = 0` hors voile (`fogEnd = clearFogEnd`) et `clamp((maxZ − fogStart) / (fogEnd − fogStart), 0, 1)` dans une passe voilée — soit exactement 1 (`fallbackColor`) dès que le repli se situe en deçà du plan lointain (`fogEnd ≤ maxZ`) et une décroissance continue vers le dégradé quand le lissage repousse `fogEnd` entre `maxZ` et `maxZ + hazeRange`. Le quad de fond l’évalue avec le `maxZ` de la caméra du nœud juste après `setFog(node)`, avant de peindre le ciel (§ 6.4), sans allocation ni changement de define. Les chaînes de récursion peuvent donc se terminer en plein air (§ 11.6).

### 6.7 Coût et 60 FPS

- Culling par ouverture (§ 6.3), scissor par région et stencil testé tôt : les passes profondes ne dessinent que quelques maillages, sur peu de pixels.
- Budget `maxPasses`, profondeur 4 et repli.
- Pas d’allocation par image : pools de caméras, de nœuds, de matrices et de listes.
- Ombres : un seul `ShadowGenerator` 4096 (environ 3,7 cm par texel sur un volume fixe de 150 m) couvre toute la carte et les intérieurs, rendu une fois par image ; faces arrière seules (`forceBackFacesOnly`) et biais faibles, pour éviter l’acné sans détacher l’ombre des os fins du squelette.
- Décor statique regroupé par zone et par matériau au chargement (`src/world/staticBatch.js`, `Mesh.MergeMeshes`). Les corps Havok restent sur les nœuds d’origine, sans géométrie de rendu. Les lots ne mélangent ni les zones ni l’intérieur et l’extérieur d’une même démo, pour garder un culling utile aux passes. La carte d’ombre passe de 196 à 52 appels de dessin, le pavillon de 913 à 418.
- Listes candidates `world` et `late` construites une fois par image. Les dessins consécutifs d’une même caméra (marquage, puis remplissage/ciel) partagent un seul `initRender`.
- Candidats de la caméra principale : `scene.getActiveMeshCandidates` ne renvoie que les maillages actifs du calque `world` dans un tampon `{ data, length }` réutilisé (65 maillages au lieu de 155), évitant à `Scene._evaluateActiveMeshes` d’appeler `mesh.isReady()` sur les clones fantômes désactivés, les projecteurs d’ombre (calque 0), les maillages `late`, les ouvertures internes et les contours de debug désactivés (§ 6.2).
- Projecteurs d’ombre conditionnés à l’ensoleillement (`isLightBlocked`, § 7.5) : un unique raycast Havok réutilisé coupe les projecteurs d’ombre des voyageurs abrités sous un toit ou sous terre (économie de 14 appels de dessin du squelette dans la carte d’ombre dans le couloir et le pavillon).
- Ciel des passes de portail intégré au quad de fond (§ 6.4) : un seul appel de dessin pour le ciel par image (quad de la passe racine), économisant un appel par passe de portail (−16 dans le pavillon, −2 dans le couloir et au départ).
- Carte d’ombre limitée aux projecteurs activés : les clones des fantômes et des projecteurs restent dans `renderList` (le préchauffage compile ainsi leurs variantes), mais `travelers.js` pose sur chaque carte d’ombre concernée un `getCustomRenderList` (API publique de `RenderTargetTexture`) qui ne transmet que les maillages activés, dans un tableau réutilisé. Sans ce filtre, Babylon appelle `isReady()` puis `needAlphaBlending()` sur la cinquantaine de clones désactivés à chaque image, avant de tester `isEnabled()`.
- Calculs dans le repère d’un portail : `toLocal` et `signedDistance` lisent les vecteurs `right` et `normal` déjà calculés par `portalBasis` au lieu de recalculer cosinus et sinus du lacet, et `shadowPortalCrossing` rejette d’abord, sans trigonométrie, les portails hors de portée horizontale de l’ombre. Ces fonctions sont appelées pour chaque voyageur et chaque portail à chaque image.
- Les mesures (§ 13.3) se font sur la build de production.

## 7. Traversée et physique

### 7.1 Ordre dans la boucle (main.js)

```
onBeforeRender :
  pas fixes (FIXED_STEP) :
    entrées → player.update(dt, controls, cameraYaw)
    crate.capturePose()         → mémoriser la pose de chaque caisse pour l’interpolation
    plugin.executeStep(dt, physicsEngine.getBodies())
    crate.afterStep()           → transférer les variations de vitesse de chaque doublure
    portals.updateTravelers()   → applyWarp des voyageurs qui ont franchi
    crate.syncProxy()           → recalculer le chevauchement, placer la doublure et régler les masques
  present(alpha) :
    poses interpolées (joueur, caisses), visual.update
    portals.updateGhosts()
    camera.follow(…)            → traceView, plan proche adaptatif
    hud.update(…)
```

La physique passe au pas fixe du jeu (60 Hz) au lieu du pas variable de `scene.render`. `scene.physicsEnabled = false` coupe l’avance automatique de Babylon. L’API publique `getPhysicsPlugin().executeStep` + `getBodies()` fait le pas, et le plugin Havok, créé avec `useDeltaForWorldStep = true`, utilise ce `dt`. Le contrôleur de personnage reste mis à jour par le jeu, comme aujourd’hui.

### 7.2 Détection d’un franchissement

À chaque pas fixe, pour chaque voyageur : `prev` (centre au pas précédent, déjà transformé si le voyageur a été téléporté) et `cur = center()`. Pour chaque portail lié P : `d0 = d(prev)`, `d1 = d(cur)`. Franchissement par l’avant si `d0 > 0` et `d1 ≤ 0`. Par l’arrière si `P.sides === "both"`, `d0 < 0` et `d1 ≥ 0`. Le point de passage `x = prev + (cur − prev)·d0/(d0 − d1)` doit être dans l’ouverture (§ 3.2). On retient le franchissement le plus précoce (plus petit `t`), puis `applyWarp(P.warp, P)`, `onTraverseObservable`, et `prev = W(cur)`. Au plus un franchissement par voyageur et par pas.

### 7.3 Joueur

- `playerController.applyWarp(warp)` transforme la position et la vitesse de la capsule, le lacet, la pose précédente d’interpolation et l’échelle (§ 8). Comme `setPosition` conserve les anciens contacts, un court balayage vertical de la capsule par l’API publique `plugin.shapeCast` (`readArrivalSupport`) mesure l’appui à la sortie et `checkSupportToRef` est sauté pour ce pas (`placedSupport`). L’intégration suivante (`capsule.integrate`) reconstruit d’elle-même les contacts à la position courante, sans aucun appel d’API interne de Babylon (`docs/BABYLON_PATCHES.md` § 2). Le retour au point de départ (`respawn`) et `teleport` sautent également `checkSupportToRef` sur ce pas et forcent l’état non soutenu.
- Le centre testé est le centre de la capsule.
- `main.js` relaie le warp à la caméra (`camera.applyWarp(warp)`, § 9.4) quand le voyageur est le joueur.

### 7.4 Corps dynamiques (caisses)

`createBodyTraveler` (bodyTraveler.js) gère un `PhysicsBody` dynamique à forme de boîte, de taille de base `size`, et un **visuel séparé** interpolé entre la pose précédente et la pose courante, comme le joueur :

- `applyWarp` : nouvelle position `W.point`, rotation `W.quaternion`, vitesse linéaire `W.dir`, vitesse angulaire tournée (`R_y(Δ)`, sans échelle), appliquées par `plugin.setPhysicsBodyTransformation(body, node)` après mise à jour du nœud. Si `warp.scale ≠ 1` : nouvelle `PhysicsShapeBox` aux dimensions `size·scale`, masse × s³ (`setMassProperties`), `setGravityFactor(scale)` (§ 3.6), visuel `scaling = scale`. La pose précédente d’interpolation est transformée.
- Les caisses sont dans le calque `world` : opaques, elles se dessinent avant les portails de leur passe. Leurs formes Havok ont le calque de collision `collisionLayer.dynamic`. La caméra ne les heurte pas.
- `createCrate(scene, portals, { name, position, size, scale, yaw, color })` assemble une caisse et choisit ses masques. Le joueur pousse le corps réel ou sa doublure avec les impulsions de contact habituelles du contrôleur. À l’échelle s, il a une masse de 75·s³ kg et une force de poussée de 1 200·s⁴ N. À demi-échelle, cela donne 75 N sur une caisse de 5 kg et donc la moitié de l’accélération à taille normale (§ 3.6).

À chaque pas fixe, `syncProxy()` applique le test du § 7.5 au **centre simulé** de la caisse, avec la demi-diagonale de sa boîte pour rayon, et retient le portail chevauché le plus proche (`straddlingPortal`). Si la caisse chevauche un portail lié, le corps réel ignore `portalBack` et continue de heurter les cadres et le sol. En quittant l’ouverture il retrouve les bits retirés.

Soit W le warp du portail chevauché, R sa rotation et k son échelle. La doublure occupe un `TransformNode` sans maillage à W(pose). C’est un `PhysicsBody` dynamique toujours actif, de dimensions `size · scale · k` et de masse `masse réelle · k³`. Sa gravité, ses amortissements, son frottement et sa restitution valent zéro. Sa forme appartient au calque `proxy` et son masque contient `player | dynamic | terrain`. Les bits de collision du jeu sont `terrain = 1`, `player = 2`, `dynamic = 4`, `proxy = 8`, `portalBack = 16` et `portalFrame = 32`. Chaque forme doit accepter le calque de l’autre dans son masque. Le corps réel résout le contact avec le cadre homothétique de l’ouverture. Hors chevauchement, les deux masques de la doublure et ses vitesses valent zéro.

`syncProxy()` pose les références `v_ref = W.direction(v)` et `ω_ref = R(ω)`. Au pas suivant, après les impulsions du joueur et l’intégration Havok, `afterStep()` ajoute au corps réel `W.inverse().direction(v_doublure − v_ref)` et `R⁻¹(ω_doublure − ω_ref)`. Le transfert précède tout changement d’espace. Au franchissement, la prochaine synchronisation utilise le portail d’arrivée et replace la doublure du côté du joueur qui pousse encore.

### 7.5 Fantômes, plans de coupe et ombres traversantes

À l’enregistrement, chaque voyageur doté d’un visuel crée **deux** clones fantômes (`root.clone`, géométrie partagée, matériaux clonés au calque `late`) et pose deux plans de coupe (`clipPlane` et `clipPlane2`) initialisés au plan de repos `idlePlane = Plane(0, −1, 0, −10⁶)`, qui ne rejette que les fragments sous y = −10⁶ m (§ 3.5). Les fantômes, désactivés au repos, gardent leurs deux plans en permanence. L’original n’a que deux variantes : **sans plan au repos**, et avec les deux plans dès qu’un fantôme est affiché. `portals.warmUp()` les compile toutes deux, pour le rendu de scène, les vues de portail et les ombres (§ 6.4) : une traversée ne fait que changer de variante, déjà présente dans le cache d’effets du moteur, sans compilation. Sans plan au repos, la carte d’ombre ne reconstruit pas à chaque image les defines de plans de coupe du joueur et des caisses (coût mesuré au § 6.7). Un voyageur enregistré après `warmUp` garde ses plans en permanence, faute de variante sans plan préparée.

À chaque image, après la pose interpolée des visuels (`updateGhosts`), pour chaque voyageur avec visuel :

1. **Fantômes (objet à cheval sur un ou deux portails).** `straddlingPortals` cherche les portails liés P tels que `|d(c)| < r` (c : position de la racine du visuel, r : `radius()`), que la projection de c sur le plan tombe dans l’ouverture élargie de r et que `canTraverse(P)` l’autorise. On retient jusqu’aux **deux** portails les plus proches (triés par distance euclidienne au rectangle d’ouverture) ; `straddlingPortal` renvoie le premier pour la doublure physique (§ 7.4) et le projecteur d’ombre ci-dessous. Pour chaque portail chevauché `P_i` (i ∈ {0, 1}) :
   - Côté `σ_i` = signe de `d_i(center())`, le centre **simulé** du dernier pas fixe (et non la position interpolée du visuel, qui a jusqu’à un pas de retard ; en cas de distance exactement nulle, repli sur `arrivalSide` si `P_i === arrival`, sinon `+1`).
   - Matériaux de l’original : `clipPlane = discardPlane(P_0, −σ_0)` et `clipPlane2 = discardPlane(P_1, −σ_1)` (ou `idlePlane` si un seul portail est chevauché). Chaque plan rejette la partie qui a traversé le portail correspondant.
   - Fantôme i (portail `P_i`, destination `D_i = P_i.target`, warp `W_i = P_i.warp`) : sa racine prend `W_i(pose de la racine)` (position, `rotationQuaternion`, `scaling × s`) et ses descendants copient leurs transformations locales depuis l’original. Ses matériaux clonés reçoivent :
     - `clipPlane = discardPlane(D_i, −σ_i)` : ne montre que la partie qui a traversé `P_i`.
     - `clipPlane2` : `idlePlane` si un seul portail est chevauché ; sinon `secondaryGhostClipPlane(P_i, σ_i, P_j, σ_j)` (avec `P_j` l’autre portail chevauché) :
       - lorsque `P_i` et `P_j` ne sont pas parallèles du même côté de rejet (portails en angle ou face à face), image par `warpPlane(W_i, …)` (point et normale unitaire transformés par `W_i`) de `discardPlane(P_j, −σ_j)`, qui rejette la partie engagée dans `P_j` ;
       - lorsque `P_i` et `P_j` sont parallèles avec le même demi-espace de rejet (par exemple deux portails côte à côte dans un même plan), transporter directement le plan de `P_j` s’opposerait à `clipPlane` et masquerait tout le fantôme : on transporte alors par `warpPlane(W_i, …)` le plan de frontière de `P_j` tourné vers `P_i` (séparation horizontale ou verticale dans le plan partagé), ce qui rejette la partie engagée dans `P_j` sans couper le morceau issu de `P_i` (ou `idlePlane` si les deux ouvertures sont confondues).
   - Quand un voyageur ne chevauche plus qu’un portail, le second fantôme se désactive et les `clipPlane2` reviennent à `idlePlane`. Quand aucun portail n’est chevauché (ou que `root` est désactivé), les deux plans de l’original repassent à `null` (variante de repos) et les deux fantômes sont désactivés (`setEnabled(false)`). `syncGhostAppearance` synchronise `alpha`, `visibility` et `isVisible` sur tous les fantômes actifs (ainsi que sur le projecteur d’ombre). Le désenregistrement rend aux matériaux de l’original leurs `clipPlane` et `clipPlane2` initiaux.

2. **Projecteur d’ombre traversante.** Le générateur d’ombres respecte les plans de coupe : l’original n’ombre que du côté source, chaque fantôme que du côté destination pour sa seule partie engagée. Pour prolonger aussi l’ombre d’un objet placé devant un portail (ou la partie non encore engagée d’un objet à cheval), chaque voyageur projetant une ombre directionnelle reçoit un clone dédié (`root.clone`, géométrie partagée, matériaux clonés) qui ne se dessine **que dans la carte d’ombre** :
   - **Lumières traitées.** Seules les lumières directionnelles (`Light.LIGHTTYPEID_DIRECTIONALLIGHT`) dotées d’un générateur d’ombres incluant l’original sont retenues. Si plusieurs générateurs partagent la même direction `L` normalisée, le même clone leur est ajouté ; sinon seule la première lumière directionnelle est traitée.
   - **Calque 0.** Chaque maillage du clone reçoit `layerMask = 0` : aucune caméra ni passe de portail ne le dessine, tandis que la carte d’ombre le rend normalement (`ObjectRenderer` reçoit une `renderList` explicite avec `forceLayerMaskCheck = false`).
   - **Détection (`shadowPortalCrossing`).** Pour chaque portail lié P traversable depuis le côté de l’objet (`adapter.canTraverse` et `sides`) dont la normale de destination D = P.target est cohérente avec la sortie des rayons `L`, on teste l’intersection du volume englobant de rayon `r` autour du centre du visuel `c` (`visual.center` si fourni, sinon position monde de `root`) déplacé le long de `c + t·L`, `t ∈ [0, t_max]` avec `t_max = (c.y − P.origin.y + r) / (−L.y)`, contre l’ouverture de P. On retient le premier portail P ainsi traversé (plus proche le long de `L`). Quand l’objet chevauche déjà un ou deux portails, le côté simulé `σ_0` du portail chevauché le plus proche (`straddling[0]`) prime pour éviter un faux déclenchement d’une image juste après un warp.
   - **Pose et cinq plans de coupe permanents.** Le clone prend `W_P(pose)` (échelle comprise) et porte cinq plans toujours définis sur ses matériaux clonés (`clipPlane` à `clipPlane5`, initialisés au plan de repos `idlePlane` quand il est masqué, pour figer les defines shader dès `warmUp` sans aucune compilation ultérieure) :
     - `clipPlane` = `discardPlane(D, side)` : ne garde que la partie du clone **derrière** le plan de D (côté opposé à la face réceptrice, complément exact du fantôme).
     - `clipPlane2` à `clipPlane5` = `shadowPrismPlanes(D, L, apertureMargin)` : les quatre plans passant par les bords de l’ouverture de D (élargie de `apertureMargin`) et contenant la direction `L`, orientés vers l’extérieur (convention `clipPlane` de Babylon : le coin opposé reste négatif). Seuls les points de la face réceptrice de D dont le rayon vers le soleil passe par l’ouverture reçoivent ainsi cette ombre ; aucune ombre parasite ne tombe sur le sol derrière D ni à côté de l’ouverture.
   - **Filtre d’éclairement (`isLightBlocked`).** Si l’option `isLightBlocked(origin, towardLight, maxDistance) → boolean` est fournie à `createPortalSystem` (module générique sans dépendance à Havok), `updateGhosts` ne l’appelle que lorsqu’un portail candidat est trouvé, depuis `center` dans la direction `−L` sur 150 m (vecteur réutilisé, aucune allocation). Si la lumière directe est bloquée, le projecteur n’est pas activé : l’ombre au-delà du portail est de toute façon confondue avec celle de l’abri (§ 11.2). Dans `src/main.js`, cette fonction s’appuie sur `createSightTest` (`src/core/physics.js`) : un raycast Havok réutilisé (`physics.raycastToRef`) filtré sur `terrain | portalBack | portalFrame`. La caméra utilise le même test pour ses collisions (§ 9.1).
   - **Désactivation.** Quand aucun portail n’est concerné, que la lumière directe est bloquée (`isLightBlocked`), que `root` est masqué ou que `settings.portalShadows` vaut `false`, les cinq plans reviennent au plan de repos et le clone est désactivé (`setEnabled(false)`). Aucune allocation par image. Un seul portail d’ombre et jusqu’à deux fantômes actifs à la fois par voyageur (§ 14).

## 8. Échelle

- Un lien a une échelle `s = B.width / A.width`. Les ouvertures liées doivent être homothétiques, sinon `link` lève une erreur.
- **Joueur** (`playerController.setScale(s)`, appelée par `applyWarp`) :
  - `capsule.setShapeOptions({ capsuleHeight: PLAYER.height·s, capsuleRadius: PLAYER.radius·s }, true)` (pieds conservés), puis `keepDistance`, `keepContactTolerance` et `maxStepHeight` × s ; `characterMass` × s³ et `characterStrength` × s⁴ ;
  - vitesses de marche et de course, accélérations et freinages × s ; `jumpSpeed` × s ; gravité appliquée au contrôleur × s. Le saut dure autant et monte s fois plus haut (§ 3.6) ;
  - visuel : `visual.root.scaling = s`. L’animation reçoit `speed / s` pour garder ses seuils de démarche ;
  - `respawn` remet l’échelle à 1.
- **Caméra** : hauteur d’épaule, distance, dégagement aux murs, distances de fondu et `minZ` × s (s = échelle du joueur).
- **Rendu** : une passe vue à travers des portails d’échelle cumulée σ dessine avec `near` et `far` × σ. Les distances de voile sont ramenées à des distances apparentes (§ 6.6).
- **HUD** : vitesse affichée en m/s du monde. Le dataset expose aussi `scale`.

## 9. Caméra à la troisième personne

### 9.1 Chemin de vue

`portals.traceView(origin, direction, distance, { collide, clearance, epsilon })` part de la cible (épaule lissée, espace du joueur) vers l’arrière, sur `distance` mètres en espace du joueur :

- Pour chaque segment : premier portail franchi (intersection rayon–ouverture, avec les règles de face du § 7.2) et premier obstacle (`collide(from, to)` → distance du choc ou `null`, raycast Havok filtré sur `terrain | portalBack | portalFrame`, fait dans l’espace du segment).
- Un obstacle d’abord : arrêt à `distanceChoc − clearance·σ`.
- Un portail d’abord : le segment continue de `W.point(x)` dans la direction `W.dir(d)` normalisée. La longueur restante est multipliée par `W.scale`, et `W` s’accumule (`composeWarps`).
- Résultat : `{ position, target: Wcumulé.point(origin), warp: Wcumulé, allowed, nearestPortalDistance }`. `allowed` est la distance libre en espace du joueur, avant tout obstacle. Le chemin déplié est une droite dans l’espace final : la caméra regarde `target` et voit le joueur à travers les ouvertures.

### 9.2 Épaule lissée et lissage

La cible de la caméra est l’épaule **lissée**, en retard sur l’épaule simulée. Juste après une traversée, elle peut se trouver de l’autre côté du portail de sortie. Avant le chemin de vue, `thirdPersonCamera.follow` trace donc un court chemin de l’épaule simulée vers l’épaule lissée (`locateShoulder`). S’il franchit un portail, la vue part de l’épaule lissée dans **son** espace, avec la direction transformée. `isViewWarped` compare ces deux chemins pour savoir si la caméra est dans un autre espace que le joueur (`warped`).

La logique actuelle (rétraction immédiate, relâchement progressif) s’applique à `allowed`, en unités de l’espace du joueur. Un second appel sans collision (`collide` absent) place la caméra à la distance lissée.

### 9.3 Garde ε et plan proche adaptatif

- Si la position finale est à moins de `ε = 2·MIN_NEAR·σ` du plan d’une ouverture (projection dans l’ouverture élargie de ε), on raccourcit la distance de ce qu’il faut pour que la caméra soit à ε **avant** le plan, du côté d’où vient le chemin. La caméra n’est jamais posée sur le plan.
- `camera.minZ = clamp(0.5 · nearestPortalDistance(position), MIN_NEAR, CAMERA.minZ) · σ_cam`, avec `MIN_NEAR = 0.005` et `CAMERA.minZ = 0.04` (`src/config.js`), et σ_cam l’échelle cumulée de la caméra (échelle du joueur × échelle du chemin). Le plan proche ne traverse donc jamais une ouverture.
- `camera.maxZ = CAMERA.maxZ = 500` (au lieu de 10 000, pour la précision de profondeur).

### 9.4 Warp de la caméra quand le joueur traverse

`camera.applyWarp(warp)` : `yaw += Δ`, cible lissée `W.point`, distance lissée inchangée (en unités du joueur, qui changent d’échelle avec lui). La caméra ne saute pas : le nouveau chemin, parti du joueur téléporté, retraverse le même portail à l’envers et retrouve la même position monde.

### 9.5 Commandes

Le lacet passé à `player.update` est le lacet logique de la caméra (espace du joueur), pas celui de la caméra rendue. Les déplacements restent relatifs à la vue après n’importe quel warp.

## 10. HUD, overlay de debug, hook dev

### 10.1 Overlay F3 (existant, étendu)

Le panneau `#player-state` affiche en plus `Portails : profondeur 3/4 · 9 passes · 60 i/s` (profondeur atteinte / maximale, passes de la dernière image, `engine.getFps()` arrondi), dans des éléments dédiés. Il expose aussi `data-portal-depth`, `data-portal-passes`, `data-fps` et `data-scale` dans son dataset. F3 active les **contours** des portails (`portals.setDebugVisible`) : un rectangle `LinesMesh` par ouverture, de la même couleur pour les deux portails d’un lien. Ces contours sont dans le calque `world`, donc visibles aussi à travers les portails.

### 10.2 Statistiques

`portals.stats` : `passes` (1 pour la racine + nœuds non repli), `depthReached` (niveau maximal non repli), `fallbacks`, `visiblePortals` (enfants de la racine).

`stats.haze` contient une entrée `{ portal, start, end }` par enfant de la racine. Ce sont les bornes lissées effectivement appliquées (§ 6.6), en mètres apparents avant multiplication par l’échelle de la passe. Les deux valent `Infinity` quand aucun voile n’est appliqué. Le renderer réutilise le tableau et ses entrées. `gowDev.state().portals.haze` en donne une copie pour l’image courante.

### 10.3 Hook dev

Le hook est chargé si `import.meta.env.DEV` est vrai ou si l’URL contient `?dev` : `src/main.js` l’importe dynamiquement avant de créer le moteur, pour que le compteur de compilations voie les premiers effets. La CI teste la build de production, qu’elle publie ensuite, donc le hook reste dans `dist/`. Il y forme un chunk séparé, téléchargé seulement avec `?dev`. Le paramètre d’URL suit le précédent de `?browser=`. Il expose `window.gowDev` :

```js
gowDev.state() → {
  player: { x, y, z, yaw, scale, grounded, capsuleHeight },
  camera: { x, y, z, yaw, pitch, minZ, warped },   // warped : la caméra est dans un autre espace que le joueur
  portals: { depth, maxDepth, passes, fallbacks, haze },
  fps, ghosts, shadowCasters, effects,
  traversals: [{ traveler, portal, frame }],       // 32 derniers franchissements
}
gowDev.teleportPlayer({ x, y, z, yaw })             // replace les pieds et la caméra, annule la vitesse, garde l’échelle
gowDev.setControls({ forward, strafe, sprint, jump } | null)   // commandes virtuelles fusionnées avec le clavier
gowDev.setPlayerVisible(visible)                     // agit aussi sur l’ombre, le fantôme et le projecteur d’ombre du joueur
gowDev.look(dx, dy)                                  // applique le mouvement de souris dès cette image
gowDev.crate(name) → { state(), visual(), ghosts(), place({ x, y, z, yaw }), push({ x, y, z }) }
gowDev.portal(name) → { origin, yaw, width, height, sides, target, scale }
gowDev.portalSystem                                  // accès direct au système de portails (tests dev uniquement)
gowDev.setMaxDepth(n)
gowDev.setPortalShadows(enabled)                     // active ou coupe les projecteurs d’ombre traversants
gowDev.manualClock() → { step(ms = 1000 / 60), release() }
gowDev.flickerProbe({ portals, band = 4, threshold = 60, returnThreshold = 24 }) → { capture(), report() }
gowDev.benchmark({ frames = 120, warmup = 10 }) → Promise<{ frames, cpuMs, frameMs, passes, drawCalls, renderWidth, renderHeight }>   // § 13.3
gowDev.project({ x, y, z }) → { x, y }               // point monde → pixel CSS du canevas (caméra principale)
gowDev.samplePixel(x, y) → Promise<[r, g, b, a]>     // couleur du pixel CSS (x, y) après le prochain rendu
gowDev.character() → { animations, weights }         // modèle glTF chargé (null avec le squelette), docs/PERSONNAGE.md
```

Pour une caisse, `state()` lit la pose simulée. `straddling` donne le nom du portail chevauché et `proxy` la position monde `{ x, y, z }` de la doublure. Ces champs valent `null` loin des ouvertures. `visual()` donne la pose monde interpolée de la caisse dessinée, `{ x, y, z, yaw, tilt, ghost, ghosts }`. `tilt` mesure en radians l’angle entre la verticale de la caisse et celle du monde. Le booléen `ghost` est vrai dès qu’au moins un fantôme est affiché ; `ghosts` indique le nombre de fantômes actifs (0, 1 ou 2). `ghosts()` expose `{ original: { clipPlane, clipPlane2 }, ghosts: [{ name, active, x, y, z, yaw, scaling, clipPlane, clipPlane2 }] }` pour contrôler les poses et les plans de coupe dans les tests. `gowDev.portalSystem` expose le système retourné par `createPortalSystem` pour créer, lier et supprimer des portails de test à la volée.

`state().effects` compte les compilations terminées depuis la création du moteur. Le hook s’abonne à l’événement public Babylon `engine.onAfterShaderCompilationObservable` avant de construire la scène. Un effet repris du cache ne déclenche aucune compilation.

Après « Jouer », l’horloge manuelle suspend les boucles du moteur et pilote `performance.now()`. Chaque `step` avance le temps en millisecondes et rend une image synchrone entre `engine.beginFrame()` et `engine.endFrame()`. Une seule horloge peut piloter la scène à la fois. `release()` rétablit l’horloge précédente et relance les boucles de rendu.

```js
const clock = gowDev.manualClock();
try {
  gowDev.teleportPlayer({ x: 26.5, y: 0, z: 2.6, yaw: Math.PI / 2 });
  for (let i = 0; i < 12; i++) clock.step(1000 / 144);
  gowDev.setPlayerVisible(false);
  const probe = gowDev.flickerProbe({ portals: ["A2"] });
  gowDev.setControls({ forward: 1 });
  for (let i = 0; i < 100; i++) {
    clock.step(1000 / 144);
    probe.capture();
  }
  console.log(probe.report());
} finally {
  gowDev.setControls(null);
  gowDev.setPlayerVisible(true);
  clock.release();
}
```

`capture()` lit le framebuffer WebGL juste après `step()`, dans la même tâche JavaScript. La sonde réutilise trois images RGBA. Elle projette les coins sans marge de chaque ouverture dans le framebuffer avec la caméra principale. Un coin derrière l’œil suffit à écarter ce portail pour l’image. Le masque retient les centres de pixels à moins de `band` pixels du contour.

Sur trois images consécutives `a, b, c`, un pixel du masque de `b` compte si `d(a,b) > threshold`, `d(b,c) > threshold` et `d(a,c) < returnThreshold`. La distance `d` est la somme des écarts absolus des quatre canaux RGBA. Le pixel compte une fois, pour le bord projeté le plus proche dans `b`. Les noms `bottom`, `right`, `top`, `left` suivent les axes locaux du portail.

`report()` donne le nombre de captures `frames`, le total des pixels isolés `spikes`, leur maximum sur une image `maxPerFrame`, les comptes successifs `perFrame` et les totaux par bord dans `byPortal`. Une série de 100 captures donne 98 images centrales mesurables. Un changement de taille du framebuffer démarre une nouvelle série de trois images.

## 11. Règles de conception des niveaux

Ces règles garantissent un éclairage et des ombres cohérents. La scène a un soleil directionnel global (`DirectionalLight` « soleil » de `src/world/lighting.js`, direction `(−0.58, −1, 0.48)` : ses rayons descendent vers −X et +Z, ils viennent du sud-est) et une lumière hémisphérique globale.

1. **Liens translatifs (et règle sur la rotation)** : dans toute scène dotée d’une lumière directionnelle à ombres (dont les cinq démos), chaque lien doit être **translatif** (`Δ ≡ 0 mod 2π`, soit `yaw_B = yaw_A − π` à `1e-6` rad près), avec ou sans changement d’échelle.
   - **Pourquoi.** Avec un lien qui tourne (`Δ ≢ 0 mod 2π`), la direction relative du soleil change d’un côté à l’autre de l’ouverture. Rendre l’éclairage « raccordé » au seuil exigerait de tourner la lumière (et sa carte d’ombre) dans les passes de portail : la destination vue à travers l’ouverture deviendrait alors différente de ce qu’on voit réellement en la traversant. On refuse volontairement cette incohérence ; la règle est documentée et signalée par l’API.
   - **Ce qui se raccorde et ce qui ne se raccorde pas.** Avec une rotation, la géométrie, la traversée physique, l’échelle, les fantômes (et leurs plans de coupe), la caméra, le voile de récursion et l’éclairage propre de chaque lieu restent cohérents : chaque côté est éclairé fidèlement à son orientation réelle dans le monde, avant comme après traversée. En revanche, au bord de l’ouverture, ne se raccordent plus : la direction apparente du soleil, les taches de lumière directe, les reflets spéculaires, les ombres portées (y compris le projecteur d’ombre traversante du § 7.5, qui reste inactif si la rotation inverse le sens de sortie des rayons sur la cible) et la lueur solaire du ciel (§ 6.4). À l’inverse, avec un lien translatif (`Δ ≡ 0 mod 2π`), le soleil garde la même direction relative des deux côtés : lumière, reflets, ombres (y compris prolongées) et lueur solaire se raccordent.
   - **Comment l’autoriser.** `portals.link(a, b, options)` (§ 5) crée toujours le lien mais, si `Δ ≢ 0 (mod 2π)` (tolérance `1e-6`) et qu’au moins une lumière directionnelle de la scène possède un générateur d’ombres, émet **une fois par paire de portails** un avertissement `console.warn` indiquant la limite et la correction (`yaw_B = yaw_A − π`). Pour assumer explicitement une rotation (intérieur fermé sans soleil direct, mise en scène particulière, test), passer `portals.link(a, b, { allowRotation: true })` supprime l’avertissement. Dans une scène sans lumière directionnelle à ombres, aucun avertissement n’est émis (§ 14).
2. **Abris équivalents** : les abords des deux ouvertures d’un lien reçoivent le même éclairage direct. Soit les deux sont à l’air libre avec un cadre identique (arches A ↔ B, où les ombres des voyageurs se prolongent dans les deux sens au soleil), soit les deux sont à l’ombre (les cinq liens à sens unique des zones 2 à 5). Une ouverture dont la face avant regarde vers **+Z ou −X** (par exemple P, A2, D, E, P1) ne reçoit jamais de soleil direct à l’intérieur : les rayons voyagent vers +Z et −X, ils n’entrent pas par une face qui leur fait face dans le même sens. Une ouverture tournée vers −Z ou +X (Q, B2, C, W, P2) est au fond d’un abri couvert d’au moins 3 m ou d’un intérieur fermé. Avec 53° d’élévation, un rayon qui entre par le haut d’une porte de 3 m touche le sol avant 2 m.
3. **Intérieurs cachés** : les intérieurs plus grands que leur enveloppe sont de la vraie géométrie, **sous la dalle** (sol à y = −20), fermée (plafond compris) et projetant des ombres. Ils sont éclairés par les mêmes lumières : le plafond les met à l’ombre, comme un vrai intérieur. La carte d’ombre doit couvrir la carte entière et les intérieurs, du sol de surface à y = −20 : `sun.autoCalcShadowZBounds = true` ou des bornes et une position de soleil adaptées, avec `ShadowGenerator` 4096.
4. **Sols alignés** : le bas d’une ouverture est au niveau du sol, des deux côtés. Les ouvertures liées ont des sols équivalents. Les seuils des alcôves souterraines gardent le calque `terrain` pour porter la caisse à cheval.
5. **Ouvertures libres** : le passage n’a pas de collisionneur, et l’espace juste derrière le plan d’un portail à sens unique est libre sur au moins 0,6 m, pour le passage de la capsule. Réserver `portalBack` aux volumes entièrement derrière le plan et accessibles uniquement par chevauchement. Dans les démos, ce sont le fond, les joues et la couverture des alcôves et des niches, ainsi que le cadre en retrait de la niche de la zone 5.
6. **Repli en plein air autorisé** : grâce au ciel voilable (§ 6.6), une chaîne de récursion qui atteint la profondeur maximale peut désormais se terminer sur le ciel ; dans la dernière passe voilée, le ciel prend exactement `fallbackColor` et le repli s’y fond sans couture. Un intérieur fermé (pièces cycliques) reste utile lorsqu’on souhaite encadrer visuellement la répétition, mais n’est plus imposé par le voile.
7. **Point de réapparition** : le jeu fait réapparaître le joueur sous y = −7 en surface. Dans un intérieur (volume déclaré par la zone), seule la limite y = −30 s’applique (`PLAYER.respawnBelow` et `PLAYER.interiorRespawnBelow` dans `src/config.js`).
8. **Cadres.** Aucune surface coplanaire au plan d’une ouverture sous sa marge. Un cadre dépasse d’au moins 1 cm devant le plan. Dans `doorway()`, l’arrière reste à `thickness` derrière le plan, au contact de l’alcôve. Les montants et linteaux qui portent un portail, y compris les poutres de A et B, reçoivent `portalFrame`. La mini-arche et les portes ordinaires restent en `terrain`. Les sections planes à l’intérieur des poutres servent au rendu seul. Chaque forme Havok reçoit son calque sur le nœud d’origine avant `batchStaticMeshes`. Les lots de rendu regroupent par zone, matériau et attributs de dessin (§ 6.7) et conservent les corps individuels.
9. **Sols peints.** Jamais de `zOffset` proportionnel à la pente, nulle part dans une scène à portails : utiliser `zOffsetUnits` (décalage constant). Deux raisons. Une surface qui traverse le plan d’une ouverture gagnerait le test de profondeur contre l’ouverture sur une ligne d’un ou deux pixels. Surtout, vue à travers un portail quand la caméra est tout contre l’ouverture, la projection oblique fait varier la profondeur surtout selon la direction à l’écran : la pente de profondeur d’un sol devient énorme, et `zOffset` l’avance de plusieurs mètres, si bien qu’il recouvre ce qui y est posé (pieds des murs, plots et escalier de la zone d’entraînement qui disparaissaient). Les sols des démos, le sable et la piste d’entraînement utilisent −8 unités, les panneaux au sol −12 pour rester au-dessus.

## 12. Démos

### 12.1 Carte

- Champ de 100 m × 100 m (x, z ∈ [−50, 50]). La dalle physique `dalle` est agrandie. Le reste du sol reçoit une texture de quadrillage répétée (maille de 1 m, traits majeurs tous les 5 m, mêmes teintes que l’existant).
- La zone d’entraînement actuelle (sol peint de 40 m, rampes, sauts, escalier, point de départ `(0, 3.65, −10)`) est inchangée au centre. Les tests existants en dépendent.
- Le relief lointain passe des rayons 59 et 82 à 95 et 125. Il reste dessiné devant le ciel (`portals.createSky(skyPalette)` dans `src/main.js`, palette dans `src/world/lighting.js`), qui reprend selon la direction de vue les trois teintes du dégradé CSS (`#e1dfbd`, `#adc2b2`, `#789b95`) avec une lueur solaire calibrée sur la vue de départ (tangage 0,18, tache lumineuse vers 70 % de la largeur).
- Chaque zone a son sol peint (`DynamicTexture` de 1024 px environ par zone) avec un **panneau au sol** qui la nomme, dans le style du marquage « DÉPART » : « PARADOXE SPATIAL », « ARCHITECTURE NON EUCLIDIENNE », « PIÈCES CYCLIQUES INFINIES », « GÉOMÉTRIE IMPOSSIBLE », « MANIPULATION D’ÉCHELLE ».
- Les intérieurs cachés sont sous la dalle (§ 11.3).
- Les sols peints rectangulaires de `floorPaint` sont subdivisés selon X et Z, avec une maille d’au plus 0,5 m. Ces triangles courts stabilisent les UV et la profondeur lorsque le sol traverse le plan proche.

### 12.2 Zone 1 : paradoxe spatial

- Arche A au milieu du quadrillage au nord, `origin (0, 0, 31)`, `yaw = π` (face avant vers le sud, côté du point de départ), ouverture 2,4 × 3 m, `sides: "both"`. Cadre : deux piliers et un linteau, avec collisions.
- Arche B identique sur une **esplanade de sable** au sud-ouest (disque de 14 m de diamètre, sol sable, obélisques et blocs colorés pour qu’on reconnaisse le lieu), `origin (−30, 0, −32)`, `yaw = 0`. Le lien est translatif.
- Chaque pilier et chaque linteau de A et B contient deux sections planes, à 5 mm de part et d’autre de l’ouverture, orientées vers des côtés opposés. Elles referment la boîte ouverte par la coupe oblique. Même à incidence rasante, les échantillons MSAA qui passent le stencil rencontrent ainsi le matériau du cadre dans la vue de destination. Ces sections rejoignent les lots de rendu des arches. Les collisions utilisent les boîtes extérieures.
- À travers A, on voit l’esplanade, pas le champ qui est derrière l’arche. Par l’arrière de A, on voit l’autre côté de l’esplanade. Alignée le long de la droite B–A, la récursion répétée en plein air illustre le ciel voilé vers `fallbackColor` (§ 6.6, § 11.6).

### 12.3 Zone 2 : architecture non euclidienne

- Noms dans le jeu : `A2` et `B2` pour les portails A et B de cette zone, afin de garder `A` et `B` pour les arches de la zone 1. `C` et `D` sont inchangés.
- Enveloppe extérieure : un tunnel couvert le long de X, de x ∈ [29.5, 36.5] et z ∈ [0.5, 3.5], de 3 m de haut, ouvert aux deux bouts. Portail A à `x = 31`, face avant −X (`yaw = −π/2`). Portail C à `x = 33.5`, face avant +X (`yaw = π/2`, 3 m au fond de l’abri, § 11.2). Ouvertures 2,4 × 2,8 m centrées en `z = 2`. L’espace entre A et C est inaccessible.
- Intérieur caché : couloir de 24 m sous la dalle, sol à y = −20. B à `(20, −20, 2)`, `yaw = π/2`. D à `(44, −20, 2)`, `yaw = −π/2`. Liens A ↔ B et C ↔ D, tous deux translatifs. Le sol du couloir porte des graduations tous les mètres et sa longueur (« 24 m »). L’enveloppe extérieure porte « 7 m ».
- Les ouvertures marquent les extrémités de la règle de 24 m. Les traits peints commencent au premier mètre intérieur. Un demi-trait coupé exactement au seuil clignotait sur une rangée de pixels à l’approche.

### 12.4 Zone 3 : pièces cycliques infinies

- Pavillon à l’ouest centré sur `(−33, 0, 6)` : pièce intérieure de 6 × 6 m, 3,2 m sous plafond. Murs de couleurs différentes (nord rouge, est bleu, sud jaune, ouest vert) et un pilier central rayé pour lire la répétition.
- Entrée réelle par une porte dans le mur sud.
- Portes est et ouest (2 × 2,6 m) qui donnent sur des alcôves fermées de 0,6 m. Portail E à `x = −30`, face avant −X vers l’intérieur (`yaw = −π/2`). Portail W à `x = −36`, face avant +X (`yaw = π/2`). Lien E ↔ W translatif (−6 m en X). Sortir par l’est fait rentrer par l’ouest, et inversement.
- La récursion atteint la profondeur maximale à l’intérieur d’une pièce fermée. Le voile et le repli s’y fondent (§ 6.6, § 11.6).
- Les joints du carrelage traversent le filet et vont jusqu’au bord. Ils mesurent 5 % du côté d’un carreau. Le pavillon conserve le filtrage anisotrope par défaut de Babylon.

### 12.5 Zone 4 : géométrie impossible

- Cabine au sud-est de 2,6 × 2,6 m au sol, 3 m de haut, centrée sur `(30, 0, −30)`. Sa porte est sur la face nord. Portail P à `(30, 0, −28.7)`, face avant +Z (`yaw = 0`), ouverture 1,6 × 2,4 m.
- Grande salle cachée de 14 × 14 m, 6 m sous plafond, sol à y = −20, z ∈ [−47, −33], centrée en x = 30, avec colonnes et grand marquage au sol. Portail Q à `(30, −20, −33)` sur son mur nord, face avant −Z (`yaw = π`). Lien P ↔ Q translatif.
- La mosaïque et la pierre des deux seuils utilisent le niveau anisotrope 1. Le filtrage isotrope des mipmaps atténue leurs joints vus de biais pendant la rotation devant P (§ 13.2).

### 12.6 Zone 5 : manipulation d’échelle

- Coordonnées réelles (tâche 5) : le petit tunnel va de x = −30,5 à −27,5. Un porche couvert le raccorde à la porte du jardin en x = −27. Les niches derrière P1 et P2 laissent 1,2 m et 0,6 m libres.
- Grand tunnel couvert au nord-ouest, le long de X, de 3 m de large (z ∈ [30, 33]) × 3,2 m de haut × 6 m de long (x ∈ [−40, −34]), entrée à l’ouest (x = −40, face −X, § 11.2). Portail P1 à `(−35, 0, 31.5)`, face avant −X (`yaw = −π/2`), ouverture 2,4 × 2,8 m. Le tunnel est fermé en x = −34,4.
- Petit tunnel, copie exacte du grand à l’échelle 0,5 (1,5 × 1,6 × 3 m, x ∈ [−30.3, −27], z ∈ [30.75, 32.25]). Portail P2 à `(−30, 0, 31.5)`, face avant +X (`yaw = π/2`), ouverture 1,2 × 1,4 m. Le tunnel est fermé en x = −30,3. Sa sortie est (x = −27) donne sur un **mini-jardin** clos de 8 × 8 m (x ∈ [−27, −19], z ∈ [27.5, 35.5]), avec un mur de 2,6 m qui empêche d’y entrer à taille normale. Le mobilier y est à l’échelle 0,5 : petits piliers, marches de 9 cm, mini-arche.
- Lien P1 ↔ P2 translatif, échelle 0,5. On rétrécit en allant vers l’est et on grandit en revenant.
- Le premier joint transversal des tunnels est décalé d’un demi-carreau. P1 et P2 coupent ainsi le milieu d’un pavé à leurs échelles respectives. Les deux tunnels partagent une texture au niveau anisotrope 1. Le dallage du jardin conserve le réglage par défaut.
- Caisse dynamique de 1 m à l’entrée du grand tunnel, qu’on peut pousser à travers P1 (elle ressort à 0,5 m). Caisse de 0,5 m dans le mini-jardin.

## 13. Tests

### 13.1 Tests unitaires (Node, sans navigateur)

`tests/portalMath.spec.js` importe `src/portals/math.js`, comme `tests/browser.spec.js` importe `src/platform/browser.js`. Ces modules sont chargés par Node, sans Vite. `@babylonjs/core` n’ayant pas de champ `exports`, leurs imports Babylon doivent donc nommer le fichier avec son extension (`@babylonjs/core/Maths/math.vector.js`). Les autres modules suivent la forme sans extension de la documentation Babylon, que Vite résout vers le même fichier.

`tests/portalMath.spec.js` couvre :

- warp (point, direction, lacet, inverse, composition, échelle, cas translatif, détection de rotation `hasWarpRotation` modulo `2π` avec tolérance `1e-6`) ;
- franchissement de segment (avant, arrière, hors de l’ouverture, à sens unique) ;
- projection oblique : cas du plan proche identique à `P`, `z_ndc = −1` sur le plan, côté caméra rejeté, côté gardé conservé ;
- rectangle écran (découpe contre le plan proche) ;
- ombres traversantes : détection `shadowPortalCrossing` (avant, arrière, sens unique, portée au sol, chevauchement, lien tourné, rayons parallèles) et plans du prisme lumineux `shadowPrismPlanes` ;
- double fantôme : transport d’un plan quelconque `warpPlane` (rotation, translation, échelle, normalisation, en place) et second plan de coupe `secondaryGhostClipPlane` (coin à 90° avec rotation et demi-échelle, portails face à face, portails coplanaires côte à côte de hauteurs différentes, portails superposés verticalement, portails confondus).

`tests/frameProbe.spec.js` importe le module pur `src/dev/frameProbe.js`. Il couvre le retour d’un pixel à sa couleur, un changement durable, le filtrage par masque et la bande d’un segment oblique jusqu’à ses extrémités. Un framebuffer synthétique vérifie aussi l’attribution aux bords de l’image centrale et la rotation des trois tampons.

### 13.2 Tests Playwright, un par concept

Chaque test charge `/?dev`, attend `gowDev`, place le joueur ou une caisse devant le portail avec le hook, la fait traverser (`setControls` ou `push`), puis vérifie à l’arrivée la position (côté et décalage latéral attendus par rapport au portail de destination, calculés à partir de `gowDev.portal`), l’orientation (lacet + Δ) et l’échelle :

1. joueur à travers l’arche A → esplanade (échelle 1) ;
2. joueur dans le tunnel extérieur → couloir souterrain (y ≈ −20), puis sortie par D → C ;
3. joueur par la porte est → porte ouest de la même pièce (x diminue d’environ 6 m) ;
4. joueur dans la cabine → grande salle ;
5. joueur à travers P1 (échelle 0,5, capsule de 0,96 m, caméra rapprochée de moitié), puis une caisse à travers P1 (échelle 0,5) ;
6. en plus : caméra seule de l’autre côté d’un portail (`camera.warped === true` alors que le joueur n’a pas traversé).

`tests/portals.spec.js` vérifie aussi qu’une image manuelle de 1/60 s fait avancer une caisse d’un pas Havok. La demi-image suivante présente la pose interpolée. Pour vérifier la réinitialisation du voile, un test maintient la caméra et l’horloge immobiles dans le pavillon, puis ramène la profondeur de 4 à 2. La distance lissée reste fixe jusqu’à l’appel de `teleportPlayer` à la même position. Au rendu suivant, elle diminue immédiatement des 12 m qui séparent les deux replis.

`tests/portalPhysics.spec.js` enregistre à 144 Hz le visuel interpolé de la caisse, la position du joueur et les franchissements. Chaque échantillon est ramené dans le repère de l’entrée par le warp inverse. Les distances et les vitesses du tableau sont donc comparables sur A, A2 et P1. La vitesse minimale porte sur l’intervalle où seule la caisse a franchi. La variation de déplacement compare deux déplacements consécutifs sur l’ensemble des 260 images de poussée.

| Portail | Séparation minimale avant → après (m) | Vitesse minimale avant → après (m/s) | Variation maximale avant → après (mm/image) |
| --- | ---: | ---: | ---: |
| A | 0,193 → 0,821 | −0,36 → 1,93 | 6,24 → 2,90 |
| A2 | 0,237 → 0,821 | −0,17 → 2,13 | 5,45 → 2,90 |
| P1 | 0,237 → 0,821 | −0,17 → 2,08 | 8,76 → 2,90 |

Sur ces trois poussées, la caisse avance sans recul. L’écart de hauteur maximal est de 9,615 mm et l’inclinaison maximale de 0,021 rad. Le joueur et la caisse sortent de P1 à l’échelle 0,5. Pendant le chevauchement de P1 puis de P2, l’écart mesuré entre la position de la doublure et W(centre simulé) est nul. Le test vérifie aussi le placement direct et la désactivation hors de l’ouverture.

Lancée seule à 6,5 m/s avec un lacet de 45°, la caisse restait bloquée à 0,111 m devant E et perdait jusqu’à 92,7 % de sa vitesse en un pas près de Q. Elle franchit désormais les deux ouvertures. La plus forte perte de vitesse horizontale près du plan est de 5,0 % sur E et de 4,7 % sur Q, pour une limite de 15 %.

`tests/portalFlicker.spec.js` mesure dix trajets à 144 Hz, avec le squelette masqué, dans Chromium avec SwiftShader en 780 × 540. La sonde compte les changements isolés d’un pixel fixe sur trois images (§ 10.3). Chaque trajet dure 100 images, sauf le passage de la caméra dans A2 qui en dure 239.

Le calibrage utilise deux mesures indépendantes. Le plafond du total vaut `ceil(1,5 × spikes mesurés)`. Le plafond d’une image vaut `max(8, ceil(1,5 × maxPerFrame mesuré))`. Huit trajets respectent aussi la limite de `floor(frames / 2)`. Pour A2 en approche et P2 au retour, ce contrôle ramène le plafond effectif à 50. Les deux exceptions concernent les pas chassés devant E et la rotation devant P, dont les captures montrent des détails sous-pixel (§ 14).

| Trajet | Total avant | Total mesuré | Seuil total effectif | Max/image avant | Max/image mesuré | Seuil par image |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| B, approche sur le sable | 1 554 | 19 | 29 | 155 | 2 | 8 |
| A, approche | 3 188 | 29 | 44 | 270 | 2 | 8 |
| A2, approche | 12 312 | 35 | 50 (calibré à 53) | 856 | 4 | 8 |
| A2, recul | 13 432 | 23 | 35 | 813 | 4 | 8 |
| E, pas chassés | 652 | 101 | 152 | 48 | 39 | 59 |
| P, approche | 15 136 | 0 | 0 | 724 | 0 | 8 |
| P, rotation | 18 084 | 56 | 84 | 651 | 8 | 12 |
| P1, approche | 186 | 0 | 0 | 44 | 0 | 8 |
| P2, retour à demi-échelle | 18 633 | 41 | 50 (calibré à 62) | 1 033 | 4 | 8 |
| A2, passage de la caméra | 117 067 | 58 | 87 | 4 119 | 3 | 8 |

Devant E, le crénelage du montant porte le plafond par image à 59, au-dessus de l’ancien pic de 48. Le test exige donc aussi zéro pixel isolé sur le bord bas, où la régression initiale en produisait 534.

Les variantes de texture utilisent les mêmes poses, commandes et seuils de détection.

- **Filtrage.** Avec le dessin final des joints et le niveau 4 de Babylon, P en rotation donne 2 554 pixels (seuil 84). Passer les seuls seuils pavés au niveau 1 en laisse 394. Passer la seule mosaïque au niveau 1 en laisse 2 215. Les trois surfaces utilisent donc le niveau 1 et le total descend à 56. Le même réglage sur la texture commune des tunnels ramène P1 de 8 à 0 (seuil 0). Le flou à distance reste limité aux matériaux où les joints déclenchent la sonde.
- **Joints.** Avec le niveau 4 dans le pavillon et des joints de 5 % du carreau, les arrêter au filet donne 112 pixels devant E. Les prolonger au bord en donne 101. Le dessin final les prolonge. Avec des joints de 2,5 %, ce même trajet monte à 644, dont 433 sur le bord bas.
- **Graduations.** Repeindre les deux traits d’extrémité du couloir porte A2 à 233 pixels en approche, 290 en recul et 2 019 jusqu’au passage de la caméra. La règle commence donc à un mètre de chaque ouverture.
- **Pavés.** Avec le filtrage retenu, aligner le premier joint sur le bord donne 4 pixels isolés devant P1 et 44 au retour par P2. Le décalage d’un demi-carreau donne respectivement 0 et 41.

Dans le pavillon à profondeur 4, le test compare le voile de chaque sous-arbre commun à deux images consécutives aux distances 4, 8, 12, 16, 20, 24, 28, 32 et 40 m. Il calcule `clamp((d − start) / (end − start), 0, 1)`, avec zéro pour un voile désactivé. La variation doit rester strictement inférieure à 0,05, y compris quand la caméra franchit un portail pendant la rotation. Les pires sauts sont de 0,024857 en avance, 0,027778 en rotation et 0 en diagonale.

Un dernier test charge une page neuve et compte les effets compilés lors du premier passage du joueur par A puis d’une caisse par A2. Il attend zéro compilation supplémentaire pendant ces traversées. Sur la build de production, deux exécutions de `portalFlicker.spec.js` ont donné des rapports identiques, y compris les séries par image, les comptes par bord et les variations du voile.

`tests/portalShadows.spec.js` vérifie le prolongement des ombres à l’horloge manuelle :

- **Arche A → esplanade devant B.** La caisse de l’arche posée devant A sans chevaucher le plan (`z = 30,45`, au sol puis élevée en `y = 1,6` pour que le rayon issu de son centre transporté touche la face avant de B) assombrit le sable devant B de `[223, 185, 131]` à `[140, 119, 87]` (−68,0 de luminance ; écart nul avant la tâche D), alors qu’un point voisin et le même point lorsque la caisse est éloignée restent à `[223, 185, 131]`.
- **Aucune ombre parasite.** Le point du sable derrière B où tomberait l’ombre d’un clone non découpé (`(−29,94, 0, −32,31)`) et un point à l’ouest de l’ouverture hors du prisme lumineux (`(−32,35, 0, −31,95)`) restent inchangés à `[223, 185, 131]` (écart nul sur les trois canaux).
- **Double face arrière B → arrière A.** Une caisse derrière B projette son ombre sur le quadrillage ensoleillé derrière A (`[67, 104, 102]` → `[57, 87, 84]`, −15,6 de luminance).
- **Portails à sens unique, abris à l’ombre, compteur et effets.** `state().shadowCasters` vaut `0` loin des portails, `1` devant A (caisse seule ou à cheval avec `ghosts = 1`), `2` avec le joueur visible devant A, puis `1` quand le joueur est masqué. Sur une paire à sens unique en plein soleil, il vaut `0` sur la face sortante et sur les deux faces arrière, et `1` devant la face avant où le soleil entre. Sur les portails abrités (`Q` sous le plafond de la grande salle, joueur visible à 1 m de `B2` dans le couloir souterrain et à 0,8 m de `W` dans le pavillon), `isLightBlocked` maintient `shadowCasters` à `0`. Aucun effet n’est compilé pendant ces scénarios (`effects = 14` constant).
- **Suivi d’ombre du joueur à l’image près.** Sur l’esplanade de sable ensoleillée à l’horloge manuelle (`manualClock`), la lecture des pixels avant puis dès l’unique première image (`clock.step(0)`) suivant un déplacement direct vérifie que l’ombre du crâne quitte l’ancienne position (`[140, 119, 87] → [223, 185, 131]`) et apparaît immédiatement sur la nouvelle (`[223, 185, 131] → [140, 119, 87]`), sans retard d’une image malgré l’exclusion des maillages `late` de `scene.getActiveMeshCandidates`.

`tests/portalGhosts.spec.js` vérifie les fantômes simultanés sur deux portails créés loin des démos (`x ≈ 40, z = −45`) via `gowDev.portalSystem` puis détruits avec `removePortal` :

- **Deux portails côte à côte dans un même plan (`sides: "both"`).** À cheval sur la jonction et le plan, la caisse affiche deux fantômes (`state().ghosts === 2`, `crate.visual().ghosts === 2`) aux poses exactes `W_1(pose)` et `W_2(pose)` ; les `clipPlane` et `clipPlane2` de l’original et des deux fantômes sont vérifiés analytiquement et par lecture de pixels aux deux destinations (moitié engagée visible, moitié passée par l’autre portail et face arrière rejetées). En ne chevauchant plus qu’un portail, le compte redescend à `1` et `clipPlane2` revient au plan neutre ; loin des ouvertures, à `0`.
- **Deux portails en angle droit (90°) avec rotation et demi-échelle.** Les deux fantômes prennent la rotation et l’échelle de leur destination et reçoivent le plan transporté `warpPlane(W_i, discardPlane(P_j, −σ_j))`. Le test vérifie aussi deux fantômes simultanés sur le joueur, `isGhostActive`, `ghostCount`, `syncGhostAppearance` (synchronisation de `alpha` et `visibility` sur les deux fantômes), la restauration des plans au désenregistrement et zéro compilation d’effet pendant tout le scénario (`effects = 14` constant).

`tests/portals.spec.js` vérifie également le ciel voilable (`src/portals/sky.js`) :

- **Départ (passe racine)** : zéro pixel transparent (`alpha = 255` sur tout le framebuffer), couleur en haut d’écran conforme au dégradé attendu (`#e1dfbd` vers 70 % de la largeur, plus fraîche à gauche), et relief lointain visible devant le ciel.
- **Passe voilée vs non voilée (arche A)** : avec `setMaxDepth(1)` le long de la droite B–A (`passes = 2, fallbacks = 1`), le ciel vu à travers l’arche A prend exactement `fallbackColor` (`[159, 184, 173, 255]`) alors que le ciel de la passe racine reste sur le dégradé lumineux (`[222, 221, 188, 255]`). À profondeur 4 face à l’arche A (`fallbacks = 0`), le ciel vu à travers A retrouve le dégradé, sans aucune compilation d’effet supplémentaire (`effects = 14` constant). Les dix trajets de `tests/portalFlicker.spec.js` restent verts sans ajustement de tolérance (`21` pixels sur B, `32` sur A, résultats identiques sur les huit autres trajets).
- **Caméra passée derrière un portail (zone 2)** : joueur sur le panneau, dos au tunnel ; la caméra franchit A2 et se retrouve derrière B2, avec un repli au bout de la chaîne des arches. Le haut du ciel et le relief de l’horizon ne doivent pas prendre la couleur de repli (§ 6.6, `hazeLevels`). Ce test échouait avec un voile appliqué à tout le sous-arbre.
- **Avertissement sur les liens avec rotation (`portals.link`)** : zéro avertissement au chargement des démos et sur les liens translatifs (y compris avec échelle et dans la tolérance `1e-6`) ; un seul `console.warn` (hors `Logger.Warn` Babylon) sur un lien tourné au soleil même relié deux fois de suite, inversé ou délié puis relié ; zéro avertissement avec `{ allowRotation: true }` ou sans lumière directionnelle à ombres ; nettoyage par `unlink` et `removePortal`.

### 13.3 Mesure des performances

Mesure sur la build de production (`npm run build && npm run preview`, page ouverte avec `?dev`), en 1920 × 1080. `await gowDev.benchmark({ frames, warmup })` rend les images de façon synchrone, sans dépendre de `requestAnimationFrame` (souvent bridé dans un onglet en arrière-plan). Il renvoie `cpuMs` (soumission JavaScript de `scene.render()`), `frameMs` (même chose, puis synchronisation GPU par `readPixels`), `passes` et `drawCalls`. En jeu, l’overlay F3 affiche les i/s réels.

Valeurs du 21 novembre 2026, après la suite des portails (correctifs de scintillement, physique, ombres traversantes, deux fantômes, ciel dans la scène). Protocole : builds de production de la version de départ (commit `c4135dc`) et de la version finale ouvertes dans le **même** Chromium sans interface (`--enable-gpu --use-angle=gl`, Radeon RX 7900 XTX, 1920 × 1080), mesures intercalées, 4 répétitions par vue (`gowDev.benchmark({ frames: 200, warmup: 40 })`), médiane des moyennes de `cpuMs`. La colonne « ×3 » utilise le bridage CPU de Chromium pour approcher un processeur de portable. D’une série à l’autre, les valeurs varient d’environ ±5 % ; la première répétition d’une page est plus lente (compilation JIT).

| Point de vue | Appels de dessin (départ → final) | `cpuMs` ×1 (départ → final) | `cpuMs` ×3 (départ → final) |
| --- | ---: | ---: | ---: |
| Départ | 124 → 125 | 0,58 → 0,65 ms (+12 %, +9 % sans la répétition à froid) | 1,62 → 1,74 ms (+7 %) |
| Arche A (zone 1) | 119 → 120 | 0,52 → 0,58 ms (+10 %) | 1,54 → 1,61 ms (+5 %) |
| Couloir souterrain (zone 2) | 96 → 97 | 0,46 → 0,48 ms (+5 %) | 1,34 → 1,41 ms (+5 %) |
| Pavillon cyclique (zone 3), profondeur 4, 17 passes | 478 → 479 | 1,86 → 1,95 ms (+5 %) | 5,56 → 5,95 ms (+7 %) |
| Cabine (zone 4) | 91 → 92 | 0,41 → 0,44 ms (+8 %) | 1,17 → 1,24 ms (+5 %) |
| Tunnel d’échelle (zone 5) | 168 → 168 | 0,73 → 0,80 ms (+9 %) | 2,21 → 2,39 ms (+8 %) |

L’appel de dessin supplémentaire est le ciel de la passe racine (§ 6.4). Un projecteur d’ombre traversante actif (§ 7.5) ajoute un appel par maillage du voyageur dans la carte d’ombre (1 pour une caisse, 14 pour le squelette), et seulement quand le voyageur est au soleil près d’un portail. Le surcoût CPU restant (0,02 à 0,1 ms sans bridage) vient des fonctions ajoutées à chaque image : fantômes doubles, recherche des projecteurs d’ombre, doublures physiques, lissage du voile, ciel. Les optimisations qui le contiennent sont décrites au § 6.7.

Sans bridage, le pire cas (pavillon) prend environ 2 ms par image. Le coût GPU n’a pas pu être mesuré sur un portable : sur la carte de bureau, il se confond avec la latence de synchronisation (`frameMs − cpuMs` ≈ 0,6 ms). Pour valider les 60 i/s sur un portable, il suffit d’ouvrir la build avec `?dev` et de lancer `gowDev.benchmark()` devant le pavillon, ou de lire les i/s de l’overlay F3.

## 14. Limites connues

- Portails verticaux et statiques uniquement (pas de portail mobile ni incliné).
- Un voyageur qui chevauche plusieurs ouvertures affiche jusqu’à **deux** fantômes simultanés (les deux portails chevauchés les plus proches) ; au-delà de deux ouvertures chevauchées en même temps, seules les deux plus proches reçoivent un fantôme et un plan de coupe. La doublure physique (`bodyTraveler.js`) et le projecteur d’ombre traversante (`createShadowCaster`) continuent d’utiliser uniquement le portail chevauché le plus proche (`straddlingPortal`).
- La doublure transmet les variations de vitesse linéaire et angulaire. Ses corrections de position sont perdues à la resynchronisation. Sa boîte reste entière jusque dans la partie masquée par le plan de coupe du visuel. Seules les boîtes des caisses disposent d’une doublure physique. La capsule du joueur garde un seul corps.
- **Ombres traversantes** :
  - Seuls les voyageurs enregistrés dotés d’un visuel (joueur, caisses) projettent leur ombre à travers un portail (pas le décor statique).
  - Un seul portail d’ombre actif à la fois par voyageur (le premier traversé le long de `L`).
  - Seules les lumières directionnelles munies d’un générateur d’ombres sont traitées (lumières ponctuelles et spots ignorés) ; si plusieurs lumières directionnelles ont des directions distinctes, seule la première est prise en compte (les générateurs partageant la même direction réutilisent le même clone).
  - Des récepteurs surélevés situés **dans** le prisme lumineux entre l’ouverture de destination `D` et le clone (derrière `D`, au-dessus du plan inférieur du prisme) peuvent encore recevoir une ombre parasite ; le sol derrière `D` et les zones hors du prisme restent préservés.
  - Dès que le centre d’un objet à cheval a franchi le plan vers la sortie, la moitié traînante encore visible par le fantôme côté entrée n’est plus prolongée par le projecteur côté sortie (l’original et le fantôme projettent alors chacun leur moitié).
  - Le filtre `isLightBlocked` ne lance qu’un seul rayon depuis le centre du voyageur (`visual.center` ou `root.position`) vers `−L` sur 150 m : un voyageur dont le centre est à l’ombre tandis qu’une extrémité dépasserait encore au soleil n’active pas de projecteur d’ombre (sans conséquence lorsque les abords respectent la règle 11.2).
- **Liens avec rotation (`Δ ≢ 0 mod 2π`, § 11.1)** : règle documentée et imposée par l’API. La direction relative du soleil change de part et d’autre : chaque lieu garde son éclairage réel (identique vu dans le portail et une fois traversé), mais les taches de lumière, les ombres portées et la lueur solaire du ciel ne se raccordent pas au bord de l’ouverture (un lien qui inverse le sens de sortie du soleil sur la cible n’active pas de projecteur d’ombre). En présence d’une lumière directionnelle à ombres, `portals.link(a, b, options)` émet un avertissement `console.warn` une fois par paire de portails, sauf si `{ allowRotation: true }` est passé.
- **API internes de Babylon utilisées** : aucune (tous les appels dans `src/` utilisent uniquement l’API publique de Babylon.js ; l’ancien appel à `PhysicsCharacterController._refreshManifoldAtPosition` a été remplacé par `plugin.shapeCast` et le saut d’un pas de `checkSupportToRef` au § 7.3, voir `docs/BABYLON_PATCHES.md` § 2).
- Si le repli arrive très près (`E − S < hazeMinRange`), un léger saut de teinte est possible. Le ciel coûte un appel de dessin par image pour la passe racine ; les passes de portail le peignent dans le quad de fond de l’étape 2a, qui existait déjà (§ 6.4).
- WebGL 2 seulement. WebGPU utilise un NDC en [0, 1] et demanderait une autre formule oblique.
- La passe racine des maillages regroupés (§ 6.7) ne peut plus être cullée objet par objet à l’intérieur d’un lot. C’est volontaire : moins d’appels de dessin valent mieux qu’un culling fin pour ce décor.
- Performances GPU non mesurées sur un portable réel (§ 13.3). Le coût CPU est mesuré avec un bridage ×3 : 5,95 ms dans le pire cas (pavillon, profondeur 4), soit +7 % par rapport à la version de départ mesurée dans les mêmes conditions.

Limites résiduelles de rendu, mesurées image par image (§ 13.2) :

- Les sections internes referment les piliers et le linteau des arches. À la jonction, les deux moitiés reçoivent les ombres de leurs mondes respectifs. Une couture d’éclairage d’un pixel peut rester visible.
- Dans la récursion du pavillon, un montant lointain se projette sur moins d’un pixel. Devant E, les captures 43 à 45 montrent le même pixel occupé successivement par le calcaire du deuxième niveau, le mur bleu du troisième et le montant de la racine. Devant P, aux images 61 à 63, la fente entre une colonne et le montant laisse entrevoir la mosaïque. Ces occultations d’une image expliquent les deux exceptions au plafond de `frames / 2` (§ 13.2).

Corrections du 21/11/2026 : le débord des cadres, le décalage constant des sols et le recouvrement de la coupe oblique corrigent les conflits de profondeur signalés le 21/11/2026. Les plans de coupe permanents corrigent les compilations tardives pendant les traversées et les approches d’ombre : les variantes de l’original avec et sans plans de coupe (`CLIPPLANE` et `CLIPPLANE2`) sont compilées au préchauffage, les fantômes portent leurs plans en permanence, le projecteur d’ombre porte cinq plans (`CLIPPLANE`…`CLIPPLANE5`), le quad de fond fige son shader (`useClipPlane: false`, mode `useSky` par uniforme), et sur SwiftShader `warmUp` compile 14 effets au chargement sans aucune compilation supplémentaire pendant le jeu.

## 15. Améliorations de Babylon

Les limites de Babylon rencontrées, et les patchs proposés (non appliqués, le jeu n’en dépend pas), sont décrits dans `docs/BABYLON_PATCHES.md`. L’ordre de priorité pour les proposer en amont est dans `docs/BABYLON_UPSTREAM.md` :

- effacement forcé de la profondeur et du stencil entre `activeCameras` ;
- pas de culling optionnel dans `ObjectRenderer` (et `BoundingBox.IsInFrustum` limité à six plans) ;
- pas d’API publique pour rafraîchir les contacts du contrôleur de personnage après une téléportation ;
- pas d’aide pour la projection oblique en perspective ;
- `TargetCamera.setTarget` déplace la caméra de 1 mm quand elle et sa cible ont la même coordonnée z ;
- opérations stencil des faces arrière réglées à part (piège documentaire plutôt que défaut).

## 16. Tâches ordonnées

Chaque tâche est générée par Codex (`gpt-6.2-astra`, effort `max`) puis relue : diff, `npm run build`, `npm test`, contrôle visuel dans Chromium et Firefox. On ne passe à la suivante que si la précédente compile, passe les tests et respecte ce document.

1. **Mathématiques** : `src/portals/math.js`, `src/portals/layers.js`, `tests/portalMath.spec.js` (§ 3, 5, 6.5, 13.1).
2. **Rendu** : `portal.js`, `renderer.js`, `system.js`, `index.js` ; brouillard et repli ; contours et statistiques ; carte agrandie et zone 1 (arches, sans traversée) ; hook dev minimal (`state`, `teleportPlayer`, `portal`, `setMaxDepth`) ; overlay F3 (§ 6, 10, 12.1, 12.2).
3. **Traversée** : `travelers.js`, `bodyTraveler.js` ; pas physique fixe ; `applyWarp` et échelle du joueur ; caisses ; fantômes et plans de coupe ; hook (`setControls`, `crate`) ; test Playwright de la zone 1 (§ 7, 8, 10.3).
4. **Caméra** : `cameraPath.js`, `traceView`, intégration à `thirdPersonCamera.js` ; garde ε ; plan proche adaptatif ; `applyWarp` de la caméra ; test de la caméra seule de l’autre côté d’un portail (§ 9).
5. **Démos 2 à 5** : zones, intérieurs cachés, caisses, règles d’éclairage, réapparition, tests Playwright 2 à 5 (§ 11, 12).
6. **Finitions** : mesures de FPS, `docs/BABYLON_PATCHES.md`, mise à jour de ce document (limites, valeurs mesurées), README.

État au 21 novembre 2026 : tâches 1 à 6 réalisées. La tâche 6 a été découpée en trois : 6a pour l’outil `gowDev.benchmark`, 6b pour le regroupement du décor statique, et les fichiers de correctifs Babylon. À leur livraison, `npm run build` passait et `npm test` donnait 60 tests verts (23 tests d’origine, 22 tests mathématiques et 15 tests de portails). Les vérifications de rendu ajoutées depuis figurent au § 13.

Suite du 21 novembre 2026 (branche `experiment/portals-polish`), mêmes règles de relecture :

7. **Outil de détection** : horloge manuelle, sonde de contour, statistiques du voile, compteur d’effets, tests de scintillement (§ 10.3, 13.2).
8. **Correctifs de rendu** : cadres avancés de 1 cm, sols à `zOffsetUnits`, `clipBias` plafonné, voile lissé, variantes de plans de coupe préparées (§ 6.4 à 6.6, 7.5, 11).
9. **Physique à travers les portails** : doublure physique, calques `portalBack` et `portalFrame`, appui lu par `shapeCast` à l’arrivée (§ 7).
10. **Ombres traversantes** : projecteurs d’ombre au calque 0 coupés par le prisme de lumière (§ 7.5).
11. **Deux fantômes** par voyageur (§ 7.5).
12. **Ciel dans la scène**, voilable (§ 6.4, 6.6).
13. **Liens avec rotation** : avertissement de `link` (§ 11.1).
14. **Performances** : candidats de la caméra principale, carte d’ombre limitée aux projecteurs activés, projecteurs seulement au soleil, ciel peint par le quad de fond, plans nuls au repos (§ 6.7, 13.3).

Les tâches 7 à 13 et la première version de la tâche 14 ont été générées par Codex (`gpt-6.2-astra`) puis par Gemini (`gemini-4-neon-xhigh`, via `agy`), et relues ; la fin de la tâche 14 a été écrite directement. `npm run build` passait alors et `npm test` donnait 100 tests verts. La suite compte 102 tests au commit `71406e0`. L’état des tests après la review de cohérence est dans `docs/REVIEW.md`.
