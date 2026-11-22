// Overlay FPS indépendant du HUD (F3) : un compteur chiffré et un petit graphique, chacun
// affichable séparément depuis le menu debug. `update(fps)` est appelé à chaque image rendue.
export function createFpsMeter() {
  const root = document.createElement("div");
  root.id = "fps-meter";
  root.hidden = true;
  const counter = document.createElement("span");
  counter.className = "fps-counter";
  counter.hidden = true;
  const canvas = document.createElement("canvas");
  canvas.className = "fps-graph";
  canvas.hidden = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = 132;
  const height = 42;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  root.append(counter, canvas);
  document.querySelector("main").append(root);

  const history = [];
  const maxSamples = width;
  let counterVisible = false;
  let graphVisible = false;
  let smoothed = 0;

  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#f4ab76";

  function syncRoot() {
    root.hidden = !counterVisible && !graphVisible;
  }

  function drawGraph() {
    // Échelle verticale adaptative, par paliers de 30 i/s, jamais sous 60.
    const peak = history.reduce((max, value) => Math.max(max, value), 0);
    const top = Math.max(60, Math.ceil(peak / 30) * 30);
    ctx.clearRect(0, 0, width, height);
    // Repère à 60 i/s.
    const y60 = height - (60 / top) * height;
    ctx.strokeStyle = "#ffffff22";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y60 + 0.5);
    ctx.lineTo(width, y60 + 0.5);
    ctx.stroke();
    // Courbe des FPS.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const start = Math.max(0, history.length - maxSamples);
    for (let i = start; i < history.length; i++) {
      const x = i - start;
      const y = height - Math.min(history[i], top) / top * height;
      if (i === start) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return {
    get counterVisible() { return counterVisible; },
    get graphVisible() { return graphVisible; },
    setCounterVisible(visible) {
      counterVisible = visible;
      counter.hidden = !visible;
      syncRoot();
    },
    setGraphVisible(visible) {
      graphVisible = visible;
      canvas.hidden = !visible;
      if (!visible) history.length = 0;
      syncRoot();
    },
    update(fps) {
      if (!counterVisible && !graphVisible) return;
      smoothed = smoothed ? smoothed * 0.9 + fps * 0.1 : fps;
      if (counterVisible) counter.textContent = Math.round(smoothed) + " i/s";
      if (graphVisible) {
        history.push(fps);
        if (history.length > maxSamples) history.shift();
        drawGraph();
      }
    },
    dispose() {
      root.remove();
    },
  };
}
