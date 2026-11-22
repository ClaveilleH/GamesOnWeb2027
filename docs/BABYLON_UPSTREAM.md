# Proposer les correctifs à Babylon.js : priorités et marche à suivre

Ce document sert de point de départ à une session (humaine ou IA) qui reprend la question : **quels correctifs de Babylon.js proposer en amont, et dans quel ordre ?** Il se suffit à lui-même. Les détails techniques de chaque limite sont dans `docs/BABYLON_PATCHES.md`, et les correctifs prêts à essayer dans `docs/babylon-patches/`.

> **Avant toute action publique** (ticket, message sur le forum, fork, pull request), demander l’accord explicite du propriétaire du dépôt. Ces actions se font sous son compte et engagent le projet. Une session IA prépare, propose et rédige, mais ne publie rien d’elle-même.

## 1. Contexte en bref

- Jeu web en JavaScript avec Babylon.js `@babylonjs/core` **9.37.1** (version `latest` sur npm, publiée le 18/11/2026), Havok 1.3.14, Vite et Playwright.
- Le système de portails (`src/portals/`, architecture dans `docs/PORTALS.md`) a révélé six limites de Babylon. Le jeu les contourne toutes avec l’API publique existante (aucun membre interne préfixé par `_` n’est appelé dans `src/`). **Aucun correctif n’est appliqué ni nécessaire au fonctionnement du jeu.**
- Les fichiers `docs/babylon-patches/*.patch` sont des diffs `patch-package` sur le **JavaScript compilé** de `node_modules` (9.37.1), avec des commentaires en français. Ils montrent la logique et ont été vérifiés : ils s’appliquent seuls et ensemble avec `patch -p1 --fuzz=0`, et le JavaScript obtenu passe `node --check`. Ils **ne sont pas** directement soumissibles. Babylon se développe en TypeScript dans `packages/dev/core/src/`, avec des commentaires de documentation en anglais. Il faut donc porter chaque correctif dans les sources `.ts`.

## 2. État en amont vérifié le 21/11/2026

Branche `master` de BabylonJS/Babylon.js, commit `47f84cf6dc63` (21/11/2026 11:22 UTC). Les six limites y sont **toujours présentes**. Une recherche sur les tickets et pull requests GitHub (mots-clés du § 6) n’a rien trouvé de pertinent. Le forum `forum.babylonjs.com` n’a **pas** été consulté.

| # | Limite | Où en amont (`packages/dev/core/src/…`) | Constat sur `master` |
| --- | --- | --- | --- |
| 1 | Profondeur et stencil effacés entre `activeCameras` | `scene.pure.ts` : `_clearFrameBuffer` l. 5137, `engine.clear(null, false, true, true)` l. 5156, appel `_processSubCameras(…, cameraIndex > 0)` l. 5859, `_clear()` l. 5499 | Inchangé, pas d’option |
| 2 | Contacts périmés après `PhysicsCharacterController.setPosition` | `Physics/v2/characterController.ts` : `setPosition` l. 478, `_refreshManifoldAtPosition` l. 1542 (**`protected`**), déjà utilisé en interne l. 1766 | Inchangé |
| 3 | `BoundingBox.IsInFrustum` / `IsCompletelyInFrustum` ne lisent que 6 plans ; pas de culling dans `ObjectRenderer` avec une liste fournie | `Culling/boundingBox.ts` : `IsCompletelyInFrustum` l. 331, `IsInFrustum` l. 349, boucles `p < 6` l. 332 et 350 ; `Rendering/objectRenderer.ts` : `_prepareRenderingManager` l. 949 | Inchangé |
| 4 | Pas de projection oblique (plan proche quelconque) en perspective | `Maths/math.vector.pure.ts` : seuls `ObliqueOffCenterLHToRef` (l. 8331) et `RH` (l. 8420) existent, pour l’orthographique ; `Cameras/camera.pure.ts` : `oblique` l. 157 (orthographique), `getProjectionMatrix` l. 968 | Inchangé |
| 5 | `TargetCamera.setTarget` modifie `position.z` | `Cameras/targetCamera.pure.ts` : `setTarget` l. 317, `this.position.z += Epsilon` l. 328 | Inchangé |
| 6 | Opérations stencil des faces arrière réglées à part | API du moteur (`setStencilBack…`) | Comportement voulu ; documentation seulement |

