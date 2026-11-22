# Review de cohérence de la codebase

Branche `review/codebase-2026-11-22`, créée le 22/11/2026 depuis `origin/experiment/non-euclidean-engine` (commit `71406e0`).

**Question posée** : le projet est-il conventionnel et cohérent, et que peut-on simplifier ?

**Méthode.** Lecture intégrale des 63 fichiers suivis : `src/` (34 modules), `tests/` (9 fichiers), `docs/` (4 documents et 5 correctifs Babylon), `ops/`, `.github/`, configuration racine, `README.md` et `LANCER.md`. Compléments :

- un passage ESLint 9 ponctuel, lancé hors du dépôt avec `no-unused-vars`, `no-undef` et `no-use-before-define` ;
- le graphe des imports internes ;
- un comptage des usages de chaque export ;
- l’application à blanc des cinq correctifs Babylon (`patch -p1 --dry-run --fuzz=0` sur `node_modules` 9.37.1 : les cinq s’appliquent).

Les numéros de ligne renvoient au commit `71406e0`.

## 1. Résumé exécutif

**Conventionnel ? Oui, pour l’essentiel.**

- Stack et outillage : Vite et ESM, imports Babylon granulaires (tree-shaking), versions épinglées, `engines` renseigné, CI GitHub Actions minimale avec actions épinglées par SHA.
- Conception : des fabriques `createX()` à état fermé partout, sans classe. Les écouteurs DOM sont rangés derrière un `AbortController`.
- Babylon : uniquement l’API publique, sans aucun membre `_` interne.
- Correctifs Babylon : ils sont rangés dans `docs/babylon-patches/` et ne sont **pas** appliqués automatiquement. C’est un choix délibéré et documenté, cohérent avec la règle « le jeu ne dépend d’aucun correctif » (R14).

Trois écarts avec les usages courants :

- aucun linter ;
- `npm test` teste `dist/` sans le reconstruire ;
- le code de développement (`src/dev/`) est embarqué dans le bundle de production.

**Cohérent ? Oui, avec quelques doublons.**

- Le graphe des imports est acyclique.
- `src/portals/` est réellement générique : il n’importe rien du jeu.
- `src/dev/` n’est importé que par `main.js`.
- Chaque ressource créée dans `main.js` enregistre son `dispose` sur `scene.onDisposeObservable`.

Les incohérences relevées :

- des doublons de logique : démarche du personnage, clones des voyageurs, masque de ligne de vue ;
- des réglages hors de `config.js` ;
- une initialisation désordonnée dans `system.js` ;
- un risque de dérive de la documentation : numéros de ligne périmés, API du hook incomplète, nombre de tests.

**Principaux leviers de simplification**, par rentabilité :

1. supprimer l’API morte et les paramètres jamais utilisés (R10) ;
2. factoriser le gabarit des tests Playwright (R4) ;
3. fusionner la fabrique des clones dans `travelers.js` (R5) ;
4. charger le hook de dev à la demande (R3) ;
5. extraire l’éclairage de `main.js` (R7) et mettre en commun la démarche (R6).

Un seul vrai défaut a été trouvé : une fuite de nœuds quand un modèle glTF échoue au calage (R12).

## 2. État de référence

Après `npm ci` (Node 20.19.2, npm 9.2.0), au commit `71406e0`, sans aucune modification :

- `npm run build` : réussit. Vite avertit que des chunks dépassent 500 kB (voir R20).
- `npm test` : 102 tests. **97 réussis et 5 en échec, tous liés à l’environnement** et non au code. La machine de mesure est un serveur partagé : 4 cœurs, 7,7 Go de RAM, d’autres services (Jellyfin, MongoDB, Docker) et des pics de charge (load average jusqu’à 160 pendant la première exécution).

Le premier passage complet a été interrompu à 92/102 au bout d’une heure, pendant un pic de charge, avec 6 échecs. Les tests en échec ou non exécutés ont été relancés à charge normale, sur la même build de référence. Les échecs stables :

