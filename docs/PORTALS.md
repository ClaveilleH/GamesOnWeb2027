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

`material.clipPlane = new Plane(a, b, c, d)` **rejette** les fragments où `a·x + b·y + c·z + d > 0` (`clipPlaneFragment` : `if (fClipDistance > 0.0) discard;`). Le plan est par matériau. Le générateur d’ombres en tient compte. Le changer change les `defines`, avec une variante de shader par état, mise en cache.

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
| `src/portals/math.js` | Fonctions pures, sans scène : warps (création, inverse, composition, application à un point, une direction, un lacet, une matrice), plans, distance signée, franchissement d’un segment, intersection rayon–ouverture, distance point–ouverture, projection oblique de Lengyel, rectangle écran d’une ouverture (découpée contre le plan proche), plans du frustum d’ouverture. Seules les classes mathématiques de Babylon sont utilisées (`Vector3`, `Matrix`, `Quaternion`, `Plane`). Testable sous Node. |
| `src/portals/layers.js` | Constantes de calques (§ 3.7). |
| `src/portals/portal.js` | `createPortal(scene, options)` : données d’un portail (repère, ouverture, faces, lien, warp en cache), maillage d’ouverture interne, contour de debug. |
| `src/portals/renderer.js` | Rendu : arbre de passes de l’image, caméras virtuelles, projection oblique, opérations stencil, passes `ObjectRenderer`, repli, voile, statistiques. |
| `src/portals/travelers.js` | Voyageurs : détection des franchissements (pas fixe), appel du warp, fantômes et plans de coupe des objets à cheval (rendu). |
| `src/portals/bodyTraveler.js` | Adaptateur générique pour un corps dynamique Havok (`PhysicsBody`) : téléportation, vitesses, échelle de la forme, de la masse et de la gravité, interpolation du visuel. |
| `src/portals/cameraPath.js` | Chemin de vue à travers les portails pour la caméra à la troisième personne : segments, collisions, warp cumulé, garde ε, plan proche adaptatif. |
| `src/portals/system.js` | `createPortalSystem(scene, options)` : façade publique, registre des portails et des voyageurs, réglages, observables, branchement sur la boucle de rendu, `dispose`. |
| `src/portals/index.js` | Exports publics. |
| `src/dev/devHook.js` | Hook de pilotage réservé au mode dev (§ 10.3). |
| `src/world/portalDemos.js` | Les cinq zones de démonstration (§ 12), avec uniquement l’API publique. |

Intégration hors module : `src/main.js` (création du système, ordre de la boucle), `src/player/playerController.js` (échelle et `applyWarp`), `src/player/thirdPersonCamera.js` (chemin de vue, échelle), `src/player/skeletonVisual.js` (calque `late`, échelle), `src/ui/hud.js` (overlay F3), `src/world/testTerrain.js` (carte agrandie), `src/world/crates.js` (caisses).

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
  apertureMargin: 0.03,           // débord de l’ouverture dessinée sur le cadre (anti-fissures)
  clipBias: 0.002,                // recul du plan oblique vers la caméra virtuelle (× échelle cumulée)
});

const a = portals.createPortal({
  name: "arche nord",
  origin: new Vector3(0, 0, 31),  // centre du bas de l’ouverture
  yaw: Math.PI,                   // normale avant = (sin yaw, 0, cos yaw)
  width: 2.4, height: 3,
  sides: "both",                  // "front" | "both"
});
const b = portals.createPortal({ /* … */ });
portals.link(a, b);               // lien bidirectionnel ; l’échelle vient des tailles (B.width / A.width)
portals.unlink(a);

portals.settings.maxDepth = 5;    // réglable à chaud (et maxPasses, fallbackColor, haze)
portals.stats;                    // { passes, depthReached, fallbacks, visiblePortals } de la dernière image
portals.setDebugVisible(true);    // contours des portails

const unregister = portals.addTraveler(adapter);   // voir ci-dessous
portals.updateTravelers();        // à chaque pas fixe, après la physique : franchissements → adapter.applyWarp
portals.updateGhosts();           // à chaque image, après la pose des visuels : fantômes et plans de coupe
portals.onTraverseObservable;     // Observable<{ traveler, portal, warp }>
portals.resetTraveler(adapter);   // après un placement direct (réapparition, hook dev) : oublie la position précédente
portals.syncGhostAppearance(adapter);   // répercute tout de suite alpha et visibility sur le fantôme (fondu du joueur)
portals.activeGhosts;             // nombre de fantômes affichés

