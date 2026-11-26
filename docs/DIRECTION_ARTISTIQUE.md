# Tests de direction artistique

http://localhost:5173/?map=direction-artistique (ou **Ctrl + D** › Carte › Direction artistique) charge une série de salles d'arcade identiques. Seules les lumières, les matériaux et les effets changent d'une salle à l'autre. Chaque salle contient un bar avec ses étagères et ses tabourets, une table et quatre chaises, et cinq bornes aux faux jeux originaux dessinés au canevas.

**E** devant la porte du mur sud passe à la salle suivante. **Ctrl + D** › Téléportation mène directement à une salle, et `&salle=N` dans l'adresse (par exemple `?map=direction-artistique&salle=33`) fait démarrer dans la salle N. Un bandeau rappelle le nom de la salle à l'entrée.

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

### 11 · Réalisme 6 · réflexions en espace écran

Sommet de l'échelle de réalisme des salles 6 à 10 : même décor et mêmes lumières (`makeLook` et `lights` sont exportés par `realism.js`). Les reflets ne viennent plus d'un miroir plan : des réflexions en espace écran (`SSRRenderingPipeline`, via le prepass) font refléter chaque surface selon sa rugosité, avec atténuation de Fresnel et flou selon la rugosité. La sonde reste comme environnement pour ce qui sort de l'écran. S'y ajoutent SSAO2, un bloom doux, le MSAA ×4 et une vignette.

À retenir : sur un diélectrique (réflectance d'environ 4 %), la SSR est invisible. Le carrelage reçoit donc une part métallique (0,4) et une faible rugosité (0,1) pour que son reflet se lise. Sous rendu logiciel, cette salle est la plus lente de la carte.

### 12 · Cyberpunk sous la pluie

Béton sombre détrempé, brouillard bleu-vert (nouveau champ `theme.fog: { color, density }`, brouillard exponentiel restauré en quittant la carte), tone mapping ACES et légère teinte cyan. Des enseignes verticales en katakana et des tags lumineux couvrent les murs, des tuyaux courent au plafond. La pluie tombe par une trouée du plafond dans une flaque, sous un projecteur vert froid à ombres. Une enseigne grésille. Le sol miroir presque net reflète tous les néons.

### 13 · Pixel 8 bits

Tout le style vient d'un post-traitement maison (`artPixel`, branché par `theme.post`). L'image est échantillonnée en cellules d'environ 180 lignes de haut, chaque cellule est ramenée à la couleur la plus proche d'une palette de 16 couleurs, avec un tramage ordonné Bayer 4×4 pour les dégradés. Les textures sont du pixel art minuscule en échantillonnage au plus proche (briques, damier, pièce), l'éclairage est simple, sans reflet. Des pièces tournent au-dessus du bar et de la table, leur flottement est quantifié par paliers ; des nuages pixelisés décorent les murs.

### 14 · Memphis pastel, plein jour

Le contre-pied des salles de nuit : style Memphis des années 80, couleurs pastel, motifs géométriques au mur (pois, gribouillis en zigzag, triangles cernés de noir, soubassement menthe), sol en terrazzo, comptoir et flancs de bornes à rayures noires et blanches. Le soleil entre par deux grandes baies côté ouest (ciel peint, montants noirs) : c'est un projecteur placé loin dehors qui traverse les murs, puisque ceux-ci ne portent pas d'ombre, et projette les ombres douces du mobilier. Une sphère, un tore, un cône et un cylindre suspendus tournent doucement. Tone mapping neutre, aucun glow.

### 15 · Plan d'architecte

Toute la salle est un tirage de plan : surfaces unies bleues sans éclairage, arêtes blanches du mobilier tracées par l'`EdgesRenderer` (seuil 0,95). Le sol porte une grille millimétrée, les cotes de la salle (16 000 × 12 000), l'empreinte de la table en pointillé et des annotations ; les murs sont des élévations avec cotes et cartouche. Une ligne de balayage translucide traverse la salle d'ouest en est. Seul le joueur reçoit une lumière hémisphérique bleu clair.

### 16 · Lumière noire

Salle presque noire, éclairée par trois tubes UV violets et des lumières faibles. À l'inverse de la salle 1, ce sont les surfaces qui brillent : moquette d'arcade à motifs cosmiques (planètes à anneau, étoiles, éclairs, gribouillis), murs couverts d'éclaboussures et de coulures de peinture fluo, liserés, bouteilles, sièges et plateaux fluorescents, glow fort. La fluorescence respire lentement (on module `emissiveTexture.level`, car `emissiveColor` s'ajoute à la texture au lieu de la teinter) et les tubes vacillent légèrement.