| Test | Symptôme | Cause établie |
| --- | --- | --- |
| `portalFlicker.spec.js:134` (contour de A2 jusqu’au passage de la caméra) | `Target crashed` après le délai de 180 s | OOM : 280 images rendues et lues par `readPixels` dans un seul `page.evaluate`. Chromium ne libère la mémoire des lectures synchrones qu’en rendant la main, d’où environ 45 Mo/s jusqu’à 6,3 Go (R23). En boucle `requestAnimationFrame`, la mémoire reste stable : le jeu ne fuit pas. |
| `portalPhysics.spec.js:92` (A2) et `:111` (E) | délai dépassé dans `beforeEach`, `browser.newContext : Failed to find browser context` | Le test précédent du même navigateur réussit, puis la création du contexte suivant bloque 30 s. `browser.close` prend aussi 30 s. Le phénomène n’apparaît pas hors du lanceur de tests (script Playwright direct : fermeture en 0,2 à 0,4 s). C’est un problème du couple Chromium headless/SwiftShader sur cette machine. Après l’échec, le worker redémarre et le test suivant passe. |
| `portals.spec.js:38` (l’arche montre l’esplanade) | même blocage de `newContext` dans `beforeEach` | idem, juste après le dernier test de `portalPhysics.spec.js` |
| `portals.spec.js:437` (passage au demi-format) | délai de 30 s dépassé dans `page.evaluate` | test le plus long de la suite (quatre traversées) sur une machine lente |

`portals.spec.js:62` (benchmark) a aussi échoué une fois pendant le pic de charge, sans se reproduire.

**Règle de comparaison retenue** : après chaque lot, l’ensemble des tests en échec doit être inclus dans celui de la référence. Tout nouvel échec est relancé isolément et analysé.

## 3. Constats

Sévérité : **haute**, un défaut ou un risque fort pour la maintenance ; **moyenne**, un écart réel aux usages ou une duplication notable ; **basse**, de la finition. Statut : *à faire*, *fait (lot n)* ou *non retenu* (avec la raison).

| ID | Axe | Sévérité | Emplacement | Résumé | Statut |
| --- | --- | --- | --- | --- | --- |
| R1 | Outillage | moyenne | `playwright.config.js:12` | `npm test` sert `dist/` sans le reconstruire | fait (lot 3) |
| R2 | Outillage | moyenne | `package.json:7-12` | Aucun linter ni `.editorconfig` | fait (lot 3) |
| R3 | Dev/prod | moyenne | `src/main.js:12`, `src/dev/devHook.js:21,31` | Hook de dev embarqué en production, activation testée deux fois | à faire |
| R4 | Tests | moyenne | `tests/portal*.spec.js` | Gabarit `beforeEach`/`afterEach`/`withClock` copié dans 5 fichiers, filtre console incohérent | fait (lot 2) |
| R5 | Simplification | moyenne | `src/portals/travelers.js:135-209, 290-413` | Fantôme et projecteur d’ombre dupliquent la fabrique de clone | à faire |
| R6 | Cohérence | moyenne | `src/player/skeletonVisual.js:155-157`, `src/player/characterModel.js:34-38` | Choix de la démarche dupliqué avec les mêmes seuils | fait (lot 5) |
| R7 | Simplification | moyenne | `src/main.js:44-222` | `start()` de 180 lignes, éclairage et ciel mêlés à la boucle | fait (lot 5) |
| R8 | Cohérence | basse | `src/main.js:81-88`, `src/player/thirdPersonCamera.js:18,37-40` | Masque et rayon de « ligne de vue » écrits deux fois | fait (lot 5) |
| R9 | Config | basse | `src/player/thirdPersonCamera.js:8,16`, `src/main.js:101` | Réglages en dur hors de `config.js` | fait (lot 5) |
| R10 | Code mort | basse | voir détail | Exports, paramètres et valeurs par défaut jamais utilisés | fait (lot 1) |
| R11 | Cohérence | basse | `src/portals/system.js:52,110-115,178-189` | Variables déclarées après usage, démontage dupliqué, `hazeLevels` non validé à chaud | à faire |
| R12 | Bug | basse | `src/player/characterModel.js:50-62` | Échec du calage : conteneur et nœuds laissés dans la scène | fait (lot 4) |
| R13 | Docs | basse | `docs/*.md`, `README.md`, `src/main.js:58` | Documentation désynchronisée du code | fait (lot 1) |
| R14 | Outillage | info | `docs/babylon-patches/` | Correctifs Babylon non appliqués automatiquement | non retenu |
| R15 | Nommage | basse | `src/core/physics.js:6`, `src/input/input.js:1-7`, `src/world/testTerrain.js` | Conventions de nommage mêlées | non retenu |
| R16 | Conventions | basse | `src/portals/math.js:1-2`, `src/portals/cameraPath.js:1`, `src/dev/flickerProbe.js:1` | Imports Babylon avec ou sans `.js` | non retenu (règle documentée au lot 1) |
| R17 | Tests | basse | `tests/portalMath.spec.js`, `tests/frameProbe.spec.js`, `tests/browser.spec.js` | Tests unitaires purs lancés par Playwright | non retenu |
| R18 | Cohérence | basse | `src/portals/math.js:20-34,175,189-195,392-393` | Deux façons d’obtenir le repère d’un portail | non retenu |
| R19 | HTML | basse | `index.html:31` | `role="dialog"` et `aria-modal` redondants sur `<dialog>` | non retenu |
| R20 | Build | basse | `vite build` | Avertissement « chunks > 500 kB » | non retenu |
| R21 | Docs | basse | `src/world/crates.js:26-29`, `src/main.js:112-120` | Ordre implicite entre l’inscription aux ombres et `addTraveler` | fait (lot 1) |
| R22 | Tests | basse | `tests/player.spec.js` | Couverture : repli du modèle 3D, attentes fixes en millisecondes | fait (lot 4, partiel) |
| R23 | Tests | moyenne | `tests/portalFlicker.spec.js:54-75` | 280 lectures de pixels sans rendre la main : OOM sur une machine de 8 Go | fait (lot 2) |

