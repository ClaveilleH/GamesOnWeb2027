---
name: glb
description: Inspecter, valider, prévisualiser, optimiser ou préparer un modèle .glb/.gltf (map, décor, personnage) pour le jeu Babylon.js de ce dépôt. À charger avant de lire, modifier, ajouter ou déboguer un fichier .glb/.gltf ou leur chargement.
---

# Travailler sur un .glb dans ce dépôt

Les modèles sont dans `public/models/` (servis à `/models/…`). Chargement : `src/core/models.js`
(`loadFittedModel`), décors : `src/world/props.js` + `PROPS` dans `src/config.js`, personnages :
`src/player/characterModel.js` + `CHARACTERS`.

## Comprendre un fichier (toujours commencer par là)

```sh
python3 -I .claude/skills/glb/tree.py <fichier.glb> [--depth N]   # arbre, positions et AABB monde (m), extras
npx --no gltf-transform inspect <fichier.glb>                    # maillages, matériaux, textures, poids
npx --no gltf-transform validate <fichier.glb>                   # validateur Khronos
blender -b -P .claude/skills/glb/render.py -- <fichier.glb> <sortie> [px]   # écrit <sortie>-iso.png et -top.png
```

- Écrire les aperçus dans le scratchpad de session, puis les lire avec l'outil Read.
- Vue `-top` : orthographique, droite = +X glTF, haut de l'image = −Z glTF. Rendu Workbench : vérifie la forme
  et le placement, pas l'éclairage du jeu.
- `NO_COLOR=1` et `--format csv|md` rendent la sortie de gltf-transform plus lisible.
- Le GLB de Shrek remonte des erreurs connues de l'export Sketchfab (`ANIMATION_SAMPLER_ACCESSOR_WITH_BYTESTRIDE`)
  que Babylon tolère.

## Repères

- Blender (Z vers le haut) → glTF (Y vers le haut) : `(x, y, z)` Blender devient `(x, z, −y)`. Unité : le mètre.
- Les propriétés personnalisées d'un objet Blender sortent dans `extras` du nœud si l'export coche
  « Include › Custom Properties » (`export_extras=True` en Python).
- Joueur : 1,92 m de haut, rayon 0,32 m, marche franchissable de 0,23 m max, pente max 45° (`PLAYER`).

## Optimiser sans casser le jeu

- **Pas de Draco, Meshopt ni KTX2** tant que le jeu n'embarque pas leurs décodeurs. Sinon Babylon les
  télécharge sur `cdn.babylonjs.com`, alors que la production sert tout depuis le VPS.
- Par défaut, `gltf-transform optimize` compresse en Meshopt, fusionne les nœuds, simplifie la géométrie
  et supprime les nœuds vides : les noms, les `extras` et les marqueurs (points d'apparition…) d'une map
  risquent de disparaître. Pour conserver toute la hiérarchie d'une map, utiliser :
  `npx --no gltf-transform optimize in.glb out.glb --compress false --flatten false --join false --instance false --palette false --prune false --simplify false`
  ou des commandes ciblées : `dedup`, `prune --keep-leaves true`, `weld`, `resize --width 1024 --height 1024`,
  `webp` (WebP est pris en charge par Babylon sans décodeur externe).
- Une map statique peut fusionner ses maillages au build par matériau et par statut de collision.
  Dans `maps/arcade/build.mjs`, les décors sont regroupés après `flatten` sous un parent `collider: "none"`
  pour que `join` fusionne uniquement des maillages de même `collider`. Le départ vide est ajouté après
  la fusion. Les positions et normales quantifiées (`KHR_mesh_quantization`) sont lues directement par Babylon.
- Vérifier avec `tree.py` les emprises monde, le marqueur `spawn` et le `collider` hérité de chaque lot,
  puis lancer `validate` et vérifier le départ et son orientation dans le jeu.

## Maps

Conventions (`collider`, `spawn`), mesures du joueur et ajout d'une map : `docs/MAPS.md`. Chargeur :
`src/world/map.js`, liste `MAPS` dans `src/config.js`, chargement par `?map=<clé|url>` uniquement.
`public/models/maps/arcade.glb` est généré (`npm run maps`, script `maps/arcade/build.mjs`) : modifier le script,
pas le fichier. Les exports three.js livrent des boîtes de 36 sommets non indexées, qu'on peut découper boîte
par boîte (voir `openDoors` dans ce script).

- Dans Babylon, la racine glTF est en miroir : x glTF = −x Babylon (y et z inchangés).
- Si le joueur bloque alors que la géométrie est libre (rayons Blender), chercher un rebord au sol de quelques
  centimètres : le contrôleur ne monte une marche que s'il a de la hauteur libre au-dessus de la tête.

## Vérifier dans le jeu

`npm run dev`, puis le MCP `chromium` sur `http://localhost:5173/?dev` (Jouer, capture d'écran, console).
`?model=/models/x.glb` essaie un personnage sans toucher au code.
`?map=arcade` ou `?map=/models/maps/x.glb` charge une map. Pour un trajet reproductible : `gowDev.manualClock()`,
`gowDev.setControls({ forward: 1 })`, puis `clock.step(1000 / 60)` en boucle et `gowDev.state().player` (voir
`tests/map.spec.js`). Pour lancer des rayons Havok dans la page, récupérer la scène par le module Vite déjà
chargé : l'URL `…/deps/@babylonjs_core_Engines_engine.js?v=…` de `performance.getEntriesByType("resource")`,
puis `Engine.Instances[0].scenes[0].getPhysicsEngine().raycast(from, to, { collideWith: 1 })`.

## Blender

- `blender` (5.2 LTS, dans `~/.local/bin`) sert sans écran aux conversions, aux scripts `bpy` et aux aperçus.
- MCP `blender` : il ne répond que si Blender est ouvert avec l'add-on « MCP for Blender » (port 9876). Il sert à
  construire ou modifier une scène que l'utilisateur regarde. Enregistrer avant d'exécuter du code, puis
  exporter en `.glb` dans `public/models/`.