### 17 · Futuriste blanc irisé

Galerie immaculée façon showroom, en PBR poussé : laque vernie (`clearCoat`) sur les bornes, le comptoir et la porte ; irisation en film mince (`iridescence`) sur les bornes aux teintes nacrées, le plateau et la sculpture suspendue (tore et orbe qui tournent au-dessus de la table) ; tissu velouté (`sheen`) sur les sièges ; chrome ; sol blanc laqué en miroir flouté. Des gorges lumineuses courent au plafond et trois projecteurs larges posent des lavis rose, cyan et violet sur les murs, pour donner des couleurs aux reflets.

À retenir : un matériau accepte au plus 8 lumières (`MAX_LIGHTS`), hémisphère comprise. Au-delà, les dernières lumières créées sont ignorées sans message d'erreur.

### 18 · Abandonnée, à la lampe torche

L'arcade fermée depuis des années, en ambiance d'horreur. Presque aucune lumière : une lampe torche (projecteur à ombres) suit la caméra à chaque image, tenue au-dessus de l'épaule et agitée d'un léger tremblement. S'y ajoutent un clair de lune froid venu de l'ouest et un néon de secours vert qui grésille au-dessus de la porte. Brouillard noir, image désaturée. Moquette tachée, papier peint à pois décollé par lés avec coulures d'humidité, toiles d'araignée dans les coins, poussières qui flottent dans toute la salle. Une chaise sur deux est renversée, une borne est couchée, les écrans sont éteints (simple reflet sombre).

### 19 · Sous l'eau

L'arcade engloutie : brouillard bleu dense, faïence verdie et moussue, sable ridé au sol, laiton oxydé, corail sur les sièges. Les caustiques sont trois calques additifs (`ALPHA_ADD`, sans écriture de profondeur) peints au canevas en boucles lumineuses lissées : deux au sol qui défilent en sens contraires, un au plafond pour les reflets de la surface. Une tentative avec la texture projetée d'un projecteur (`SpotLight.projectionTexture`) n'a produit qu'un éclairage uniforme et a été abandonnée. Des bulles montent en zigzag depuis cinq points, des algues ondulent le long des murs.

### 20 · Caméscope VHS 1994

Arcade de galerie marchande des années 90 (moquette à confettis, frise en zigzag turquoise et rose, plastiques brillants, caissons de tubes fluorescents), filmée comme une cassette. Post-traitement maison `artVhs` : tube cathodique bombé aux coins noirs, couches rouge et bleue décalées, chrominance floutée horizontalement (les couleurs bavent), flottement ligne par ligne, lignes de balayage, bruit, bande de tracking qui remonte l'image avec de la neige, voile chaud et vignette. Une incrustation HTML (`.vhs-osd`) affiche « ▶ PLAY », « SP » et l'heure réelle datée de 1994 ; elle est retirée en quittant la salle.

### 21 · Aquarelle

La scène 3D devient une peinture grâce au post-traitement maison `artWatercolor` : filtre de Kuwahara à quatre quadrants (aplats lissés qui gardent les bords), légère dérive de l'image comme un pinceau imprécis, couleurs éclaircies et un peu désaturées, contours assombris là où la luminance varie (accumulation de pigment), taches de lavis inégal, grain de papier, et bords de l'image qui se fondent dans le papier crème. Les matériaux sont de simples aplats de couleurs douces sous une lumière de jour latérale.

### 22 · Art déco, casino des années 20

PBR orienté métaux : or brossé sur les plinthes et les liserés des bornes, laiton poli, laque noire vernie, loupe de noyer, velours bordeaux à reflet (`sheen`), tapis de jeu vert sur la table. Le sol en marbre noir veiné d'or se reflète en miroir presque net, et l'or comme le laiton reflètent la salle par une sonde. Les murs portent des panneaux vert bouteille encadrés d'or, avec éventails en soleil levant et chevrons. Un lustre de couronnes en laiton et de pampilles scintillantes pend au-dessus de la table, et des appliques chaudes rasent les panneaux. Tone mapping ACES et glow léger.

