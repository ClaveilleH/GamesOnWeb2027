# Tests de direction artistique

http://localhost:5173/?map=direction-artistique (ou **Ctrl + D** › Carte › Direction artistique) charge une série de salles d'arcade identiques. Seules les lumières, les matériaux et les effets changent d'une salle à l'autre. Chaque salle contient un bar avec ses étagères et ses tabourets, une table et quatre chaises, et cinq bornes aux faux jeux originaux dessinés au canevas.

**E** devant la porte du mur sud passe à la salle suivante. **Ctrl + D** › Téléportation mène directement à une salle. Un bandeau rappelle le nom de la salle à l'entrée.

## Fonctionnement

- `src/world/art/arcadeKit.js` construit la salle commune (géométrie et collisions) à partir d'un `look`, c'est-à-dire les matériaux fournis par la direction artistique.
- `src/world/art/themes/*.js` : une direction artistique par fichier. Chacune fournit `look(scene, name)` (matériaux), `decorate(ctx)` (lumières, néons, reflets, animations), `ambient` (ciel hémisphérique et soleil) et `glow` (intensité du halo des matériaux émissifs).
- `src/world/art/artMap.js` aligne les salles tous les 30 m sur l'axe X. Une seule salle est allumée à la fois : les autres sont éteintes, maillages et lumières compris. Leurs lumières ne comptent donc pas dans la limite par matériau, et seuls les miroirs de la salle active sont rendus. L'ambiance globale (lumière hémisphérique, soleil, glow) suit la salle où se trouve le joueur.
- Outils de `ctx` : `point`, `spot` (lumières), `shadows` (ombres portées d'une lumière de la salle), `box`, `plane`, `add` (décor sans collision), `mirror` et `mirrorFloor` (miroir plan en temps réel, avec flou), `probe` (sonde de réflexion rendue à l'entrée dans la salle, pour les surfaces brillantes), `onUpdate` (animation). Une direction artistique peut aussi régler le traitement d'image (`image` : tone mapping, exposition, contraste, vignette).
- Ajouter une salle : créer `themes/<nom>.js` sur le modèle des autres et l'ajouter à `THEMES` (`src/world/art/themes.js`).

## Salles

### 1 · Néon violet

Salle sombre éclairée en violet : trois plafonniers violets, une lumière magenta au bar et un reflet cyan sur les bornes. Les gorges du plafond, les plinthes, le cadre de porte, les liserés des bornes et l'enseigne « ARCADE » sont des néons émissifs que le glow fait baver. Le sol est un carrelage noir miroir, légèrement flouté, qui reflète la salle et le joueur. La laque des bornes, le chrome, le plateau du bar et la porte reflètent la salle par une sonde. Les plinthes respirent doucement.

### 2 · Bistrot chaud (réaliste)

Rendu physique (PBR) à la lumière de lampes à incandescence. On y trouve un parquet vernis aux reflets très flous (sol miroir flouté), un comptoir et une table en marbre, du laiton, des tabourets et des chaises en cuir sang-de-bœuf, des bornes en noyer et un lambris sous l'enduit. Un vrai miroir derrière les bouteilles reflète la salle et le joueur. Trois suspensions en laiton éclairent le bar. Celle de la table est un projecteur qui donne des ombres portées, joueur compris. Le tone mapping ACES, l'exposition relevée et une vignette donnent un rendu photographique. Les ampoules vacillent à peine.

### 3 · BD cel-shading

Style bande dessinée : aplats de couleurs franches (jaune, bleu, rouge, violet), trame de points au sol, sur les murs et au plafond, et contours noirs épais autour de tout le mobilier (`renderOutline`). Il n'y a aucune lumière ponctuelle. Une hémisphère forte sans reflet spéculaire donne à chaque face plane une teinte constante, comme un ombrage en trois tons. Des bulles « POW ! », « ZAP ! » et « BONUS » se gonflent en rythme sur les murs, et la saturation est relevée.

### 4 · Film noir

Noir et blanc (saturation −100), contraste et vignette très marqués. La lumière de la rue entre par une fenêtre du mur ouest où ruisselle la pluie (texture animée). Elle traverse des stores vénitiens dont les lamelles projettent des bandes d'ombre nettes sur le sol et la table (projecteur à ombres dures). Un ventilateur tourne au plafond, de la fumée monte au-dessus de la table (panneaux face caméra qui grandissent et s'estompent), et le damier mouillé reflète la scène.

### 5 · Synthwave

Esthétique rétro-futuriste des années 80. Les murs portent une fresque peinte : coucher de soleil rayé, montagnes, palmiers en silhouette et ciel étoilé. Au sol, une grille magenta lumineuse défile vers le fond comme une route et se reflète dans le sol miroir. Le chrome du bar et des tables reflète la salle par une sonde. Les tubes au plafond, les liserés des bornes et les bouteilles sont des néons magenta et cyan au glow fort. Le sol est exclu du glow (`noGlow`) pour que la grille reste nette.

Les textures peintes au canevas sont désormais répétées (`WRAP`) : `DynamicTexture` bornait leurs UV par défaut, ce qui écrasait toute texture répétée sur le pixel de bord.

### 6 à 10 · Échelle de réalisme

Cinq salles identiques (mêmes couleurs, mêmes meubles, mêmes lumières) où seule la technique de rendu change, pour comparer les niveaux de réalisme à décor égal :

