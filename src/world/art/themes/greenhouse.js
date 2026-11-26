import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 76 · Serre victorienne au petit matin : verrière à résille de fer forgé vert sombre au plafond
// et sur le mur ouest, ciel pâle derrière, soleil rasant qui projette la résille au sol, brume humide,
// palmiers et fougères en pots de terre cuite, dallage de pierre mouillé qui reflète.
const palette = { background: "#e8efe4", primary: "#2a4a3a", secondary: "#f0d8a0", accent: "#c06a3a", text: "#2a3a30" };

function glazing(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#d8e8f0");
  g.addColorStop(1, "#f8ecd0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Résille de fer forgé : petits carreaux et arcs.
  ctx.strokeStyle = "#1e3a2e";
  ctx.lineWidth = 5;
  for (let x = 0; x <= w; x += w / 12) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  for (let y = 0; y <= h; y += h / 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += w / 12) {
    ctx.beginPath();
    ctx.arc(x + w / 24, h / 6, w / 24, Math.PI, 0);
    ctx.stroke();
  }
  // Buée et gouttes.
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  for (let i = 0; i < 300; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const greenhouse = {
  key: "serre",
  title: "Serre victorienne",
  ambient: { hemi: 0.6, sky: "#e8f0ff", ground: "#4a5a40", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.4, contrast: 1.05, vignette: 1.5 },
  fog: { color: "#dce6d8", density: 0.03 },
  glow: 0,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const flags = paintedTexture(scene, `${name} · dallage`, 512, 512, (c, w, h) => {
      c.fillStyle = "#6a6a60";
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? -32 : 0; x < w; x += 64) {
        const v = 110 + Math.random() * 40;
        c.fillStyle = `rgb(${v},${v},${v - 10})`;
        c.fillRect(x + 2, y + 2, 60, 60);
      }
      c.fillStyle = "rgba(60,90,50,0.3)";
      for (let i = 0; i < 200; i++) c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    });
    flags.uScale = 5;
    flags.vScale = 4;
    const iron = m("fer forgé", { diffuse: "#1e3a2e", specular: "#406050", power: 40 });
    const glass = m("verrière", { diffuse: "#000000", unlit: true, emissiveTexture: paintedTexture(scene, `${name} · verrière`, 1024, 512, glazing) });
    const brick = m("brique", { diffuse: "#a05a3a" });
    const screens = new Map();
    return {
      palette,
      floor: m("dallage mouillé", { diffuse: "#ffffff", texture: flags, specular: "#ffffff", power: 140 }),
      wall: m("mur chaulé", { diffuse: "#e8e4d8" }),
      ceiling: glass,
      trim: iron,
      doorFrame: iron,
      door: m("porte vitrée", { diffuse: "#a0b8a8", specular: "#ffffff", power: 120 }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Sortie", { color: "#f0e0b0", background: "#1e3a2e", font: "italic bold 70px serif" }) }),
      counter: brick,
      counterTop: m("marbre", { diffuse: "#f0ece4", specular: "#ffffff", power: 100 }),
      backBar: iron,
      shelf: iron,
      glass: (i) => m(`flacon ${i}`, { diffuse: ["#80a060", "#c0a060", "#e0e8e0"][i % 3], specular: "#ffffff", power: 140, alpha: 0.7 }),
      seat: iron,
      tableTop: m("plateau", { diffuse: "#f0ece4" }),
      metal: iron,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#2a4a3a", "#c06a3a", "#e8e4d8"][i % 3] }),
      cabinetSide: () => iron,
      panel: iron,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", { diffuse: "#c06a3a" }),
      scanlines: false,
      glassMat: glass,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, height: H } } = ctx;
    const key = room.theme.key;
    // Mur ouest vitré lui aussi.
    ctx.plane("verrière ouest", -W / 2 + 0.03, H / 2, 0, 11, H - 0.2, look.glassMat, -Math.PI / 2);
    // Soleil rasant du matin par l'ouest, ombres de la résille.
    const sun = ctx.spot("soleil", [-W / 2 - 6, 5, -1], [1, -0.45, 0.15], "#fff0c8", 2.2, 1.1, 1, 30);
    ctx.shadows(sun, { size: 1024, darkness: 0.3, soft: true });
    // Plantes : palmiers (stipe et palmes) et fougères (touffes) dans des pots de terre cuite.
    const terracotta = std(scene, `${key} · terre cuite`, { diffuse: "#b86a40" });
    const leaf = std(scene, `${key} · feuille`, { diffuse: "#3a7a3a", specular: "#204020", power: 30 });
    const fern = std(scene, `${key} · fougère`, { diffuse: "#5a9a40" });
    const trunk = std(scene, `${key} · stipe`, { diffuse: "#6a5030" });
    const pot = (x, z, s) => {
      const p = CreateCylinder(`${key} · pot ${x} ${z}`, { height: 0.5 * s, diameterTop: 0.6 * s, diameterBottom: 0.42 * s, tessellation: 20 }, scene);
      p.position.copyFrom(ctx.local(x, 0.25 * s, z));
      ctx.add(p, terracotta);
    };
    for (const [x, z, height] of [[-7, -5, 2.6], [-7, 4.8, 3.1], [7.1, 5.1, 2.4]]) {
      pot(x, z, 1.3);
      const stem = CreateCylinder(`${key} · stipe ${x} ${z}`, { height, diameterTop: 0.08, diameterBottom: 0.16, tessellation: 10 }, scene);
      stem.position.copyFrom(ctx.local(x, 0.6 + height / 2, z));
      ctx.add(stem, trunk);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const frond = CreateSphere(`${key} · palme ${x} ${z} ${k}`, { diameter: 1.4, segments: 8 }, scene);
        frond.scaling.set(0.2, 0.05, 1);
        frond.rotation.set(0.5, a, 0);
        frond.position.copyFrom(ctx.local(x + Math.sin(a) * 0.55, 0.6 + height - 0.1, z + Math.cos(a) * 0.55));
        ctx.add(frond, leaf);
      }
    }
    for (const [x, z] of [[-7.2, -1.5], [-7.2, 1.5], [2.5, 5.3], [-2.2, -5.3]]) {
      pot(x, z, 0.9);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const blade = CreateSphere(`${key} · fronde ${x} ${z} ${k}`, { diameter: 0.9, segments: 6 }, scene);
        blade.scaling.set(0.15, 0.04, 1);
        blade.rotation.set(-0.6, a, 0);
        blade.position.copyFrom(ctx.local(x + Math.sin(a) * 0.3, 0.6, z + Math.cos(a) * 0.3));
        ctx.add(blade, fern);
      }
    }
    ctx.point("bar", -1, 2.6, 3.5, "#fff0d8", 0.5, 7);
    ctx.mirrorFloor(look.floor, { level: 0.3, blur: 6, size: 512 });
  },
};
