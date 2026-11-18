# Games on Web 2027

Une balle tombe sur une plateforme en 3D. Babylon.js affiche la scène et Havok simule les rebonds. Le bouton **Relancer la balle** permet de répéter le test. Le compteur affiche les impacts détectés par Havok.

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

GitHub Actions compile le site et teste les collisions sur les pull requests vers `main` et sur les pushs vers `main`. Après un push validé, le workflow publie le contenu de `dist/` dans une release GitHub. L’archive embarque Babylon.js et le module WebAssembly de Havok.

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
