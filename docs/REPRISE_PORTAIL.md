# Notes de reprise : portail rétrécissant (travail en cours)

État au moment de l'arrêt, sur la branche `experiment/shrinking-portal`, créée depuis `main`. Le fonctionnement est décrit dans [PORTAIL_RETRECISSANT.md](PORTAIL_RETRECISSANT.md).

## Ce qui marche (vérifié à la main dans le navigateur, `npm run dev`)

- Le couloir à x = 14, z de −17 à −7, avec son entrée sur le mur ouest.
- Le rendu récursif sur 5 niveaux : à travers le portail, on voit le couloir agrandi, ses portails successifs et une copie géante du joueur.
- La traversée, répétable à l'infini : `state.crossings` augmente et le joueur réapparaît devant la petite porte.
- Le retard de caméra : l'image est continue au moment du passage. Si le joueur s'arrête, la caméra glisse seule à travers le portail (`soft: true` dans `limitCameraRay`).
- Le coût de rendu, mesuré : 4,25 → 6,04 ms par image à 1024 × 768, avec les 5 vues actives.
- `npm run build` passe.

## Ce qui reste ouvert

### 1. Les tests Playwright échouent (priorité)

`npm test` : 7 réussis, une quinzaine en échec, surtout dans `tests/player.spec.js`. Exemple, `player.spec.js:266` :

- `startOnGround` attend `#player-state[data-grounded="true"]`.
- La valeur reçue est `""` : l'attribut n'est jamais renseigné.

Ce qu'on sait déjà :

- Les tests tournent sur le **build** (`vite preview` sur le port 4187, servi depuis `dist/`) sous **SwiftShader**. Il faut donc refaire `npm run build` avant chaque `npm test`.
- Un essai sur `main` avec les changements remisés (`git stash`) a aussi échoué. **Cet essai ne prouve rien** : `dist/` contenait encore mon code.
- Ce même build, ouvert dans un Chromium normal (GPU), démarre sans erreur et le HUD se remplit.
- Hypothèses à vérifier, dans l'ordre :
  1. `view.samples = 4` sur la RTT du niveau 1 (MSAA) plante ou est refusé sous SwiftShader.
  2. Les 5 rendus supplémentaires rendent SwiftShader trop lent : le portail est peut-être déjà dans le champ dès l'apparition, puisque le test de frustum ignore les murs.
  3. Une exception au premier `present()` : le HUD vide pointe dans ce sens.
- Méthode : ouvrir le build avec `chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })` et écouter `pageerror` et `console`. Ensuite, comparer avec `main` **rebuildé** pour connaître la vraie base. Lors d'une session précédente, `main` échouait déjà sur 1 test sur 3 sous SwiftShader (clics instables).
- Pistes de correction :
  - retirer `samples` ;
  - n'activer les vues que si la caméra est dans le couloir ou voit son entrée ;
  - réduire `SHRINK.levels` ou la résolution des niveaux profonds (`{ ratio: 0.5 }`).

### 2. Limites connues (décrites dans PORTAIL_RETRECISSANT.md)

- Aucun fantôme du corps pendant qu'il est à cheval sur le plan du portail.
- La petite porte n'est pas un portail : regarder à travers ne montre pas le couloir réduit, et on ne peut pas revenir en arrière.
- Juste après le passage, le joueur est collé au mur du fond et la caméra entre dans sa tête jusqu'à ce qu'il avance. Idée : faire apparaître le joueur un peu plus loin, ou espacer la petite porte du mur du fond.

### 3. Idées

- Encadrer l'entrée du couloir (cadre orange) pour qu'on la repère depuis le départ.
- Écrire un test Playwright de traversée : marcher vers le portail et vérifier `data-crossings` (attribut ajouté au HUD).

## Environnement

- Node ≥ 20.19 est requis (Vite 8). Sur le PC d'origine, Node 22 a été installé avec `winget install OpenJS.NodeJS.22` : **rouvrir PowerShell** après l'installation.
- `public/models/test.glb` n'est pas suivi et ne doit **jamais** être commité : c'est un modèle Mario, propriété de Nintendo, et `main` est publiée.
- Pilotage manuel en dev, dans la console du navigateur : `window.__game` (`player`, `camera`, `portalViews`, `cameraLag`). Les touches se simulent avec `window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }))`, et l'orientation avec `__game.camera.look(dx, dy)`, où l'angle vaut `dx × 0,0023` rad.
