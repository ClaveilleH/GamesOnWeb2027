# Architecture

Carte du code pour s'orienter sans relire tout le dépôt. Le jeu est une page Vite unique en JavaScript (ES modules, sans framework ni TypeScript) qui utilise Babylon.js 9 pour le rendu et Havok (WebAssembly) pour la physique.

## Arborescence

| Fichier | Rôle |
| --- | --- |
| `index.html` | Canvas `#scene`, HUD (`#player-state`, `#capture-hint`, `#status`) et menu `<dialog id="pause-menu">` avec la table des touches. |
| `src/main.js` | Point d'entrée. Crée moteur, scène, lumières, ombres, terrain, tunnel, joueur, visuels, caméra, entrées, HUD et menu, puis gère la boucle à pas fixe. |
| `src/config.js` | Toutes les constantes de réglage : gravité, pas fixe, `PLAYER` (capsule, vitesses, saut, pente) et `CAMERA` (épaule, distance, sensibilité, fondu). |
| `src/core/physics.js` | Initialise Havok et exporte `collisionLayer` (`terrain` = 1, `player` = 2). |
| `src/player/playerController.js` | `PhysicsCharacterController` de Babylon : marche, course, saut avec temps coyote et tampon de saut, réapparition, traversée des portails. Expose `state`, `previousPose` et `update()`. |
| `src/player/skeletonVisual.js` | Squelette construit en primitives, avec animation procédurale (repos, marche, course, saut, chute) et `setFade()` pour le fondu de proximité. |
| `src/player/thirdPersonCamera.js` | Caméra d'épaule : `look()` (souris), `follow()` (lissage et raycast anti-mur), `shift()` (suivi d'une téléportation). Elle tient compte des portails. |
| `src/input/input.js` | Clavier (`event.code`), souris en pointer lock, pause sur blur ou onglet masqué. `read()` renvoie les commandes du pas. |
| `src/input/bindings.js` | Actions et touches par défaut (ZQSD/WASD + flèches), réassignation, persistance dans `localStorage` (`gow.bindings.v1`). |
| `src/input/keyboardLayout.js` | Détection AZERTY/QWERTY et libellés des touches. |
| `src/input/preferences.js` | Lecture et écriture `localStorage` protégées par `try/catch`. |
| `src/ui/menu.js` | Menu pause et réassignation des touches. |
| `src/ui/hud.js` | HUD F3. Écrit position, vitesse et caméra dans les `data-*` de `#player-state`, que les tests lisent. |
| `src/world/testTerrain.js` | Terrain d'entraînement 40 × 40 m : sol peint (DynamicTexture), rampes 18°/32°/60°, plots de saut, escalier, murs avec panneaux, relief lointain. Exporte `spawnPoint` (0, 3,65, −10). |
| `src/world/nonEuclideanTunnel.js` | Expérience non euclidienne : tunnel de 14 m qui ne fait que 3 m quand on le traverse (voir plus bas). |
| `tests/player.spec.js` | Tests Playwright de bout en bout sur le build de production (port 4187). |
| `ops/` | Déploiement du VPS : service et timer systemd, Nginx, `update.py`, qui récupère la dernière release GitHub. |
| `.github/workflows/site.yml` | CI : build, tests, puis release de `dist/` sur `main`. |

## Boucle de jeu (`src/main.js`)