### 23 · Low poly

Rendu à facettes sans aucune texture. Le sol est remplacé par un terrain légèrement bosselé (grille 22 × 22, relief de quelques centimètres, la physique reste plane) en ombrage plat. Des arbres (tronc hexagonal, feuillage en icosphères déformées), des rochers et des cristaux qui tournent sur la table sont déformés au hasard puis convertis en faces plates (`convertToFlatShadedMesh`). Les couleurs viennent d'aplats sous un éclairage en dégradé (ciel pêche, sol bleu-vert), et un soleil rasant d'ouest sépare nettement les faces et pose des ombres franches.

### 24 · Encre de Chine

La salle dessinée au pinceau sur papier de riz, par le post-traitement maison `artInk`. Les contours sont détectés par un filtre de Sobel sur la luminance, au pas d'un pixel et demi pour un trait épais. Le trait tremble (échantillonnage décalé par du bruit) et s'interrompt par endroits, comme sous la pression du pinceau. Les tons sont réduits à trois lavis d'encre, posés sur un papier crème à fibres et grain. Les matériaux sont de simples gris choisis pour tomber chacun dans un lavis différent. Seul le rouge vermillon (porte, sièges, soleil peint au mur, certaines bouteilles, enseigne 出口) est conservé en couleur.

### 25 · Vaisseau spatial

La salle de détente d'un vaisseau. Murs en panneaux de coque rivetés avec bandeau d'avertissement jaune et noir, sol en caillebotis métallique légèrement réfléchissant, composite blanc vernis pour les bornes et le comptoir, acier. Un grand hublot sur le mur ouest montre une nébuleuse et des étoiles qui défilent lentement, et devant elles une planète à anneau peinte au canevas (anneau arrière, planète, anneau avant). Des bandes bleues lumineuses courent au plafond et aux plinthes, une rangée de voyants clignote, le sas est cerclé d'orange et un gyrophare tourne à côté.

### 26 · Dessin animé des années 30

Aplats de gris cernés d'encre (`renderOutline`), plancher et papier peint dessinés à la main, comme un vieux court métrage. Le post-traitement maison `artFilm` imite une pellicule usée : virage sépia contrasté, défauts qui changent 12 fois par seconde (image qui flotte dans le couloir du projecteur, scintillement de l'exposition, rayures verticales claires ou sombres, poussières), grain, et vignette ronde en iris. Les bornes se dandinent et les bouteilles sautillent en rythme, comme dans les dessins animés de l'époque.

### 27 · Diner des années 50

Damier noir et blanc ciré en miroir, chrome (soubassement cannelé, tabourets, pieds de table, flancs des bornes), skaï rouge, formica blanc, murs menthe à frise rouge et blanche semés d'étoiles « boomerang ». Un juke-box (caisse chromée, dôme demi-cylindre) change lentement de couleur et éclaire le coin nord-ouest. L'enseigne néon « EAT » s'allume lettre par lettre, et une horloge murale fait tourner ses aiguilles autour d'un pivot décalé. Plafonniers en globes, reflets du chrome et du skaï par une sonde.

### 28 · Vaporwave

Rêverie numérique des années 90 : damier rose et turquoise en miroir, murs en ciel dégradé violet, rose et cyan avec soleils à bandes, palmiers vert menthe et « ＡＥＳＴＨＥＴＩＣ » en caractères pleine chasse. Quatre colonnes grecques (fût à 16 pans, base, chapiteau) en marbre rose veiné de violet. Au centre, un nœud chromé tourne sur un piédestal, et une sphère miroir flotte. Post-traitement maison `artGlitch` : de temps en temps, une bande horizontale se décale, ses couches de couleur se séparent et sa teinte tourne, sur fond de fines lignes.

À retenir : `active` est un mot réservé en GLSL ES. Un nom de variable comme celui-ci fait échouer la compilation du shader, ce que le test de la carte détecte par l'erreur en console.

### 29 · Chalet sous la neige

