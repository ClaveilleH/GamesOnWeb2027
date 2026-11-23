# Maps glTF/GLB

Le terrain d'entraînement reste la map par défaut. Une map glTF/GLB ne se charge que par lien et remplace alors le terrain, les démos de portails et les décors `PROPS` :

- http://localhost:5173/?map=arcade : une clé de `MAPS` (`src/config.js`) ;
- http://localhost:5173/?map=/models/maps/ma-map.glb : n'importe quel fichier, pour essayer une map sans toucher au code.

Si la map est introuvable ou illisible, la console l'indique et le jeu reprend le terrain d'entraînement. Le chargeur est `src/world/map.js`.

## Conventions

Les réglages d'un objet sont ses propriétés personnalisées. Dans Blender : panneau Objet ▸ Custom Properties, puis cocher **Include ▸ Custom Properties** à l'export glTF. Elles arrivent dans les `extras` glTF.

| Propriété | Valeurs | Effet |
| --- | --- | --- |
| `collider` | `"mesh"` (défaut), `"box"`, `"none"` | Collision avec les triangles du maillage, avec sa boîte englobante, ou aucune. Un réglage posé sur un parent vaut pour ses enfants. |
| `spawn` | `true` | Départ du joueur (un *empty* suffit). Ses pieds sont à la position de l'objet, et il regarde dans la direction de l'axe −Y de l'objet Blender (+Z glTF), comme un personnage tourné vers la vue de face. Sans départ, le joueur tombe au-dessus de l'origine. |

Tous les maillages sont affichés, projettent et reçoivent les ombres. Ceux qui partagent un matériau sont fusionnés pour réduire le nombre d'appels de rendu.

## Mesures à respecter

Le joueur mesure 1,92 m pour un rayon de 0,32 m. Il franchit une marche de 0,23 m au plus et une pente de 45° au plus. Pour monter une marche, même de 2 cm, il lui faut au-dessus de la tête une hauteur libre au moins égale à celle de la marche. Prévoir des passages d'au moins **0,8 m** de large et **2,05 m** de haut, plus la hauteur de la marche s'il y en a une dessous. La porte de la salle d'arcade, 2,04 m au-dessus d'un seuil plat, est à la limite. L'unité est le mètre. Le soleil ombre une zone de 150 m centrée sur l'origine.

## Ajouter une map

1. Exporter la map en `.glb` (glTF binaire) dans `public/models/maps/`.
2. La vérifier : `python3 -I .claude/skills/glb/tree.py <map.glb>` (objets, positions, `extras`) et `npx gltf-transform validate <map.glb>`.
3. L'essayer avec `?map=/models/maps/<map>.glb`, puis l'ajouter à `MAPS` pour avoir une clé courte.

Pas de compression Draco, Meshopt ni KTX2 : Babylon irait chercher leurs décodeurs sur son CDN. Voir `.claude/skills/glb/SKILL.md` pour alléger un fichier sans perdre les noms ni les `extras`.

## Salle d'arcade (`?map=arcade`)

`public/models/maps/arcade.glb` est généré : ne pas le modifier à la main. Ses sources sont dans `maps/arcade/source/` (`salle.glb` et `facade.glb`, exports three.js). `npm run maps` le reconstruit avec `maps/arcade/build.mjs`, qui :

- colle la façade contre le mur +X de la salle, porte dans l'axe de l'ouverture de la salle, et la surélève de 2 cm pour que sa marche affleure le seuil ;
- ouvre les deux battants à 90° vers l'intérieur (les barres de poussée sont côté rue) et remonte l'imposte, trop basse pour le joueur ;
- ferme la salle, livrée ouverte comme une maquette, avec un mur sur le côté +Z et un toit ;
- ajoute la chaussée, le trottoir et le départ face à la porte ;
- relève de 3 mm les confettis du sol, qui affleuraient la dalle et scintillaient ;
- fusionne les matériaux identiques (93 → 19).

`tests/map.spec.js` vérifie le départ, l'entrée dans la salle et le retour au terrain d'entraînement si la map manque.
