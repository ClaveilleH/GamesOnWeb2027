# Modèle 3D du personnage

Par défaut, le joueur est le squelette procédural de `src/player/skeletonVisual.js`. On peut le remplacer par un modèle glTF/GLB sans toucher au code.

## Ajouter un modèle

1. Déposez le fichier dans `public/models/`, par exemple `public/models/heros.glb`. Vite sert ce dossier tel quel et le copie dans `dist/` au build.
2. Pour essayer le modèle sans rien modifier, ouvrez http://localhost:5173/?model=/models/heros.glb.
3. Pour l'adopter, indiquez son chemin dans `src/config.js` : `CHARACTER.model = "/models/heros.glb"`.

Si le fichier est absent ou illisible, le jeu affiche un avertissement dans la console et reprend le squelette.

Utilisez uniquement des modèles originaux ou sous licence compatible avec le projet (CC0, CC-BY avec attribution, Mixamo…). `main` est publiée en production.

## Ce que fait le chargeur (`src/player/characterModel.js`)

- **Chargement.** `@babylonjs/loaders` n'est importé que si un modèle est demandé, ce qui garde le bundle léger.
- **Calage automatique.** Le modèle est mis à l'échelle de `PLAYER.height` (1,92 m), pieds à y = 0, centré sur l'axe vertical. Si le personnage ne regarde pas vers +Z, réglez `CHARACTER.yawOffset` en radians (par exemple `Math.PI`).
- **Animations.** Chaque démarche du joueur est associée à une animation du fichier :

  | Démarche | Mots-clés cherchés dans le nom |
  | --- | --- |
  | `idle` | idle, stand, breath, repos |
  | `walk` | walk, marche |
  | `run` | run, sprint, jog, course |
  | `jump` | jump, saut |
  | `fall` | fall, chute, air |

  Pour imposer un nom exact, utilisez `CHARACTER.animations` (`{ walk: "Walking_A", … }`). Une démarche sans animation reprend la plus proche : la course reprend la marche, la chute reprend le saut. Le passage d'une animation à l'autre se fait en fondu (`CHARACTER.blendRate`). La marche et la course sont accélérées ou ralenties selon la vitesse réelle, par rapport à `walkAnimationSpeed` et `runAnimationSpeed`.
- **Intégration au jeu.** Le chargeur expose la même interface que le squelette (`root`, `update`, `materials`, `setFade`, `dispose`). Le fondu de proximité de la caméra, les ombres et les fantômes des portails fonctionnent donc sans changement.

## Préparer un modèle

- Il doit être en **glTF 2.0 binaire (`.glb`)**, avec textures et animations intégrées. Depuis Blender : Fichier → Exporter → glTF 2.0, format « glTF Binary », en cochant « Animation ».
- Il doit être **rigué**, c'est-à-dire avoir un squelette et une peau. Un modèle statique (par exemple un OBJ converti) s'affiche, mais reste figé.
- Chaque animation doit être une action séparée et nommée (Idle, Walk, Run, Jump…), et jouer **sur place**, sans déplacement de la racine. C'est le contrôleur physique qui déplace le personnage.

## Débogage

Avec `?dev` dans l'URL, `gowDev.character()` renvoie l'association démarche → animation retenue et le poids actuel de chaque animation.
