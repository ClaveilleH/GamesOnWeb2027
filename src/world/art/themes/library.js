import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 48 · Bibliothèque ancienne : rayonnages du sol au plafond sur tous les murs (dos de livres
// peints, reliures cuir et dorures), coursive à balustrade, échelle roulante, lampes de banquier à abat-jour
// vert sur le bar et la table, fauteuils de cuir, plancher ciré qui reflète doucement, globe terrestre.
// Lumière chaude et basse, pénombre dans les hauteurs, poussière dorée.
const palette = { background: "#1a120a", primary: "#c8a050", secondary: "#2a5a3a", accent: "#8a1a1a", text: "#f0e0c0" };
const SPINES = ["#6a1a14", "#1a3a5a", "#2a4a2a", "#5a3a14", "#3a1a3a", "#7a5a2a", "#1a1a1a", "#8a6a3a"];

function shelves(ctx, w, h) {
  ctx.fillStyle = "#2a1608";
  ctx.fillRect(0, 0, w, h);
  const rows = 6;
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = 4;
    const base = (r + 1) * rh - 8;
    while (x < w - 4) {
      const bw = 8 + Math.random() * 14;
      const bh = rh * (0.6 + Math.random() * 0.3);
      if (Math.random() < 0.04) {
        x += bw * 2;
        continue;
      }
      const color = SPINES[Math.floor(Math.random() * SPINES.length)];
      ctx.fillStyle = color;
      ctx.fillRect(x, base - bh, bw - 1, bh);
      // Nervures et titres dorés.
      ctx.fillStyle = "rgba(220,180,90,0.75)";
      ctx.fillRect(x + 1, base - bh + 6, bw - 3, 2);
      ctx.fillRect(x + 1, base - 10, bw - 3, 2);
      ctx.fillStyle = "rgba(220,180,90,0.5)";
      ctx.fillRect(x + bw / 2 - 1.5, base - bh * 0.7, 2, bh * 0.35);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + bw - 3, base - bh, 2, bh);
      x += bw;
    }
    // Tablette.
    ctx.fillStyle = "#4a2a12";
    ctx.fillRect(0, base, w, 8);
  }
  // Montants verticaux.
  ctx.fillStyle = "#3a200c";
  for (let x = 0; x < w; x += w / 8) ctx.fillRect(x, 0, 10, h);
}

