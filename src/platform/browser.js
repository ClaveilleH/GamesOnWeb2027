// Écarts de comportement connus entre navigateurs.
// Chaque différence est une option nommée d’un profil : le reste du code lit l’option,
// il ne teste jamais le nom du navigateur. Pour un nouvel écart, ajouter une option
// aux deux profils et la documenter ici.
const profiles = {
  chromium: {
    name: "chromium",
    // Après une sortie par Échap, Chromium refuse requestPointerLock (SecurityError)
    // pendant 1250 ms, même sur un clic : on retente à la fin du délai.
    lockDelayAfterUserExitMs: 1250,
    // Pendant ce délai, la caméra suit déjà la souris, curseur masqué, pour que la reprise
    // paraisse immédiate.
    lookDuringLockDelay: true,
    // Chromium libère la souris dès l’appui sur Échap : on peut recapturer aussitôt.
    relockAfterEscapeRelease: false,
    // Chromium libère lui-même la souris quand la touche système (Windows/Cmd) est pressée.
    pauseOnSystemKey: false,
  },
  firefox: {
    name: "firefox",
    lockDelayAfterUserExitMs: 0,
    lookDuringLockDelay: false,
    // Firefox libère la souris au relâchement d’Échap : une capture faite pendant l’appui
    // serait aussitôt annulée et rouvrirait le menu.
    relockAfterEscapeRelease: true,
    // Firefox garde la souris capturée quand la touche système ouvre le lanceur du bureau.
    pauseOnSystemKey: true,
  },
};

export const browserNames = Object.keys(profiles);

// `?browser=firefox` force un profil, pour tester ses règles dans un autre navigateur.
export function detectBrowser(userAgent = navigator.userAgent, search = location.search) {
  const forced = new URLSearchParams(search).get("browser");
  if (Object.hasOwn(profiles, forced)) return forced;
  // Un navigateur non reconnu suit le profil Chromium, le moteur le plus répandu.
  return /\bFirefox\/\d/.test(userAgent) && !/\bSeamonkey\//i.test(userAgent) ? "firefox" : "chromium";
}

export function createPlatform(name = detectBrowser()) {
  return Object.freeze({ ...profiles[Object.hasOwn(profiles, name) ? name : "chromium"] });
}