Les numéros de ligne correspondent au commit cité. Ils bougeront : chercher les noms de fonctions plutôt que les lignes.

## 3. Ordre de priorité recommandé

Critères : utilité générale pour les utilisateurs de Babylon, gain pour le jeu, risque de rétrocompatibilité (les consignes de Babylon sont strictes, voir § 5), taille du changement et facilité de test.

| Priorité | Proposition | Type | Taille | Risque | Gain pour le jeu | Pourquoi ce rang |
| --- | --- | --- | --- | --- | --- | --- |
| **1** | **#2** `PhysicsCharacterController.refreshContacts()` public + `setPosition(position, refreshContacts = false)` | Bug / amélioration, ajout pur | ~15 lignes | Très faible : paramètre optionnel en fin, méthode nouvelle | Évite le balayage de capsule supplémentaire à la sortie du portail | Bug réel (« Teleport character » laisse des contacts faux). Babylon a déjà la logique (méthode `protected` utilisée en interne). |
| **2** | **#3a** `BoundingBox.IsInFrustum` / `IsCompletelyInFrustum` : boucler sur `frustumPlanes.length` | Bug | 2 lignes | Faible, mais **auditer les appelants** (un appelant qui passerait plus de 6 plans en n’en voulant que 6 changerait de résultat) | `mesh.isInFrustum` gère 10 plans, ce qui supprime le second test de la pyramide | Correctif minuscule, très facile à tester en Vitest pur (sans moteur). |
| **3** | **#5** `TargetCamera.setTarget` sans effet de bord sur `position` | Bug | ~10 lignes | Faible : la rotation calculée est identique, seule la position n’est plus décalée de 1 mm. À présenter comme correctif, avec un test de non-régression. | Supprime le contournement de la visée latérale de la caméra | Test existant à étendre : `test/unit/Cameras/targetCameraSetTarget.test.ts`. |
| **4** | **#4a** `Matrix.ObliqueNearPlaneToRef(projection, view, plane, result, halfZRange)` | Nouvelle fonctionnalité, statique, ajout pur | ~45 lignes | Faible (ajout), mais nom et signature à valider par les mainteneurs | Pourrait remplacer `applyObliqueNearPlane` de `src/portals/math.js` | Utile au-delà des portails : miroirs, eau, découpe sans `discard`. Pur calcul, donc tests Vitest simples (cas du plan proche identique à `P`, `z_ndc` = −1 ou 0 sur le plan). |
| **5** | **#4b** `Camera.obliqueNearPlane` appliqué dans `getProjectionMatrix` | Nouvelle fonctionnalité | ~30 lignes | Moyen : touche le cache de projection (`_isSynchronizedProjectionMatrix`) et dépend de la matrice de vue | Faible : le jeu fige déjà sa projection | À proposer après 4a, en s’appuyant dessus. |
| **6** | **#3b** `ObjectRenderer.cullingPlanes` | Nouvelle fonctionnalité | ~20 lignes | Moyen : chemin chaud, cache `_defaultRenderListPrepared`, WebGPU (identifiants de passe) ; les mainteneurs préféreront peut-être une autre conception (frame graph) | Moyen : le renderer pourrait déléguer son culling | Discussion de conception d’abord. |
| **7** | **#1** `Camera.clearDepthStencilBeforeRender` | Nouvelle fonctionnalité | ~10 lignes | Moyen à élevé : interactions avec le multivue, le pre-pass, `outputRenderTarget` et les post-process ; signature privée `_clear()` modifiée | **Aucun** : le jeu passe par `ObjectRenderer` et n’en a plus besoin | Intérêt général réel (portails, miroirs, découpes au stencil avec plusieurs caméras), mais à discuter sur le forum avant tout code. |
| (doc) | **#6** Opérations stencil des faces arrière | Documentation | — | Nul | — | Page « Stencil buffer » de la documentation (dépôt BabylonJS/Documentation) ; facultatif. |

En pratique : **#2, #3a et #5** sont trois petites pull requests indépendantes, à faible risque, qu’on peut préparer d’abord. **#4a** vient ensuite, avec plus de tests. **#4b, #3b et #1** passent d’abord par une discussion sur le forum.

## 4. Fiche par correctif

### #2 — Rafraîchir les contacts du contrôleur de personnage

