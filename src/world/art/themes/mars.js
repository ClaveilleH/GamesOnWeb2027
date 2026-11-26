import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Salle 56 · Avant-poste martien : module d'habitat à panneaux blancs modulaires, hublots ronds sur un
// paysage de dunes rouilles sous un ciel caramel, poussière en suspension (brouillard orangé), sol de
// grille métallique, bandeaux de LED blanc froid. Réalisme « film de SF » : PBR, ombres, contraste
// chaud/froid entre la lumière martienne qui entre et l'éclairage technique du module.
const palette = { background: "#e8e4dc", primary: "#d0602a", secondary: "#3a4a5a", accent: "#f0a020", text: "#2a2e34" };

function landscape(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, "#c89a70");
  sky.addColorStop(1, "#e8c0a0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Petit soleil pâle.
  const sun = ctx.createRadialGradient(w * 0.7, h * 0.25, 0, w * 0.7, h * 0.25, 60);
  sun.addColorStop(0, "rgba(255,250,240,1)");
  sun.addColorStop(0.15, "rgba(240,230,220,0.8)");
  sun.addColorStop(1, "rgba(240,200,160,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  // Plans de reliefs successifs, du plus lointain (pâle) au plus proche (sombre).
  const layers = [["#b87850", 0.52, 40], ["#a05a34", 0.6, 60], ["#8a4426", 0.7, 50], ["#6a3018", 0.82, 30]];
  for (const [color, base, amp] of layers) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = h * base - amp * (0.5 + 0.5 * Math.sin(x * 0.006 + base * 10)) - amp * 0.4 * Math.sin(x * 0.021 + base * 3);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  }
  // Cailloux au premier plan.
  ctx.fillStyle = "#4a2010";
  for (let i = 0; i < 80; i++) {
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, h * (0.86 + Math.random() * 0.13), 2 + Math.random() * 7, 1 + Math.random() * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function panels(ctx, w, h) {
  ctx.fillStyle = "#e4e2dc";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#9a9a98";
  ctx.lineWidth = 3;
  const cw = w / 8;
  const ch = h / 3;
  for (let x = 0; x < w; x += cw) for (let y = 0; y < h; y += ch) {
    ctx.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
    ctx.fillStyle = "#b0b0ae";
    for (const [px, py] of [[10, 10], [cw - 10, 10], [10, ch - 10], [cw - 10, ch - 10]]) ctx.fillRect(x + px - 2, y + py - 2, 4, 4);
  }
  // Marquages techniques.
  ctx.fillStyle = "#d0602a";
  ctx.font = "bold 18px monospace";
  for (let k = 0; k < 6; k++) ctx.fillText(`HAB-${String(k + 3).padStart(2, "0")}`, k * cw + 14, ch * 2 + 30);
  ctx.fillStyle = "#f0a020";
  for (let x = 0; x < w; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, h - 18);
    ctx.lineTo(x + 12, h - 18);
    ctx.lineTo(x + 24, h);
    ctx.lineTo(x + 12, h);
    ctx.fill();
  }
}

export const mars = {
  key: "mars",
  title: "Avant-poste martien",
  ambient: { hemi: 0.45, sky: "#ffd8b8", ground: "#5a3020", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.4, contrast: 1.1, vignette: 1.5 },
  fog: { color: "#c88a60", density: 0.035 },
  glow: 0.5,

  look(scene, name) {
    const mat = (label, options) => {
      const m = pbr(scene, `${name} · ${label}`, options);
      m.usePhysicalLightFalloff = false;
      return m;
    };
    const grate = paintedTexture(scene, `${name} · grille`, 256, 256, (c, w, h) => {
      c.fillStyle = "#3a3c40";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#1a1a1c";
      for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) c.fillRect(x + 3, y + 3, 10, 10);
      c.fillStyle = "rgba(200,110,60,0.25)";
      for (let i = 0; i < 300; i++) c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    });
    grate.uScale = 10;
    grate.vScale = 7.5;
    const white = mat("composite blanc", { albedo: "#e8e6e0", roughness: 0.45 });
    const dark = mat("composite gris", { albedo: "#3a4048", metallic: 0.5, roughness: 0.4 });
    const screens = new Map();
    return {
      palette,
      floor: mat("grille", { albedo: "#ffffff", metallic: 0.7, roughness: 0.35, texture: grate }),
      wall: mat("panneaux", { albedo: "#ffffff", roughness: 0.5, texture: paintedTexture(scene, `${name} · panneaux`, 1024, 512, panels) }),
      ceiling: dark,
      trim: dark,
      doorFrame: mat("sas", { albedo: "#d0602a", roughness: 0.5 }),
      door: dark,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SAS ▸ 02", { color: "#f0a020", background: "#1a1c20", font: "bold 70px monospace", glow: 6 }) }),
      counter: white,
      counterTop: dark,
      backBar: dark,
      shelf: white,
      glass: (i) => mat(`flacon ${i}`, { albedo: ["#e0e0e0", "#a0c0e0", "#f0a020"][i % 3], roughness: 0.1, alpha: 0.8 }),
      seat: mat("assise", { albedo: "#d0602a", roughness: 0.6 }),
      tableTop: white,
      metal: dark,
      cabinet: () => white,
      cabinetSide: () => dark,
      panel: dark,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => mat("bouton", { albedo: "#f0a020", roughness: 0.4 }),
      scanlines: false,
      dark,
      white,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Hublots ronds sur le mur ouest et le mur nord : paysage peint, encadrement en tore.
    const view = std(scene, `${key} · paysage`, { diffuse: "#000000", unlit: true,
      emissiveTexture: paintedTexture(scene, `${key} · paysage`, 1024, 512, landscape) });
    const porthole = (label, x, y, z, yaw) => {
      const glass = CreateDisc(`${key} · hublot ${label}`, { radius: 0.76, tessellation: 48 }, scene);
      // Les UV du disque sont inversés verticalement : un demi-tour remet le ciel en haut.
      glass.rotation.set(0, yaw, Math.PI);
      glass.position.copyFrom(ctx.local(x, y, z));
      ctx.add(glass, view);
      const ring = CreateTorus(`${key} · cadre ${label}`, { diameter: 1.55, thickness: 0.12, tessellation: 48 }, scene);
      ring.rotation.set(Math.PI / 2, yaw, 0);
      ring.position.copyFrom(ctx.local(x, y, z));
      ctx.add(ring, look.dark);
    };
    for (const z of [-3.5, 0, 3.5]) porthole(`ouest ${z}`, -W / 2 + 0.03, 2, z, -Math.PI / 2);
    porthole("nord", 5.5, 2.4, D / 2 - 0.03, 0);
    // Lumière martienne qui entre par les hublots, éclairage technique blanc froid au plafond.
    const sun = ctx.spot("soleil martien", [-W / 2 - 3, 4, 0], [1, -0.6, 0.1], "#ffb07a", 2, 1.1, 2, 20);
    ctx.shadows(sun, { size: 1024, darkness: 0.35, soft: true });
    const ledMat = std(scene, `${key} · led`, { diffuse: "#000000", emissive: "#e8f4ff" });
    for (const x of [-4, 0, 4]) {
      ctx.box(`bandeau ${x}`, x, H - 0.03, 0, 0.12, 0.03, D - 2, ledMat);
      ctx.point(`plafonnier ${x}`, x, H - 0.4, 0, "#dceaff", 0.55, 8);
    }
    // Conduites et réservoirs le long des murs.
    for (const y of [H - 0.35, H - 0.55]) {
      const pipe = CreateCylinder(`${key} · conduite ${y}`, { height: D - 0.4, diameter: 0.12, tessellation: 16 }, scene);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.copyFrom(ctx.local(W / 2 - 0.15, y, 0));
      ctx.add(pipe, look.white);
    }
    for (const z of [-5.2, 5.2]) {
      const tank = CreateCylinder(`${key} · réservoir ${z}`, { height: 1.6, diameter: 0.6, tessellation: 24 }, scene);
      tank.position.copyFrom(ctx.local(-W / 2 + 0.5, 0.8, z));
      ctx.add(tank, look.white);
    }
    // Voyants d'état qui clignotent.
    const lampMat = std(scene, `${key} · voyant`, { diffuse: "#000000", emissive: "#40ff60" });
    for (let k = 0; k < 6; k++) ctx.box(`voyant ${k}`, W / 2 - 0.05, 1.5, -4 + k * 0.25, 0.02, 0.06, 0.06, lampMat);
    ctx.onUpdate((time) => {
      lampMat.emissiveColor.set(0.25, 1, 0.38).scaleInPlace(0.4 + 0.6 * (Math.sin(time * 3) > 0 ? 1 : 0.2));
    });
  },
};