### R1 — `npm test` ne reconstruit pas le site testé (moyenne)

- **Problème.** `playwright.config.js:12` lance `npm run preview`, qui sert le contenu existant de `dist/`. Après une modification de `src/`, un `npm test` sans `npm run build` teste l’ancienne build sans le signaler. La CI n’est pas touchée (elle construit avant), mais en local c’est un piège classique. Le README demande de penser au build à la main.
- **Proposition.** `webServer.command: "npm run build && npm run preview -- …"`, l’usage documenté par Playwright pour Vite. La build prend environ 1,5 s. Le README est simplifié en conséquence.
- **Risque.** Faible : environ 2 s de plus par lancement. La CI construit deux fois, ce qui reste négligeable. L’avertissement de taille des chunks de Vite (R20) apparaît désormais en tête de la sortie de `npm test`.

### R2 — Pas de linter (moyenne)

- **Problème.** Aucun ESLint, Prettier ou `.editorconfig`, ni script `lint`. Le passage ponctuel d’ESLint trouve :
  - un paramètre inutilisé (`sky.js:44`) ;
  - une variable de test inutilisée (`tests/portals.spec.js:471`) ;
  - des variables utilisées avant leur déclaration (`system.js:187-189`, R11).

  Ces défauts auraient été vus à l’écriture.
- **Proposition.** ESLint 10 en configuration plate minimale :
  - `@eslint/js` recommandé ;
  - globals navigateur pour `src/`, Node pour les fichiers de configuration et les tests ;
  - `no-unused-vars` avec `caughtErrors: "none"`.

  Ajouter le script `npm run lint` et une étape `npm run lint` en CI avant la build, ainsi qu’un `.editorconfig` (2 espaces, LF, UTF-8). Pas de Prettier (voir R15).
- **Risque.** Faible : trois devDependencies et aucun effet sur le bundle.
- **Réalisé (lot 3).** `eslint` 10.15.0, `@eslint/js` 10.0.1 et `globals` 17.14.0, épinglés comme les autres dépendances. La configuration recommandée passe sans exception. Elle a relevé un `throw` dans un `finally` (`no-unsafe-finally`) dans `tests/portals.spec.js`, qui aurait masqué l’erreur d’origine du test : la vérification de l’horloge réelle se fait maintenant côté Node.

### R3 — Hook de dev embarqué en production (moyenne)

- **Problème.** `src/main.js:12` importe statiquement `src/dev/devHook.js`, qui importe `flickerProbe.js`, `frameProbe.js`, `SceneInstrumentation` et `PerfCounter`. Tout ce code finit dans le bundle servi à tous les joueurs. L’activation est décidée à deux endroits par un couplage implicite :
  - `observeDevEffects` teste `import.meta.env.DEV || ?dev` (`devHook.js:21`) ;
  - `installDevHook` sort si `getEffects` est indéfini (`devHook.js:31`).

  `docs/PORTALS.md` § 10.3 justifie le hook en production (la CI teste la build publiée avec `?dev`). C’est vrai pour son **activation**, pas pour son **chargement**.