1. **Aplats sans lumière** : couleurs émissives, aucun éclairage ni ombre.
2. **Éclairage diffus** : Lambert, lumière d'ambiance et trois points.
3. **Phong texturé et ombres** : textures peintes (carrelage, lambris, bois), reflets spéculaires, projecteur à ombres douces.
4. **PBR et reflets** : métal/rugosité, sol miroir flouté, sonde de réflexion, tone mapping ACES.
5. **PBR et post-traitement** : niveau 4 plus occlusion ambiante (SSAO2), bloom, MSAA, grain, aberration chromatique, netteté et vignette.

Le post-traitement passe par un nouveau crochet `theme.post(scene, camera, room)` : il est appelé à l'entrée de la salle et renvoie la fonction qui le libère à la sortie. Les matériaux PBR utilisent l'atténuation standard (`usePhysicalLightFalloff = false`) : les intensités des lumières restent celles des niveaux 2 et 3, et le joueur (matériau standard) n'est pas surexposé.

Le coût grimpe nettement : dans le navigateur logiciel des tests, le niveau 1 tourne environ 10 fois plus vite que le niveau 5.

### 11 · Cyberpunk sous la pluie

Béton sombre détrempé, brouillard bleu-vert (nouveau champ `theme.fog: { color, density }`, brouillard exponentiel restauré en quittant la carte), tone mapping ACES et légère teinte cyan. Des enseignes verticales en katakana et des tags lumineux couvrent les murs, des tuyaux courent au plafond. La pluie tombe par une trouée du plafond dans une flaque, sous un projecteur vert froid à ombres. Une enseigne grésille. Le sol miroir presque net reflète tous les néons.

### 12 · Pixel 8 bits

Tout le style vient d'un post-traitement maison (`artPixel`, branché par `theme.post`). L'image est échantillonnée en cellules d'environ 180 lignes de haut, chaque cellule est ramenée à la couleur la plus proche d'une palette de 16 couleurs, avec un tramage ordonné Bayer 4×4 pour les dégradés. Les textures sont du pixel art minuscule en échantillonnage au plus proche (briques, damier, pièce), l'éclairage est simple, sans reflet. Des pièces tournent au-dessus du bar et de la table, leur flottement est quantifié par paliers ; des nuages pixelisés décorent les murs.

### 13 · Memphis pastel, plein jour

Le contre-pied des salles de nuit : style Memphis des années 80, couleurs pastel, motifs géométriques au mur (pois, gribouillis en zigzag, triangles cernés de noir, soubassement menthe), sol en terrazzo, comptoir et flancs de bornes à rayures noires et blanches. Le soleil entre par deux grandes baies côté ouest (ciel peint, montants noirs) : c'est un projecteur placé loin dehors qui traverse les murs, puisque ceux-ci ne portent pas d'ombre, et projette les ombres douces du mobilier. Une sphère, un tore, un cône et un cylindre suspendus tournent doucement. Tone mapping neutre, aucun glow.

### 14 · Plan d'architecte

Toute la salle est un tirage de plan : surfaces unies bleues sans éclairage, arêtes blanches du mobilier tracées par l'`EdgesRenderer` (seuil 0,95). Le sol porte une grille millimétrée, les cotes de la salle (16 000 × 12 000), l'empreinte de la table en pointillé et des annotations ; les murs sont des élévations avec cotes et cartouche. Une ligne de balayage translucide traverse la salle d'ouest en est. Seul le joueur reçoit une lumière hémisphérique bleu clair.

### 15 · Lumière noire

Salle presque noire, éclairée par trois tubes UV violets et des lumières faibles. À l'inverse de la salle 1, ce sont les surfaces qui brillent : moquette d'arcade à motifs cosmiques (planètes à anneau, étoiles, éclairs, gribouillis), murs couverts d'éclaboussures et de coulures de peinture fluo, liserés, bouteilles, sièges et plateaux fluorescents, glow fort. La fluorescence respire lentement (on module `emissiveTexture.level`, car `emissiveColor` s'ajoute à la texture au lieu de la teinter) et les tubes vacillent légèrement.

### 16 · Futuriste blanc irisé

Galerie immaculée façon showroom, en PBR poussé : laque vernie (`clearCoat`) sur les bornes, le comptoir et la porte ; irisation en film mince (`iridescence`) sur les bornes aux teintes nacrées, le plateau et la sculpture suspendue (tore et orbe qui tournent au-dessus de la table) ; tissu velouté (`sheen`) sur les sièges ; chrome ; sol blanc laqué en miroir flouté. Des gorges lumineuses courent au plafond et trois projecteurs larges posent des lavis rose, cyan et violet sur les murs, pour donner des couleurs aux reflets.

À retenir : un matériau accepte au plus 8 lumières (`MAX_LIGHTS`), hémisphère comprise. Au-delà, les dernières lumières créées sont ignorées sans message d'erreur.

### 17 · Abandonnée, à la lampe torche

L'arcade fermée depuis des années, en ambiance d'horreur. Presque aucune lumière : une lampe torche (projecteur à ombres) suit la caméra à chaque image, tenue au-dessus de l'épaule et agitée d'un léger tremblement. S'y ajoutent un clair de lune froid venu de l'ouest et un néon de secours vert qui grésille au-dessus de la porte. Brouillard noir, image désaturée. Moquette tachée, papier peint à pois décollé par lés avec coulures d'humidité, toiles d'araignée dans les coins, poussières qui flottent dans toute la salle. Une chaise sur deux est renversée, une borne est couchée, les écrans sont éteints (simple reflet sombre).
