import { movementModes } from "../player/playerController.js";

const modeLabels = { walk: "Marche", fly: "Vol", noclip: "Noclip" };
const cameraViews = [{ view: "third", label: "3e personne" }, { view: "first", label: "1re personne" }];
const scales = [0.25, 0.5, 1, 2];
const east = Math.PI / 2;

// Pieds légèrement au-dessus du sol : le joueur se pose au pas suivant.
export const debugDestinations = Object.freeze([
  { label: "Départ", feet: { x: 0, y: 0.05, z: -10 }, yaw: 0 },
  { label: "Arche A · paradoxe", feet: { x: 0, y: 0.05, z: 26 }, yaw: 0 },
  { label: "Esplanade B", feet: { x: -30, y: 0.05, z: -26 }, yaw: Math.PI },
  { label: "Galerie 7 m / 24 m", feet: { x: 27, y: 0.05, z: 2 }, yaw: east },
  { label: "Pavillon cyclique", feet: { x: -33, y: 0.05, z: 0 }, yaw: 0 },
  { label: "Cabine · grande salle", feet: { x: 30, y: 0.05, z: -25 }, yaw: Math.PI },
  { label: "Tunnel d’échelle P1", feet: { x: -43, y: 0.05, z: 31.5 }, yaw: east },
]);

const number = (value, digits = 2) => value.toFixed(digits).replace(".", ",").replace(/^-(0,0+)$/, "$1");