- **Proposition.** Un seul prédicat `devMode` dans `main.js`, puis `await import("./dev/devHook.js")` avant la création du moteur, pour que le compteur de compilations soit branché à temps. Les deux gardes de `devHook.js` sont supprimées. Le hook devient un chunk séparé, chargé seulement avec `?dev` ou en `npm run dev`.
- **Risque.** Faible à moyen : l’ordre d’initialisation doit être conservé. Il est couvert par tous les tests `?dev`, qui comparent les compteurs d’effets avant et après.

### R4 — Gabarit des tests copié cinq fois (moyenne)

- **Problème.** Le même code est recopié à l’identique :
  - `beforeEach` (ouvrir `/?dev`, cliquer « Jouer », attendre l’appui) dans `portals`, `portalGhosts`, `portalFlicker`, `portalShadows` et `portalPhysics` ;
  - `afterEach` (aucune erreur de page, aucun avertissement Babylon) dans quatre fichiers ;
  - `withClock` dans trois fichiers.

  `portalPhysics.spec.js:15-17` ne filtre pas la console comme les autres : c’est un oubli plus qu’un choix.
- **Proposition.** Un module `tests/support/devGame.js` (non collecté par Playwright, sans suffixe `.spec`) qui exporte `startDevGame`, `expectCleanPage` et `withClock`. Le filtre console est appliqué partout.
- **Risque.** Faible : comportement identique. Le filtre console devient plus strict pour `portalPhysics` ; s’il échouait, ce serait un vrai signal.

### R5 — Deux fabriques de clones presque identiques dans `travelers.js` (moyenne)

- **Problème.** `createGhostClone` (`travelers.js:135-209`) et `createShadowCaster` (`travelers.js:290-413`) répètent la même séquence :
  - clone de la racine détaché, désactivé, avec `rotationQuaternion` ;
  - matériaux clonés ;
  - paires source/copie pour chaque maillage ;
  - inscription aux générateurs d’ombres ;
  - `syncAppearance` identique au caractère près ;
  - `dispose` identique.

  Les seules différences : le suffixe du nom, le `layerMask` (`late` ou 0), `receiveShadows` et la liste des générateurs.
- **Proposition.** Une fabrique commune `createVisualCopy(visual, sources, suffix, { layerMask, receiveShadows, generators })` qui renvoie `{ clone, copies, materials, syncAppearance, dispose }`. Les deux appelants ne gardent que leurs plans de coupe et leur `show`/`hide`.
- **Risque.** Moyen : c’est le chemin des ombres traversantes et des fantômes. L’ordre « matériaux, puis plans, puis maillages, puis cartes d’ombre » est conservé. Couvert par `portalGhosts.spec.js` et `portalShadows.spec.js` (poses, plans, pixels, compteurs d’effets constants).

### R6 — Démarche calculée à deux endroits (moyenne)

- **Problème.** `skeletonVisual.js:155-157` réécrit en ligne `gaitOf` de `characterModel.js:34-38`, avec les mêmes seuils : 0,12 m/s, `walkSpeed + 0,4` et 0,15 m/s. Si l’un des deux change, le squelette et le modèle glTF divergent sans que rien ne le signale.
- **Proposition.** `src/player/gait.js` exporte `gaitOf`, et les deux visuels l’importent.
- **Risque.** Faible : expression identique.

### R7 — `main.js` concentre trop de responsabilités (moyenne)

- **Problème.** `start()` (`main.js:44-222`) mêle :
  - le moteur et la physique ;
  - deux lumières et le générateur d’ombres, avec dix réglages ;
  - un raycast « lumière bloquée » ;
  - le ciel ;
  - le joueur, la caméra, les entrées et le menu ;
  - la boucle à pas fixe et le redimensionnement.

  L’éclairage (`main.js:54-75`) et la palette du ciel (`main.js:93-98`) décrivent le monde, pas l’orchestration.
- **Proposition.** `src/world/lighting.js` : `createLighting(scene)` renvoie `{ sun, shadows }`, et une palette `skyPalette` est passée à `portals.createSky`. `main.js` garde l’assemblage et la boucle.
- **Risque.** Faible : mêmes objets, créés dans le même ordre (lumières avant le décor, générateur avant l’inscription des projecteurs).

