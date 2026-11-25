import "@babylonjs/core/Rendering/edgesRenderer";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 14 · Plan d'architecte : tout est dessiné au trait blanc sur fond bleu, comme un tirage
// de plan. Surfaces unies sans lumière, arêtes tracées par l'EdgesRenderer, grille millimétrée et
// cotes au sol et aux murs. Une ligne de balayage parcourt la salle comme un scanner.
const palette = { background: "#0b3d91", primary: "#ffffff", secondary: "#9ec9ff", accent: "#ffffff", text: "#ffffff" };
const BLUE = "#0e4aa8";

function grid(ctx, w, h, major, minor, label) {
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += minor) ctx.strokeRect(x, 0, 0, h);
  for (let y = 0; y <= h; y += minor) ctx.strokeRect(0, y, w, 0);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += major) ctx.strokeRect(x, 0, 0, h);
  for (let y = 0; y <= h; y += major) ctx.strokeRect(0, y, w, 0);
  if (label) label(ctx);
}

// Cote : flèche double et mesure, à la manière d'un plan.
function dimension(ctx, x0, y0, x1, y1, text) {
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  for (const [x, y, s] of [[x0, y0, 1], [x1, y1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s * 14 * Math.cos(a - 0.4), y + s * 14 * Math.sin(a - 0.4));
    ctx.lineTo(x + s * 14 * Math.cos(a + 0.4), y + s * 14 * Math.sin(a + 0.4));
    ctx.fill();
  }
  ctx.save();
  ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
  ctx.rotate(a);
  ctx.font = "italic 22px monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, 0, -8);
  ctx.restore();
}

export const blueprint = {
  key: "plan-architecte",
  title: "Plan d'architecte",
  // Les aplats ignorent la lumière ; l'hémisphère n'éclaire que le joueur, en bleu clair.
  ambient: { hemi: 0.9, sky: "#cfe4ff", ground: "#2a6ad2" },
  glow: 0.35,

  look(scene, name) {
    const flat = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: "#000000", emissive: hex, unlit: true });
    const floor = paintedTexture(scene, `${name} · grille`, 1024, 768, (ctx, w, h) => grid(ctx, w, h, 64, 16, (c) => {
      dimension(c, 40, 40, w - 40, 40, "16 000");
      dimension(c, 40, 70, 40, h - 40, "12 000");
      c.strokeStyle = "rgba(255,255,255,0.6)";
      c.setLineDash([12, 8]);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(w * 0.21, h * 0.67, 110, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.font = "20px monospace";
      c.fillStyle = "#ffffff";
      c.fillText("TABLE Ø 1200", w * 0.21 - 70, h * 0.67 + 140);
      c.fillText("COMPTOIR", w * 0.2, h * 0.2);
      c.fillText("BORNES ×5", w * 0.86, h * 0.5);
    }));
    const wall = paintedTexture(scene, `${name} · élévation`, 2048, 512, (ctx, w, h) => grid(ctx, w, h, 128, 32, (c) => {
      dimension(c, 60, h - 40, w - 60, h - 40, "ÉLÉVATION — 16 000");
      dimension(c, 30, 30, 30, h - 70, "4 200");
      c.font = "bold 28px monospace";
      c.fillStyle = "#ffffff";
      c.fillText("SALLE D'ARCADE — PLAN N° 14 — ÉCH. 1:50", 120, 60);
      c.strokeStyle = "#ffffff";
      c.lineWidth = 3;
      c.strokeRect(w - 560, 20, 520, 120);
      c.font = "20px monospace";
      c.fillText("DESSINÉ : ATELIER GOW", w - 540, 60);
      c.fillText("VÉRIFIÉ : —", w - 540, 92);
      c.fillText("RÉV. B", w - 540, 124);
    }));
    const fill = flat("aplat", "#1257c4");
    const deep = flat("aplat sombre", "#0b3d91");
    const screens = new Map();
    return {
      palette,
      floor: std(scene, `${name} · sol`, { diffuse: "#000000", unlit: true, emissiveTexture: floor }),
      wall: std(scene, `${name} · mur`, { diffuse: "#000000", unlit: true, emissiveTexture: wall }),
      ceiling: flat("plafond", "#082c6b"),
      trim: fill,
      doorFrame: fill,
      door: deep,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE →", { color: "#ffffff", background: BLUE, font: "bold 70px monospace" }) }),
      counter: fill,
      counterTop: deep,
      backBar: deep,
      shelf: fill,
      glass: () => fill,
      seat: deep,
      tableTop: deep,
      metal: fill,
      cabinet: () => fill,
      cabinetSide: () => deep,
      panel: deep,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => fill,
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    // Arêtes blanches sur tout le mobilier, pas sur les parois (déjà quadrillées) ni sur les écrans.
    const skip = new Set([room.anchors.floor, room.anchors.ceiling, ...room.anchors.walls, ...room.screens]);
    const white = new Color4(1, 1, 1, 1);
    for (const mesh of room.meshes) {
      if (skip.has(mesh) || mesh.name.includes("fronton") || mesh.name.includes("enseigne")) continue;
      mesh.enableEdgesRendering(0.95);
      mesh.edgesWidth = 2.5;
      mesh.edgesColor = white;
    }
    // Ligne de balayage : un plan lumineux fin qui traverse la salle d'ouest en est.
    const scan = std(scene, `${room.theme.key} · balayage`, { diffuse: "#000000", emissive: "#9ec9ff", unlit: true, alpha: 0.35 });
    scan.backFaceCulling = false;
    const sweep = ctx.plane("balayage", 0, H / 2, 0, D, H, scan, Math.PI / 2);
    ctx.onUpdate((time) => {
      const t = (time * 0.12) % 1;
      sweep.position.x = ctx.local(-W / 2 + t * W, 0, 0).x;
    });
  },
};