portals.traceView(origin, direction, distance, options);   // § 9
portals.nearestPortalDistance(point);                      // distance à l’ouverture la plus proche
portals.dispose();
```

Objet `portal` : `{ name, origin, yaw, width, height, sides, target, warp, normal, right, signedDistance(p), contains(localPoint) }`. Le `warp` va de ce portail vers `target`, ou vaut `null` si le portail n’est pas lié. Changer le repère d’un portail après sa création n’est pas pris en charge en v1. Les portails sont statiques.

Objet `warp` (renvoyé par `math.js`) : `{ rotationY, scale, translation, matrix, point(p, out), direction(v, out), yaw(θ), quaternion(q, out), inverse() }`. `matrix` est la `Matrix` Babylon équivalente. `quaternion(q)` renvoie `R_y(Δ) ⊗ q`.

### 5.1 Contrat d’un voyageur

```js
portals.addTraveler({
  name: "joueur",
  center(out) { /* écrit dans out le point simulé testé (centre de capsule, centre du corps) */ return out; },
  canTraverse(portal) { return true; },          // facultatif
  applyWarp(warp, portal) { /* transforme position, vitesse, orientation, échelle et la pose précédente d’interpolation */ },
  visual: {                                      // facultatif : active les fantômes
    root,                                        // TransformNode racine du visuel (pose interpolée de l’image)
    radius() { return 1.1 * scale; },            // rayon englobant du visuel, échelle comprise
    materials,                                   // matériaux exclusifs au voyageur (le système les clone pour le fantôme)
  },
});
```

`addTraveler` exige des matériaux **exclusifs** : le plan de coupe est posé sur le matériau. L’adaptateur clone donc les matériaux partagés avant l’enregistrement. Le système synchronise à chaque image `alpha` et `visibility` des matériaux du fantôme avec ceux de l’original.

`createBodyTraveler(portals, { body, visual, size, scale })` (`bodyTraveler.js`) fournit un adaptateur prêt à l’emploi pour un corps dynamique Havok (§ 7.4).

## 6. Flux de rendu

### 6.1 Pourquoi `ObjectRenderer` plutôt que `scene.activeCameras`

`Scene.render` appelle `_processSubCameras(camera, cameraIndex > 0)`. Pour chaque caméra après la première, cela efface **la profondeur et le stencil** (`_bindFrameBuffer` → `_clearFrameBuffer` → `engine.clear(null, false, true, true)`), sans option pour l’éviter. Une liste `activeCameras` détruirait donc le stencil entre deux niveaux.

`ObjectRenderer` (public depuis Babylon 7) dessine une liste de maillages avec une caméra donnée dans le framebuffer **courant**, sans l’effacer. `initRender` règle les matrices et l’UBO de scène (un UBO par appel dans l’image). On l’utilise pour toutes les passes de portail. Ses limites : il ne fait pas de culling (on lui fournit la liste via `getCustomRenderList`), et il vide la profondeur et le stencil au début d’un groupe de rendu > 0 si la scène l’a configuré ainsi. Le système appelle donc `scene.setRenderingAutoClearDepthStencil(i, false)` pour i = 1 à 3.

### 6.2 Déroulé d’une image

1. `scene.onBeforeRenderObservable` (main.js) : logique du jeu au pas fixe, pose des visuels, `portals.updateGhosts()`, caméra (`traceView`).
2. `scene.onBeforeCameraRenderObservable` (caméra principale) : le renderer construit l’**arbre de passes** sur le CPU (§ 6.3) et règle la caméra principale (`layerMask = world`, brouillard neutre).
3. Babylon rend la caméra principale : cartes d’ombre (une fois par image), puis les maillages `world` visibles. Le stencil vaut 0 partout (`autoClearDepthAndStencil`), et son test est désactivé pour la passe racine.
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
- Plan de coupe oblique : le plan de D, orienté pour garder le demi-espace **opposé** à l’œil virtuel, reculé de `clipBias·σ_C` vers l’œil (§ 6.5). On fige la projection obtenue avec `camera.freezeProjectionMatrix(m)`.
- `planes` : les plans de `Frustum.GetPlanesToRef(view × projOblique)`, plus les 4 plans qui passent par l’œil virtuel et chaque bord de l’ouverture de D (marge `apertureMargin`), orientés vers l’intérieur. Seuls les maillages visibles à travers D sont donc dessinés.
- σ_C = σ_N × W.scale.

Liste de maillages d’une passe : `scene.meshes` filtrés par calque (`world` ou `late`), `isEnabled()`, `isVisible`, `visibility > 0`, présence de sous-maillages et `isInFrustum(planes)`. Pour un nœud non racine, on filtre aussi par `rect` (la boîte englobante projetée doit toucher le rectangle) si c’est peu coûteux.

### 6.4 Parcours stencil (pré-ordre)

Notation : N est un nœud de niveau k, C un enfant de niveau k + 1. Les références stencil valent le niveau. Le scissor du moteur vaut `C.rect` pendant tout le traitement de C, puis revient à `N.rect` (racine : pas de scissor).

| Étape | Liste dessinée | Caméra | Couleur | Profondeur | Stencil |
| --- | --- | --- | --- | --- | --- |
| 1. Marquer | ouverture de C | N | off | test `LEQUAL`, écriture off | `EQUAL k`, masque d’écriture 0xFF, `zpass INCR`, sinon `KEEP` |
| 2a. Vider (C normal) | quad plein écran, z = 1 | — | `(0, 0, 0, 0)` (ciel CSS) | `ALWAYS`, écriture on (1.0) | `EQUAL k+1`, écriture 0 |
| 2b. Remplir (C repli) | quad plein écran | — | `fallbackColor` opaque | `ALWAYS`, écriture on | `EQUAL k+1`, écriture 0 |
| 3. Monde de C | maillages `world` de C | C | on | `LEQUAL`, écriture on | `EQUAL k+1`, écriture 0 |
| 4. Enfants de C | récursion (étapes 1 à 6 avec N := C) | | | | |
| 5. Tardifs de C | maillages `late` de C | C | on | `LEQUAL`, écriture on | `EQUAL k+1`, écriture 0 |
| 6. Restaurer | ouverture de C | N | off | `ALWAYS`, écriture on | `EQUAL k+1`, masque 0xFF, `zpass DECR` |

Pour un nœud de repli, on enchaîne 1, 2b et 6. Après l’étape 6, la région de C revient à la référence k, et sa profondeur est celle du plan de l’ouverture vu par N. Les frères suivants et les tardifs de N voient donc l’ouverture comme une surface opaque à cette profondeur. Les objets placés devant passent, ceux qui sont derrière sont masqués.

Pourquoi le pré-ordre (dessiner N avant ses enfants) plutôt que l’approche post-ordre « enfants d’abord » de Rinsma ? Le marquage de l’étape 1 teste la profondeur de N. Une ouverture cachée par un mur, ou par une autre ouverture déjà restaurée, ne marque donc rien. Deux portails qui se recouvrent à l’écran restent corrects, même avec du ciel dans leur destination.

Détails :

- **Maillage d’ouverture** : rectangle `(width + 2·margin) × (height + 2·margin)` dans le repère du portail, de `y = −margin` à `height + margin`, sans culling des faces arrière. Calque `internal`, `ShaderMaterial` réduit à la position (`world`, `viewProjection`). Les états de profondeur et de couleur passent par `disableColorWrite`, `disableDepthWrite` et `depthFunction` du matériau. Le stencil vient de l’état **global** du moteur (`engine.setStencilBuffer`, `setStencilFunction`, `setStencilFunctionReference`, `setStencilFunctionMask`, `setStencilMask`, `setStencilOperationPass/Fail/DepthFail`). Le matériau n’active jamais `material.stencil`.
- **Quad plein écran** : deux triangles en NDC, et un vertex shader `gl_Position = vec4(position.xy, 1.0, 1.0)`. La profondeur vaut donc 1, à la limite incluse du volume de clipping. Une couleur uniforme. Calque `internal`.
- On ne coupe jamais l’écriture de couleur au niveau du moteur pendant l’évaluation des matériaux de scène. `PrepareDefinesForFrameBoundValues` lit `engine.getColorWrite()` pour le define `DEPTHPREPASS`, et créerait une variante parasite.
- **Préchauffage** : chaque `ObjectRenderer` a son propre `renderPassId`, donc ses propres « draw wrappers ». Avant de masquer l’écran de chargement, appeler `isReadyForRendering` sur la liste complète. Sinon, les maillages peuvent manquer à la première image d’un portail.

### 6.5 Projection oblique (Lengyel), forme Babylon

Entrées : la projection de base `P` (symétrique), la matrice de vue `V` de la caméra virtuelle, et le plan monde `(n, o)` orienté vers le côté **gardé**, puis reculé de `clipBias·σ` vers l’œil.

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
  - Pour un sous-arbre T : `S_T` est la plus grande distance apparente des coins de l’ouverture de T vus depuis la racine, de sorte que le voile soit nul sur toute l’ouverture de T (continuité avec la racine, qui n’est pas voilée). `E_T` est la plus petite distance apparente des ouvertures de repli de T, mesurée dans la passe parente. S’il n’y a pas de repli, le voile est désactivé (`fogStart = 1e8`, `fogEnd = 1e9`). Si `E_T − S_T < hazeMinRange`, on prend `E_T = S_T + hazeMinRange` (limite connue : un léger saut de teinte sur le repli). Le voile ne commence qu’à `max(S_T, E_T − hazeRange)` : seule la bande qui précède le repli se teinte, et un repli lointain ne brouille pas toute la vue à travers l’ouverture.
  - Mise en œuvre : `scene.fogMode = Scene.FOGMODE_LINEAR` en permanence, pour ne pas basculer les defines à chaque passe. Racine : `fogStart = 1e8`, `fogEnd = 1e9`. Passe de niveau ≥ 1 : `fogStart = max(S_T, E_T − hazeRange)·σ`, `fogEnd = E_T·σ`, `fogColor = fallbackColor`. `StandardMaterial` relie les paramètres de brouillard à chaque dessin d’un matériau non gelé (`BindFogParameters`). La distance de brouillard de Babylon est la longueur de la position en espace vue. Si le jeu utilise plus tard son propre brouillard, le renderer sauvegarde ses réglages, les applique à la racine et les restaure en fin d’image.
  - Le ciel CSS (canevas transparent) ne peut pas être voilé. Les démos évitent les chaînes de repli qui donnent sur le ciel (§ 11).

### 6.7 Coût et 60 FPS

- Culling par ouverture (§ 6.3), scissor par région et stencil testé tôt : les passes profondes ne dessinent que quelques maillages, sur peu de pixels.
- Budget `maxPasses`, profondeur 4 et repli.
- Pas d’allocation par image : pools de caméras, de nœuds, de matrices et de listes.
- Ombres : un seul `ShadowGenerator` 4096 (environ 3,7 cm par texel sur un volume fixe de 150 m) couvre toute la carte et les intérieurs, rendu une fois par image ; faces arrière seules (`forceBackFacesOnly`) et biais faibles, pour éviter l’acné sans détacher l’ombre des os fins du squelette.
- Décor statique regroupé par zone et par matériau au chargement (`src/world/staticBatch.js`, `Mesh.MergeMeshes`). Les corps Havok restent sur les nœuds d’origine, sans géométrie de rendu. Les lots ne mélangent ni les zones ni l’intérieur et l’extérieur d’une même démo, pour garder un culling utile aux passes. La carte d’ombre passe de 196 à 52 appels de dessin, le pavillon de 913 à 418.
- Listes candidates `world` et `late` construites une fois par image. Les dessins consécutifs d’une même caméra (marquage, puis remplissage) partagent un seul `initRender`.
- Les mesures (§ 13.3) se font sur la build de production.

## 7. Traversée et physique

### 7.1 Ordre dans la boucle (main.js)

```
onBeforeRender :
  pas fixes (FIXED_STEP) :
    entrées → player.update(dt, controls, cameraYaw)
    physique Havok : plugin.executeStep(dt, physicsEngine.getBodies())   (scene.physicsEnabled = false)
    caisses : mémoriser la pose précédente → lire la pose courante
    portals.updateTravelers()   → applyWarp des voyageurs qui ont franchi
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

