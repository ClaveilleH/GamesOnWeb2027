# Tests de direction artistique

http://localhost:5173/?map=direction-artistique (ou **Ctrl + D** › Carte › Direction artistique) charge une série de salles d'arcade identiques. Seules les lumières, les matériaux et les effets changent d'une salle à l'autre. Chaque salle contient un bar avec ses étagères et ses tabourets, une table et quatre chaises, et cinq bornes aux faux jeux originaux dessinés au canevas.

**E** devant la porte du mur sud passe à la salle suivante. **Ctrl + D** › Téléportation mène directement à une salle. Un bandeau rappelle le nom de la salle à l'entrée.

## Fonctionnement

- `src/world/art/arcadeKit.js` construit la salle commune (géométrie et collisions) à partir d'un `look`, c'est-à-dire les matériaux fournis par la direction artistique.
- `src/world/art/themes/*.js` : une direction artistique par fichier. Chacune fournit `look(scene, name)` (matériaux), `decorate(ctx)` (lumières, néons, reflets, animations), `ambient` (ciel hémisphérique et soleil) et `glow` (intensité du halo des matériaux émissifs).
- `src/world/art/artMap.js` aligne les salles tous les 30 m sur l'axe X. Une seule salle est allumée à la fois : les autres sont éteintes, maillages et lumières compris. Leurs lumières ne comptent donc pas dans la limite par matériau, et seuls les miroirs de la salle active sont rendus. L'ambiance globale (lumière hémisphérique, soleil, glow) suit la salle où se trouve le joueur.
- Outils de `ctx` : `point`, `spot` (lumières), `box`, `plane` (décor sans collision), `mirrorFloor` (sol miroir en temps réel, avec flou), `probe` (sonde de réflexion rendue à l'entrée dans la salle, pour les surfaces brillantes), `onUpdate` (animation).
- Ajouter une salle : créer `themes/<nom>.js` sur le modèle des autres et l'ajouter à `THEMES` (`src/world/art/themes.js`).

## Salles

### 1 · Néon violet

Salle sombre éclairée en violet : trois plafonniers violets, une lumière magenta au bar et un reflet cyan sur les bornes. Les gorges du plafond, les plinthes, le cadre de porte, les liserés des bornes et l'enseigne « ARCADE » sont des néons émissifs que le glow fait baver. Le sol est un carrelage noir miroir, légèrement flouté, qui reflète la salle et le joueur. La laque des bornes, le chrome, le plateau du bar et la porte reflètent la salle par une sonde. Les plinthes respirent doucement.