### R8 — Ligne de vue écrite deux fois (basse)

- **Problème.** Le masque `terrain | portalBack | portalFrame` et le même raycast Havok avec un `PhysicsRaycastResult` réutilisé sont écrits deux fois : dans `main.js:81-88` (lumière bloquée) et dans `thirdPersonCamera.js:18,37-40` (collision de la caméra).
- **Proposition.** `core/physics.js` exporte `createSightTest(physics)`, qui renvoie `(from, to) → distance | null` avec ce masque.
- **Risque.** Faible.

### R9 — Réglages hors de `config.js` (basse)

- **Problème.** `config.js` centralise `PLAYER` et `CAMERA`, mais trois réglages restent en dur :
  - `thirdPersonCamera.js:8` (`baseMinZ = 0.04`) ;
  - `thirdPersonCamera.js:16` (`maxZ = 500`, cité par `docs/PORTALS.md` § 9.3) ;
  - `main.js:101` (réapparition sous y = −30 dans un intérieur, § 11.7).
- **Proposition.** `CAMERA.minZ`, `CAMERA.maxZ` et `PLAYER.interiorRespawnBelow`.
- **Risque.** Nul.

### R10 — API morte et paramètres jamais utilisés (basse)

- `src/platform/browser.js:21` : `browserNames` n’est importé nulle part.
- `src/portals/renderer.js:18` : `export { clearFogEnd }` réexporte une constante de `sky.js` que personne n’importe depuis `renderer.js`.
- `src/portals/sky.js:26` : le paramètre `clearEnd` de `skyVeilFactor` reçoit toujours sa valeur par défaut (`renderer.js:421`).
- `src/portals/sky.js:44` : le paramètre `scene` de `createPortalSky` est inutilisé (signalé par le lint).
- `src/player/playerController.js:210` : `setScale` est exposé mais n’est appelé que dans le module.
- `src/player/thirdPersonCamera.js` :
  - le paramètre `respawned` de `follow` (l. 82) vaut toujours `false` aux deux appels (`main.js:157`, `devHook.js:92`) ; la réapparition passe par `camera.reset` ;
  - le repli « sans portails » (`noPortals`, `traceWithoutPortals`, l. 9-10, 43, 88) n’est jamais emprunté ;
  - `dispose` (l. 118) n’est jamais appelé : la scène libère ses caméras.
- La valeur par défaut `apertureMargin = 0.03` est écrite trois fois alors que `system.js` passe toujours la sienne :
  - `src/portals/portal.js:21` ;
  - `src/portals/travelers.js:415` (`settings = {}`) ;
  - `src/portals/travelers.js:494` (`?? 0.03`).
- `tests/portals.spec.js:471` : `height` est inutilisé.

**Proposition.** Supprimer tout cela et mettre à jour la signature de `createPortalSky` dans `docs/PORTALS.md` § 4. **Risque :** nul (code jamais exécuté ou valeur identique).

### R11 — Initialisation désordonnée de `system.js` (basse)

- **Problème.** Trois points :
  - `sky` et `disposed` sont déclarés après l’objet `system` qui les utilise (`system.js:188-189`). Ça fonctionne grâce aux fermetures, mais c’est fragile et signalé par le lint. Seul `renderer` doit vraiment suivre `system`, dont il a besoin.
  - Le démontage d’un portail (aperture et contour) est écrit deux fois : dans `removePortal` (l. 110-115) et dans `dispose` (l. 178-183).
  - `hazeLevels` n’est borné qu’à la construction (l. 52), alors que `docs/PORTALS.md` § 5 le dit « réglable à chaud » comme `maxDepth`, `maxPasses` et `apertureMargin`, qui ont des setters validés.
- **Proposition.** Déclarer `sky` et `disposed` en tête, écrire une fonction `disposePortal(portal)` et un setter `hazeLevels` (même bornage que `maxDepth`).
- **Risque.** Faible : comportement identique pour toute valeur valide.

### R12 — Échec du calage d’un modèle glTF : nœuds laissés dans la scène (basse, bug)