Réalisme chaleureux en PBR : murs en rondins, plancher de mélèze, plafond sombre, laine rouge à reflet velouté sur les sièges, fer forgé. Une cheminée en pierre (montants, hotte, linteau, âtre, bûches) abrite un feu en panneaux animés à texture dégradée qui ondulent. Sa lumière orange vacille et projette les ombres du mobilier. Un tapis en peau est posé devant l'âtre. Deux fenêtres donnent sur une nuit bleue (sapins enneigés, lune), où la neige tombe sur un calque transparent qui défile. Lanternes chaudes au bar et près des bornes, clair de lune froid par les fenêtres.

### 30 · Pâte à modeler

Tout semble modelé à la main : couleurs franches et mates, léger reflet gras, et une texture de relief (`bumpTexture`) partagée par tous les matériaux, peinte comme une carte de normales approximative avec empreintes de doigts en arcs concentriques et petites bosses. Lumière de studio douce : un grand projecteur à ombres floues et un remplissage froid. Des figurines en pâte (un chat orange sur le comptoir, une plante en pot, un escargot qui longe le mur) bougent par à-coups, car leurs poses sont quantifiées à 12 images par seconde comme en stop motion. Le chat respire en se déformant et remue la queue.

### 31 · Hologramme

Le mobilier est une projection. Les matériaux utilisent l'effet de Fresnel : la couleur émissive (`emissiveFresnelParameters`) est forte sur les bords et faible de face, et l'opacité (`opacityFresnelParameters`) rend les centres presque transparents. Des arêtes cyan (`EdgesRenderer`) dessinent chaque objet, une texture de lignes de balayage défile sur toutes les surfaces, et l'ensemble scintille avec de brèves coupures. Salle noire quadrillée, barres de projecteurs au sol sous chaque zone et au plafond.

À retenir : `clone()` sur une `DynamicTexture` ne recopie pas son dessin. Il faut peindre une seconde texture.

### 32 · Maquette miniature (tilt-shift)

Une profondeur de champ très courte (`DefaultRenderingPipeline`, ouverture f/1,4, focale 110 mm) fait la mise au point sur la cible de la caméra d'épaule, donc sur le joueur, et floute l'avant et l'arrière-plan : la salle se lit comme une maquette photographiée de près. La mise au point suit le joueur en douceur. Plastique de jouet brillant aux couleurs saturées, sol en plaque à picots, plein soleil à ombres nettes, contraste et saturation relevés, accentuation légère.

À retenir : `scene.pickWithRay` exige l'import à effet de bord de `@babylonjs/core/Culling/ray`, sinon une exception fige le rendu.

### 33 · Temple dans la jungle

Pierre en blocs irréguliers couverte de mousse (plus dense vers le bas), dalles au sol, brume verte. Une ouverture au plafond laisse tomber un soleil vertical (projecteur à ombres). Les faisceaux sont simulés par quatre cylindres ouverts, additifs, à dégradé vertical, qui respirent lentement, et des poussières flottent dans la lumière. Sous l'ouverture, un bassin d'eau sombre aux rides animées (texture de relief qui défile) reflète la salle grâce à un miroir plan, et une idole dorée se dresse sur sa margelle. Des lianes à feuilles pendent du plafond et se balancent autour de leur point d'attache, des fougères occupent les angles et deux torches vacillent près de la porte.

À retenir : `VolumetricLightScatteringPostProcess` est incompatible avec le rendu du joueur ici (le squelette apparaît déformé et décalé), d'où les faisceaux en géométrie.

### 34 · Art ASCII

Post-traitement `artAscii` : l'image est découpée en cellules d'environ 1/64 de la hauteur d'écran, et chaque cellule devient un caractère choisi selon sa luminance (`. : * o & 8 @ #`), en phosphore vert sur noir avec une pointe de la couleur d'origine, des lignes de balayage et un léger scintillement. Les glyphes 5×5 sont codés dans un nombre (un bit par pixel) et décodés en arithmétique flottante (`floor(n / 2^k)` modulo 2), car GLSL ES 1.0 n'a pas d'opérateurs binaires. La scène est volontairement sombre (murs, sol, plafond) et le mobilier clair, sous un projecteur à ombres dures : silhouettes du joueur et des bornes lisibles en caractères denses sur fond de points.

### 35 · Forge volcanique