- `playerController.applyWarp(warp)` : position de la capsule `W.point`, vitesse `W.dir`, `state.yaw = W.yaw(yaw)`, pose précédente d’interpolation transformée (position et lacet), `scale *= warp.scale` (§ 8), puis **rafraîchissement des contacts** au nouveau point. `capsule.setPosition` garde la liste des contacts du point de départ, et `checkSupport` l’utiliserait. Babylon 9.37 n’offre que la méthode interne `_refreshManifoldAtPosition(position)`. Le joueur reste donc au sol sans à-coup d’animation, à la différence du retour au point de départ (`respawn`), qui force l’état non soutenu. Limite documentée et patch proposé dans `docs/BABYLON_PATCHES.md`.
- Le centre testé est le centre de la capsule.
- `main.js` relaie le warp à la caméra (`camera.applyWarp(warp)`, § 9.4) quand le voyageur est le joueur.

### 7.4 Corps dynamiques (caisses)

`createBodyTraveler` (bodyTraveler.js) gère un `PhysicsBody` dynamique à forme de boîte, de taille de base `size`, et un **visuel séparé** interpolé entre la pose précédente et la pose courante, comme le joueur :

- `applyWarp` : nouvelle position `W.point`, rotation `W.quaternion`, vitesse linéaire `W.dir`, vitesse angulaire tournée (`R_y(Δ)`, sans échelle), appliquées par `plugin.setPhysicsBodyTransformation(body, node)` après mise à jour du nœud. Si `warp.scale ≠ 1` : nouvelle `PhysicsShapeBox` aux dimensions `size·scale`, masse × s³ (`setMassProperties`), `setGravityFactor(scale)` (§ 3.6), visuel `scaling = scale`. La pose précédente d’interpolation est transformée.
- Les caisses sont dans le calque `world` : opaques, elles se dessinent avant les portails de leur passe. Leurs formes Havok ont le calque de collision `collisionLayer.dynamic`. La caméra ne les heurte pas.
- `createCrate(scene, portals, { name, position, size, yaw, color })` (`src/world/crates.js`) assemble une caisse prête à l’emploi. Le hook dev l’expose par son nom. Le joueur la pousse (masse 75 kg et force 1 200 N à l’échelle 1, × s³ à l’échelle s). À la sortie d’un portail, si la capsule chevauche une caisse encore engagée, la récupération de pénétration du contrôleur est suspendue pour ce pas. Sinon, Havok pourrait la renvoyer à travers le plan.

