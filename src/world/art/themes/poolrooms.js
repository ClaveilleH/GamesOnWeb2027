import { Engine } from "@babylonjs/core/Engines/engine";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 74 · Piscine liminale : un espace vide et trop propre, carrelé de blanc du sol au plafond, inondé
// de quelques centimètres d'eau claire. Lumière laiteuse sans source visible, caustiques qui ondulent sur
// le fond carrelé, reflets dans l'eau, joints réguliers à perte de vue. Le mobilier est blanc ou carrelé
// lui aussi, et seul un bleu-vert d'eau colore l'ensemble. Légère surexposition, bloom doux.
const palette = { background: "#e8f4f4", primary: "#40b0c0", secondary: "#ffffff", accent: "#ffd060", text: "#305060" };

function tiles(ctx, w, h, { tint = "#f4f8f8", joint = "#b8c8c8" } = {}) {
  ctx.fillStyle = joint;
  ctx.fillRect(0, 0, w, h);
  const n = 8;
  const s = w / n;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    const v = Math.random() * 6;
    ctx.fillStyle = tint;
    ctx.globalAlpha = 1;
    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
    ctx.fillStyle = `rgba(0,0,0,${v / 255})`;
    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
  }
}

function caustics(ctx, w, h) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  // Réseau de lignes ondulées entrecroisées, comme la lumière focalisée par les vaguelettes.
  ctx.strokeStyle = "rgba(200,255,255,0.55)";
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 18; i++) {
      ctx.lineWidth = 1.5 + Math.random() * 2.5;
      ctx.beginPath();
      const o = (i / 18) * (k ? w : h);
      for (let t = 0; t <= 1.001; t += 0.02) {
        const a = t * (k ? h : w);
        const b = o + Math.sin(t * 14 + i * 1.7) * 9 + Math.sin(t * 31 + i) * 4;
        if (k) ctx.lineTo(b, a);
        else ctx.lineTo(a, b);
      }
      ctx.stroke();
    }
  }
}

export const poolrooms = {
  key: "piscine-liminale",
  title: "Piscine liminale",
  ambient: { hemi: 0.7, sky: "#ffffff", ground: "#a0d8d8", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.15, contrast: 1.1 },
  fog: { color: "#d8eeee", density: 0.008 },
  glow: 0,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const wallTiles = paintedTexture(scene, `${name} · faïence`, 512, 512, tiles);
    wallTiles.uScale = 6;
    wallTiles.vScale = 2;
    const floorTiles = paintedTexture(scene, `${name} · fond`, 512, 512, (c, w, h) => tiles(c, w, h, { tint: "#b8e4e8", joint: "#5a9aa0" }));
    floorTiles.uScale = 6;
    floorTiles.vScale = 4.5;
    const ceramic = m("céramique", { diffuse: "#ffffff", texture: paintedTexture(scene, `${name} · carreaux`, 256, 256, tiles), specular: "#ffffff", power: 120 });
    const screens = new Map();
    return {
      palette,
      floor: m("fond carrelé", { diffuse: "#ffffff", texture: floorTiles, specular: "#ffffff", power: 160 }),
      wall: m("faïence", { diffuse: "#ffffff", texture: wallTiles, specular: "#ffffff", power: 100 }),
      ceiling: m("plafond", { diffuse: "#ffffff", texture: wallTiles }),
      trim: m("frise", { diffuse: "#40a0b0" }),
      doorFrame: ceramic,
      door: m("porte", { diffuse: "#f0f4f4" }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE", { color: "#305060", background: "#f4f8f8", font: "300 76px sans-serif" }) }),
      counter: ceramic,
      counterTop: m("plateau", { diffuse: "#ffffff", specular: "#ffffff", power: 160 }),
      backBar: ceramic,
      shelf: m("étagère", { diffuse: "#ffffff" }),
      glass: () => m("flacon", { diffuse: "#a0e0e0", specular: "#ffffff", power: 160, alpha: 0.6 }),
      seat: m("assise", { diffuse: "#ffffff" }),
      tableTop: ceramic,
      metal: m("inox", { diffuse: "#d0d8d8", specular: "#ffffff", power: 140 }),
      cabinet: () => ceramic,
      cabinetSide: () => m("flanc", { diffuse: "#f0f4f4" }),
      panel: m("pupitre", { diffuse: "#e0e8e8" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", { diffuse: "#40a0b0" }),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D } } = ctx;
    const key = room.theme.key;
    // Eau : nappe translucide bleu-vert juste au-dessus du fond, et deux couches de caustiques qui dérivent.
    const water = std(scene, `${key} · eau`, { diffuse: "#30a8b8", specular: "#ffffff", power: 200, alpha: 0.4 });
    const sheet = ctx.plane("eau", 0, 0.06, 0, W, D, water, 0);
    sheet.rotation.x = Math.PI / 2;
    const layers = [0, 1].map((k) => {
      const tex = paintedTexture(scene, `${key} · caustiques ${k}`, 512, 512, caustics);
      tex.uScale = 5;
      tex.vScale = 4;
      const mat = std(scene, `${key} · caustiques ${k}`, { diffuse: "#000000", unlit: true, emissiveTexture: tex });
      mat.alphaMode = Engine.ALPHA_ADD;
      mat.alpha = 0.7;
      mat.disableDepthWrite = true;
      ctx.noGlow(mat);
      const plane = ctx.plane(`caustiques ${k}`, 0, 0.02 + k * 0.005, 0, W, D, mat, 0);
      plane.rotation.x = Math.PI / 2;
      return tex;
    });
    // Le fond (sous l'eau) reflète la salle : miroir plan atténué.
    ctx.mirrorFloor(look.floor, { level: 0.35, blur: 3 });
    // Lumière laiteuse : plafonniers diffus, aucun point chaud.
    for (const [x, z] of [[-4, -2], [4, -2], [-4, 3], [4, 3]]) ctx.point(`diffus ${x} ${z}`, x, 3.8, z, "#f0ffff", 0.3, 10);
    ctx.onUpdate((time) => {
      layers[0].uOffset = (time * 0.012) % 1;
      layers[0].vOffset = (time * 0.007) % 1;
      layers[1].uOffset = (-time * 0.009) % 1;
      layers[1].vOffset = (time * 0.013) % 1;
    });
  },

  post(scene, camera) {
    const pipeline = new DefaultRenderingPipeline("piscine · image", true, scene, [camera]);
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.75;
    pipeline.bloomWeight = 0.35;
    pipeline.bloomKernel = 96;
    return () => pipeline.dispose();
  },
};