Basalte noir veiné de fissures incandescentes qui pulsent lentement, sol d'obsidienne polie (miroir plan légèrement flouté) qui reflète fissures, braises et joueur. Une rivière de lave à texture qui coule longe le mur ouest. Une forge (billot, enclume, foyer à braises) projette des ombres vacillantes, et des braises montent en tourbillonnant depuis la lave et le foyer. Lumière presque uniquement orange et rouge, venue d'en bas. Post-traitement `artHeat` : ondulation de chaleur plus forte en bas de l'image.

À retenir : `StandardMaterial` multiplie l'émissif par la texture diffuse (`(diffus + émissif) × texture`). Une texture émissive sur une texture diffuse sombre reste donc éteinte. Les fissures sont peintes dans les deux textures.

### 36 · Vision thermique

La salle est vue par une caméra infrarouge. Le post-traitement `artThermal` lit la luminance (légèrement floutée, avec un bruit de capteur) comme une température et la convertit en palette « fer chaud » : noir, bleu nuit, violet, rouge, orange, jaune, blanc. Il ajoute un réticule central et une échelle de couleurs. Les matériaux sont donc des niveaux de gris qui codent la chaleur : salle froide et sombre ; radiateurs, ampoules, tasses fumantes, moteurs à l'arrière des bornes, écrans et quelques bouteilles tièdes ressortent. Le joueur est la source la plus chaude : le matériau de ses os (« os ivoire ») reçoit une couleur émissive le temps de la visite, restaurée par le disposer du post-traitement.

### 37 · Izakaya

Cloisons shoji rétroéclairées : une même texture (papier chaud et grille de bois) sert de diffuse et d'émissive, de sorte que le papier rayonne et que le bois reste sombre. Plancher clair ciré au reflet doux (miroir plan à faible intensité), comptoir et table en laque noire brillante qui reflètent la salle (sonde), coussins rouge sombre. Quatre lanternes de papier rouge marquées 酒 se balancent et éclairent d'un orange chaud. Un rideau noren bleu nuit (« 居酒屋 ») ondule devant le fond du bar, et des pétales de cerisier tombent en tournoyant.

### 38 · Couleur sélective

Noir et blanc très contrasté, sauf les rouges, qui gardent leur saturation, comme dans un roman graphique filmé. Le post-traitement `artSelective` applique une courbe en S forte sur la luminance, mesure la « rougeur » d'un pixel (rouge nettement au-dessus du vert et du bleu) et ne conserve la couleur que là, avec du grain. Sont rouges : l'enseigne EXIT, la porte, une borne, les tabourets et les chaises, une bouteille, un néon au-dessus du bar et la robe de la chanteuse sur l'affiche. Murs de briques, sol noir miroir, deux projecteurs durs à ombres franches (cercle de lumière sur la table, contre-jour sur le bar).

### 39 · Ombres chinoises

Aucune lumière dans la salle (hémisphérique à 0) : le mobilier, en noir mat, et le joueur deviennent des silhouettes d'encre. Seuls les murs rayonnent, peints comme un ciel de papier au couchant (dégradé violet, orange, jaune, soleil diffus, lune pâle, deux plans de collines découpées). Des découpes noires à texture d'opacité sont collées devant les murs : branches générées récursivement, nuages, et oiseaux qui traversent le mur nord en battant des ailes. Seuls les écrans des bornes gardent une lueur ambrée éteinte. Le post-traitement `artPaper` ajoute des fibres de papier (bruit à deux échelles) et un bord irrégulier comme brûlé.

### 40 · Studio blanc (high-key)

L'inverse des salles sombres : tout est blanc (mat, laqué, acier blanc en PBR), avec trois accents pastel (corail, menthe, bleu ciel) sur la porte, les flancs des bornes, les sièges et quelques sculptures (sphère, anneau qui tourne, bille qui rebondit). La lumière est enveloppante : hémisphérique forte, une grande boîte à lumière au plafond à ombre très légère, deux remplissages. Ce sont l'occlusion ambiante (SSAO2 marquée) et les dégradés qui dessinent les volumes et les angles. Sol blanc laqué au reflet doux, sonde pour les surfaces brillantes, bloom léger.

### 41 · Steampunk

