# Games on Web 2027

Un squelette animé en troisième personne explore un terrain d’entraînement en plein écran. Babylon.js construit le personnage en primitives et Havok gère ses déplacements. Cliquez sur **Jouer** pour commencer. Par défaut, utilisez **ZQSD / WASD** ou les **flèches** pour marcher, **Maj** pour courir, **Espace** pour sauter, **R** pour réapparaître et la souris pour orienter la caméra. **Échap** met le jeu en pause et ouvre le menu où vous pouvez réassigner les touches et choisir la disposition du clavier. **F3** affiche ou masque l’état et la vitesse du personnage.

## Développement

Avec Node.js 24 et npm, lancer

```sh
npm ci
npm run dev
```

Pour tester la version de production avec Chromium, lancer

```sh
npm run build
npx playwright install --only-shell chromium
npm test
```

## Production

GitHub Actions compile le site et teste le chargement de Havok, l’atterrissage, la marche et le saut du personnage sur les pull requests vers `main` et sur les pushs vers `main`. Après un push validé, le workflow publie le contenu de `dist/` dans une release GitHub. L’archive embarque Babylon.js et le module WebAssembly de Havok.

Le VPS vérifie la dernière release toutes les trois minutes. Il en vérifie la somme SHA-256 et le numéro de commit, puis bascule Nginx sur cette version. En cas d’échec, la version en ligne continue d’être servie. Le commit déployé est consultable sur [gow.bertho.tech/version.txt](https://gow.bertho.tech/version.txt).

Sur le VPS Debian avec Nginx, Certbot et son plugin Nginx, exécuter une fois depuis ce dépôt avec le DNS du sous-domaine en place.

```sh
sudo bash ops/install.sh
```

Le script active le site HTTPS et le minuteur systemd. Pour lancer une synchronisation immédiate ou consulter son journal, utiliser

```sh
sudo systemctl start gow-site.service
journalctl -u gow-site.service -n 20 --no-pager
```

## Portail rétrécissant (expérience)

Un couloir dont le portail mène à une version agrandie de lui-même, franchissable à l'infini : voir [docs/PORTAIL_RETRECISSANT.md](docs/PORTAIL_RETRECISSANT.md).
