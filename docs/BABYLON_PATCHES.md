# Limites de Babylon.js rencontrées et correctifs proposés

Ce rapport accompagne `docs/PORTALS.md`. Il recense les limites de Babylon.js 9.37.1 (`@babylonjs/core`) rencontrées en écrivant le système de portails. Pour chacune, il décrit le contournement retenu dans le jeu et le correctif proposé pour Babylon. **Le jeu ne dépend d’aucun de ces correctifs** : tous les contournements utilisent l’API existante. Les correctifs sont fournis sous forme de fichiers `patch-package` dans `docs/babylon-patches/`. Ils ne sont pas appliqués : il n’y a ni dossier `patches/` à la racine, ni script `postinstall`, et `node_modules` n’est jamais modifié.

Pour essayer un correctif localement :

```sh
mkdir -p patches
cp docs/babylon-patches/<fichier>.patch patches/
npx patch-package          # applique les fichiers de patches/ à node_modules
```

Pour l’annuler, supprimer `patches/` et relancer `npm ci`.

| Fichier | Limite (section) | Fichiers de Babylon touchés |
| --- | --- | --- |
| `@babylonjs+core+9.37.1+01-preserve-depth-stencil.patch` | § 1 | `scene.pure.js`, `Cameras/camera.pure.{js,d.ts}` |
| `@babylonjs+core+9.37.1+02-character-refresh-contacts.patch` | § 2 | `Physics/v2/characterController.{js,d.ts}` |
| `@babylonjs+core+9.37.1+03-object-renderer-culling.patch` | § 3 | `Rendering/objectRenderer.{js,d.ts}`, `Culling/boundingBox.js` |
| `@babylonjs+core+9.37.1+04-oblique-near-plane.patch` | § 4 | `Maths/math.vector.pure.{js,d.ts}`, `Cameras/camera.pure.{js,d.ts}` |
| `@babylonjs+core+9.37.1+05-settarget-no-side-effect.patch` | § 5 | `Cameras/targetCamera.pure.js` |

Chaque fichier s’applique seul ou avec les autres, sans décalage (`patch -p1 --fuzz=0`), sur une copie propre de `@babylonjs/core` 9.37.1. Les fichiers JavaScript obtenus passent `node --check`. Les commentaires ajoutés dans les sources sont en français : pour une contribution en amont (pull request sur BabylonJS/Babylon.js, qui publie ses sources en TypeScript), il faudrait les traduire et reporter les changements dans les fichiers `.ts` de `packages/dev/core`.

## 1. Effacement forcé de la profondeur et du stencil entre `activeCameras`

**Constat.** `Scene.render` appelle `_processSubCameras(camera, cameraIndex > 0)` pour chaque caméra de `scene.activeCameras`. À partir de la deuxième, `_renderForCamera` → `_bindFrameBuffer(camera)` → `_clearFrameBuffer(camera)` exécute `engine.clear(null, false, true, true)` sur le framebuffer par défaut. La profondeur et le stencil sont donc effacés entre deux caméras, et aucune propriété ne permet de l’éviter (`scene.autoClearDepthAndStencil` ne joue que sur le premier effacement).

**Conséquence.** On ne peut pas enchaîner des caméras qui partagent le stencil (portails, miroirs, découpes) avec `activeCameras`.

**Contournement.** Les passes de portail passent par `ObjectRenderer`, qui dessine dans le framebuffer courant sans l’effacer (`src/portals/renderer.js`).

**Correctif proposé.** Une propriété de caméra `clearDepthStencilBeforeRender` (vraie par défaut, donc sans changement de comportement), lue dans `_clearFrameBuffer` pour le framebuffer par défaut.

## 2. Contacts périmés après `PhysicsCharacterController.setPosition`

**Constat.** `setPosition` déplace la capsule mais conserve la liste de contacts (`_manifold`) calculée au point de départ. Le prochain `checkSupport` raisonne donc sur le sol de l’ancien emplacement. Seule la méthode interne `_refreshManifoldAtPosition(position)` reconstruit les contacts.