Atelier victorien en PBR : laiton, cuivre et fonte (sonde de reflets), acajou, cuir, parquet à bâtons rompus, papier peint damassé au-dessus d'un lambris. Trois engrenages en prise tournent sur le mur nord à des vitesses qui respectent le rapport de leurs dents (ω₂ = −ω₁·n₁/n₂). Chacun est monté sur deux nœuds : un support qui le couche contre le mur et un pivot qui tourne autour de son axe propre. Une tuyauterie de cuivre longe les murs, avec coudes et descentes. Deux manomètres, dont l'aiguille tremble, et une soupape qui lâche des jets de vapeur intermittents. Ampoules à filament au bout de leurs fils, lumière chaude et ombres douces.

La libération des salles remonte désormais toute la chaîne des parents des maillages (supports, pivots) pour libérer aussi les nœuds intermédiaires.

### 42 · Grotte bioluminescente

Aucune lumière blanche : seul le vivant éclaire. La roche sombre et humide est piquetée de mousse phosphorescente cyan. La même peinture sert de diffuse (roche et mousse) et d'émissive (mousse seule), et sa lueur respire lentement. Douze champignons aux chapeaux lumineux (cyan, magenta, vert) gonflent doucement, et six d'entre eux portent une lumière colorée. Stalactites au plafond, lucioles vert-jaune qui errent et clignotent, brume bleu nuit. Le sol mouillé (miroir plan) reflète toutes les lueurs.

### 43 · Croquis au crayon

La salle est dessinée au graphite sur papier crème. Le post-traitement `artPencil` détecte les contours sur la luminance et superpose trois couches de hachures (angles différents, tremblées par un bruit) qui apparaissent l'une après l'autre quand l'ombre s'épaissit. Il reprend aussi légèrement la couleur des objets saturés, comme un crayon de couleur (porte et flancs rouges, sièges bleus). Les traits « bouillonnent » : le tremblé change quatre fois par seconde, comme un dessin animé image par image. La scène est en gris moyens, sous une lampe latérale à ombres douces que les hachures traduisent.

### 44 · Saloon

Western de fin d'après-midi : planches verticales patinées (fibres, nœuds), plancher usé, comptoir massif avec barre de pied en laiton et crachoir, lustre en roue de chariot garni de huit bougies qui se balance un peu, portes battantes qui oscillent puis s'amortissent, affiche « WANTED » sur le mur est. Le soleil entre en biais par deux fenêtres à croisée : un projecteur rasant porte les ombres du mobilier, des faisceaux additifs inclinés matérialisent la lumière et des grains de poussière y flottent. Étalonnage sépia (saturation −35, teinte ocre via les courbes de couleur), brume chaude, vignette forte.

### 45 · Vitraux

Nef de pierre appareillée et dallage de marbre noir et blanc poli (miroir plan) où se reflètent trois grandes verrières en ogive du mur ouest. Chaque vitrail est peint (losanges colorés, rosace centrale, plombs noirs) et sert de vitre lumineuse (émissive avec opacité). Le même dessin, posé au sol en additif, étiré et décalé vers l'intérieur, simule les taches de couleur que le soleil y dépose. Un projecteur rasant venu de derrière les verrières porte les ombres. Un chandelier aux deux rangées de cierges près du bar, avec flammes qui dansent et lumière chaude, complète la nef. Mobilier en chêne, calices dorés.

### 46 · Palais de glace

