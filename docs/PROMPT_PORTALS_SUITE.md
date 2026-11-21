# Prompt — Portails non euclidiens, suite : corriger les défauts visuels et lever les limites

> À coller tel quel au début d’une nouvelle session. Adapter la section « Rôles » si l’IA doit coder elle-même plutôt que déléguer à Codex.

## Rôles

Toi, Claude Code, tu es l’architecte et le reviewer. Tu n’écris pas le code de production : toute la génération de code passe par Codex (`codex exec -m gpt-6.2-astra -c model_reasoning_effort="max"`, mode non interactif, depuis ton terminal). Vérifie d’abord que la CLI `codex` fonctionne ; sinon arrête-toi et signale-le. Pour chaque tâche, donne à Codex un brief qui se suffit à lui-même (objectif, fichiers, interfaces en citant `docs/PORTALS.md`, conventions du dépôt, critères d’acceptation). Relis le diff, lance `npm run build` et `npm test`, contrôle le rendu dans Chromium et Firefox (MCP). Tu peux corriger toi-même les petites choses (quelques lignes) ; pour le reste, renvoie à Codex des retours précis, au plus 3 allers-retours par tâche, puis demande-moi.

## Contexte

Jeu web Babylon.js 9.37.1 + Havok 1.3.14 + Vite + Playwright, en JavaScript ES modules. Le système de portails existe déjà sur la branche `experiment/non-euclidean-engine` : module générique `src/portals/`, cinq démos dans `src/world/portalDemos.js`, 60 tests verts (`tests/portalMath.spec.js`, `tests/portals.spec.js`). **Lis d’abord en entier** :

- `docs/PORTALS.md` — architecture, API, flux de rendu stencil (§ 6), traversée et fantômes (§ 7), échelle (§ 8), caméra (§ 9), hook dev `gowDev` (§ 10.3), règles de conception (§ 11), démos (§ 12), mesures (§ 13.3), **limites connues (§ 14)** ;
- `docs/BABYLON_PATCHES.md` et `docs/BABYLON_UPSTREAM.md` — limites de Babylon et contournements en place (aucun correctif Babylon n’est appliqué, n’en ajoute pas sans m’en parler).

Branche : crée `experiment/portals-polish` à partir de `experiment/non-euclidean-engine`. Ne fais ni commit ni push : je m’en occupe.

## Priorité 1 — Défauts que j’ai constatés en jouant

1. **Scintillements autour des portails** (bords des ouvertures, en marchant ou en tournant la caméra).
2. **Scintillements pendant la traversée** d’un portail (joueur et caméra).
3. **Traversée d’un objet pas fluide** (pousser une caisse à travers un portail : à-coups).

Méthode imposée : **d’abord reproduire et mesurer, ensuite corriger**. Les fenêtres des navigateurs pilotés par MCP tournent souvent à ~1 i/s en arrière-plan : ne te fie pas à une observation en temps réel. Construis un outil de détection déterministe, par exemple dans le hook dev :
- avancer le jeu image par image avec une horloge simulée (le test « à 144 Hz… » de `tests/player.spec.js` remplace `requestAnimationFrame` et `performance.now` par `advanceRenderFrame` : réutilise cette technique), sur un trajet scripté (`gowDev.setControls`, `teleportPlayer`, `crate().push`) ;
- capturer chaque image (`samplePixel` sur une grille de points autour de l’ouverture, ou lecture d’une région du framebuffer) et détecter les **changements isolés d’une image** (un pixel qui change puis revient), ainsi que les **sauts** de position du visuel des caisses entre deux images ;
- en faire des tests Playwright de non-régression qui échouent avant la correction.

Pistes relevées à la relecture du code, **à vérifier une par une** (ne pas les tenir pour acquises) :