- **Problème.** `setPosition` copie la position mais garde `_manifold`. Le `checkSupport` suivant raisonne sur le sol de départ : le personnage paraît en l’air pendant un pas, ou appuyé sur un sol absent.
- **Proposition.** `public refreshContacts(): void` (appelle `this._refreshManifoldAtPosition(this._position)`) et `setPosition(position: Vector3, refreshContacts = false)`.
- **Correctif de référence.** `docs/babylon-patches/@babylonjs+core+9.37.1+02-character-refresh-contacts.patch`.
- **Test à écrire.** Dans `test/unit/Physics/`, sur le modèle de `havokPlugin.test.ts` et `ragdoll.test.ts` : sol statique, personnage téléporté au-dessus d’un autre sol, `checkSupport` doit renvoyer `SUPPORTED` avec `refreshContacts = true`. Vérifier comment ces tests chargent Havok.
- **Contournement du jeu à retirer après intégration.** `src/player/playerController.js` : le balayage public `readArrivalSupport` (avec `supportQuery`, `capsuleHit` et `supportHit`) et le saut d’un pas de `checkSupportToRef` par le drapeau `placedSupport` (dans `applyWarp`, `place` et `update`). À la sortie d’un portail (`applyWarp`), remplacer `capsule.setPosition(warpedCenter)` et `readArrivalSupport()` par `capsule.setPosition(warpedCenter, true)` (ou `capsule.refreshContacts()`) puis `capsule.checkSupportToRef(FIXED_STEP, down, surface)` pour rafraîchir `state.grounded` immédiatement. (Aucune API interne `_…` de Babylon n’est plus utilisée dans le jeu.)
- **Mots-clés de recherche.** `PhysicsCharacterController setPosition`, `character controller teleport`, `_refreshManifoldAtPosition`.

### #3a — Tous les plans dans `BoundingBox.IsInFrustum`

- **Problème.** Les deux méthodes statiques bouclent sur `p < 6`. Un tableau de plans plus long (frustum oblique, pyramide d’ouverture, culling par portail) est tronqué en silence.
- **Proposition.** Boucler sur `frustumPlanes.length`.
- **À auditer avant d’ouvrir la PR.** Tous les appelants de `IsInFrustum`, `IsCompletelyInFrustum`, `BoundingBox.isInFrustum`, `BoundingInfo.isInFrustum` et `AbstractMesh.isInFrustum` dans `packages/dev`. Vérifier qu’aucun ne passe plus de 6 plans en comptant sur la troncature (multivue, CSM, octree). Un tableau d’exactement 6 plans ne change pas de comportement.
- **Correctif de référence.** La partie `boundingBox.js` du fichier `…+03-object-renderer-culling.patch`.
- **Test à écrire.** Vitest pur dans `test/unit/Culling/` : une boîte à l’intérieur des 6 plans d’un frustum mais hors d’un 7e plan doit être rejetée.
- **Contournement du jeu à retirer.** `src/portals/renderer.js`, fonction `drawVisible` : second test `outsidePlanes(…, node.pyramid)`. On fusionnerait alors `planes` et `pyramid` en un seul tableau.

### #5 — `setTarget` sans effet de bord

- **Problème.** Si `position.z === target.z`, `setTarget` fait `this.position.z += Epsilon` (1 mm). La caméra se déplace en douce. Pour un portail, à petite échelle, ce millimètre peut faire franchir à la caméra la garde qui l’empêche de toucher un plan d’ouverture.
- **Proposition.** Décaler une copie temporaire de l’œil, utilisée seulement pour `LookAtLH/RHToRef`.
- **Correctif de référence.** `…+05-settarget-no-side-effect.patch`.
- **Test à écrire.** Étendre `test/unit/Cameras/targetCameraSetTarget.test.ts` : avec `position.z === target.z`, `position` reste inchangée et la rotation est la même qu’avant le correctif.
- **Contournement du jeu à retirer.** `src/player/thirdPersonCamera.js`, méthode `follow` (branche `else if (camera.position.z !== eyeView.position.z)`) : rétablissement de `position.z` et calcul manuel de la rotation. La branche précédente (`camera.position.equals(eyeView.target)`) traite un autre cas, à garder : l’œil confondu avec la cible, où `setTarget` ne fait rien.

### #4a / #4b — Plan proche oblique en perspective