Murs taillés dans la glace : blocs, fissures et bulles peints, vernis en clearcoat. Le mobilier est en glace réfringente (PBR : réfraction par sous-surface, indice 1,31, teinte cyan selon l'épaisseur) qui reflète et réfracte une sonde de la salle. Le sol gelé, poli comme un miroir, reflète le bar et les tabourets. Stalactites de glace, cristaux lumineux qui scintillent dans les angles, sièges couverts de fourrure (sheen). Lumière froide (voûte translucide, contre-jours bleus) et une seule source chaude, un brasero à ombres près de la table. Brume bleu pâle.

### 47 · 3D rétro 32 bits

L'esthétique des premières consoles 3D. Le post-traitement `artRetro3d` calcule l'image vers 240 lignes (gros pixels nets) et ramène les couleurs à 5 bits par canal avec un tramage ordonné de Bayer 4×4. Les textures sont minuscules (32 texels), sans filtrage ni mipmaps (`paintedTexture(..., { pixelated: true, mipmaps: false })`) : carrelage violet en damier, briques, bois et métal riveté à gros texels. Brouillard proche et épais comme une distance d'affichage courte, éclairage simple par deux ponctuelles colorées, couleurs franches pour les bornes et les sièges.

### 48 · Bibliothèque ancienne

Tous les murs sont des rayonnages du sol au plafond : dos de livres peints en couleurs de reliure, nervures et titres dorés, quelques vides, tablettes et montants. Une coursive à balustrade et main courante en laiton court le long du mur nord, avec une échelle appuyée. Trois lampes de banquier à abat-jour vert émissif (bar et table) donnent une lumière chaude et basse ; celle de la table porte les ombres. Fauteuil club et sièges en cuir rouge, globe terrestre qui tourne lentement, plancher ciré au reflet doux, poussière dorée qui flotte autour des lampes, pénombre et brume chaude dans les hauteurs.

### 49 · De Stijl / Bauhaus

Les murs sont une composition générée : découpe récursive en rectangles, quelques-uns remplis de rouge, bleu, jaune ou noir, le reste blanc cassé, avec d'épaisses lignes noires. Le mobilier est en volumes purs aux couleurs primaires : bar bleu à plateau noir, sièges rouges, table et porte jaunes, bornes alternées. Trois sculptures élémentaires (cube bleu qui tourne, cylindre rouge, sphère jaune) reposent sur des socles noirs. Lumière franche de grand atelier, comme une verrière zénithale, à ombres nettes ; sol blanc laqué qui reflète.

### 50 · Bar tiki au couchant

Les murs s'ouvrent sur un océan au soleil couchant : ciel violet, corail et or, deux soleils bas dont le reflet doré scintille sur la mer, îles à palmiers en silhouette sur l'horizon. Plancher de terrasse, comptoir et étagères en bambou à nœuds, auvent de chaume dont la frange de lanières ondule au vent. Trois torches tiki à flammes vacillantes, une guirlande d'ampoules colorées en chaînette qui se balance d'un mur à l'autre. Soleil rasant venu de l'ouest qui étire les ombres, remplissage rose.

### 51 · Années 70 psychédéliques

Papier peint à cercles concentriques orange, moutarde, brun, rouille et crème ; moquette à poils longs (milliers de brins peints), teck, formica orange, velours moutarde, miroir fumé derrière le bar. Trois lampes à lave (socle chromé, flacon teinté) dont les bulles de cire montent, gonflent et redescendent, chacune avec sa lueur colorée. Une boule à facettes tourne au plafond : ses éclats sont des petits panneaux projetés sur le mur le plus proche dans leur direction et balaient la salle. Post-traitement `artGroovy` : ondulation radiale douce et teinte qui dérive lentement.

### 52 · Loft industriel (jour)

Réalisme diurne, à comparer aux salles nocturnes. Béton banché (nuances, joints de panneaux, trous de tiges), poutre IPN, acier noir, bois brut, cuir fauve, plantes en pot, suspensions industrielles, tout en PBR. Le mur ouest est une verrière d'atelier à petits carreaux sur un ciel bleuté nuageux. Un soleil franc la traverse et projette au sol l'ombre de sa grille (ombres douces 2048), tandis qu'une lumière bleutée de ciel sert de remplissage. Le béton ciré reflète la verrière. Occlusion ambiante, bloom léger, netteté.

### 53 · Risographie

L'image est « imprimée » en trois encres de riso (rose fluo, bleu, jaune) sur papier blanc cassé. Le post-traitement `artRiso` sépare les couleurs de façon soustractive simplifiée : le rose vient de l'absence de vert, le bleu de l'absence de rouge, le jaune de l'absence de bleu. La composante grise commune est retirée et confiée au bleu, l'encre la plus sombre, ce qui garde des aplats nets. Chaque encre est une trame de points d'angle différent dont le rayon suit la racine de la densité ; les passages sont décalés de quelques pixels (repérage imparfait), l'encre mord irrégulièrement le papier, et les encres se multiplient comme sur papier. La scène est claire et pastel, sous une lampe à ombres douces.

### 54 · Observatoire

Les murs et le plafond s'ouvrent sur un ciel nocturne peint : bande laiteuse diagonale faite de nuages flous, environ 1 800 étoiles de tailles et de teintes variées, constellations tracées finement. Le ciel défile lentement, comme la rotation de la Terre. Tout l'éclairage est rouge, comme les lampes d'astronome qui préservent la vision nocturne. Télescope de laiton sur trépied qui balaie doucement le ciel, sphère armillaire aux anneaux imbriqués qui tournent sur la table, carte du ciel en plateau, noyer et cuir vert. Le sol de pierre polie (miroir plan) reflète les étoiles et les lueurs rouges.

### 55 · Gravure en taille-douce

L'image est gravée comme une illustration du XIXᵉ siècle ou un billet de banque. Le post-traitement `artEngraving` trace des tailles parallèles inclinées, légèrement ondulées par la luminance locale, dont l'épaisseur suit l'obscurité. Une seconde passe croisée n'apparaît que dans les noirs. Les contours détectés par gradient sont encrés. Encre brun-noir sur papier vergé crème (vergeures et pontuseaux) ; ni trame de points ni dégradé. La scène est en gris neutres sous une lumière latérale de fenêtre à ombres douces, pour un modelé marqué.

### 56 · Avant-poste martien

Module d'habitat façon film de SF réaliste, en PBR. Panneaux composites blancs rivetés et marqués (« HAB-05 », bandes de danger), grille métallique au sol saupoudrée de poussière rouge, plafond gris technique avec bandeaux de LED blanc froid. Hublots ronds (disques encadrés d'un tore) sur un paysage peint : dunes rouille en plans successifs, ciel caramel, petit soleil pâle. La lumière martienne orangée entre par les hublots de l'ouest et porte des ombres douces, en contraste chaud/froid avec l'éclairage du module. Brouillard exponentiel orangé de poussière en suspension, conduites, réservoirs, voyants verts clignotants.

