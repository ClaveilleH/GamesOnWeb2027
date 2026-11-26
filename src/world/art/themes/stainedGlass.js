import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Engine } from "@babylonjs/core/Engines/engine";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 45 · Vitraux : nef de pierre claire, grandes verrières en ogive sur le mur ouest. Le soleil les
// traverse et dépose au sol des taches de couleur (projection additive du même dessin, étirée en biais).
// Dallage de marbre poli qui reflète les verrières, rangées de cierges, poussière dans la lumière.
const palette = { background: "#1a1614", primary: "#c8a050", secondary: "#2a4aa0", accent: "#a02a2a", text: "#f0e8d8" };
const GLASS = ["#c0202a", "#2040b0", "#e0b020", "#209050", "#8030a0", "#e06020"];

// Verrière : ogive, plombs noirs, losanges et médaillon central.
function paintWindow(ctx, w, h, seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.35);
  ctx.quadraticCurveTo(0, 0, w / 2, 0);
  ctx.quadraticCurveTo(w, 0, w, h * 0.35);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.clip();
  const cell = w / 6;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      ctx.fillStyle = GLASS[Math.floor(rand() * GLASS.length)];
      ctx.beginPath();
      ctx.moveTo(x + cell / 2, y);
      ctx.lineTo(x + cell, y + cell / 2);
      ctx.lineTo(x + cell / 2, y + cell);
      ctx.lineTo(x, y + cell / 2);
      ctx.fill();
      ctx.fillStyle = GLASS[Math.floor(rand() * GLASS.length)];
      ctx.fillRect(x, y, cell / 2, cell / 2);
    }
  }
  // Médaillon : rosace à pétales.
  ctx.fillStyle = "#f0d060";
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.38, w * 0.26, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.fillStyle = GLASS[k % GLASS.length];
    ctx.beginPath();
    ctx.ellipse(w / 2 + Math.cos(a) * w * 0.14, h * 0.38 + Math.sin(a) * w * 0.14, w * 0.08, w * 0.04, a, 0, Math.PI * 2);
    ctx.fill();
  }
  // Plombs.
  ctx.strokeStyle = "#101010";
  ctx.lineWidth = 5;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      ctx.strokeRect(x, y, cell, cell);
      ctx.beginPath();
      ctx.moveTo(x + cell / 2, y);
      ctx.lineTo(x + cell, y + cell / 2);
      ctx.lineTo(x + cell / 2, y + cell);
      ctx.lineTo(x, y + cell / 2);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.38, w * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.35);
  ctx.quadraticCurveTo(0, 0, w / 2, 0);
  ctx.quadraticCurveTo(w, 0, w, h * 0.35);
  ctx.lineTo(w, h);
  ctx.stroke();
}

