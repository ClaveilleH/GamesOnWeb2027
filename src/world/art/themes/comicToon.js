import "@babylonjs/core/Rendering/outlineRenderer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 3 · BD cel-shading : aplats de couleurs franches, contours noirs épais, trame de points.
// Une seule lumière hémisphérique forte, sans reflet spéculaire : chaque face plane reçoit une teinte
// constante (haut clair, côtés moyens, dessous sombres), comme un ombrage en trois tons.
const palette = { background: "#1b1f6b", primary: "#ffe14d", secondary: "#ff3b3b", accent: "#ffffff", text: "#ffffff" };
const ink = Color3.FromHexString("#14110f");

function halftone(ctx, w, h, base, dot, step = 16) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = dot;
  for (let y = 0; y < h; y += step) {
    for (let x = (y / step) % 2 ? step / 2 : 0; x < w; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, step * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export const comicToon = {
  key: "bd-cel-shading",
  title: "BD cel-shading",
  ambient: { hemi: 1.15, sky: "#ffffff", ground: "#5a4a8a", sun: 0 },
  image: { contrast: 1.1, saturation: 25 },
  glow: 0,

  look(scene, name) {
    const flat = (label, hex, options = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...options });
    const floorTexture = paintedTexture(scene, `${name} · trame`, 1024, 768, (ctx, w, h) => halftone(ctx, w, h, "#ffcf3d", "#f29a1d", 24));
    const wallTexture = paintedTexture(scene, `${name} · mur`, 1024, 512, (ctx, w, h) => {
      halftone(ctx, w, h, "#4fc3f7", "#2a9fd6", 20);
      ctx.fillStyle = "#e53935";
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
      ctx.fillStyle = "#14110f";
      ctx.fillRect(0, h * 0.78 - 6, w, 8);
    });
    const sideArt = paintedTexture(scene, `${name} · flancs`, 256, 512, (ctx, w, h) => {
      halftone(ctx, w, h, "#e53935", "#b71c1c", 18);
      ctx.fillStyle = "#ffe14d";
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.3);
      ctx.lineTo(w * 0.9, h * 0.45);
      ctx.lineTo(w * 0.35, h * 0.55);
      ctx.lineTo(w * 0.8, h * 0.75);
      ctx.lineTo(w * 0.2, h * 0.6);
      ctx.lineTo(w * 0.55, h * 0.48);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#14110f";
      ctx.stroke();
    });
    const colors = ["#e53935", "#1e88e5", "#43a047", "#ffb300", "#8e24aa"];
    const screens = new Map();
    return {
      palette,
      floor: flat("sol", "#ffffff", { texture: floorTexture }),
      wall: flat("mur", "#ffffff", { texture: wallTexture }),
      ceiling: flat("plafond", "#ffffff", { texture: paintedTexture(scene, `${name} · plafond`, 512, 512,
        (ctx, w, h) => halftone(ctx, w, h, "#fff3c4", "#f5d77a", 24)) }),
      trim: flat("plinthe", "#14110f"),
      doorFrame: flat("cadre", "#14110f"),
      door: flat("porte", "#43a047"),
      sign: flat("enseigne", "#000000", { unlit: true, emissiveTexture: signTexture(scene, `${name} · enseigne`, "→ SUITE !",
        { color: "#14110f", background: "#ffffff", font: "bold 84px sans-serif" }) }),
      counter: flat("bar", "#8e24aa"),
      counterTop: flat("plateau", "#ffe14d"),
      backBar: flat("fond du bar", "#ffffff", { texture: paintedTexture(scene, `${name} · fond du bar`, 512, 128,
        (ctx, w, h) => halftone(ctx, w, h, "#ff8a65", "#e64a19", 14)) }),
      shelf: flat("étagère", "#14110f"),
      glass: (i) => flat(`bouteille ${i}`, colors[i % colors.length]),
      seat: flat("assise", "#e53935"),
      tableTop: flat("table", "#1e88e5"),
      metal: flat("métal", "#cfd8dc"),
      cabinet: (i) => flat(`borne ${i}`, colors[(i + 1) % colors.length]),
      cabinetSide: () => flat("flanc", "#ffffff", { texture: sideArt }),
      panel: flat("pupitre", "#263238"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, flat(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => flat(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: (i) => flat(`bouton ${i}`, colors[i % colors.length]),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { room, scene, ROOM: { width: W } } = ctx;
    // Bulles et onomatopées sur les murs.
    const bubble = (label, text, x, y, z, w, h, yaw, fill = "#ffffff", color = "#14110f") => {
      const texture = paintedTexture(scene, `${room.theme.key} · ${label}`, 512, 256, (c, tw, th) => {
        c.fillStyle = fill;
        c.strokeStyle = "#14110f";
        c.lineWidth = 12;
        c.beginPath();
        c.ellipse(tw / 2, th / 2, tw / 2 - 14, th / 2 - 14, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = color;
        c.font = "italic 900 110px sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(text, tw / 2, th / 2 + 6, tw * 0.8);
      });
      texture.hasAlpha = true;
      const mat = std(scene, `${room.theme.key} · ${label}`, { diffuse: "#000000", unlit: true, emissiveTexture: texture });
      mat.opacityTexture = texture;
      return ctx.plane(label, x, y, z, w, h, mat, yaw);
    };
    bubble("POW", "POW !", -W / 2 + 0.03, 2.8, -1.2, 2.6, 1.3, -Math.PI / 2, "#ffe14d", "#e53935");
    bubble("ZAP", "ZAP !", 1.5, 3.1, 5.97, 2.2, 1.1, 0, "#ffffff", "#1e88e5");
    bubble("BONUS", "BONUS", W / 2 - 0.03, 3.35, 0, 2.4, 0.9, Math.PI / 2, "#ff8a65", "#14110f");
    // Contours encrés sur tout le mobilier (pas sur les parois ni sur les écrans).
    const skip = new Set([room.anchors.floor, room.anchors.ceiling, ...room.anchors.walls, ...room.screens]);
    for (const mesh of room.meshes) {
      if (skip.has(mesh) || mesh.name.includes("fronton") || mesh.name.includes("enseigne")) continue;
      if (["POW", "ZAP", "BONUS"].some((label) => mesh.name.endsWith(label))) continue;
      mesh.renderOutline = true;
      mesh.outlineColor = ink;
      mesh.outlineWidth = 0.025;
    }
    // Pas de lumière ponctuelle : l'hémisphère suffit. Les bulles se gonflent en rythme.
    const pops = room.meshes.filter((mesh) => ["POW", "ZAP", "BONUS"].some((label) => mesh.name.endsWith(label)));
    ctx.onUpdate((time) => {
      pops.forEach((mesh, i) => mesh.scaling.setAll(1 + 0.05 * Math.max(0, Math.sin(time * 3 + i * 2))));
    });
  },
};