- **Problème.** `createCharacterModel` appelle `container.addAllToScene()` (l. 50) avant de mesurer la hauteur. Si le calage échoue (l. 62, `Le modèle … n’a pas de hauteur mesurable`), l’exception remonte. `main.js:38` reprend alors le squelette, mais les maillages du modèle, les nœuds `personnage` et `personnage · calage` restent dans la scène, visibles à l’origine.
- **Proposition.** `try/catch` après `addAllToScene` qui libère `container` et `root` avant de relancer l’erreur. Ajouter un test du repli : un modèle introuvable donne le squelette.
- **Risque.** Nul.
- **Réalisé (lot 4).** Libération explicite de `container` et `root` au seul point d’échec situé après `addAllToScene`. Deux tests dans `tests/player.spec.js` :
  - un modèle introuvable (404) ;
  - un GLB minimal servi par `page.route`, un triangle posé à plat donc de hauteur nulle.

  Dans les deux cas, le squelette est utilisé et aucun nœud du modèle ne reste. Sans le correctif, le second test échoue en trouvant `personnage`, `personnage · calage`, `__root__` et `triangle plat` dans la scène.

### R13 — Documentation désynchronisée (basse)

- `docs/BABYLON_UPSTREAM.md:63,80` : les numéros de ligne sont périmés (`renderer.js` l. 265-267 est maintenant l. 349, `math.js` l. 264 l. 270, `renderer.js` l. 130 l. 200). Proposition : citer les fonctions plutôt que les lignes.
- `docs/PORTALS.md` :
  - § 10.3 n’énumère pas `gowDev.benchmark`, `project`, `samplePixel` ni `character` (documentés ailleurs ou nulle part) ;
  - § 15 cite quatre limites sur les six de `BABYLON_PATCHES.md` ;
  - § 16 annonce 100 tests (il y en a 102).
- `README.md` dit « Node.js 24 », `LANCER.md` « Node 22 » et `package.json` `^20.19.0 || >=22.12.0`. `LANCER.md` n’est référencé nulle part.
- `src/main.js:58` parle de « futurs intérieurs à −20 m », qui existent.

**Risque.** Nul.

### R14 — Correctifs Babylon non appliqués automatiquement (info, non retenu)

`docs/babylon-patches/*.patch` sont au format `patch-package`, mais il n’y a ni dossier `patches/` ni `postinstall`. C’est **voulu et cohérent** : le jeu contourne chaque limite par l’API publique, et `docs/BABYLON_PATCHES.md` explique comment essayer un correctif. Vérifié : les cinq s’appliquent sans décalage sur 9.37.1.

**Non retenu** : les appliquer automatiquement rendrait le jeu dépendant de correctifs non publiés, contre la règle du projet. Aucune modification des correctifs n’est nécessaire.

### R15 — Nommage mêlé (basse, non retenu)

- Les objets-énumérations sont nommés tantôt en PascalCase pluriel (`PortalLayers`, comme les énumérations Babylon), tantôt en camelCase singulier (`collisionLayer`).
- Les constantes privées sont en `SCREAMING_SNAKE_CASE` dans `input.js` seulement ; ailleurs, elles sont en camelCase.
- `world/testTerrain.js` construit la carte réelle, pas un terrain de test.

**Non retenu** : ces renommages toucheraient huit fichiers et la documentation sans gain fonctionnel, avec des conflits assurés pour les branches en cours (`experiment/portals-polish`…). À faire au besoin lors d’une prochaine refonte de ces fichiers. Pas de Prettier pour la même raison : il reformaterait tout le dépôt.

### R16 — Imports Babylon avec ou sans `.js` (basse, non retenu, règle documentée)

`math.js`, `cameraPath.js`, `flickerProbe.js` et les tests importent `@babylonjs/core/…/x.js`. Les 96 autres imports omettent l’extension, comme la documentation Babylon. Ce n’est pas un hasard : `@babylonjs/core` n’a pas de champ `exports`, donc Node exige l’extension pour les modules chargés par les tests unitaires, alors que Vite résout les deux formes vers le même module.

**Non retenu** : uniformiser ferait 96 lignes de churn. La règle est ajoutée à `docs/PORTALS.md` § 13.1.

### R17 — Tests unitaires lancés par Playwright (basse, non retenu)

`portalMath`, `frameProbe` et `browser` ne touchent pas au navigateur. Vitest serait l’outil habituel, mais Playwright les exécute bien, sans dépendance de plus, et un seul `npm test` couvre tout.

**Non retenu** : gain faible pour une dépendance et une configuration supplémentaires.

### R18 — Deux façons d’obtenir le repère d’un portail (basse, non retenu)