1. `scene.onBeforeRenderObservable` accumule le temps réel, plafonné à `MAX_ACCUMULATED_TIME`, et exécute N pas physiques de `FIXED_STEP` (1/60 s).
2. À chaque pas, `player.update(dt, controls, cameraYaw)` déplace la capsule. Le résultat indique `respawned` ou `teleport` (translation d'un portail). Dans ce dernier cas, la caméra est décalée avec `camera.shift()`.
3. `present()` interpole la pose visuelle entre `previousPose` et `state` avec `alpha`, anime le squelette, place la caméra puis applique le fondu du personnage.
4. Un second observateur, `portalViews.update`, active les rendus de portail visibles. Il tourne à chaque image, menu ouvert compris.

Le menu ouvert met la simulation en pause, mais la scène continue d'être rendue.

## Conventions

- +Z correspond au nord et à l'avant au départ (`SPAWN_YAW = 0`). L'unité est le mètre. Y pointe vers le haut.
- Tout ce qui doit bloquer le joueur et la caméra est un `PhysicsAggregate` de masse 0 avec `filterMembershipMask = collisionLayer.terrain`. Le raycast de la caméra ne voit que cette couche.
- Les objets qui projettent une ombre sont renvoyés par les fonctions de construction du monde (`casters`) et ajoutés au `ShadowGenerator` dans `main.js`.
- Les couleurs sont en hexadécimal via `Color3.FromHexString`. Le ciel n'est pas rendu par Babylon : le canvas est transparent (`clearColor` alpha 0) et le ciel est un dégradé CSS sur `main` (`src/style.css`).
- Les textes de l'interface, les noms de meshes, les commentaires et les messages de commit sont en français.
- Les imports Babylon se font par chemin profond (`@babylonjs/core/...`) pour l'élagage du bundle.

## Tunnel non euclidien (`src/world/nonEuclideanTunnel.js`)

Le tunnel est orienté selon Z, centré en x = −16,5. Sa coque extérieure va de z = −12 (entrée sud) à z = 2 (sortie nord), soit 14 m. Seuls les 3 derniers mètres (z ∈ [−1, 2]) sont réellement parcourus.

- **Portails.** Deux plans de translation pure de ±11 m sur Z :
  - « entrée sud » (z = −12, franchi vers +Z) envoie à z = −1 ;
  - « retour » (z = −1, franchi vers −Z) renvoie à z = −12.

  Les 11 m intermédiaires de la coque ne sont jamais vus de l'intérieur.
- **`crossPortal(from, to)`** renvoie le portail franchi par un segment (`translation`, point, paramètre `s`). Il est utilisé par :
  - le contrôleur, qui téléporte la capsule et décale aussi `previousPose` ;
  - la caméra, qui raycaste en deux morceaux de part et d'autre du portail et place la caméra de l'autre côté si le segment épaule → caméra traverse un portail.
- **Rendu.** Chaque portail est une boîte fine (`portalDepth` = 15 cm, faces arrière visibles) dont le shader `portal` échantillonne en espace écran une `RenderTargetTexture`. Cette texture est rendue par une `TargetCamera` décalée de la translation du portail, avec `scene.clipPlane` qui coupe tout ce qui précède le portail d'arrivée. Les pixels vides sont remplis par une copie du dégradé CSS du ciel. La vue n'est rendue que si le portail est dans le frustum (calculé à neuf) et vu de face. Elle coûte un rendu complet de la scène.
- **Double.** Un second `createSkeletonVisual` (`twin`) s'affiche à `feet + translation` quand le corps chevauche un portail (`straddledPortal`), pour que le personnage ne soit pas coupé en deux.
- **Limites connues.** La récursion est d'un seul niveau, ce qui suffit ici car un portail ne voit jamais l'autre. Les translations sont pures, sans rotation. Le double ne projette pas d'ombre. Les vues de portail ont la taille de l'écran.

Pour ajouter un portail, ajoutez une entrée à `portals` : `plane`, `facing`, `translation` et `clip`. Le plan de découpe garde ce qui est au-delà du portail d'arrivée et suit la convention Babylon : un fragment est rejeté si `n·p + d > 0`.

## Débogage

- **F3** affiche le HUD. Les valeurs détaillées sont dans les attributs `data-*` de `#player-state` (`x`, `y`, `z`, `speed`, `grounded`, `cameraYaw`…).
- **En développement uniquement**, `window.__game = { scene, camera, player }`. `__game.camera.look(dx, dy)` tourne la caméra sans pointer lock, ce qui est utile dans un navigateur piloté.
- Pour déplacer le personnage par script : `window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }))`, puis `keyup`. Il faut d'abord avoir cliqué sur **Jouer**.
