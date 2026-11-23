# Maps glTF/GLB

Le terrain d'entraînement reste la map par défaut. Une map glTF/GLB ne se charge que par lien et remplace alors le terrain, les démos de portails et les décors `PROPS` :

- http://localhost:5173/?map=arcade : une clé de `MAPS` (`src/config.js`) ;
- http://localhost:5173/?map=/models/maps/ma-map.glb : n'importe quel fichier, pour essayer une map sans toucher au code.

Si la map est introuvable ou illisible, la console l'indique et le jeu reprend le terrain d'entraînement. Le chargeur est `src/world/map.js`.

## Conventions

**Retouches** — La géométrie se crée et se corrige dans Blender, sur les fichiers sources. Les marqueurs de map se placent aussi dans ces sources. Le build se limite à assembler et à optimiser les sources.

Les réglages d'un objet sont ses propriétés personnalisées. Dans Blender : panneau Objet ▸ Custom Properties, puis cocher **Include ▸ Custom Properties** à l'export glTF. Elles arrivent dans les `extras` glTF.

| Propriété | Valeurs | Effet |
| --- | --- | --- |
| `collider` | `"mesh"` (défaut), `"none"` | Collision avec les triangles du maillage ou aucune. Un réglage posé sur un parent vaut pour ses enfants. |
| `spawn` | `true` | Départ du joueur (un *empty* suffit). Ses pieds sont à la position de l'objet, et il regarde dans la direction de l'axe −Y de l'objet Blender (+Z glTF), comme un personnage tourné vers la vue de face. Sans départ, le joueur tombe sur l'origine depuis le haut de la map. |

Tous les maillages sont affichés, projettent et reçoivent les ombres. Ceux qui partagent un matériau sont fusionnés pour réduire le nombre d'appels de rendu. La map est donc statique : ses animations glTF sont ignorées. Les maillages sans indices (exports three.js) et les instances GPU (`EXT_mesh_gpu_instancing`) sont pris en charge, collisions comprises.

## Mesures à respecter

Le joueur mesure 1,92 m pour un rayon de 0,32 m. Il franchit une marche de 0,23 m au plus et une pente de 45° au plus. Pour monter une marche, même de 2 cm, il lui faut au-dessus de la tête une hauteur libre au moins égale à celle de la marche. Prévoir des passages d'au moins **0,8 m** de large et **2,05 m** de haut, plus la hauteur de la marche s'il y en a une dessous. La porte de la salle d'arcade, 2,04 m au-dessus d'un seuil plat, est à la limite. L'unité est le mètre. Le soleil ombre une zone de 150 m centrée sur l'origine. Le joueur réapparaît au départ s'il tombe à plus de 7 m sous le point le plus bas de la map.

## Ajouter une map

1. Exporter la map en `.glb` (glTF binaire) dans `public/models/maps/`.
2. La vérifier : `python3 -I .claude/skills/glb/tree.py <map.glb>` (objets, positions, `extras`) et `npx gltf-transform validate <map.glb>`.
3. L'essayer avec `?map=/models/maps/<map>.glb`, puis l'ajouter à `MAPS` pour avoir une clé courte.

Pas de compression Draco, Meshopt ni KTX2 : Babylon irait chercher leurs décodeurs sur son CDN. On peut fusionner les maillages statiques par matériau au build si chaque lot conserve le `collider` effectif de ses triangles et si le nœud `spawn` garde ses `extras`, sa position et son orientation monde. Voir `.claude/skills/glb/SKILL.md` pour vérifier le résultat.

## Salle d'arcade (`?map=arcade`)

Pour modifier l'arcade, éditer ses sources dans `maps/arcade/source/`, puis régénérer `public/models/maps/arcade.glb` avec `npm run maps`. La salle et la façade proviennent d'exports three.js.

- `salle.glb` contient la salle fermée par le mur +Z et le toit. Les confettis du sol sont relevés de 3 mm pour éviter le scintillement.
- `facade.glb` contient les deux battants ouverts à 90° vers l'intérieur, barres de poussée côté rue. L'imposte est remontée pour laisser passer le joueur.
- `abords.glb` contient la chaussée, le trottoir et le nœud vide `spawn` dans le repère de la salle. Le départ est sur la chaussée, face à la porte.

`maps/arcade/build.mjs` place la façade contre le mur +X de la salle, dans l'axe de l'ouverture. Il la surélève de 2 cm pour que la marche affleure le seuil. Il fusionne les trois documents, indexe la géométrie, déduplique les ressources et aplatit la hiérarchie.

Le script regroupe ensuite les accents de la salle et de la façade (confettis, néons, boutons et ampoules) sous le parent `decors`. Son `collider: "none"` les exclut des triangles envoyés à Havok. La fusion par matériau se fait entre nœuds frères de même statut de collision. Elle donne 19 lots, dont 10 de décor.

Les positions sont quantifiées sur 14 bits et les normales sur 8 bits avec `KHR_mesh_quantization`, que Babylon lit sans décodeur externe. Les optimisations suppriment les nœuds vides. Le script conserve donc le nom, la matrice monde et les `extras` du départ avant l'aplatissement, puis le rétablit à la racine de la scène après la fusion.

`tests/map.spec.js` vérifie le départ et le retour au terrain d'entraînement si la map manque.
