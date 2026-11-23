import { isKnownCode } from "./keyboardLayout.js";
import { readPreference, writePreference } from "./preferences.js";

export const actions = [
  { id: "forward", label: "Avancer", defaults: ["KeyW", "ArrowUp"] },
  { id: "back", label: "Reculer", defaults: ["KeyS", "ArrowDown"] },
  { id: "left", label: "Gauche", defaults: ["KeyA", "ArrowLeft"] },
  { id: "right", label: "Droite", defaults: ["KeyD", "ArrowRight"] },
  { id: "sprint", label: "Courir", defaults: ["ShiftLeft", "ShiftRight"] },
  { id: "jump", label: "Sauter", defaults: ["Space", null] },
  { id: "respawn", label: "Réapparaître", defaults: ["KeyR", null] },
  { id: "interact", label: "Interagir", defaults: ["KeyE", null] },
];
const storageKey = "gow.bindings.v1";
// Tab libère la souris pour le menu debug.
const reserved = new Set(["Escape", "F3", "Tab", "Backspace", "Delete"]);
export const canBind = (code) => isKnownCode(code) && !reserved.has(code);

function defaults() {
  return Object.fromEntries(actions.map(({ id, defaults: keys }) => [id, [...keys]]));
}

function load() {
  try {
    const saved = JSON.parse(readPreference(storageKey));
    const used = new Set();
    for (const { id } of actions) {
      const pair = saved?.[id];
      if (!Array.isArray(pair) || pair.length !== 2) return defaults();
      for (const code of pair) {
        if (code === null) continue;
        if (!canBind(code) || used.has(code)) return defaults();
        used.add(code);
      }
    }
    return saved;
  } catch {
    return defaults();
  }
}

export function createBindings() {
  let table = load();
  const changes = new EventTarget();
  function save() {
    writePreference(storageKey, JSON.stringify(table));
    changes.dispatchEvent(new Event("change"));
  }
  return {
    changes,
    keys: (action) => table[action],
    actionFor: (code) => actions.find(({ id }) => table[id].includes(code))?.id,
    assign(id, slot, code) {
      if (code !== null && !canBind(code)) return;
      let conflict;
      if (code !== null) {
        const previous = actions.find((action) => table[action.id].includes(code));
        if (previous) {
          const index = table[previous.id].indexOf(code);
          if (previous.id === id && index === slot) return;
          table[previous.id][index] = null;
          conflict = { label: previous.label, slot: index };
        }
      }
      table[id][slot] = code;
      save();
      return conflict;
    },
    reset() {
      table = defaults();
      save();
    },
  };
}