### 7.5 Fantômes et plans de coupe (objets à cheval)

À chaque image, après la pose interpolée des visuels : pour chaque voyageur avec visuel, on cherche le portail P le plus proche tel que `|d(c)| < r` (c : position de la racine du visuel, r : `radius()`) et que la projection de c sur le plan tombe dans l’ouverture élargie de r. Si un tel portail existe :

- σ = signe de `d(center())`, le centre **simulé** du dernier pas fixe, et non la position interpolée du visuel. Le visuel a jusqu’à un pas de retard. Juste après une téléportation, il peut encore être derrière le portail de sortie alors que le corps simulé est déjà passé. Lire σ sur le visuel ferait basculer la coupe pendant une image. Le visuel et l’état simulé sont toujours dans le même espace, puisque la pose précédente d’interpolation est transformée à la traversée.
- Matériaux de l’original : `clipPlane = Plane(−σ·n, σ·n·o)` du portail P. On rejette la partie qui a déjà traversé.
- Fantôme : clone de la hiérarchie du visuel (`root.clone`, géométrie partagée), avec des clones des matériaux, au calque `late`. Sa racine prend `W(pose de la racine)` (position, `rotationQuaternion` ou lacet, `scaling × s`). Les nœuds descendants copient leurs transformations locales depuis l’original (paires établies au clonage, dans le même ordre). Matériaux : `clipPlane = Plane(−σ·n_D, σ·n_D·o_D)` du portail D = P.target. On ne montre que la partie qui a traversé.
- Sinon, les plans de coupe repassent à `null` et le fantôme est désactivé (`setEnabled(false)`).

Les ombres suivent : le générateur respecte les plans de coupe. L’original n’ombre que du côté source, le fantôme que du côté destination. Un seul portail à la fois par voyageur (limite).

## 8. Échelle

- Un lien a une échelle `s = B.width / A.width`. Les ouvertures liées doivent être homothétiques, sinon `link` lève une erreur.
- **Joueur** (`playerController.setScale(s)`, appelée par `applyWarp`) :
  - `capsule.setShapeOptions({ capsuleHeight: PLAYER.height·s, capsuleRadius: PLAYER.radius·s }, true)` (pieds conservés), puis `keepDistance`, `keepContactTolerance` et `maxStepHeight` × s ; `characterMass` et `characterStrength` × s³ ;
  - vitesses de marche et de course, accélérations et freinages × s ; `jumpSpeed` × s ; gravité appliquée au contrôleur × s. Le saut dure autant et monte s fois plus haut (§ 3.6) ;
  - visuel : `visual.root.scaling = s`. L’animation reçoit `speed / s` pour garder ses seuils de démarche ;
  - `respawn` remet l’échelle à 1.
- **Caméra** : hauteur d’épaule, distance, dégagement aux murs, distances de fondu et `minZ` × s (s = échelle du joueur).
- **Rendu** : une passe vue à travers des portails d’échelle cumulée σ dessine avec `near` et `far` × σ. Les distances de voile sont ramenées à des distances apparentes (§ 6.6).
- **HUD** : vitesse affichée en m/s du monde. Le dataset expose aussi `scale`.

## 9. Caméra à la troisième personne

### 9.1 Chemin de vue