function element(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Chaque catégorie est un menu déroulant repliable. `open` par défaut : fermé.
function section(title, { open = false } = {}, ...children) {
  const body = element("div", { className: "debug-section-body" }, children);
  return element("details", { className: "debug-section", open },
    [element("summary", { textContent: title }), body]);
}

function slider(label, { min, max, step, value, format }, onInput) {
  const output = element("output");
  const input = element("input", { type: "range", min, max, step, value });
  const show = () => { output.textContent = format(Number(input.value)); };
  input.addEventListener("input", () => {
    show();
    onInput(Number(input.value));
  });
  show();
  const row = element("label", { className: "debug-slider" }, [element("span", { textContent: label }), output, input]);
  return { row, input, set(value) { input.value = value; show(); } };
}

// Panneau latéral : modes de déplacement, échelle, temps, téléportation et affichage.
// `game` relie le panneau au jeu sans qu’il connaisse la boucle principale.
export function createDebugMenu(canvas, game) {
  const panel = document.querySelector("#debug-menu");
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const { player, portals } = game;

  const characterButtons = (game.characters ?? []).map(({ key, label }) => {
    const button = element("button", { type: "button", textContent: label });
    button.dataset.character = key;
    button.setAttribute("aria-pressed", String(key === game.currentCharacter));
    button.addEventListener("click", () => game.selectCharacter(key), options);
    return button;
  });

  const modeButtons = movementModes.map((mode) => {
    const button = element("button", { type: "button", textContent: modeLabels[mode] });
    button.dataset.mode = mode;
    button.addEventListener("click", () => {
      player.setMode(mode);
      refresh();
    }, options);
    return button;
  });
  const viewButtons = cameraViews.map(({ view, label }) => {
    const button = element("button", { type: "button", textContent: label });
    button.dataset.view = view;
    button.addEventListener("click", () => {
      game.setCameraView(view);
      refresh();
    }, options);
    return button;
  });

  const flySpeed = slider("Vitesse de vol", {
    min: 1, max: 40, step: 1, value: player.state.flySpeed, format: (v) => v + " m/s",
  }, (value) => { player.state.flySpeed = value; });

  const scaleButtons = scales.map((scale) => {
    const button = element("button", { type: "button", textContent: "×" + number(scale).replace(/,?0+$/, "") });
    button.dataset.scale = String(scale);
    button.addEventListener("click", () => {
      player.resize(scale);
      refresh();
    }, options);
    return button;
  });

  const timeScale = slider("Vitesse du temps", {
    min: 0.1, max: 2, step: 0.05, value: game.timeScale, format: (v) => "×" + number(v),
  }, (value) => { game.timeScale = value; });

  const destinations = debugDestinations.map(({ label, feet, yaw }) => {
    const button = element("button", { type: "button", textContent: label });
    button.addEventListener("click", () => game.teleport(feet, yaw), options);
    return element("li", {}, [button]);
  });

  const hudToggle = element("input", { type: "checkbox" });
  hudToggle.addEventListener("change", () => {
    if (hudToggle.checked !== game.hudVisible) game.toggleHud();
  }, options);
  const depth = slider("Profondeur des portails", {
    min: 0, max: 8, step: 1, value: portals.settings.maxDepth, format: String,
  }, (value) => { portals.settings.maxDepth = value; });

  const fpsCounterToggle = element("input", { type: "checkbox" });
  fpsCounterToggle.addEventListener("change", () => {
    if (fpsCounterToggle.checked !== game.fpsCounterVisible) game.toggleFpsCounter();
  }, options);
  const fpsGraphToggle = element("input", { type: "checkbox" });
  fpsGraphToggle.addEventListener("change", () => {
    if (fpsGraphToggle.checked !== game.fpsGraphVisible) game.toggleFpsGraph();
  }, options);

  const coordinates = element("output", { className: "debug-position" });
  const copy = element("button", { type: "button", textContent: "Copier" });
  copy.addEventListener("click", () => {
    const { x, y, z } = player.state.position;
    const text = `{ x: ${x.toFixed(2)}, y: ${y.toFixed(2)}, z: ${z.toFixed(2)} }`;
    navigator.clipboard?.writeText(text).then(() => { copy.textContent = "Copié"; }, () => { copy.textContent = "Échec"; });
    setTimeout(() => { copy.textContent = "Copier"; }, 1200);
  }, options);

  panel.append(
    element("header", {}, [
      element("h1", { textContent: "Debug" }),
      element("p", {}, [element("kbd", { textContent: "Tab" }), " souris · ", element("kbd", { textContent: "Ctrl D" }), " fermer"]),
    ]),
    section("Déplacement", {},
      element("div", { className: "debug-choices" }, modeButtons),
      flySpeed.row,
      element("p", { className: "debug-note" }, [
        element("kbd", { textContent: "Espace" }), " monter · ", element("kbd", { textContent: "C" }), " descendre · ",
        element("kbd", { textContent: "Maj" }), " ×2,5",
      ])),
    section("Caméra", {}, element("div", { className: "debug-choices" }, viewButtons)),
    section("Performance", { open: true },
      element("label", { className: "debug-check" }, [fpsCounterToggle, "Compteur FPS"]),
      element("label", { className: "debug-check" }, [fpsGraphToggle, "Graphique des FPS"])),
    section("Affichage", {},
      element("label", { className: "debug-check" }, [hudToggle, "HUD et contours des portails (F3)"]),
      depth.row),
    section("Échelle du joueur", {}, element("div", { className: "debug-choices" }, scaleButtons)),
    section("Téléportation", {}, element("ul", { className: "debug-destinations" }, destinations)),
    section("Temps", {}, timeScale.row),
    ...(characterButtons.length
      ? [section("Personnage", {},
          element("div", { className: "debug-choices" }, characterButtons),
          element("p", { className: "debug-note" }, ["Recharge la page pour appliquer."]))]
      : []),
    section("Position", { open: true }, element("div", { className: "debug-position-row" }, [coordinates, copy])),
  );
  panel.setAttribute("aria-label", "Menu debug");

  // Un bouton ou une case garderait le focus : Espace l’activerait au lieu de faire sauter.
  for (const type of ["click", "change"]) {
    panel.addEventListener(type, () => canvas.focus({ preventScroll: true }), options);
  }

  let lastScale;
  let lastMode;
  function refresh() {
    lastScale = player.state.scale;
    lastMode = player.state.mode;
    for (const button of modeButtons) button.setAttribute("aria-pressed", String(button.dataset.mode === player.state.mode));
    for (const button of viewButtons) button.setAttribute("aria-pressed", String(button.dataset.view === game.cameraView));
    for (const button of scaleButtons) button.setAttribute("aria-pressed", String(Number(button.dataset.scale) === player.state.scale));
    flySpeed.set(player.state.flySpeed);
    timeScale.set(game.timeScale);
    depth.set(portals.settings.maxDepth);
    hudToggle.checked = game.hudVisible;
    fpsCounterToggle.checked = game.fpsCounterVisible;
    fpsGraphToggle.checked = game.fpsGraphVisible;
  }

  let lastText = "";
  return {
    get isOpen() { return !panel.hidden; },
    toggle() {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) refresh();
    },
    refresh,
    // Appelé à chaque image : ne touche au DOM que si l’affichage change.
    update() {
      if (panel.hidden) return;
      const { position, scale } = player.state;
      const text = `x ${number(position.x)}  y ${number(position.y)}  z ${number(position.z)}  ×${number(scale, 3)}`;
      if (text !== lastText) coordinates.textContent = lastText = text;
      // Un portail d’échelle change la taille du joueur sans passer par le panneau.
      if (scale !== lastScale || player.state.mode !== lastMode) refresh();
    },
    dispose() {
      listeners.abort();
      panel.replaceChildren();
      panel.hidden = true;
    },
  };
}
