export function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Les réglages en mémoire restent utilisables si le navigateur refuse le stockage.
  }
}
