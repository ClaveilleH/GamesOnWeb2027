# Portail rétrécissant

Expérience de géométrie non euclidienne de la branche `experiment/shrinking-portal`.

## Ce qu'on voit

À droite du départ (x = 14, z de −17 à −7), un couloir fermé s'ouvre par une porte sur son mur ouest. Il contient deux éléments :

- **Au fond**, une petite porte, deux fois plus petite que le couloir, plaquée sur le mur.
- **À l'autre bout**, un portail de la taille du couloir. Il montre le même couloir **agrandi deux fois**, avec son propre portail, qui en montre un autre encore deux fois plus grand, et ainsi de suite. On y voit aussi une copie géante du joueur.

Quand on franchit le portail, on se retrouve devant la petite porte, à taille normale : c'est le monde qui a grandi, donc on a rétréci. Le portail est de nouveau devant soi et on peut recommencer sans fin.

## Principe

Tout tient dans une homothétie `T` de rapport 2 (`SHRINK.ratio`), centrée au sol sur l'axe du couloir. `T` envoie le plan de la petite porte sur celui du portail, si bien que la petite porte agrandie coïncide exactement avec le portail.

- **Rendu.** Une homothétie conserve les angles. L'image du couloir agrandi vue depuis la caméra `C` est donc identique à l'image du couloir réel vue depuis `T⁻¹(C)`. La vue de niveau n est rendue depuis `T⁻ⁿ(C)`, avec un plan de coupe qui ne garde que ce qui se trouve devant la petite porte. Elle est ensuite collée en espace écran sur le portail. `SHRINK.levels` niveaux (5 par défaut) sont rendus, les plus profonds en premier. Chaque niveau a son propre volume de portail, sur un calque (`layerMask`) que seule la caméra du niveau précédent voit. Au-delà du dernier niveau, le portail a la taille de quelques pixels et prend une teinte unie. Coût mesuré : environ +1,8 ms par image à 1024 × 768, seulement quand le portail est dans le champ.
- **Joueur.** Quand les pieds franchissent le plan du portail dans son ouverture, `playerController` applique `T⁻¹` aux pieds et divise la vitesse par 2 (`state.crossings` est incrémenté).
- **Caméra.** Elle ne passe pas en même temps que le joueur. Tant qu'elle est en retard (`cameraLag` dans `main.js`), elle vise `T^lag(pieds)`, l'image agrandie du joueur, vue à travers le portail, et glisse jusqu'au plan. Une fois le plan franchi, `T⁻¹` lui est appliquée, distance comprise. L'image est identique avant et après : le passage ne produit aucun saut visuel. Sans retard, la caméra ne peut pas franchir le portail à reculons.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `src/world/shrinkingPortal.js` | Réglages `SHRINK`, homothétie `scaleAround`, géométrie du couloir, rendu récursif `createPortalViews` |
| `src/player/playerController.js` | Paramètre `portal` : détection du franchissement et téléportation |
| `src/player/thirdPersonCamera.js` | `follow(…, limitRay)` pour borner le rayon anti-mur, `transform()` pour le passage, `camera` exposée |
| `src/main.js` | Branchement, retard de caméra, `window.__game` en développement |

## Limites connues

- Pendant la fraction de seconde où le corps est à cheval sur le plan, la partie déjà passée disparaît : il n'y a pas de fantôme du corps de l'autre côté.
- La petite porte n'est pas un portail. On ne peut pas revenir en arrière, et regarder à travers elle ne montre pas le couloir réduit.
- Juste après le passage, le joueur est collé au mur du fond et la caméra se retrouve dans sa tête (fondu de proximité) jusqu'à ce qu'il avance.

## Tester à la main

Avec `npm run dev`, `window.__game` donne accès à `player`, `camera`, `portalViews` et `cameraLag`. Le HUD (F3) expose le nombre de passages dans `#player-state[data-crossings]`.
