import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 5 · Synthwave : fresque de coucher de soleil rayé, palmiers en silhouette, grille lumineuse
// qui défile au sol et se reflète, chrome, magenta et cyan, glow fort.
const palette = { background: "#1a0633", primary: "#2de2e6", secondary: "#ff2a6d", accent: "#ffd319", text: "#ffffff" };

function sunset(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, "#0d0221");
  sky.addColorStop(0.55, "#541388");
  sky.addColorStop(1, "#ff2a6d");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) / 8})`;
    ctx.fillRect((i * 173) % w, (i * 61) % (h * 0.45), 2, 2);
  }
  // Soleil rayé.
  const cx = w * 0.5;
  const cy = h * 0.62;
  const r = h * 0.3;
  const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  sun.addColorStop(0, "#ffd319");
  sun.addColorStop(1, "#ff2a6d");
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = sun;
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  ctx.fillStyle = "#541388";
  for (let k = 0; k < 7; k++) ctx.fillRect(cx - r, cy + k * r * 0.16, 2 * r, 3 + k * 2.5);
  ctx.restore();
  // Montagnes et sol quadrillé en perspective.
  ctx.fillStyle = "#1a0633";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.7);
  for (let x = 0; x <= w; x += w / 14) ctx.lineTo(x, h * 0.7 - (((x * 7) % 90) + 10));
  ctx.lineTo(w, h * 0.7);
  ctx.fill();
  ctx.fillStyle = "#0d0221";
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
  ctx.strokeStyle = "#ff2a6d";
  ctx.lineWidth = 2;
  for (let i = -20; i <= 20; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 8, h * 0.7);
    ctx.lineTo(cx + i * 90, h);
    ctx.stroke();
  }
  for (let k = 1; k < 8; k++) {
    const y = h * 0.7 + (h * 0.3) * (k / 8) ** 1.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Palmiers.
  ctx.fillStyle = "#0d0221";
  for (const [px, ph] of [[w * 0.12, 0.55], [w * 0.2, 0.42], [w * 0.84, 0.5]]) {
    const base = h * 0.72;
    const top = base - h * ph;
    ctx.beginPath();
    ctx.moveTo(px - 5, base);
    ctx.quadraticCurveTo(px + 18, (base + top) / 2, px + 6, top);
    ctx.lineTo(px + 12, top);
    ctx.quadraticCurveTo(px + 26, (base + top) / 2, px + 5, base);
    ctx.fill();
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(px + 9, top);
      ctx.quadraticCurveTo(px + 9 + Math.cos(a) * 50, top - 30 + Math.sin(a) * 10, px + 9 + Math.cos(a) * 90, top + 20 + Math.abs(Math.sin(a)) * 20);
      ctx.lineTo(px + 9 + Math.cos(a) * 80, top + 10);
      ctx.fill();
    }
  }
}

export const synthwave = {
  key: "synthwave",
  title: "Synthwave",
  ambient: { hemi: 0.18, sky: "#ff6ad5", ground: "#2de2e6", sun: 0 },
  image: { contrast: 1.15, exposure: 1.1, vignette: 1.2 },
  glow: 1.1,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const grid = paintedTexture(scene, `${name} · grille`, 512, 512, (ctx, w, h) => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#ff2a6d";
      ctx.shadowColor = "#ff2a6d";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, w, h);
    });
    grid.uScale = 16;
    grid.vScale = 12;
    const chrome = m("chrome", { diffuse: "#222233", specular: "#ffffff", power: 256 });
    const mural = paintedTexture(scene, `${name} · fresque`, 2048, 512, sunset);
    const screens = new Map();
    return {
      palette,
      floor: m("grille", { diffuse: "#05010d", specular: "#ff6ad5", power: 180, emissiveTexture: grid }),
      wall: m("fresque", { diffuse: "#000000", unlit: true, emissiveTexture: mural }),
      ceiling: m("plafond", { diffuse: "#0d0221" }),
      trim: m("liseré cyan", { diffuse: "#000000", emissive: "#2de2e6" }),
      doorFrame: m("cadre", { diffuse: "#000000", emissive: "#ff2a6d" }),
      door: chrome,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "NEXT LEVEL", { color: "#2de2e6", background: "#1a0633", font: "italic bold 76px sans-serif", glow: 16 }) }),
      counter: m("bar", { diffuse: "#1a0633", specular: "#ff6ad5", power: 100 }),
      counterTop: chrome,
      backBar: m("fond du bar", { diffuse: "#000000", unlit: true, emissiveTexture: paintedTexture(scene, `${name} · fond du bar`, 512, 128,
        (ctx, w, h) => {
          const g = ctx.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, "#ff2a6d");
          g.addColorStop(1, "#2de2e6");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }) }),
      shelf: chrome,
      glass: (i) => m(`verre ${i}`, { diffuse: "#000000", emissive: ["#ff2a6d", "#2de2e6", "#ffd319", "#a742ff"][i % 4], alpha: 0.8 }),
      seat: m("assise", { diffuse: "#ff2a6d", specular: "#ffffff", power: 60 }),
      tableTop: chrome,
      metal: chrome,
      cabinet: (i) => m(`borne ${i}`, { diffuse: i % 2 ? "#1a0633" : "#0d0221", specular: "#ff6ad5", power: 120 }),
      cabinetSide: (i) => m(`flanc ${i}`, { diffuse: "#000000", unlit: true, emissiveTexture: mural }),
      cabinetEdge: (i) => m(`liseré ${i}`, { diffuse: "#000000", emissive: i % 2 ? "#2de2e6" : "#ff2a6d" }),
      panel: m("pupitre", { diffuse: "#111122", specular: "#2de2e6", power: 80 }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: "#000000", emissive: ["#ff2a6d", "#2de2e6", "#ffd319", "#a742ff"][i % 4] }),
      chrome, grid,
    };
  },

  decorate(ctx) {
    const { look, scene, ROOM: { width: W, depth: D, height: H } } = ctx;
    ctx.point("magenta", -4, H - 0.5, 1, "#ff2a6d", 0.9, 10);
    ctx.point("cyan", 4, H - 0.5, -1, "#2de2e6", 0.9, 10);
    ctx.point("soleil couchant", 0, 1.2, D / 2 - 1, "#ffb347", 0.6, 8);
    const tube = (hex) => std(scene, `synthwave · tube ${hex}`, { diffuse: "#000000", emissive: hex });
    ctx.box("tube nord", 0, H - 0.08, D / 2 - 0.1, W - 0.4, 0.06, 0.06, tube("#ff2a6d"));
    ctx.box("tube sud", 0, H - 0.08, -D / 2 + 0.1, W - 0.4, 0.06, 0.06, tube("#2de2e6"));
    // Reflets : la grille se reflète dans le sol, le chrome reflète la salle.
    ctx.mirrorFloor(look.floor, { level: 0.3, blur: 10 });
    ctx.noGlow(ctx.room.anchors.floor);
    ctx.probe([look.chrome], { level: 0.6 });
    // La grille défile vers le fond, comme une route vers le soleil.
    ctx.onUpdate((time, dt) => {
      look.grid.vOffset = (look.grid.vOffset + dt * 0.25) % 1;
    });
  },
};
