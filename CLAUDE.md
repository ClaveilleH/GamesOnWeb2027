# CLAUDE.md

Jeu web Games on Web 2027 : personnage squelette en troisième personne sur un terrain d'entraînement. Il utilise Babylon.js 9 pour le rendu, Havok (WASM) pour la physique et Vite 8 pour le build, en JavaScript ES modules, sans framework ni TypeScript.

**Avant d'explorer le code, lire [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Il contient la carte des fichiers, la boucle de jeu, les conventions et le fonctionnement des portails. Mettez-le à jour quand vous ajoutez un module ou changez un mécanisme.

## Commandes

- `npm ci` puis `npm run dev` : serveur de développement sur http://localhost:5173.
- `npm run build` : build de production dans `dist/`.
- `npm test` : tests Playwright sur le build de production servi en `vite preview` sur le port 4187. Il faut d'abord lancer `npm run build` et `npx playwright install --only-shell chromium`.

Node ≥ 20.19 ou ≥ 22.12 est requis (`engines`). Node 18 ne peut pas faire tourner Vite 8.

## Règles du projet

- Le français est utilisé partout : textes de l'interface, noms de meshes, commentaires, messages de commit (format conventionnel : `feat:`, `fix:`, `test:`…).
- Les réglages de jeu vont dans `src/config.js`, pas en dur dans les modules.
- Les obstacles sont des `PhysicsAggregate` de masse 0 sur la couche `collisionLayer.terrain`. La caméra ne raycaste que cette couche.
- Les imports Babylon se font par chemin profond (`@babylonjs/core/Maths/math.vector`, etc.), jamais depuis `@babylonjs/core` directement.
- Le ciel est un dégradé CSS : le canvas est transparent. Tout rendu hors écran qui doit montrer le ciel doit le recomposer (voir le shader `portal`).
- Les tests lisent l'état du jeu dans les `data-*` de `#player-state` : ne pas les renommer sans mettre à jour `tests/player.spec.js`.
- La CI publie `main` en production (release GitHub, puis le VPS la récupère toutes les 3 minutes). Les expériences se font sur des branches.

## Tester dans un navigateur piloté

Le pointer lock n'est pas disponible dans un navigateur piloté. En développement, `window.__game.camera.look(dx, dy)` tourne la caméra. Pour déplacer le personnage, on envoie des `KeyboardEvent` (`code: "ArrowUp"`…) sur `window` après avoir cliqué sur **Jouer**.

Sous SwiftShader (tests Playwright), le rendu est lent. Un rendu supplémentaire permanent, comme une vue de portail, suffit à faire expirer les clics des tests.

## Branches en cours

- `experiment/non-euclidean-tunnel` : tunnel de 14 m vu de l'extérieur qui ne fait que 3 m à l'intérieur, grâce à des portails (`src/world/nonEuclideanTunnel.js`).