- **Problème.** Aucune aide pour la méthode de Lengyel (remplacer le plan proche d’une perspective par un plan quelconque). C’est l’outil standard des portails et des miroirs plans. Babylon a `oblique` seulement pour l’orthographique.
- **Proposition.** 4a : `Matrix.ObliqueNearPlaneToRef(projection, view, plane, result, halfZRange = false): Nullable<T>` (plan monde dont le demi-espace positif est gardé ; NDC [−1, 1] ou [0, 1]). 4b : `Camera.obliqueNearPlane: Nullable<Plane>`, appliqué en fin de `getProjectionMatrix` pour les perspectives, avec le cache de projection mis à jour.
- **Formules.** `docs/PORTALS.md` § 6.5 (NDC [−1, 1]). Pour [0, 1] : troisième colonne = `C / (C·q)`, sans soustraire la quatrième (`docs/BABYLON_PATCHES.md` § 4).
- **Correctif de référence.** `…+04-oblique-near-plane.patch`, qui couvre 4a et 4b et gère les deux plages NDC.
- **Tests de référence.** Côté jeu, `tests/portalMath.spec.js` (cas « le plan proche d’origine reproduit les seize coefficients », « une vue tournée et translatée coupe sur le plan incliné… », « un plan derrière l’œil… »), à transposer en Vitest dans `test/unit/Math/`.
- **Contournement du jeu.** `applyObliqueNearPlane` dans `src/portals/math.js` et l’appel à `freezeProjectionMatrix` dans `prepareCamera` (`src/portals/renderer.js`). On peut garder la version du jeu, testée, même après intégration.

### #3b — Culling dans `ObjectRenderer`

- **Problème.** Avec `renderList` ou `getCustomRenderList`, `ObjectRenderer` dessine tous les maillages actifs de la liste, sans test de frustum.
- **Proposition.** `ObjectRenderer.cullingPlanes: Nullable<Plane[]>` appliqué dans `_prepareRenderingManager`. Attention au cache `_defaultRenderListPrepared` et aux identifiants de passe WebGPU.
- **Correctif de référence.** La partie `objectRenderer.*` du fichier `…+03-object-renderer-culling.patch`. Il dépend de #3a.
- **Contournement du jeu.** `src/portals/renderer.js` : `drawVisible` (filtrage avant chaque passe).

### #1 — Garder profondeur et stencil entre caméras actives

- **Problème.** Pour chaque caméra de `activeCameras` après la première, `_clearFrameBuffer` efface profondeur et stencil, sans option.
- **Proposition.** `Camera.clearDepthStencilBeforeRender = true` par défaut, lu dans `_clearFrameBuffer`. Le correctif modifie aussi la signature privée `_clear(clearDepthAndStencil)`.
- **À discuter avant de coder.** Comportement avec le multivue, `prePass`, `outputRenderTarget`, les post-process, et le premier effacement de l’image. Une conception par le frame graph est peut-être préférable pour les mainteneurs.
- **Correctif de référence.** `…+01-preserve-depth-stencil.patch`.
- **Gain pour le jeu.** Aucun : le renderer de portails utilise `ObjectRenderer` et n’y gagnerait rien.

## 5. Règles de contribution de Babylon.js (lues sur `master` le 21/11/2026)

Sources : `.github/copilot-instructions.md` et `.github/instructions/` (`index.md`, `backcompat.instructions.md`, `tests.instructions.md`, `comments.instructions.md`, `fix-bug.md`, `pr-labels.md`, `tree-shaking.instructions.md`). **Les relire au début de la session**, elles évoluent.

