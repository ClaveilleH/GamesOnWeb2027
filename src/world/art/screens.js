// Écrans et frontons des bornes, dessinés au canevas : de faux jeux originaux, un par borne.
// `palette` adapte les couleurs à la direction artistique de la salle.

export const GAMES = Object.freeze([
  { title: "ASTRO RUSH", kind: "shooter" },
  { title: "MAZE MUNCH", kind: "maze" },
  { title: "JUMP KID", kind: "platform" },
  { title: "TURBO LANE", kind: "race" },
  { title: "IRON FISTS", kind: "fight" },
  { title: "BLOCK DROP", kind: "blocks" },
]);

const DEFAULT_PALETTE = Object.freeze({
  background: "#06040e", primary: "#7df9ff", secondary: "#ff4fd8", accent: "#ffe45c", text: "#ffffff",
});

function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawShooter(ctx, w, h, p) {
  for (let i = 0; i < 60; i++) rect(ctx, i % 3 ? "#ffffff66" : p.accent, (i * 97) % w, (i * 53) % h, 2, 2);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const x = 22 + col * 30;
      const y = 24 + row * 22;
      rect(ctx, row === 0 ? p.secondary : p.primary, x, y, 18, 10);
      rect(ctx, p.background, x + 4, y + 3, 3, 3);
      rect(ctx, p.background, x + 11, y + 3, 3, 3);
    }
  }
  rect(ctx, p.accent, w / 2 - 12, h - 26, 24, 10);
  rect(ctx, p.accent, w / 2 - 3, h - 34, 6, 8);
  rect(ctx, p.text, w / 2 - 1, h - 70, 2, 14);
}

function drawMaze(ctx, w, h, p) {
  ctx.strokeStyle = p.primary;
  ctx.lineWidth = 4;
  for (let x = 16; x < w; x += 32) {
    for (let y = 16; y < h; y += 32) {
      if ((x * 7 + y * 3) % 5 < 2) ctx.strokeRect(x, y, 22, 22);
      else rect(ctx, p.accent, x + 9, y + 9, 4, 4);
    }
  }
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.arc(w * 0.46, h * 0.58, 11, 0.6, Math.PI * 2 - 0.6);
  ctx.lineTo(w * 0.46, h * 0.58);
  ctx.fill();
  for (const [x, color] of [[0.7, p.secondary], [0.2, "#5cff7a"]]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(w * x, h * 0.3, 10, Math.PI, 0);
    ctx.lineTo(w * x + 10, h * 0.3 + 12);
    ctx.lineTo(w * x - 10, h * 0.3 + 12);
    ctx.fill();
  }
}

function drawPlatform(ctx, w, h, p) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, p.background);
  sky.addColorStop(1, p.secondary + "55");
  rect(ctx, sky, 0, 0, w, h);
  for (const [x, y, len] of [[10, 150, 90], [120, 120, 70], [60, 85, 60], [170, 60, 60]]) {
    rect(ctx, p.primary, x, y, len, 10);
    rect(ctx, "#00000055", x, y + 10, len, 4);
  }
  rect(ctx, "#5cff7a", 0, h - 18, w, 18);
  rect(ctx, p.accent, 74, 130, 12, 20);
  rect(ctx, p.secondary, 74, 126, 12, 6);
  for (const x of [140, 160, 190]) rect(ctx, p.accent, x, 104, 6, 6);
}

function drawRace(ctx, w, h, p) {
  rect(ctx, "#1a5c2a", 0, h * 0.45, w, h);
  ctx.fillStyle = "#333340";
  ctx.beginPath();
  ctx.moveTo(w * 0.45, h * 0.45);
  ctx.lineTo(w * 0.55, h * 0.45);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    rect(ctx, p.text, w / 2 - 1 - t * 4, h * (0.47 + t * 0.53), 2 + t * 8, 6 + t * 10);
  }
  const sun = ctx.createRadialGradient(w / 2, h * 0.4, 4, w / 2, h * 0.4, 50);
  sun.addColorStop(0, p.accent);
  sun.addColorStop(1, "transparent");
  rect(ctx, sun, 0, 0, w, h * 0.45);
  rect(ctx, p.secondary, w / 2 - 22, h - 46, 44, 22);
  rect(ctx, "#111", w / 2 - 26, h - 30, 10, 10);
  rect(ctx, "#111", w / 2 + 16, h - 30, 10, 10);
}