`toLocal`, `signedDistance` et `shadowPortalCrossing` lisent `portal.right` et `portal.normal`, avec un repli sur `sin`/`cos` du lacet. `rayCrossing`, `portalPlane`, `secondaryGhostClipPlane` et `shadowPrismPlanes` recalculent `sin`/`cos`.

**Non retenu** : les tests unitaires passent des objets simples sans repère, le résultat numérique est identique, et c’est le chemin chaud du rendu.

### R19 — Rôle ARIA redondant (basse, non retenu)

`<dialog role="dialog" aria-modal="true">` répète le rôle implicite de `<dialog>` et la modalité de `showModal()`. **Non retenu** : c’est inoffensif, et toucher à l’accessibilité demande une vérification au lecteur d’écran.

### R20 — Avertissement de taille des chunks (basse, non retenu)

Babylon core (1,15 Mo) et le chargeur glTF (1,06 Mo, déjà chargé à la demande) dépassent le seuil de 500 kB de Vite. **Non retenu** : découper davantage n’allège pas le premier chargement, et relever `chunkSizeWarningLimit` relève d’une décision produit.

### R21 — Contrat d’ordre implicite pour les ombres traversantes (basse)

- **Problème.** `addTraveler` ne crée de projecteur d’ombre que si le visuel figure **déjà** dans la `renderList` d’un générateur (`travelers.js:162-171, 304-308`). `crates.js:26-29` et `main.js:112` (avant `main.js:120`) respectent cet ordre, mais `docs/PORTALS.md` § 5.1 ne le dit pas.
- **Proposition.** Le documenter dans le contrat du voyageur.
- **Risque.** Nul.

### R22 — Couverture et fragilité des tests (basse)

- **Couvert** :
  - maths des portails, en Node (22 tests) ;
  - traversée du joueur, des caisses et de la caméra dans les cinq zones ;
  - physique avec doublure ;
  - fantômes doubles, ombres traversantes, ciel et voile ;
  - scintillement ;
  - entrées et menu.
- **Non couvert** : le chargement d’un modèle glTF et son repli (`characterModel.js`, `main.js:32-42`), ainsi que `system.dispose()` et `bodyTraveler.dispose()` (seul `removePortal` est exercé).
- **Fragile** :
  - `player.spec.js` attend des durées fixes (`waitForTimeout` de 150 à 1000 ms) ;
  - `portalFlicker.spec.js` est calibré sur le rendu SwiftShader exact (toute retouche du rendu impose un recalibrage, documenté au § 13.2 de `PORTALS.md`).
- **Proposition retenue** : un test du repli vers le squelette (avec R12).
- **Non retenu** : réécrire les attentes en millisecondes (stables en CI à ce jour) et tester `dispose` (le chemin ne sert qu’au rechargement à chaud de Vite).

### R23 — Lectures de pixels en boucle synchrone : la suite ne passe pas sur 8 Go (moyenne)

- **Problème.** `measureOutline` (`tests/portalFlicker.spec.js:54-75`) rend et lit le framebuffer (`readPixels` de 780 × 540) jusqu’à 280 fois dans un seul `page.evaluate`. Chromium ne libère la mémoire de ces lectures synchrones qu’au retour à sa boucle d’événements. Mesures sur la machine de référence :
  - le navigateur et le moteur de rendu grossissent chacun d’environ 45 Mo/s, jusqu’à 6,3 Go au total ;
  - le moteur de rendu est alors tué (`Target crashed`) et la machine swappe ;
  - sans lecture de pixels, ou en `requestAnimationFrame`, la mémoire reste stable.

  Le test du passage de la caméra dans A2 échoue donc à chaque fois sur une machine de 8 Go. La CI (16 Go) le laisse passer.
- **Proposition.** Rendre la main au navigateur (`setTimeout(0)`) toutes les 50 captures dans `measureOutline`. Le rendu est figé par l’horloge manuelle, donc la mesure reste identique.
- **Risque.** Faible : aucune image n’est rendue pendant la pause (boucles du moteur arrêtées, `performance.now` figé).

### Points conformes, sans action

