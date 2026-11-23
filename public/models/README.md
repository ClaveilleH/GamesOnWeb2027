# Modèles 3D du jeu

Les fichiers déposés ici sont servis tels quels à la racine du site (convention Vite
pour le dossier `public/`). Un fichier `public/models/borne-arcade.glb` est donc
accessible dans le jeu à l'URL **`/models/borne-arcade.glb`**.

## Format

Le moteur charge du **glTF 2.0 / `.glb`** (voir `src/player/characterModel.js` et
`src/world/props.js`). Un `.obj` n'est pas chargé directement : convertis-le d'abord
en `.glb` (un seul fichier, matériaux et textures inclus).

Depuis Blender : `Fichier ▸ Importer ▸ Wavefront (.obj)`, puis
`Fichier ▸ Exporter ▸ glTF 2.0 (.glb)` en cochant **Format : glTF Binary (.glb)**.

## Ajouter un décor

1. Dépose le `.glb` dans ce dossier.
2. Déclare-le dans `PROPS`, au bas de `src/config.js` (position, orientation,
   hauteur). Un fichier absent est simplement ignoré : le jeu tourne quand même.

> Ce dossier est versionné : en committant le `.glb`, la CI et tes coéquipiers
> ont le modèle. Pense au poids du fichier (allège le maillage si besoin).

## Maps

Les maps sont dans `maps/` et se chargent par lien (`?map=…`) : voir `docs/MAPS.md`.
`maps/arcade.glb` est généré par `npm run maps` à partir de `maps/arcade/source/` (à la racine du dépôt).