`portals.traceView(origin, direction, distance, { collide, clearance, epsilon })` part de la cible (épaule lissée, espace du joueur) vers l’arrière, sur `distance` mètres en espace du joueur :

- Pour chaque segment : premier portail franchi (intersection rayon–ouverture, avec les règles de face du § 7.2) et premier obstacle (`collide(from, to)` → distance du choc ou `null`, raycast Havok filtré sur le terrain, fait dans l’espace du segment).
- Un obstacle d’abord : arrêt à `distanceChoc − clearance·σ`.
- Un portail d’abord : le segment continue de `W.point(x)` dans la direction `W.dir(d)` normalisée. La longueur restante est multipliée par `W.scale`, et `W` s’accumule (`composeWarps`).
- Résultat : `{ position, target: Wcumulé.point(origin), warp: Wcumulé, allowed, nearestPortalDistance }`. `allowed` est la distance libre en espace du joueur, avant tout obstacle. Le chemin déplié est une droite dans l’espace final : la caméra regarde `target` et voit le joueur à travers les ouvertures.

### 9.2 Épaule lissée et lissage

La cible de la caméra est l’épaule **lissée**, en retard sur l’épaule simulée. Juste après une traversée, elle peut se trouver de l’autre côté du portail de sortie. Avant le chemin de vue, `thirdPersonCamera.follow` trace donc un court chemin de l’épaule simulée vers l’épaule lissée (`locateShoulder`). S’il franchit un portail, la vue part de l’épaule lissée dans **son** espace, avec la direction transformée. `isViewWarped` compare ces deux chemins pour savoir si la caméra est dans un autre espace que le joueur (`warped`).

La logique actuelle (rétraction immédiate, relâchement progressif) s’applique à `allowed`, en unités de l’espace du joueur. Un second appel sans collision (`collide` absent) place la caméra à la distance lissée.

### 9.3 Garde ε et plan proche adaptatif

- Si la position finale est à moins de `ε = 2·MIN_NEAR·σ` du plan d’une ouverture (projection dans l’ouverture élargie de ε), on raccourcit la distance de ce qu’il faut pour que la caméra soit à ε **avant** le plan, du côté d’où vient le chemin. La caméra n’est jamais posée sur le plan.
- `camera.minZ = clamp(0.5 · nearestPortalDistance(position), MIN_NEAR, CAMERA_MIN_Z) · σ_cam`, avec `MIN_NEAR = 0.005` et `CAMERA_MIN_Z = 0.04` (valeur actuelle), et σ_cam l’échelle cumulée de la caméra (échelle du joueur × échelle du chemin). Le plan proche ne traverse donc jamais une ouverture.
- `camera.maxZ = 500` (au lieu de 10 000, pour la précision de profondeur).

### 9.4 Warp de la caméra quand le joueur traverse

`camera.applyWarp(warp)` : `yaw += Δ`, cible lissée `W.point`, distance lissée inchangée (en unités du joueur, qui changent d’échelle avec lui). La caméra ne saute pas : le nouveau chemin, parti du joueur téléporté, retraverse le même portail à l’envers et retrouve la même position monde.

### 9.5 Commandes

Le lacet passé à `player.update` est le lacet logique de la caméra (espace du joueur), pas celui de la caméra rendue. Les déplacements restent relatifs à la vue après n’importe quel warp.

## 10. HUD, overlay de debug, hook dev

### 10.1 Overlay F3 (existant, étendu)

Le panneau `#player-state` affiche en plus `Portails : profondeur 3/4 · 9 passes · 60 i/s` (profondeur atteinte / maximale, passes de la dernière image, `engine.getFps()` arrondi), dans des éléments dédiés. Il expose aussi `data-portal-depth`, `data-portal-passes`, `data-fps` et `data-scale` dans son dataset. F3 active les **contours** des portails (`portals.setDebugVisible`) : un rectangle `LinesMesh` par ouverture, de la même couleur pour les deux portails d’un lien. Ces contours sont dans le calque `world`, donc visibles aussi à travers les portails.

### 10.2 Statistiques

`portals.stats` : `passes` (1 pour la racine + nœuds non repli), `depthReached` (niveau maximal non repli), `fallbacks`, `visiblePortals` (enfants de la racine).

### 10.3 Hook dev

Le hook est actif si `import.meta.env.DEV` est vrai ou si l’URL contient `?dev`. La CI teste la build de production, qu’elle publie ensuite : on ne peut pas retirer le hook à la compilation. Le paramètre d’URL suit le précédent de `?browser=`. Il expose `window.gowDev` :

```js
gowDev.state() → {
  player: { x, y, z, yaw, scale, grounded, capsuleHeight },
  camera: { x, y, z, yaw, pitch, minZ, warped },   // warped : la caméra est dans un autre espace que le joueur
  portals: { depth, maxDepth, passes, fallbacks },
  fps,
  traversals: [{ traveler, portal, frame }],       // 32 derniers franchissements
}
gowDev.teleportPlayer({ x, y, z, yaw })             // pieds ; remet vitesse, interpolation et caméra derrière le joueur
gowDev.setControls({ forward, strafe, sprint, jump } | null)   // commandes virtuelles fusionnées avec le clavier
gowDev.crate(name) → { state(), place({ x, y, z, yaw }), push({ x, y, z }) }   // state : { x, y, z, yaw, scale }
gowDev.portal(name) → { origin, yaw, width, height, sides, target, scale }
gowDev.setMaxDepth(n)
```

## 11. Règles de conception des niveaux

Ces règles garantissent un éclairage et des ombres cohérents. La scène a un soleil directionnel global (`DirectionalLight` « soleil », direction `(−0.58, −1, 0.48)` : ses rayons descendent vers −X et +Z, ils viennent du sud-est) et une lumière hémisphérique globale.