function ashlar(ctx, w, h) {
  ctx.fillStyle = "#5a5248";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 48) {
    for (let x = (y / 48) % 2 ? -48 : 0; x < w; x += 96) {
      const v = 150 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${v},${v - 8},${v - 20})`;
      ctx.fillRect(x + 2, y + 2, 92, 44);
    }
  }
}

export const stainedGlass = {
  key: "vitraux",
  title: "Vitraux",
  ambient: { hemi: 0.45, sky: "#d0c8ff", ground: "#3a3028", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.7, contrast: 1.12, vignette: 2.2 },
  fog: { color: "#3a3440", density: 0.015 },
  glow: 0.7,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const stone = m("pierre", { diffuse: "#ffffff", texture: paintedTexture(scene, `${name} · appareil`, 1024, 512, ashlar) });
    const marble = paintedTexture(scene, `${name} · marbre`, 512, 512, (c, w, h) => {
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          c.fillStyle = (x + y) % 2 ? "#1a1a1e" : "#d8d4cc";
          c.fillRect((x * w) / 2, (y * h) / 2, w / 2, h / 2);
        }
      }
      c.strokeStyle = "rgba(120,110,100,0.35)";
      for (let k = 0; k < 14; k++) {
        c.beginPath();
        let x = Math.random() * w;
        c.moveTo(x, 0);
        for (let y = 0; y < h; y += 16) c.lineTo((x += (Math.random() - 0.5) * 14), y);
        c.stroke();
      }
    });
    marble.uScale = 8;
    marble.vScale = 6;
    const wood = m("chêne", { diffuse: "#4a3018", specular: "#2a1a10", power: 30 });
    const gold = m("or", { diffuse: "#b8902a", specular: "#ffe8a0", power: 90 });
    const screens = new Map();
    return {
      palette,
      floor: m("dallage", { diffuse: "#ffffff", texture: marble, specular: "#ffffff", power: 140 }),
      wall: stone,
      ceiling: m("voûte", { diffuse: "#2a2630" }),
      trim: stone,
      doorFrame: stone,
      door: wood,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "✝ Sortie", { color: "#f0e8d8", background: "#2a2018", font: "italic 66px serif" }) }),
      counter: wood,
      counterTop: m("nappe", { diffuse: "#f0ece0" }),
      backBar: wood,
      shelf: gold,
      glass: (i) => m(`calice ${i}`, { diffuse: i % 2 ? "#b8902a" : "#e0d8c8", specular: "#ffffff", power: 100 }),
      seat: wood,
      tableTop: wood,
      metal: gold,
      cabinet: () => wood,
      cabinetSide: () => stone,
      panel: wood,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => gold,
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W } } = ctx;
    const key = room.theme.key;
    const windows = [-3.5, 0, 3.5];
    windows.forEach((z, k) => {
      const tex = paintedTexture(scene, `${key} · verrière ${k}`, 256, 512, (c, w, h) => paintWindow(c, w, h, 11 + k * 31));
      tex.hasAlpha = true;
      // Verrière : vitre lumineuse (émissive) collée au mur ouest, encadrée de pierre.
      const pane = std(scene, `${key} · verrière ${k}`, { diffuse: "#000000", unlit: true, emissiveTexture: tex });
      pane.opacityTexture = tex;
      ctx.plane(`verrière ${k}`, -W / 2 + 0.02, 2.25, z, 1.5, 2.9, pane, -Math.PI / 2);
      ctx.box(`ébrasement ${k}`, -W / 2 + 0.08, 0.75, z, 0.16, 0.1, 1.7, look.trim);
      // Projection au sol : même dessin, additif et transparent, étiré et décalé vers l'est.
      const spill = std(scene, `${key} · projection ${k}`, { diffuse: "#000000", unlit: true, emissiveTexture: tex });
      spill.opacityTexture = tex;
      spill.alphaMode = Engine.ALPHA_ADD;
      spill.alpha = 0.95;
      spill.disableDepthWrite = true;
      const patch = ctx.plane(`projection ${k}`, -W / 2 + 3.4, 0.015, z, 3.4, 1.5, spill);
      patch.rotation.set(Math.PI / 2, -Math.PI / 2, 0);
      patch.isPickable = false;
      ctx.noGlow(patch);
    });
    // Soleil derrière les verrières, légèrement coloré, qui porte des ombres.
    const sun = ctx.spot("soleil", [-W / 2 - 2.5, 4.5, 0], [1, -0.75, 0], "#ffe8c0", 1.6, 1.4, 1, 20);
    ctx.shadows(sun, { size: 1024, darkness: 0.35, soft: true });
    // Rangées de cierges sur un chandelier près du bar.
    const wax = std(scene, `${key} · cire`, { diffuse: "#f4ecd8" });
    const flame = std(scene, `${key} · flamme`, { diffuse: "#000000", emissive: "#ffc060" });
    const flames = [];
    ctx.box("chandelier", 2.6, 0.5, 5.3, 2.2, 1, 0.5, look.metal);
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 7; k++) {
        const x = 1.7 + k * 0.3;
        const z = 5.2 + row * 0.18;
        const height = 0.15 + ((k * 7 + row * 3) % 5) * 0.04;
        const candle = CreateCylinder(`${key} · cierge ${row} ${k}`, { height, diameter: 0.05, tessellation: 10 }, scene);
        candle.position.copyFrom(ctx.local(x, 1 + height / 2, z));
        ctx.add(candle, wax);
        const fire = CreateSphere(`${key} · flamme ${row} ${k}`, { diameter: 0.035, segments: 6 }, scene);
        fire.scaling.y = 1.8;
        fire.position.copyFrom(ctx.local(x, 1.04 + height, z));
        ctx.add(fire, flame);
        flames.push({ fire, phase: k + row * 3 });
      }
    }
    const candles = ctx.point("cierges", 2.6, 1.6, 4.8, "#ffb060", 0.9, 7);
    ctx.mirrorFloor(look.floor, { level: 0.35, blur: 4 });
    ctx.onUpdate((time) => {
      candles.intensity = 0.85 + Math.sin(time * 9) * 0.05 + Math.sin(time * 23) * 0.03;
      for (const { fire, phase } of flames) fire.scaling.y = 1.8 + Math.sin(time * 11 + phase) * 0.25;
    });
  },
};
