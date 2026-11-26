// Sélecteur de salle du menu pause, pour les maps à salles numérotées (map « direction artistique ») :
// champ (numéro ou nom, Entrée pour y aller), boutons précédente / suivante et grille cliquable.
// `rooms` : { title, items: [{ label, feet, yaw }], current() → index } ; `go(item)` téléporte et reprend.

export function createRoomPicker(dialog, rooms, go) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const { items } = rooms;

  const section = document.createElement("section");
  section.className = "room-picker";
  section.setAttribute("aria-labelledby", "room-picker-title");
  section.innerHTML = `
    <div class="room-picker-bar">
      <h2 id="room-picker-title"></h2>
      <p class="room-picker-current" aria-live="polite"></p>
    </div>
    <form class="room-picker-form">
      <button type="button" class="room-step" data-step="-1" aria-label="Salle précédente">◀</button>
      <input type="text" inputmode="search" autocomplete="off" spellcheck="false"
        aria-label="Numéro ou nom de la salle" placeholder="N° ou nom (1–${items.length}), Entrée">
      <button type="submit">Aller</button>
      <button type="button" class="room-step" data-step="1" aria-label="Salle suivante">▶</button>
    </form>
    <ol class="room-grid"></ol>`;
  section.querySelector("h2").textContent = rooms.title ?? "Salles";
  const currentLabel = section.querySelector(".room-picker-current");
  const form = section.querySelector("form");
  const field = form.querySelector("input");
  const grid = section.querySelector(".room-grid");

  // Nom sans le numéro (« 12 · Film noir » → « Film noir ») pour l'infobulle et le filtre.
  const nameOf = (item) => item.label.replace(/^\d+\s*·\s*/, "");
  const normalize = (text) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const buttons = items.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(index + 1);
    button.title = item.label;
    button.setAttribute("aria-label", item.label);
    button.addEventListener("click", () => go(item), options);
    const li = document.createElement("li");
    li.append(button);
    grid.append(li);
    return { button, li, key: normalize(`${index + 1} ${nameOf(item)}`) };
  });

  // Salles correspondant au texte saisi : un numéro exact d'abord, sinon les noms qui le contiennent.
  function matches(text) {
    const query = normalize(text);
    if (!query) return items.map((_, index) => index);
    const number = Number(query);
    if (Number.isInteger(number) && number >= 1 && number <= items.length) return [number - 1];
    return buttons.flatMap((entry, index) => (entry.key.includes(query) ? [index] : []));
  }

  function filter() {
    const visible = new Set(matches(field.value));
    for (const [index, { li }] of buttons.entries()) li.hidden = !visible.has(index);
  }

  function refresh() {
    const current = rooms.current();
    currentLabel.textContent = items[current] ? `Ici : ${items[current].label}` : "";
    for (const [index, { button }] of buttons.entries()) {
      button.setAttribute("aria-current", index === current ? "true" : "false");
    }
    field.value = "";
    filter();
  }

  field.addEventListener("input", filter, options);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const [first] = matches(field.value);
    if (first !== undefined && field.value.trim()) go(items[first]);
  }, options);
  for (const step of section.querySelectorAll(".room-step")) {
    step.addEventListener("click", () => {
      const next = (rooms.current() + Number(step.dataset.step) + items.length) % items.length;
      go(items[next]);
    }, options);
  }

  // Juste sous la barre du menu : visible sans défiler.
  dialog.querySelector(".menu-bar").after(section);
  refresh();

  return {
    refresh,
    dispose() {
      listeners.abort();
      section.remove();
    },
  };
}
