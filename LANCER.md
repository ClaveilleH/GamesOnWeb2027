# Lancer le jeu en local (Windows)

## 1. Installer Node.js 22 (une seule fois)

Le projet utilise Vite 8, qui demande **Node 20.19 ou plus récent**. Avec Node 18, `npm run dev` échoue.

Dans PowerShell :

```powershell
winget install OpenJS.NodeJS.LTS
```

**Fermez puis rouvrez** PowerShell, sinon l'ancienne version de Node reste active. Vérifiez ensuite la version, qui doit afficher `v22.x` ou plus :

```powershell
node -v
```

## 2. Installer les dépendances

À faire la première fois, puis après chaque `git pull` qui modifie `package-lock.json` :

```powershell
cd S:\dev\GOW2027
npm ci
```

## 3. Lancer

```powershell
npm run dev
```

Ouvrez ensuite **http://localhost:5173** dans le navigateur et cliquez sur **Jouer**. Laissez la fenêtre PowerShell ouverte pendant que vous jouez. **Ctrl + C** arrête le serveur.

Les modifications du code s'affichent automatiquement dans la page, sans relancer.

## Commandes en jeu

| Touche | Action |
| --- | --- |
| ZQSD / WASD / flèches | Se déplacer |
| Maj | Courir |
| Espace | Sauter |
| R | Réapparaître au départ |
| Souris (après un clic sur la scène) | Orienter la caméra |
| Échap | Pause et menu des touches |
| F3 | HUD : position, vitesse, infos des portails |

Ajouter `?dev` à l'adresse (http://localhost:5173/?dev) active les outils de développement (`window.gowDev`).

## Tests automatisés (facultatif)

La première fois :

```powershell
npx playwright install --only-shell chromium
```

Ensuite :

```powershell
npm test
```

`npm test` reconstruit le site avant de lancer les tests.

## Problèmes fréquents

| Message | Solution |
| --- | --- |
| `Vite requires Node.js version 20.19+` ou erreur `EBADENGINE` | Node est trop ancien : voir l'étape 1, puis rouvrir PowerShell. |
| `npm.ps1 cannot be loaded because running scripts is disabled` | Exécuter une fois `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, ou utiliser `npm.cmd` à la place de `npm`. |
| `Port 5173 is already in use` | Un serveur tourne déjà : ouvrez simplement http://localhost:5173, ou fermez l'autre fenêtre. |
| `'npm' n'est pas reconnu…` | Node n'est pas installé ou PowerShell n'a pas été rouvert après l'installation. |
| Page noire ou « Impossible de charger la scène 3D » | Activer l'accélération matérielle (WebGL) du navigateur, puis recharger. |
