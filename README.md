# Games on Web 2027

Un squelette animé en troisième personne explore un terrain d’entraînement en plein écran. Babylon.js construit le personnage en primitives et Havok gère ses déplacements. Cliquez sur **Jouer** pour commencer. Par défaut, utilisez **ZQSD / WASD** ou les **flèches** pour marcher, **Maj** pour courir, **Espace** pour sauter, **R** pour réapparaître et la souris pour orienter la caméra. **Échap** met le jeu en pause et ouvre le menu où vous pouvez réassigner les touches et choisir la disposition du clavier. **F3** affiche ou masque l’état et la vitesse du personnage. **Ctrl + D** ouvre le menu debug (caméra 3e / 1re personne, vol, noclip, échelle, temps, téléportation) et **Tab** libère la souris pour cliquer dedans.

## Portails non euclidiens

Le terrain de 100 m × 100 m entoure la zone d’entraînement de cinq démonstrations, chacune nommée par un panneau peint au sol :

- une arche isolée qui montre un autre lieu (paradoxe spatial) ;
- un couloir plus long dedans que dehors ;
- une pièce qui boucle sur elle-même ;
- une cabine qui donne sur une grande salle ;
- un tunnel qui réduit le joueur et les caisses de moitié.

**F3** affiche aussi la profondeur de récursion atteinte, le nombre de passes de rendu, les images par seconde et les contours des portails.

Le système est un module générique (`src/portals/`). Son architecture, son API et ses limites sont décrites dans [docs/PORTALS.md](docs/PORTALS.md). Les limites de Babylon.js rencontrées, avec les correctifs proposés, sont dans [docs/BABYLON_PATCHES.md](docs/BABYLON_PATCHES.md). Ajouter `?dev` à l’URL expose `window.gowDev`, un hook de pilotage utilisé par les tests Playwright, qui permet aussi de mesurer les performances.

## Maps

Le terrain d’entraînement est la map par défaut. D’autres maps glTF/GLB se chargent par lien : http://localhost:5173/?map=arcade ouvre la salle d’arcade et sa façade. Conventions et ajout d’une map : [docs/MAPS.md](docs/MAPS.md).

## Personnage

Le squelette procédural peut être remplacé par un modèle glTF/GLB animé, déposé dans `public/models/` : voir [docs/PERSONNAGE.md](docs/PERSONNAGE.md).

## Développement

Avec Node.js 20.19 ou plus récent (la CI utilise Node 24) et npm, lancer

```sh
npm ci
npm run dev
```

Pas à pas pour Windows et problèmes fréquents : [LANCER.md](LANCER.md).

Pour tester la version de production avec Chromium, lancer

```sh
npx playwright install --only-shell chromium
npm test
```

`npm test` reconstruit d’abord `dist/`, puis lance Playwright sur `vite preview`. `npm run lint` vérifie le code avec ESLint.

## Production

GitHub Actions vérifie le code avec ESLint, compile le site et teste le chargement de Havok, l’atterrissage, la marche et le saut du personnage, ainsi que le rendu et la traversée des portails sur les pull requests vers `main` et sur les pushs vers `main`. Après un push validé, le workflow publie le contenu de `dist/` dans une release GitHub. L’archive embarque Babylon.js et le module WebAssembly de Havok.

Le VPS vérifie la dernière release toutes les trois minutes. Il en vérifie la somme SHA-256 et le numéro de commit, puis bascule Nginx sur cette version. En cas d’échec, la version en ligne continue d’être servie. Le commit déployé est consultable sur [gow.bertho.tech/version.txt](https://gow.bertho.tech/version.txt).

Sur le VPS Debian avec Nginx, Certbot et son plugin Nginx, exécuter depuis ce dépôt avec le DNS du sous-domaine en place.

```sh
sudo bash ops/install.sh
```

Le script active le site HTTPS et le minuteur systemd. Il installe `ops/nginx.conf` une seule fois pour que Certbot puisse y gérer le certificat et la redirection HTTPS du domaine. La configuration du site se trouve dans `ops/nginx-site.conf`. Après l’avoir modifiée, relancer `sudo bash ops/install.sh` sur le VPS.

Sur le VPS déjà en service, le script s’arrête avant toute modification pour demander une migration unique. Dans le bloc qui sert le site dans `/etc/nginx/sites-available/gow.bertho.tech`, remplacer `root`, `index`, les directives `gzip*` et `add_header` et tous les blocs `location` par `include snippets/gow-site.conf;`. Conserver le certificat et la redirection HTTPS de Certbot, puis relancer le script.

Pour lancer une synchronisation immédiate ou consulter son journal, utiliser

```sh
sudo systemctl start gow-site.service
journalctl -u gow-site.service -n 20 --no-pager
```