Les UV d'un disque Babylon sont inversés verticalement par rapport à un plan : un demi-tour sur l'axe Z remet le ciel en haut.

### 57 · Écran LCD de console portable

L'image passe par une matrice LCD monochrome imaginaire de 144 lignes : le post-traitement `artLcd` échantillonne une couleur par cellule, en tire la luminance (courbe resserrée par `smoothstep` pour garder du contraste) et la répartit sur quatre verts olive par un tramage ordonné de Bayer 4 × 4. Les interstices entre pixels laissent voir le fond vert clair, et une légère ombre donne du relief à la matrice. La scène est en gris neutres sous une lampe à ombres dures, pour que les volumes se lisent malgré les quatre teintes.

Une rémanence (mélange avec l'image précédente) a été essayée puis retirée : la copie, dernière de la chaîne, rend directement à l'écran, et sa sortie n'est donc pas lisible par la passe suivante.

### 58 · Estampe sur bois

Inspirée des estampes japonaises gravées sur bois. Le post-traitement `artWoodblock` lisse légèrement l'image, puis ramène chaque pixel à l'encre la plus proche d'une palette de huit : papier, bleu de Prusse, indigo clair, vermillon, ocre, vert-de-gris, chair, noir. La distance est pondérée, plus sensible au vert. Les contours sont tracés au trait noir, le grain de la planche (veines horizontales ondulées) module les aplats, les fibres du washi texturent le tout, et un dégradé *bokashi* de bleu de Prusse assombrit le haut de l'image. Les ombres et les reflets spéculaires deviennent eux-mêmes des aplats, ce qui donne des formes très graphiques. Tatami, bar indigo, chaises vermillon, sous une lumière douce à une seule ombre nette.

## Construction à la demande

Chaque salle n'est construite (décor, matériaux, lumières, miroirs, sondes, collisions) qu'à sa première activation : au chargement de la carte, seule la première l'est. La position de la porte, qui sert à l'interaction « passer à la salle suivante », est calculée sans construire la salle. Avec 22 salles (il y en a 50 aujourd'hui), le test qui les traverse toutes passe de 4,4 à 2,4 minutes sous rendu logiciel.

Inversement, en entrant dans une salle, toutes celles qui ne sont pas voisines sont libérées : maillages, matériaux et textures, lumières, miroirs, sondes, ombres et collisions. Les effets compilés restent en cache, ce qui accélère une reconstruction au retour. Au plus trois salles existent donc en même temps, et `gowDev.map().built` en donne le nombre. Le test complet tombe alors à 1,5 minute pour 28 salles.