function drawFight(ctx, w, h, p) {
  rect(ctx, p.secondary + "44", 0, 0, w, h);
  rect(ctx, "#2b1c3a", 0, h - 40, w, 40);
  for (const [x, color, flip] of [[70, p.primary, 1], [170, p.accent, -1]]) {
    rect(ctx, color, x - 8, h - 110, 16, 30);
    rect(ctx, color, x - 6, h - 126, 12, 14);
    rect(ctx, color, x - 8, h - 80, 6, 40);
    rect(ctx, color, x + 2, h - 80, 6, 40);
    rect(ctx, color, x + flip * 8, h - 104, flip * 22, 6);
  }
  for (const [x, color] of [[10, p.primary], [w - 110, p.accent]]) {
    rect(ctx, "#ffffff33", x, 12, 100, 10);
    rect(ctx, color, x, 12, 70, 10);
  }
  ctx.fillStyle = p.text;
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center";
  ctx.fillText("99", w / 2, 26);
}

function drawBlocks(ctx, w, h, p) {
  const colors = [p.primary, p.secondary, p.accent, "#5cff7a", "#ff8a3c"];
  const size = 14;
  const left = w / 2 - 5 * size;
  rect(ctx, "#ffffff22", left - 2, 0, 10 * size + 4, h);
  rect(ctx, p.background, left, 0, 10 * size, h);
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 10; col++) {
      if ((row * 3 + col * 7) % 9 === 0) continue;
      rect(ctx, colors[(row + col) % colors.length], left + col * size + 1, h - (row + 1) * size + 1, size - 2, size - 2);
    }
  }
  for (const [c, r] of [[4, 3], [5, 3], [5, 4], [6, 4]]) {
    rect(ctx, p.secondary, left + c * size + 1, r * size + 1, size - 2, size - 2);
  }
}

const DRAW = { shooter: drawShooter, maze: drawMaze, platform: drawPlatform, race: drawRace, fight: drawFight, blocks: drawBlocks };

// Écran 4:3 du jeu `index`, avec lignes de balayage si `scanlines`.
export function paintScreen(ctx, size, index, palette = DEFAULT_PALETTE, scanlines = true) {
  const p = { ...DEFAULT_PALETTE, ...palette };
  const { width: w, height: h } = size;
  ctx.save();
  ctx.scale(w / 256, h / 192);
  rect(ctx, p.background, 0, 0, 256, 192);
  DRAW[GAMES[index % GAMES.length].kind](ctx, 256, 192, p);
  ctx.fillStyle = p.text;
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "left";
  ctx.fillText("1UP 004250", 6, 12);
  ctx.restore();
  if (scanlines) {
    for (let y = 0; y < h; y += 3) rect(ctx, "#00000040", 0, y, w, 1);
  }
}

// Fronton lumineux : titre du jeu `index` sur un dégradé.
export function paintMarquee(ctx, size, index, palette = DEFAULT_PALETTE) {
  const p = { ...DEFAULT_PALETTE, ...palette };
  const { width: w, height: h } = size;
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, p.secondary);
  gradient.addColorStop(0.5, p.background);
  gradient.addColorStop(1, p.primary);
  rect(ctx, gradient, 0, 0, w, h);
  ctx.font = `bold ${Math.round(h * 0.52)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = h * 0.06;
  ctx.strokeStyle = p.background;
  const title = GAMES[index % GAMES.length].title;
  ctx.strokeText(title, w / 2, h / 2, w * 0.8);
  ctx.fillStyle = p.accent;
  ctx.fillText(title, w / 2, h / 2, w * 0.8);
}
