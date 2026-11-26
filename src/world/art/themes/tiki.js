import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 50 · Bar tiki au couchant : les murs s'ouvrent sur un océan au soleil couchant (reflet doré qui
// scintille sur l'eau, îles en silhouette), comptoir en bambou sous une frange de chaume, torches tiki,
// guirlande d'ampoules colorées qui se balance, plancher de terrasse. Lumière orange rasante et rose.
const palette = { background: "#2a1020", primary: "#ff8a3d", secondary: "#2ab5a5", accent: "#ffd23f", text: "#fff4d6" };
const BULBS = ["#ff4d6d", "#ffd23f", "#2ab5a5", "#ff8a3d", "#b56dff"];

function ocean(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, "#3a2a6a");
  sky.addColorStop(0.5, "#ff6a5a");
  sky.addColorStop(1, "#ffc06a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.55);
  const sea = ctx.createLinearGradient(0, h * 0.55, 0, h);
  sea.addColorStop(0, "#c05a5a");
  sea.addColorStop(1, "#1a2a4a");
  ctx.fillStyle = sea;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
  for (const cx of [w * 0.2, w * 0.7]) {
    const sun = ctx.createRadialGradient(cx, h * 0.52, 5, cx, h * 0.52, 80);
    sun.addColorStop(0, "#fff8d0");
    sun.addColorStop(0.4, "#ffd080");
    sun.addColorStop(1, "rgba(255,180,100,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(cx - 100, h * 0.3, 200, h * 0.25);
  }
  // Îles et palmiers en silhouette sur l'horizon.
  ctx.fillStyle = "#2a1020";
  for (const [x, r] of [[0.45, 70], [0.9, 50], [0.05, 40]]) {
    ctx.beginPath();
    ctx.ellipse(w * x, h * 0.55, r * 2, r * 0.35, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(w * x - 2, h * 0.55 - r * 0.9, 4, r * 0.6);
    for (let k = 0; k < 5; k++) {
      const a = Math.PI + (k / 4) * Math.PI;
      ctx.beginPath();
      ctx.ellipse(w * x + Math.cos(a) * 16, h * 0.55 - r * 0.9 + Math.sin(a) * 6 + 6, 18, 4, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function bamboo(ctx, w, h) {
  const n = 24;
  const step = w / n;
  for (let k = 0; k < n; k++) {
    const g = ctx.createLinearGradient(k * step, 0, (k + 1) * step, 0);
    g.addColorStop(0, "#6a4a1a");
    g.addColorStop(0.4, "#d8b060");
    g.addColorStop(1, "#7a5a20");
    ctx.fillStyle = g;
    ctx.fillRect(k * step, 0, step - 2, h);
    ctx.fillStyle = "#5a3a10";
    for (let y = (k * 37) % 60; y < h; y += 90) ctx.fillRect(k * step, y, step - 2, 5);
  }
}

export const tiki = {
  key: "bar-tiki",
  title: "Bar tiki au couchant",
  ambient: { hemi: 0.5, sky: "#ff9a6a", ground: "#4a2a3a", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.6, contrast: 1.08, vignette: 1.8, saturation: 15 },
  glow: 0.7,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const sea = paintedTexture(scene, `${name} · océan`, 2048, 512, ocean);
    const cane = m("bambou", { diffuse: "#ffffff", texture: paintedTexture(scene, `${name} · bambou`, 512, 256, bamboo), specular: "#4a3a20", power: 40 });
    const deck = paintedTexture(scene, `${name} · terrasse`, 1024, 768, (c, w, h) => {
      for (let y = 0; y < h; y += 40) {
        const v = 130 + Math.floor(Math.random() * 30);
        c.fillStyle = `rgb(${v},${Math.floor(v * 0.66)},${Math.floor(v * 0.42)})`;
        c.fillRect(0, y, w, 36);
      }
    });
    const screens = new Map();
    return {
      palette,
      floor: m("terrasse", { diffuse: "#ffffff", texture: deck, specular: "#3a2a1a" }),
      wall: m("océan", { diffuse: "#000000", unlit: true, emissiveTexture: sea }),
      ceiling: m("chaume", { diffuse: "#8a6a3a" }),
      trim: cane,
      doorFrame: cane,
      door: m("porte", { diffuse: "#5a3a1a" }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Aloha → sortie", { color: "#ffd23f", background: "#2a1020", font: "bold italic 62px serif", glow: 10 }) }),
      counter: cane,
      counterTop: m("plateau verni", { diffuse: "#7a4a1a", specular: "#ffffff", power: 100 }),
      backBar: cane,
      shelf: cane,
      glass: (i) => m(`cocktail ${i}`, { diffuse: ["#ff4d6d", "#ffd23f", "#2ab5a5", "#ff8a3d"][i % 4], specular: "#ffffff", power: 120, alpha: 0.85 }),
      seat: m("assise", { diffuse: "#2ab5a5" }),
      tableTop: cane,
      metal: m("pied", { diffuse: "#3a2a1a" }),
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#2ab5a5", "#ff8a3d", "#ff4d6d"][i % 3] }),
      cabinetSide: () => cane,
      panel: m("pupitre", { diffuse: "#3a2a1a" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", { diffuse: "#ffd23f" }),
      scanlines: false,
      sea,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, height: H } } = ctx;
    const key = room.theme.key;
    // Frange de chaume au-dessus du bar : lanières qui pendent et bougent au vent.
    const straw = std(scene, `${key} · paille`, { diffuse: "#c8a060" });
    const strands = [];
    for (let k = 0; k < 44; k++) {
      const x = -6.5 + k * 0.15;
      const len = 0.35 + ((k * 7) % 5) * 0.05;
      const strand = ctx.box(`chaume ${k}`, x, 2.75 - len / 2, 3.1, 0.12, len, 0.02, straw);
      strands.push({ strand, k });
    }
    ctx.box("auvent", -3.2, 2.8, 3.6, 6.8, 0.1, 1.2, straw);
    for (const x of [-6.5, 0.1]) ctx.box(`poteau ${x}`, x, 1.4, 3.1, 0.12, 2.8, 0.12, look.trim);
    // Torches tiki : fût de bambou, coupe, flamme.
    const flame = std(scene, `${key} · flamme`, { diffuse: "#000000", emissive: "#ffa040" });
    const torches = [];
    for (const [x, z] of [[-1.5, -5.4], [1.5, -5.4], [6.8, 4.8]]) {
      const pole = CreateCylinder(`${key} · torche ${x}`, { height: 1.8, diameter: 0.07, tessellation: 10 }, scene);
      pole.position.copyFrom(ctx.local(x, 0.9, z));
      ctx.add(pole, look.trim);
      const fire = CreateSphere(`${key} · feu ${x}`, { diameter: 0.18, segments: 8 }, scene);
      fire.scaling.y = 1.8;
      fire.position.copyFrom(ctx.local(x, 1.95, z));
      ctx.add(fire, flame);
      torches.push({ fire, light: ctx.point(`torche ${x}`, x, 2.1, z, "#ff9040", 0.8, 5), phase: x });
    }
    // Guirlande d'ampoules colorées en chaînette d'un mur à l'autre.
    const bulbs = [];
    for (let k = 0; k <= 30; k++) {
      const t = k / 30;
      const x = -W / 2 + 0.5 + t * (W - 1);
      const sag = Math.sin(t * Math.PI) * 0.5;
      const bulb = CreateSphere(`${key} · ampoule ${k}`, { diameter: 0.08, segments: 8 }, scene);
      bulb.position.copyFrom(ctx.local(x, H - 0.4 - sag, -1));
      ctx.add(bulb, std(scene, `${key} · ampoule ${k}`, { diffuse: "#000000", emissive: BULBS[k % BULBS.length] }));
      bulbs.push({ bulb, base: bulb.position.y, t });
    }
    // Soleil couchant rasant venu du mur ouest, ombres longues.
    const sun = ctx.spot("soleil", [-W / 2 - 4, 1.8, 0], [1, -0.12, 0], "#ffa060", 1.6, 1.5, 1, 26);
    ctx.shadows(sun, { size: 1024, darkness: 0.3, soft: true });
    ctx.point("rose", 4, H - 0.5, 2, "#ff7aa0", 0.4, 12);
    ctx.onUpdate((time) => {
      for (const { strand, k } of strands) strand.rotation.x = Math.sin(time * 1.6 + k * 0.4) * 0.12;
      for (const { fire, light, phase } of torches) {
        fire.scaling.y = 1.8 + Math.sin(time * 10 + phase) * 0.25;
        light.intensity = 0.78 + Math.sin(time * 13 + phase) * 0.06;
      }
      for (const { bulb, base, t } of bulbs) bulb.position.y = base + Math.sin(time * 0.9 + t * 3) * 0.03 * Math.sin(t * Math.PI);
      // Scintillement du reflet sur l'eau.
      look.sea.uOffset = Math.sin(time * 0.05) * 0.004;
      look.sea.level = 1 + Math.sin(time * 2.7) * 0.03;
    });
  },
};
