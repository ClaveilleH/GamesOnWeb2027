import { detectBrowser } from "./browser.js";

// Babylon lit le renderer du contexte du jeu. Un nom masqué ou inconnu reste indéterminé.
export function isSoftwareRenderer(renderer) {
  return /\b(?:swiftshader|llvmpipe|softpipe|swrast|lavapipe|software (?:rasterizer|renderer)|microsoft basic render driver|gdi generic)\b/i.test(renderer);
}

function isMobile(userAgent, maxTouchPoints) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

// Le navigateur refuse un contexte demandé avec `failIfMajorPerformanceCaveat` quand il rendrait en
// logiciel, même si le nom du renderer est masqué. Firefox peut ignorer cette option : la surveillance
// des images lentes (`createSlowFrameMonitor`) prend alors le relais.
export function hasMajorPerformanceCaveat() {
  try {
    const canvas = document.createElement("canvas");
    const options = { failIfMajorPerformanceCaveat: true };
    const gl = canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !gl;
  } catch {
    return false;
  }
}

// Repère un ralentissement durable pendant le jeu : `sample` renvoie true une seule fois, après
// `duration` secondes d’affilée sous `minFps`. `reset` repart de zéro (menu ouvert, reprise).
export function createSlowFrameMonitor({ minFps = 30, duration = 5 } = {}) {
  let slowTime = 0;
  let triggered = false;
  return {
    sample(fps, deltaSeconds) {
      if (triggered) return false;
      // Un onglet resté caché renvoie un gros écart : il ne compte pas comme une image lente.
      slowTime = fps < minFps ? slowTime + Math.min(deltaSeconds, 0.25) : 0;
      triggered = slowTime >= duration;
      return triggered;
    },
    reset() {
      slowTime = 0;
    },
  };
}

export function graphicsHelp(userAgent, maxTouchPoints = 0) {
  if (isMobile(userAgent, maxTouchPoints)) {
    return "Sur mobile ou tablette, mettez le système et le navigateur à jour, puis rouvrez le jeu.";
  }
  if (detectBrowser(userAgent, "") === "firefox") {
    return "Dans les paramètres de Firefox, recherchez « Performances » et décochez « Utiliser les paramètres de performance recommandés » pour voir le réglage. Si « Utiliser l’accélération graphique matérielle si disponible » est déjà cochée, l’accélération est active : recochez les paramètres recommandés. Sinon, cochez-la puis redémarrez Firefox.";
  }
  if (/Edg\//.test(userAgent)) {
    return "Dans Edge, ouvrez edge://settings/system dans la barre d’adresse. Activez l’accélération graphique si disponible, puis redémarrez Edge.";
  }
  if (/Chrom(?:e|ium)\//.test(userAgent)) {
    return "Dans les paramètres du navigateur, recherchez « accélération ». Activez l’accélération graphique si disponible, puis relancez le navigateur.";
  }
  if (/Safari\//.test(userAgent)) {
    return "Dans le menu Apple, ouvrez Réglages Système → Général → Mise à jour de logiciels pour mettre à jour macOS et Safari, puis rouvrez le jeu.";
  }
  return "Recherchez « accélération » dans les paramètres du navigateur et activez l’option si elle est proposée. Si nécessaire, mettez à jour le navigateur et le pilote graphique, puis redémarrez le navigateur.";
}