1. **Liens translatifs** : dans les démos, chaque lien a `Δ = 0` (`yaw_B = yaw_A − π`), avec ou sans échelle. Le soleil garde alors la même direction relative de part et d’autre d’une ouverture, et ombres comme reflets se raccordent. Les liens avec rotation restent permis par l’API. Chaque lieu y est éclairé comme il l’est réellement, mais une tache de soleil peut ne pas se raccorder au bord de l’ouverture (§ 14).
2. **Abris équivalents** : les abords des deux ouvertures d’un lien reçoivent le même éclairage direct. Soit les deux sont à l’air libre avec un cadre identique (arches), soit les deux sont à l’ombre. Une ouverture dont la face avant regarde vers **+Z ou −X** ne reçoit jamais de soleil direct à l’intérieur : les rayons voyagent vers +Z et −X, ils n’entrent pas par une face qui leur fait face dans le même sens. Une ouverture tournée vers −Z ou +X doit être au fond d’un abri couvert d’au moins 3 m. Avec 53° d’élévation, un rayon qui entre par le haut d’une porte de 3 m touche le sol avant 2 m.
3. **Intérieurs cachés** : les intérieurs plus grands que leur enveloppe sont de la vraie géométrie, **sous la dalle** (sol à y = −20), fermée (plafond compris) et projetant des ombres. Ils sont éclairés par les mêmes lumières : le plafond les met à l’ombre, comme un vrai intérieur. La carte d’ombre doit couvrir la carte entière et les intérieurs, du sol de surface à y = −20 : `sun.autoCalcShadowZBounds = true` ou des bornes et une position de soleil adaptées, avec `ShadowGenerator` 4096.
4. **Sols alignés** : le bas d’une ouverture est au niveau du sol, des deux côtés. Les ouvertures liées ont des sols équivalents.
5. **Ouvertures libres** : le passage n’a pas de collisionneur, et l’espace juste derrière le plan d’un portail à sens unique est libre sur au moins 0,6 m, pour qu’un objet à cheval ne heurte rien. Le cadre, s’il existe, est de la vraie géométrie avec collisions.
6. **Pas de repli sur le ciel** : une chaîne de récursion qui atteint la profondeur maximale doit se terminer dans un intérieur fermé (pièces cycliques). Le voile ne peut pas teinter le ciel CSS.
7. **Point de réapparition** : le jeu fait réapparaître le joueur sous y = −7 en surface. Dans un intérieur (volume déclaré par la zone), seule la limite y = −30 s’applique.

## 12. Démos

### 12.1 Carte

- Champ de 100 m × 100 m (x, z ∈ [−50, 50]). La dalle physique `dalle` est agrandie. Le reste du sol reçoit une texture de quadrillage répétée (maille de 1 m, traits majeurs tous les 5 m, mêmes teintes que l’existant).
- La zone d’entraînement actuelle (sol peint de 40 m, rampes, sauts, escalier, point de départ `(0, 3.65, −10)`) est inchangée au centre. Les tests existants en dépendent.
- Le relief lointain passe des rayons 59 et 82 à 95 et 125.
- Chaque zone a son sol peint (`DynamicTexture` de 1024 px environ par zone) avec un **panneau au sol** qui la nomme, dans le style du marquage « DÉPART » : « PARADOXE SPATIAL », « ARCHITECTURE NON EUCLIDIENNE », « PIÈCES CYCLIQUES INFINIES », « GÉOMÉTRIE IMPOSSIBLE », « MANIPULATION D’ÉCHELLE ».
- Les intérieurs cachés sont sous la dalle (§ 11.3).

### 12.2 Zone 1 : paradoxe spatial

- Arche A au milieu du quadrillage au nord, `origin (0, 0, 31)`, `yaw = π` (face avant vers le sud, côté du point de départ), ouverture 2,4 × 3 m, `sides: "both"`. Cadre : deux piliers et un linteau, avec collisions.
- Arche B identique sur une **esplanade de sable** au sud-ouest (disque de 14 m de diamètre, sol sable, obélisques et blocs colorés pour qu’on reconnaisse le lieu), `origin (−30, 0, −32)`, `yaw = 0`. Le lien est translatif.
- À travers A, on voit l’esplanade, pas le champ qui est derrière l’arche. Par l’arrière de A, on voit l’autre côté de l’esplanade.

### 12.3 Zone 2 : architecture non euclidienne

- Noms dans le jeu : `A2` et `B2` pour les portails A et B de cette zone, afin de garder `A` et `B` pour les arches de la zone 1. `C` et `D` sont inchangés.
- Enveloppe extérieure : un tunnel couvert le long de X, de x ∈ [29.5, 36.5] et z ∈ [0.5, 3.5], de 3 m de haut, ouvert aux deux bouts. Portail A à `x = 31`, face avant −X (`yaw = −π/2`). Portail C à `x = 33.5`, face avant +X (`yaw = π/2`, 3 m au fond de l’abri, § 11.2). Ouvertures 2,4 × 2,8 m centrées en `z = 2`. L’espace entre A et C est inaccessible.
- Intérieur caché : couloir de 24 m sous la dalle, sol à y = −20. B à `(20, −20, 2)`, `yaw = π/2`. D à `(44, −20, 2)`, `yaw = −π/2`. Liens A ↔ B et C ↔ D, tous deux translatifs. Le sol du couloir porte des graduations tous les mètres et sa longueur (« 24 m »). L’enveloppe extérieure porte « 7 m ».

### 12.4 Zone 3 : pièces cycliques infinies

