import { actions, canBind } from "../input/bindings.js";

const slotNames = ["principal", "secondaire"];
const help = "Sélectionnez une touche pour la modifier.";
const prompt = "Appuyez sur une touche… Échap annule. Retour arrière ou Suppr efface.";

export function createMenu(bindings, layout, onResume, onOpen) {
  const dialog = document.querySelector("#pause-menu");
  const play = dialog.querySelector("#play");
  const table = dialog.querySelector("#bindings");
  const select = dialog.querySelector("#keyboard-layout");
  const reset = dialog.querySelector("#reset-bindings");
  const message = dialog.querySelector("#binding-message");
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const slots = [];
  let recording = null;
  let timer;

  function announce(text, temporary = false) {
    clearTimeout(timer);
    message.textContent = text;
    if (temporary) timer = setTimeout(() => { message.textContent = help; }, 3500);
  }

  function refresh() {
    select.options[0].textContent = layout.automaticLabel;
    select.value = layout.preference;
    for (const slot of slots) {
      const { action, index, button } = slot;
      const label = layout.label(bindings.keys(action.id)[index]);
      button.textContent = recording === slot ? "…" : label;
      button.setAttribute("aria-label", `${action.label}, ${slotNames[index]}, ${label}`);
      button.setAttribute("aria-pressed", String(recording === slot));
    }
  }

  for (const action of actions) {
    const row = table.insertRow();
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = action.label;
    row.append(name);
    for (let index = 0; index < 2; index++) {
      const button = document.createElement("button");
      button.type = "button";
      row.insertCell().append(button);
      const slot = { action, index, button };
      slots.push(slot);
      button.addEventListener("click", () => {
        recording = slot;
        refresh();
        announce(prompt);
      }, options);
    }
  }

  // `key` indique la touche qui ferme le menu, pour que la reprise s’adapte au navigateur.
  function resume(key) {
    recording = null;
    dialog.close();
    play.textContent = "Reprendre";
    onResume(key);
  }

  function escape() {
    if (recording) {
      recording = null;
      refresh();
      announce("Modification annulée.", true);
    } else {
      resume("Escape");
    }
  }

  function record(code) {
    if (code === "Escape") return escape();
    const clear = code === "Backspace" || code === "Delete";
    if (!clear && !canBind(code)) {
      const reservedKeys = { F3: "F3 est réservé au HUD", Tab: "Tab est réservé à la souris" };
      announce(reservedKeys[code] ? reservedKeys[code] + ". Choisissez une autre touche." : "Touche inconnue. Essayez une autre touche.");
      return;
    }
    const { action, index } = recording;
    recording = null;
    const conflict = bindings.assign(action.id, index, clear ? null : code);
    refresh();
    if (conflict) {
      announce(`${layout.label(code)} a été retiré de « ${conflict.label} » (${slotNames[conflict.slot]}) et affecté à « ${action.label} ».`, true);
    } else {
      announce(clear ? "Emplacement effacé." : "Touche enregistrée.", true);
    }
  }

  window.addEventListener("keydown", (event) => {
    if (!dialog.open) return;
    if (recording || event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) {
        if (recording) record(event.code);
        else escape();
      }
      return;
    }
    if (event.code === "Tab") {
      const boundary = event.shiftKey ? play : reset;
      if (document.activeElement === boundary) {
        event.preventDefault();
        (event.shiftKey ? reset : play).focus();
      }
    }
  }, { ...options, capture: true });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    escape();
  }, options);
  play.addEventListener("click", () => resume(), options);
  select.addEventListener("change", () => layout.setPreference(select.value), options);
  reset.addEventListener("click", () => {
    recording = null;
    bindings.reset();
    announce("Touches par défaut restaurées.", true);
  }, options);
  bindings.changes.addEventListener("change", refresh, options);
  layout.changes.addEventListener("change", refresh, options);
  refresh();

  return {
    get isOpen() { return dialog.open; },
    // Ferme le menu et reprend la partie (après un choix fait dans le menu, comme une salle).
    resume() {
      if (dialog.open) resume();
    },
    open() {
      if (dialog.open) return;
      onOpen?.();
      announce(help);
      refresh();
      dialog.showModal();
      play.focus({ preventScroll: true });
    },
    dispose() {
      listeners.abort();
      clearTimeout(timer);
      dialog.close();
      table.replaceChildren();
    },
  };
}