**Conséquence.** Après une téléportation, le personnage peut se croire en l’air pendant un pas, avec un à-coup d’animation, ou sur un sol qui n’existe plus.

**Contournement.** `src/player/playerController.js` appelle `_refreshManifoldAtPosition` dans une fonction isolée et commentée (`refreshContacts`). C’est la seule API interne de Babylon utilisée par le jeu.

**Correctif proposé.** Une méthode publique `refreshContacts()` et un paramètre `setPosition(position, refreshContacts = false)`.

## 3. Pas de culling dans `ObjectRenderer` avec une liste fournie

**Constat.** Quand `ObjectRenderer` reçoit sa liste par `renderList` ou `getCustomRenderList`, il dessine tous les maillages actifs de la liste, sans test de frustum. De plus, `BoundingInfo.isInFrustum` ne lit que les six premiers plans du tableau qu’on lui passe.

**Conséquence.** Pour une passe de portail, il faut trier soi-même les maillages, et les plans supplémentaires (la pyramide d’ouverture) demandent un test séparé.

**Contournement.** Le renderer filtre la liste avant chaque passe avec `isInFrustum` sur le frustum oblique recadré au scissor, plus un test des huit coins de la boîte englobante contre les quatre plans de la pyramide d’ouverture.

**Correctif proposé.** Une propriété `ObjectRenderer.cullingPlanes` (tableau de longueur quelconque, `null` par défaut) appliquée dans `_prepareRenderingManager`, et une boucle sur `frustumPlanes.length` dans `BoundingBox.IsInFrustum` / `IsCompletelyInFrustum`.

## 4. Pas d’aide pour une projection oblique en perspective

**Constat.** Babylon gère une projection oblique pour les caméras orthographiques (`camera.oblique`), mais n’offre rien pour remplacer le plan proche d’une perspective par un plan quelconque (méthode de Lengyel). C’est l’outil de base des portails et des miroirs plans, qui en sont réduits aux `clipPlane` des matériaux (un `discard` par fragment et une variante de shader).

**Contournement.** `applyObliqueNearPlane` dans `src/portals/math.js`, testée par `tests/portalMath.spec.js`, appliquée à une `TargetCamera` par `freezeProjectionMatrix`.

**Correctif proposé.** `Matrix.ObliqueNearPlaneToRef(projection, view, plane, result)`, et une propriété `Camera.obliqueNearPlane` (un `Plane` monde) prise en compte par `getProjectionMatrix`. La formule de `math.js` vaut pour un NDC en [−1, 1] (WebGL). Avec `isNDCHalfZRange` (WebGPU), le plan proche s’écrit `z_clip ≥ 0`. La troisième colonne devient alors directement `C / (C·q)`, sans soustraire la quatrième. Le correctif doit traiter les deux cas.

## 5. `TargetCamera.setTarget` déplace la caméra

**Constat.** Si la caméra et la cible ont la même coordonnée z, `setTarget` ajoute `Epsilon` (1 mm) à `position.z` pour éviter une matrice dégénérée. La position de la caméra est donc modifiée en douce.

**Conséquence.** Près du plan d’un portail ou à petite échelle, ce millimètre peut faire franchir à la caméra la garde ε qui l’empêche de toucher une ouverture.

**Contournement.** `src/player/thirdPersonCamera.js` rétablit `position.z` et calcule la rotation à la main dans ce cas.

**Correctif proposé.** Calculer la matrice de visée sur une copie décalée de la position, sans modifier `this.position`.

## 6. Opérations stencil des faces arrière

**Constat.** Ce n’est pas un défaut, mais un piège. Depuis la prise en charge du stencil double face, `setStencilOperationPass` et les autres setters globaux du moteur ne règlent que les faces avant. Un rectangle sans culling vu de dos utilise les réglages `setStencilBack…`, restés par défaut.

**Contournement.** Le renderer règle les deux faces (`src/portals/renderer.js`, fonction `stencil`).

**Proposition.** Documenter ce comportement dans la page « Stencil buffer » de Babylon, ou ajouter des setters `setStencilOperationPassBothFaces`.
