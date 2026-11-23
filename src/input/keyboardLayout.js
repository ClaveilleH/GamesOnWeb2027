import { readPreference, writePreference } from "./preferences.js";

const storageKey = "gow.layout.v1";
const layouts = ["auto", "azerty", "qwerty"];
const azertyKeys = { KeyQ: "A", KeyW: "Z", KeyA: "Q", KeyZ: "W", Semicolon: "M", KeyM: "," };
const layoutProbes = { KeyQ: "a", KeyA: "q", KeyW: "z", KeyZ: "w" };
const punctuation = {
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
  Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", IntlBackslash: "<",
};
const keyNames = {
  Space: "Espace", Enter: "Entrée", Tab: "Tab", Escape: "Échap", Backspace: "Retour arrière", Delete: "Suppr",
  ShiftLeft: "Maj gauche", ShiftRight: "Maj droite", ControlLeft: "Ctrl gauche", ControlRight: "Ctrl droite",
  AltLeft: "Alt gauche", AltRight: "Alt droite", MetaLeft: "Méta gauche", MetaRight: "Méta droite",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  CapsLock: "Verr. maj.", NumLock: "Verr. num.", ScrollLock: "Arrêt défil.", Home: "Début", End: "Fin",
  Insert: "Inser", PageUp: "Page préc.", PageDown: "Page suiv.", ContextMenu: "Menu contextuel",
  Pause: "Pause", PrintScreen: "Impr. écran", NumpadEnter: "Entrée pavé", NumpadAdd: "Pavé +",
  NumpadSubtract: "Pavé −", NumpadMultiply: "Pavé ×", NumpadDivide: "Pavé ÷", NumpadDecimal: "Pavé décimal",
  NumpadComma: "Virgule pavé", NumpadEqual: "Pavé =", IntlRo: "Ro", IntlYen: "¥",
  Convert: "Conversion", NonConvert: "Sans conversion", KanaMode: "Kana",
  NumpadClear: "Effacer pavé", NumpadBackspace: "Retour arrière pavé", NumpadHash: "Pavé #",
  NumpadParenLeft: "Pavé (", NumpadParenRight: "Pavé )", NumpadStar: "Pavé *",
  AudioVolumeMute: "Muet", AudioVolumeDown: "Volume −", AudioVolumeUp: "Volume +",
  MediaPlayPause: "Lecture / pause", MediaStop: "Arrêt", MediaTrackNext: "Piste suivante", MediaTrackPrevious: "Piste précédente",
  BrowserBack: "Page précédente", BrowserForward: "Page suivante", BrowserHome: "Accueil", BrowserRefresh: "Actualiser",
  BrowserSearch: "Rechercher", BrowserFavorites: "Favoris", BrowserStop: "Arrêter", Fn: "Fn", FnLock: "Verr. Fn",
};
const numberedKey = /^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Lang[1-5])$/;

export function isKnownCode(code) {
  return typeof code === "string" && (numberedKey.test(code) || Object.hasOwn(keyNames, code) || Object.hasOwn(punctuation, code));
}

export function createKeyboardLayout() {
  const changes = new EventTarget();
  const listeners = new AbortController();
  const language = navigator.languages?.[0] || navigator.language;
  const guess = /^fr(?:$|-(?:Latn-)?(?:FR|BE)(?:-|$))/i.test(language) ? "azerty" : "qwerty";
  const stored = readPreference(storageKey);
  let preference = layouts.includes(stored) ? stored : "auto";
  let keyEvidence = null;
  let mapLayout = null;
  let keyMap = null;
  const notify = () => changes.dispatchEvent(new Event("change"));

  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey || !Object.hasOwn(layoutProbes, event.code)) return;
    const letter = event.key.toLowerCase();
    let detected;
    if (letter === layoutProbes[event.code]) detected = "azerty";
    else if (letter === event.code.slice(3).toLowerCase()) detected = "qwerty";
    if (detected && detected !== keyEvidence) {
      keyEvidence = detected;
      notify();
    }
  }, { capture: true, signal: listeners.signal });

  async function readMap() {
    try {
      const map = await navigator.keyboard?.getLayoutMap?.();
      if (!map?.get("KeyQ") || listeners.signal.aborted) return;
      keyMap = map;
      mapLayout = map.get("KeyQ").toLowerCase() === "a" ? "azerty" : "qwerty";
      notify();
    } catch {
      // La frappe fournit aussi une preuve lorsque la carte système est inaccessible.
    }
  }
  readMap();

  function automaticLayout() {
    return keyEvidence ?? mapLayout ?? guess;
  }

  return {
    changes,
    get preference() { return preference; },
    get layout() { return preference === "auto" ? automaticLayout() : preference; },
    get automaticLabel() {
      const name = automaticLayout().toUpperCase();
      return keyEvidence || mapLayout ? `Automatique (${name} détecté)` : `Automatique (disposition ${name} supposée)`;
    },
    setPreference(value) {
      if (!layouts.includes(value) || preference === value) return;
      preference = value;
      writePreference(storageKey, value);
      notify();
    },
    label(code) {
      if (!code) return "—";
      if (!isKnownCode(code)) return code;
      if (Object.hasOwn(keyNames, code)) return keyNames[code];
      if (preference === "auto" && keyMap && mapLayout === automaticLayout()) {
        const glyph = keyMap.get(code);
        if (glyph?.length === 1) return glyph.toLocaleUpperCase("fr");
      }
      if (this.layout === "azerty" && Object.hasOwn(azertyKeys, code)) return azertyKeys[code];
      if (/^Key[A-Z]$/.test(code)) return code.slice(3);
      if (/^Digit\d$/.test(code)) return code.slice(5);
      if (/^Numpad\d$/.test(code)) return "Pavé " + code.slice(6);
      return punctuation[code] ?? code;
    },
    dispose: () => listeners.abort(),
  };
}