- Pavillon à l’ouest centré sur `(−33, 0, 6)` : pièce intérieure de 6 × 6 m, 3,2 m sous plafond. Murs de couleurs différentes (nord rouge, est bleu, sud jaune, ouest vert) et un pilier central rayé pour lire la répétition.
- Entrée réelle par une porte dans le mur sud.
- Portes est et ouest (2 × 2,6 m) qui donnent sur des alcôves fermées de 0,6 m. Portail E à `x = −30`, face avant −X vers l’intérieur (`yaw = −π/2`). Portail W à `x = −36`, face avant +X (`yaw = π/2`). Lien E ↔ W translatif (−6 m en X). Sortir par l’est fait rentrer par l’ouest, et inversement.
- La récursion atteint la profondeur maximale à l’intérieur d’une pièce fermée. Le voile et le repli s’y fondent (§ 11.6).

### 12.5 Zone 4 : géométrie impossible

- Cabine au sud-est de 2,6 × 2,6 m au sol, 3 m de haut, centrée sur `(30, 0, −30)`. Sa porte est sur la face nord. Portail P à `(30, 0, −28.7)`, face avant +Z (`yaw = 0`), ouverture 1,6 × 2,4 m.
- Grande salle cachée de 14 × 14 m, 6 m sous plafond, sol à y = −20, z ∈ [−47, −33], centrée en x = 30, avec colonnes et grand marquage au sol. Portail Q à `(30, −20, −33)` sur son mur nord, face avant −Z (`yaw = π`). Lien P ↔ Q translatif.

### 12.6 Zone 5 : manipulation d’échelle

- Coordonnées réelles (tâche 5) : le petit tunnel va de x = −30,5 à −27,5. Un porche couvert le raccorde à la porte du jardin en x = −27. Les niches derrière P1 et P2 laissent 1,2 m et 0,6 m libres.
- Grand tunnel couvert au nord-ouest, le long de X, de 3 m de large (z ∈ [30, 33]) × 3,2 m de haut × 6 m de long (x ∈ [−40, −34]), entrée à l’ouest (x = −40, face −X, § 11.2). Portail P1 à `(−35, 0, 31.5)`, face avant −X (`yaw = −π/2`), ouverture 2,4 × 2,8 m. Le tunnel est fermé en x = −34,4.
- Petit tunnel, copie exacte du grand à l’échelle 0,5 (1,5 × 1,6 × 3 m, x ∈ [−30.3, −27], z ∈ [30.75, 32.25]). Portail P2 à `(−30, 0, 31.5)`, face avant +X (`yaw = π/2`), ouverture 1,2 × 1,4 m. Le tunnel est fermé en x = −30,3. Sa sortie est (x = −27) donne sur un **mini-jardin** clos de 8 × 8 m (x ∈ [−27, −19], z ∈ [27.5, 35.5]), avec un mur de 2,6 m qui empêche d’y entrer à taille normale. Le mobilier y est à l’échelle 0,5 : petits piliers, marches de 9 cm, mini-arche.
- Lien P1 ↔ P2 translatif, échelle 0,5. On rétrécit en allant vers l’est et on grandit en revenant.
- Caisse dynamique de 1 m à l’entrée du grand tunnel, qu’on peut pousser à travers P1 (elle ressort à 0,5 m). Caisse de 0,5 m dans le mini-jardin.

## 13. Tests

### 13.1 Tests unitaires (Node, sans navigateur)

`tests/portalMath.spec.js` importe `src/portals/math.js`, comme `tests/browser.spec.js` importe `src/platform/browser.js`. Il couvre :

- warp (point, direction, lacet, inverse, composition, échelle, cas translatif) ;
- franchissement de segment (avant, arrière, hors de l’ouverture, à sens unique) ;
- projection oblique : cas du plan proche identique à `P`, `z_ndc = −1` sur le plan, côté caméra rejeté, côté gardé conservé ;
- rectangle écran (découpe contre le plan proche).

### 13.2 Tests Playwright, un par concept

Chaque test charge `/?dev`, attend `gowDev`, place le joueur ou une caisse devant le portail avec le hook, la fait traverser (`setControls` ou `push`), puis vérifie à l’arrivée la position (côté et décalage latéral attendus par rapport au portail de destination, calculés à partir de `gowDev.portal`), l’orientation (lacet + Δ) et l’échelle :

1. joueur à travers l’arche A → esplanade (échelle 1) ;
2. joueur dans le tunnel extérieur → couloir souterrain (y ≈ −20), puis sortie par D → C ;
3. joueur par la porte est → porte ouest de la même pièce (x diminue d’environ 6 m) ;
4. joueur dans la cabine → grande salle ;
5. joueur à travers P1 (échelle 0,5, capsule de 0,96 m, caméra rapprochée de moitié), puis une caisse à travers P1 (échelle 0,5) ;
6. en plus : caméra seule de l’autre côté d’un portail (`camera.warped === true` alors que le joueur n’a pas traversé).

Les tests existants restent verts.

### 13.3 Mesure des performances

Mesure sur la build de production (`npm run build && npm run preview`, page ouverte avec `?dev`), en 1920 × 1080. `await gowDev.benchmark({ frames, warmup })` rend les images de façon synchrone, sans dépendre de `requestAnimationFrame` (souvent bridé dans un onglet en arrière-plan). Il renvoie `cpuMs` (soumission JavaScript de `scene.render()`), `frameMs` (même chose, puis synchronisation GPU par `readPixels`), `passes` et `drawCalls`. En jeu, l’overlay F3 affiche les i/s réels.

Valeurs du 21 novembre 2026 (Chromium, Radeon RX 7900 XTX, 1920 × 1080). La colonne « CPU ×3 » utilise le bridage CPU de Chromium pour approcher un processeur de portable.