- **Rétrocompatibilité stricte**, à la compilation comme à l’exécution. Pas de paramètre obligatoire ajouté, pas de paramètre optionnel inséré avant les existants, pas de changement de comportement qui casserait du code existant. Tous les correctifs ci-dessus sont des ajouts, sauf #3a et #5, à présenter comme des corrections de bug, avec un test de non-régression.
- **API publique** : tout ce qui est exporté par l’index du paquet, sauf les noms préfixés par `_`. Elle exige des commentaires de documentation complets en anglais (paramètres, retour, remarques).
- **Tests** : Vitest pour les tests unitaires, dans `packages/dev/core/test/unit/<Domaine>/` (`Cameras`, `Culling`, `Math`, `Physics`, `Rendering`, `Scene`…), avec des imports explicites depuis `vitest`. Playwright pour les tests d’intégration, de performance et d’interaction. Toute nouvelle API doit avoir des tests.
- **Bug** : écrire d’abord un test qui échoue, puis corriger.
- **Arborescence « pure »** : la logique se modifie dans les fichiers `*.pure.ts` quand ils existent (`scene.pure.ts`, `Cameras/camera.pure.ts`, `Cameras/targetCamera.pure.ts`, `Maths/math.vector.pure.ts`). `characterController.ts`, `objectRenderer.ts` et `boundingBox.ts` sont des fichiers simples. Pas d’effet de bord au niveau du module.
- **Commandes de qualité**, toutes vertes avant la PR : `npm run format:check`, `npm run lint:check`, `npm run build:source`, `npm run test:unit`.
- **Étiquettes** : `bug`, `enhancement` ou `new feature`, plus l’étiquette de domaine (voir `pr-labels.md`).
- Le forum `forum.babylonjs.com` est le lieu habituel des discussions de conception et des signalements. À privilégier pour #1, #3b et #4b avant la pull request.

## 6. Marche à suivre pour la session suivante

1. Lire ce document, puis `docs/BABYLON_PATCHES.md` et les fichiers de `docs/babylon-patches/`.
2. **Revérifier l’état en amont** : il a pu changer depuis le 21/11/2026.
   - `npm view @babylonjs/core version` et le journal des changements de Babylon.
   - Pour chaque limite, lire la fonction concernée sur `master`, par exemple `curl -s https://raw.githubusercontent.com/BabylonJS/Babylon.js/master/packages/dev/core/src/Cameras/targetCamera.pure.ts | grep -n "Epsilon"`, et de même pour les fichiers du § 2.
   - Chercher sur GitHub (tickets et PR) et sur le forum, avec les mots-clés : `setTarget Epsilon`, `setTarget position side effect`, `character controller setPosition`, `character controller teleport contacts`, `activeCameras stencil`, `activeCameras clear depth`, `oblique projection perspective`, `oblique near plane clipping`, `portal rendering stencil`, `IsInFrustum planes`, `ObjectRenderer culling`.
3. Mettre à jour le tableau du § 2 et, si besoin, l’ordre du § 3. Retirer de la liste ce qui est déjà corrigé.
4. **Faire valider la liste et l’ordre par le propriétaire du dépôt** avant toute action publique.
5. Pour chaque correctif retenu, dans l’ordre :
   - forker BabylonJS/Babylon.js (compte du propriétaire), créer une branche, `npm install` ;
   - porter la logique du `.patch` dans le `.ts` source, avec des commentaires de documentation en anglais ;
   - écrire les tests Vitest (§ 4) et vérifier qu’ils échouent sans le correctif, pour un bug ;
   - lancer les commandes de qualité (§ 5) ;
   - rédiger la description de PR en anglais : problème, reproduction minimale (si possible un lien Playground), changement, rétrocompatibilité, tests.
6. Après intégration et publication d’une version : monter `@babylonjs/core` dans le jeu, retirer le contournement (§ 4, « Contournement du jeu à retirer »), lancer `npm run build && npm test`, et mettre à jour `docs/BABYLON_PATCHES.md`, `docs/PORTALS.md` § 14 et ce document.

## 7. Reproductions minimales à préparer (Playground)

- **#2** : sol à y = 0, personnage posé, `setPosition` au-dessus d’un second sol à y = −20, puis `checkSupport` → `UNSUPPORTED` au premier pas, alors qu’il devrait être `SUPPORTED`.
- **#5** : `TargetCamera` en (0, 1, 0), `setTarget(new Vector3(5, 1, 0))`, puis lire `camera.position.z` → 0,001 au lieu de 0.
- **#3a** : boîte unité à l’origine ; 6 plans d’un grand frustum, plus un 7e plan qui exclut l’origine ; `BoundingBox.IsInFrustum` renvoie `true`.
- **#1** : deux caméras dans `activeCameras`, la première écrit un masque au stencil, la seconde dessine avec un test `EQUAL 1` → rien n’apparaît, car le stencil a été effacé.
- **#4** : un miroir plan ou un portail avec un objet entre la caméra virtuelle et le plan. Sans plan oblique, l’objet apparaît à tort dans le reflet.