- **Structure** par domaine (`core`, `input`, `platform`, `player`, `portals`, `ui`, `world`, `dev`), un module par responsabilité.
- **Fabriques** : `createX(...)` renvoie un objet de méthodes, sans classe.
- **Allocation** : pas d’allocation par image (tampons réutilisés, pools de caméras et de nœuds).
- **Dépendances** : graphe des imports sans cycle. `portals/` est générique (aucun import du jeu), et la couche `world/` passe par `portals/index.js`.
- **Cycle de vie** : `dispose` systématique via `scene.onDisposeObservable`, `AbortController` pour les écouteurs DOM (`input`, `hud`, `menu`, `keyboardLayout`).
- **Erreurs** :
  - `start().catch` affiche un message à l’utilisateur ;
  - un modèle illisible laisse place au squelette ;
  - les erreurs de `localStorage` sont absorbées et les préférences invalides remplacées par les valeurs par défaut.
- **Babylon idiomatique** :
  - `ObjectRenderer` pour les passes ;
  - Observables ;
  - `PhysicsCharacterController` ;
  - `executeStep` au pas fixe ;
  - `getActiveMeshCandidates` et `getCustomRenderList` (API publiques).
- **CI** : permissions minimales, actions épinglées par SHA, publication seulement si `main` n’a pas bougé.
- **Ops** : unité systemd durcie (`ProtectSystem=strict`, `NoNewPrivileges`), bascule atomique par lien symbolique, somme SHA-256 vérifiée.

## 4. Plan d’implémentation

Les lots vont du plus sûr au plus risqué. Après chaque lot : `npm run build` et `npm test` au moins aussi verts que la référence, puis un commit.

| Lot | Constats | Contenu | Risque |
| --- | --- | --- | --- |
| 1 | R10, R13, R16, R21 | Suppression de l’API morte ; documentation resynchronisée | nul |
| 2 | R4, R23 | `tests/support/devGame.js` partagé par les cinq fichiers de tests des portails ; sonde de scintillement qui rend la main | faible |
| 3 | R1, R2 | `npm test` reconstruit le site ; ESLint, `npm run lint`, CI, `.editorconfig` | faible |
| 4 | R12, R22 | Correctif du modèle glTF et test du repli | nul |
| 5 | R6, R7, R8, R9 | `gait.js`, `world/lighting.js`, `createSightTest`, réglages dans `config.js` | faible |
| 6 | R3 | Hook de dev chargé à la demande | faible à moyen |
| 7 | R11, R5 | `system.js` remis en ordre ; fabrique commune des clones dans `travelers.js` | moyen |

## 5. Suivi

*Mis à jour à chaque lot. Les tests sont comparés à la référence du § 2 (5 échecs d’environnement).*

| Lot | Commit | Build | Tests | Remarques |
| --- | --- | --- | --- | --- |
| 1 | `refactor: supprime l’API morte et resynchronise la documentation` | OK | 97 réussis, 5 échecs identiques à la référence | Lot 2 avancé avant l’outillage : il supprime l’OOM de `portalFlicker.spec.js:134`, qui fait aussi swapper la machine |
| 2 | `test: partage le gabarit des tests de portails et borne la mémoire de la sonde` | OK | 98 réussis, 4 échecs (inclus dans la référence) | Le test du passage de la caméra dans A2 passe : 239 images, 58 pixels isolés, maximum 3 par image, soit exactement la calibration de `PORTALS.md` § 13.2. Pic mémoire de Chrome : 2,7 Go au lieu de 6,3 Go et d’un plantage. Suite en 20,5 min au lieu de 38. `portalPhysics.spec.js` applique désormais le filtre console commun, sans nouvel échec. |
| 3 | `build: reconstruit le site avant les tests et ajoute ESLint` | OK | 98 réussis, 4 échecs (inclus dans la référence) | `dist/` supprimé avant le lancement : `npm test` l’a reconstruit. `npm run lint` passe. |
| 4 | `fix(personnage): retire le modèle refusé au calage avant de reprendre le squelette` | OK | 104 tests : 100 réussis, 4 échecs (inclus dans la référence) | Deux tests ajoutés (repli du modèle 3D) |
| 5 | `refactor: regroupe démarche, éclairage, ligne de vue et réglages de caméra` | OK | 100 réussis, 4 échecs (inclus dans la référence) | `start()` passe de 179 à 151 lignes. Lumières créées dans le même ordre et sous les mêmes noms (`ciel`, `soleil`) ; les tests d’ombres et de ciel, lus au pixel, sont inchangés. |

## 6. Bilan

*À compléter en fin de chantier.*