- **Z-fighting au marquage du stencil.** Les montants et linteaux des portes (`doorway()` dans `src/world/portalDemos.js`) sont placés juste derrière le plan du portail : leur face avant est **exactement dans le plan de l’ouverture**. Or l’ouverture dessinée déborde de `apertureMargin` = 3 cm sur ce cadre (`docs/PORTALS.md` § 6.4). Le test de profondeur `LEQUAL` du marquage compare deux surfaces coplanaires → bande de 3 cm qui scintille autour des portes des zones 2 à 5. (L’arche de la zone 1 n’est pas concernée : ses piliers sont centrés sur le plan.) Correctifs possibles : reculer le cadre de quelques millimètres, ou réduire / supprimer la marge là où un cadre coplanaire existe, ou marquer avec une petite polarisation de profondeur.
- **Sols peints à `zOffset` qui traversent le plan d’un portail.** `floorPaint(...)` pose des sols avec `material.zOffset = -2` (décalage de profondeur vers la caméra) ; certains s’étendent de part et d’autre d’un plan de portail : « seuil pavé » centré sur P et Q (zone 4), « mesure extérieure » sur A2 et C (zone 2), « pavé » des tunnels sur P1 et P2 (zone 5), le carrelage du pavillon bord à bord avec E et W (zone 3). La partie située derrière le plan peut gagner le test de profondeur contre l’ouverture → scintillement le long de la ligne de sol. Correctif possible : couper ces sols au plan du portail, ou ne pas mettre de `zOffset` à moins de quelques centimètres d’un plan.
- **Variantes de shader non préchauffées.** Le plan de coupe des objets à cheval (`material.clipPlane`, § 7.5) change les defines (`CLIPPLANE`) : la première fois qu’un objet passe à cheval, son matériau et celui de son fantôme compilent une nouvelle variante ; pendant la compilation, Babylon saute le maillage (`isReady` faux) → l’objet ou son fantôme disparaît une ou plusieurs images à la **première** traversée. `warmUp()` (`src/portals/renderer.js`) ne prépare que l’état sans plan de coupe. Correctifs possibles : préchauffer les variantes avec plan de coupe au chargement, ou garder un plan de coupe toujours actif (rejeté au loin) pour ne jamais changer de define.
- **Voile recalculé à chaque image sans lissage.** `E_T` (distance du repli le plus proche, § 6.6) est recalculé à chaque image ; quand un portail profond apparaît ou disparaît (seuil d’un pixel du rectangle, budget de passes), le voile saute → pulsation de teinte dans les vues récursives (pavillon cyclique). Correctif possible : lisser `S_T`/`E_T` dans le temps, ou définir le voile par niveau de façon stable.
- **Garde ε et plan proche de la caméra** (§ 9.3) : vérifier qu’aucune image ne montre le mauvais côté quand la caméra franchit un plan, y compris à l’échelle 0,5 et en reculant.
- **Caisses à la traversée** (§ 7.4) :
  - au moment du franchissement (centre sur le plan), la moitié arrière de la caisse se retrouve **derrière le plan du portail de destination**, dans l’alcôve ou la niche fermée qui s’y trouve (0,6 à 1,2 m d’espace libre selon les zones) : Havok la dépénètre brutalement ; de même, avant le franchissement, la moitié avant heurte ce qui est derrière le plan **source** ;
  - contacts Havok du côté source conservés un pas après `setPhysicsBodyTransformation` ;
  - poussée par le contrôleur de personnage (logique `pushingBody`/`driveVelocity` dans `src/player/playerController.js`) saccadée, et suspension de la récupération de pénétration à la sortie ;
  - mesurer : trajectoire du visuel image par image (pas de saut ni d’arrêt), vitesse avant/après (même direction, × échelle).

## Priorité 2 — Lever les limites connues (`docs/PORTALS.md` § 14)

Dans cet ordre, en t’arrêtant pour me consulter si une limite demande un changement d’architecture important :

1. **Physique à travers les portails** (liée au défaut 3) : pendant qu’un corps est à cheval, ne plus le faire heurter la géométrie située derrière le plan source, et le faire interagir avec la géométrie de destination (par exemple un clone physique cinématique piloté à `W(pose)` qui renvoie ses contacts, ou un filtrage de collisions par portail). Les tests vérifient qu’une caisse traverse une porte avec alcôve sans à-coup ni rebond.
2. **Ombres à travers les portails** : l’ombre d’un objet posé près d’un portail doit se prolonger de l’autre côté (par exemple des projecteurs d’ombre fantômes, visibles seulement dans la carte d’ombre, avec une solution aux ombres fantômes parasites décrites au § 7.5 de la doc).
3. **Fantômes pour deux portails à la fois** (objet qui chevauche deux ouvertures voisines).
4. **Ciel voilable** : remplacer le ciel CSS par un dôme de ciel dans la scène (même dégradé), pour que le voile et le repli fonctionnent aussi en plein air.
5. **Liens avec rotation** : rendre l’éclairage cohérent au bord de l’ouverture ou documenter précisément la règle et l’imposer dans l’API (avertissement).
6. **API interne de Babylon** : remplacer l’appel à `_refreshManifoldAtPosition` par une sous-classe de `PhysicsCharacterController` (la méthode est `protected` dans les sources TypeScript de Babylon).
7. Facultatif, si tout le reste est fait : portails mobiles, WebGPU (NDC [0, 1], voir `docs/BABYLON_PATCHES.md` § 4), requêtes d’occlusion pour ne pas rendre les portails cachés.

## Contraintes

- Garder l’architecture et l’API publiques de `src/portals/` ; tout changement est reporté dans `docs/PORTALS.md` (sections concernées et § 14).
- Tous les tests existants restent verts ; chaque défaut corrigé a son test de non-régression ; chaque limite levée a son test.
- Performances : mesurer avec `await gowDev.benchmark()` (`docs/PORTALS.md` § 13.3) avant et après, en 1920 × 1080, avec et sans bridage CPU ×3 de Chromium ; ne pas dépasser les valeurs actuelles de plus de 10 % (pire cas actuel : pavillon cyclique, 18 passes, 5,8 ms en ×3).
- Ne jamais modifier `node_modules` ; pas de nouvelle dépendance sans me demander.

## Critères de réussite

- Plus aucun scintillement détecté par l’outil image par image sur les trajets scriptés de chaque zone (approche, traversée en marchant, en reculant, en tournant la caméra dans l’ouverture, à l’échelle 0,5), dans Chromium et Firefox.
- Une caisse poussée à travers chaque type de portail (arche, porte avec alcôve, portail d’échelle) a une trajectoire continue, sans saut ni rebond.
- Je valide à l’œil, en jouant, sur ma machine : donne-moi la liste des endroits à tester.

## Rapport final

Tâche par tâche : ce qui a été fait, ce qui a été délégué à Codex et ce que tu as corrigé toi-même, la cause réelle de chaque défaut (confirmée ou non parmi les pistes ci-dessus), les tests ajoutés, les mesures de performance avant/après, les limites qui restent.
