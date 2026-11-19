// Écarts de comportement entre navigateurs qu’on ne peut pas traiter autrement.
//
// Règle : d’abord une solution valable partout, qui réagit à ce que fait le navigateur
// (erreur renvoyée, touche reçue). Un profil seulement quand c’est impossible, par exemple
// pour une valeur interne au navigateur. Chaque option existe dans tous les profils ;
// le reste du code lit l’option, il ne teste jamais le nom du navigateur.
const profiles = {
  chromium: {
    name: "chromium",
    // Après une sortie par Échap, Chromium refuse requestPointerLock (SecurityError)
    // pendant 1250 ms, même sur un clic : la capture est retentée à la fin du délai.
    lockDelayAfterUserExitMs: 1250,
  },
  firefox: {
    name: "firefox",
    // Firefox n’impose pas de délai après une sortie par Échap.
    lockDelayAfterUserExitMs: 0,
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