export const library = {
  key: "bibliotheque",
  title: "Bibliothèque ancienne",
  ambient: { hemi: 0.42, sky: "#ffd9a0", ground: "#2a1608", sun: 0 },
  image: { toneMapping: "aces", exposure: 2.2, contrast: 1.1, vignette: 2.5 },
  fog: { color: "#3a2614", density: 0.02 },
  glow: 0.5,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const books = paintedTexture(scene, `${name} · rayonnages`, 2048, 1024, shelves);
    books.uScale = 1.5;
    const oak = m("chêne ciré", { diffuse: "#5a3216", specular: "#6a4a2a", power: 70 });
    const leather = m("cuir", { diffuse: "#6a1a14", specular: "#4a2a20", power: 30 });
    const brass = m("laiton", { diffuse: "#a07830", specular: "#ffe0a0", power: 90 });
    const planks = paintedTexture(scene, `${name} · plancher`, 1024, 768, (c, w, h) => {
      for (let y = 0; y < h; y += 32) {
        const v = 70 + Math.floor(Math.random() * 25);
        c.fillStyle = `rgb(${v},${Math.floor(v * 0.55)},${Math.floor(v * 0.3)})`;
        c.fillRect(0, y, w, 30);
        c.fillStyle = "#1a0c04";
        c.fillRect(0, y + 30, w, 2);
        c.fillRect((y * 13) % w, y, 2, 30);
      }
    });
    const screens = new Map();
    return {
      palette,
      floor: m("plancher", { diffuse: "#ffffff", texture: planks, specular: "#5a4030", power: 80 }),
      wall: m("rayonnages", { diffuse: "#ffffff", texture: books }),
      ceiling: m("caissons", { diffuse: "#2a1a0c" }),
      trim: oak,
      doorFrame: oak,
      door: leather,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Silence · Sortie", { color: "#e8c878", background: "#1a2a1a", font: "italic 58px serif" }) }),
      counter: oak,
      counterTop: m("sous-main", { diffuse: "#1a3a2a", specular: "#203020" }),
      backBar: m("rayonnage bar", { diffuse: "#ffffff", texture: books }),
      shelf: oak,
      glass: (i) => m(`carafe ${i}`, { diffuse: ["#8a4a10", "#c8a060", "#e0e0d0"][i % 3], specular: "#ffffff", power: 140, alpha: 0.8 }),
      seat: leather,
      tableTop: oak,
      metal: brass,
      cabinet: () => oak,
      cabinetSide: () => leather,
      panel: oak,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => brass,
      scanlines: false,
      oak, brass, leather,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Coursive : plancher étroit et balustrade le long des murs nord et ouest, à 2,6 m.
    const gy = 2.6;
    ctx.box("coursive nord", 0, gy, D / 2 - 0.4, W - 0.6, 0.08, 0.8, look.oak);
    ctx.box("main courante nord", 0, gy + 0.9, D / 2 - 0.82, W - 0.6, 0.06, 0.06, look.brass);
    for (let x = -W / 2 + 0.6; x < W / 2 - 0.3; x += 0.5) ctx.box(`balustre ${x}`, x, gy + 0.45, D / 2 - 0.82, 0.04, 0.85, 0.04, look.oak);
    // Échelle roulante appuyée sur la coursive.
    for (const dx of [-0.22, 0.22]) {
      const rail = ctx.box(`montant ${dx}`, 5.5 + dx, 1.5, D / 2 - 1.1, 0.05, 3.2, 0.05, look.oak);
      rail.rotation.x = -0.25;
    }
    for (let k = 0; k < 9; k++) {
      ctx.box(`barreau ${k}`, 5.5, 0.2 + k * 0.33, D / 2 - 1.5 + k * 0.083, 0.44, 0.03, 0.03, look.brass);
    }
    // Lampes de banquier : pied laiton, abat-jour vert émissif, lumière chaude dessous.
    const shade = std(scene, `${key} · abat-jour`, { diffuse: "#0a2a14", emissive: "#1a7a3a", specular: "#ffffff", power: 120 });
    const lamps = [[-5.2, 1.06, 3.4], [-1.6, 1.06, 3.4], [-4.6, 0.81, -2]];
    for (const [x, y, z] of lamps) {
      ctx.box(`pied ${x}`, x, y + 0.12, z, 0.03, 0.24, 0.03, look.brass);
      const s = CreateCylinder(`${key} · abat-jour ${x}`, { height: 0.08, diameterTop: 0.12, diameterBottom: 0.22, tessellation: 16 }, scene);
      s.position.copyFrom(ctx.local(x, y + 0.27, z));
      s.rotation.x = 0.35;
      ctx.add(s, shade);
    }
    ctx.point("lampes bar", -3.4, 1.4, 3.2, "#ffcf80", 1.4, 7);
    const lampTable = ctx.point("lampe table", -4.6, 1.2, -2, "#ffcf80", 1.3, 7);
    ctx.shadows(lampTable, { size: 1024, darkness: 0.25, soft: true });
    ctx.point("bornes", 5.5, 2.2, 0, "#ffb870", 0.9, 9);
    ctx.point("hauteurs", 0, H - 0.4, 0, "#ffd9a0", 0.4, 14);
    // Globe terrestre sur pied, fauteuil club près de la table.
    const globeTex = paintedTexture(scene, `${key} · globe`, 512, 256, (c, w, h) => {
      c.fillStyle = "#c8b88a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#8a6a3a";
      for (let k = 0; k < 9; k++) {
        c.beginPath();
        c.ellipse(Math.random() * w, h * (0.2 + Math.random() * 0.6), 20 + Math.random() * 60, 12 + Math.random() * 30, Math.random(), 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = "rgba(60,40,20,0.4)";
      for (let x = 0; x < w; x += 32) c.strokeRect(x, 0, 0, h);
      for (let y = 0; y < h; y += 32) c.strokeRect(0, y, w, 0);
    });
    const globe = CreateSphere(`${key} · globe`, { diameter: 0.5, segments: 24 }, scene);
    globe.position.copyFrom(ctx.local(-6.6, 1.1, 0.5));
    globe.rotation.z = 0.41;
    ctx.add(globe, std(scene, `${key} · globe`, { diffuse: "#ffffff", texture: globeTex, specular: "#4a3a2a", power: 60 }));
    ctx.box("pied du globe", -6.6, 0.42, 0.5, 0.08, 0.84, 0.08, look.oak);
    ctx.box("fauteuil assise", -6.4, 0.25, -3.2, 0.8, 0.5, 0.8, look.leather);
    ctx.box("fauteuil dossier", -6.75, 0.65, -3.2, 0.15, 0.8, 0.8, look.leather);
    ctx.box("fauteuil bras g", -6.4, 0.45, -3.55, 0.8, 0.4, 0.12, look.leather);
    ctx.box("fauteuil bras d", -6.4, 0.45, -2.85, 0.8, 0.4, 0.12, look.leather);
    ctx.mirrorFloor(look.floor, { level: 0.15, blur: 8, size: 512 });
    // Poussière dorée dans la lumière des lampes.
    const dustMat = std(scene, `${key} · poussière`, { diffuse: "#000000", emissive: "#ffd890" });
    const motes = [];
    for (let k = 0; k < 40; k++) {
      const mote = CreateSphere(`${key} · poussière ${k}`, { diameter: 0.015, segments: 3 }, scene);
      mote.isPickable = false;
      ctx.add(mote, dustMat);
      const [x, , z] = lamps[k % lamps.length];
      motes.push({ mote, x: x + (Math.random() - 0.5) * 1.2, y: 0.9 + Math.random() * 1.5, z: z + (Math.random() - 0.5) * 1.2, phase: Math.random() * 10 });
    }
    ctx.onUpdate((time) => {
      globe.rotation.y = time * 0.15;
      const origin = ctx.local(0, 0, 0);
      for (const p of motes) p.mote.position.set(origin.x + p.x + Math.sin(time * 0.2 + p.phase) * 0.2, p.y + Math.sin(time * 0.13 + p.phase * 2) * 0.2, origin.z + p.z + Math.cos(time * 0.17 + p.phase) * 0.2);
    });
  },
};