| Point de vue | Passes | Appels de dessin | `cpuMs` ×3 (moy. / p95) | `frameMs` ×3 (moy. / p95) |
| --- | ---: | ---: | ---: | ---: |
| Départ | 3 | 125 | 2,8 / 3,8 | 3,3 / 4,4 |
| Arche A (zone 1) | 4 | 136 | 2,3 / 3,0 | 2,8 / 3,6 |
| Couloir (zone 2) | 3 | 96 | 1,6 / 2,1 | 2,1 / 2,7 |
| Pavillon cyclique (zone 3), profondeur 4 | 18 | 420 | 5,8 / 7,1 | 6,6 / 8,0 |
| Pavillon cyclique, profondeur 5 | 21 | 476 | 6,3 / 7,8 | 6,9 / — |
| Cabine (zone 4) | 2 | 90 | 1,4 / 2,1 | 2,0 / 2,6 |
| Tunnel d’échelle (zone 5) | 7 | 184 | 2,8 / 3,6 | 3,4 / 4,2 |

Sans bridage, le pire cas (pavillon) prend environ 2 ms par image. Le coût GPU n’a pas pu être mesuré sur un portable : sur la carte de bureau, il se confond avec la latence de synchronisation (`frameMs − cpuMs` ≈ 0,6 ms). Pour valider les 60 i/s sur un portable, il suffit d’ouvrir la build avec `?dev` et de lancer `gowDev.benchmark()` devant le pavillon, ou de lire les i/s de l’overlay F3.

## 14. Limites connues

- Portails verticaux et statiques uniquement (pas de portail mobile ni incliné).
- Un objet à cheval sur deux portails à la fois n’a de fantôme que pour le plus proche.
- La physique n’est pas dupliquée à travers les portails : un objet à cheval n’entre en collision qu’avec le monde de son centre. Le fantôme est purement visuel.
- Les ombres portées ne traversent une ouverture que pour la partie engagée d’un objet à cheval. L’ombre d’un objet posé juste devant un portail ne se prolonge pas de l’autre côté.
- Avec un lien qui tourne (Δ ≠ 0), la direction relative du soleil change : chaque lieu est éclairé correctement, mais les taches de lumière ne se raccordent pas au bord de l’ouverture.
- Le voile ne teinte pas le ciel CSS. Si le repli arrive très près (`E − S < hazeMinRange`), un léger saut de teinte est possible.
- WebGL 2 seulement. WebGPU utilise un NDC en [0, 1] et demanderait une autre formule oblique.
- API internes de Babylon utilisées : `PhysicsCharacterController._refreshManifoldAtPosition`. Voir `docs/BABYLON_PATCHES.md`.
- La passe racine des maillages regroupés (§ 6.7) ne peut plus être cullée objet par objet à l’intérieur d’un lot. C’est volontaire : moins d’appels de dessin valent mieux qu’un culling fin pour ce décor.
- Performances GPU non mesurées sur un portable réel (§ 13.3). Le coût CPU, lui, est mesuré avec un bridage ×3 : 5,8 ms dans le pire cas.

## 15. Améliorations de Babylon

Les limites de Babylon rencontrées, et les patchs proposés (non appliqués, le jeu n’en dépend pas), sont décrits dans `docs/BABYLON_PATCHES.md` :

- effacement forcé de la profondeur et du stencil entre `activeCameras` ;
- pas de culling optionnel dans `ObjectRenderer` ;
- pas d’API publique pour rafraîchir les contacts du contrôleur de personnage après une téléportation ;
- pas d’aide pour la projection oblique en perspective.

## 16. Tâches ordonnées

Chaque tâche est générée par Codex (`gpt-6.2-astra`, effort `max`) puis relue : diff, `npm run build`, `npm test`, contrôle visuel dans Chromium et Firefox. On ne passe à la suivante que si la précédente compile, passe les tests et respecte ce document.

1. **Mathématiques** : `src/portals/math.js`, `src/portals/layers.js`, `tests/portalMath.spec.js` (§ 3, 5, 6.5, 13.1).
2. **Rendu** : `portal.js`, `renderer.js`, `system.js`, `index.js` ; brouillard et repli ; contours et statistiques ; carte agrandie et zone 1 (arches, sans traversée) ; hook dev minimal (`state`, `teleportPlayer`, `portal`, `setMaxDepth`) ; overlay F3 (§ 6, 10, 12.1, 12.2).
3. **Traversée** : `travelers.js`, `bodyTraveler.js` ; pas physique fixe ; `applyWarp` et échelle du joueur ; caisses ; fantômes et plans de coupe ; hook (`setControls`, `crate`) ; test Playwright de la zone 1 (§ 7, 8, 10.3).
4. **Caméra** : `cameraPath.js`, `traceView`, intégration à `thirdPersonCamera.js` ; garde ε ; plan proche adaptatif ; `applyWarp` de la caméra ; test de la caméra seule de l’autre côté d’un portail (§ 9).
5. **Démos 2 à 5** : zones, intérieurs cachés, caisses, règles d’éclairage, réapparition, tests Playwright 2 à 5 (§ 11, 12).
6. **Finitions** : mesures de FPS, `docs/BABYLON_PATCHES.md`, mise à jour de ce document (limites, valeurs mesurées), README.

État au 21 novembre 2026 : tâches 1 à 6 réalisées. La tâche 6 a été découpée en trois : 6a pour l’outil `gowDev.benchmark`, 6b pour le regroupement du décor statique, et les fichiers de correctifs Babylon. `npm run build` passe et `npm test` donne 60 tests verts : 23 tests d’origine, 22 tests mathématiques et 15 tests de portails.
