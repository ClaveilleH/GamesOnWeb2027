import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Échelle de réalisme : cinq salles au décor, aux couleurs et aux lumières identiques. Seule la technique
// de rendu change, des aplats sans lumière au PBR avec post-traitement photographique. On compare ainsi
// les niveaux de réalisme à décor égal.
const palette = { background: "#101820", primary: "#7fd1ff", secondary: "#ff7a59", accent: "#ffe08a", text: "#ffffff" };

// Couleurs de base, communes à tous les niveaux.
const C = {
  floor: "#8a7560", wall: "#cfc6b8", wainscot: "#5b6e74", ceiling: "#e8e2d6", trim: "#3b2f26",
  counter: "#3e5565", counterTop: "#d9d4cc", wood: "#7a5234", seat: "#a8432f", metal: "#9aa3a8",
  cabinet: ["#2f4858", "#6b3a5a", "#2f5a3a", "#5a4a2f", "#33335a"], side: "#20262b", panel: "#22282c",
  door: "#4a6a5a", glass: ["#6a8f3a", "#a0522d", "#c9d8dc", "#7a2030"],
};

// Textures des niveaux 3 à 5.
function textures(scene, name) {
  const tiles = paintedTexture(scene, `${name} · carrelage`, 1024, 1024, (ctx, w, h) => {
    const step = w / 8;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const shade = 0.9 + (((x * 7 + y * 13) / step) % 5) * 0.03;
        ctx.fillStyle = `rgb(${Math.round(138 * shade)},${Math.round(117 * shade)},${Math.round(96 * shade)})`;
        ctx.fillRect(x, y, step, step);
        for (let i = 0; i < 60; i++) {
          ctx.fillStyle = `rgba(40,30,20,${Math.random() * 0.12})`;
          ctx.fillRect(x + Math.random() * step, y + Math.random() * step, 2, 2);
        }
      }
    }
    ctx.strokeStyle = "#3a2e24";
    ctx.lineWidth = 4;
    for (let x = 0; x <= w; x += step) ctx.strokeRect(x, -2, 0, h + 4);
    for (let y = 0; y <= h; y += step) ctx.strokeRect(-2, y, w + 4, 0);
  });
  tiles.uScale = 2;
  tiles.vScale = 1.5;
  const wall = paintedTexture(scene, `${name} · mur`, 2048, 512, (ctx, w, h) => {
    ctx.fillStyle = C.wall;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(80,70,60,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    const top = h * 0.72;
    ctx.fillStyle = C.wainscot;
    ctx.fillRect(0, top, w, h - top);
    for (let x = 0; x < w; x += 64) {
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x, top, 3, h - top);
    }
    ctx.fillStyle = C.trim;
    ctx.fillRect(0, top - 6, w, 10);
  });
  const wood = paintedTexture(scene, `${name} · bois`, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = C.wood;
    ctx.fillRect(0, 0, w, h);
    for (let v = 0; v < 60; v++) {
      ctx.strokeStyle = `rgba(40,20,8,${0.08 + (v % 4) * 0.05})`;
      ctx.lineWidth = 1 + (v % 3);
      ctx.beginPath();
      const y0 = (v / 60) * h;
      ctx.moveTo(0, y0);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 + Math.sin((x + v * 31) / 50) * 5);
      ctx.stroke();
    }
  });
  return { tiles, wall, wood };
}

export function makeLook(scene, name, level) {
  const tex = level >= 3 ? textures(scene, name) : null;
  // Fabrique selon le niveau : 1 aplat, 2 diffus, 3 Blinn-Phong texturé, 4-5 PBR.
  const mat = (label, hex, { texture, glossy = 0.2, metal = false } = {}) => {
    const full = `${name} · ${label}`;
    if (level === 1) return std(scene, full, { diffuse: "#000000", emissive: hex, unlit: true });
    if (level === 2) return std(scene, full, { diffuse: hex });
    if (level === 3) {
      return std(scene, full, { diffuse: texture ? "#ffffff" : hex, texture, specular: metal ? "#ffffff" : "#555555",
        power: 16 + glossy * 200 });
    }
    const m = pbr(scene, full, { albedo: texture ? "#ffffff" : hex, texture, metallic: metal ? 1 : 0, roughness: 1 - glossy });
    // Atténuation standard : mêmes intensités qu'aux niveaux 2-3, le joueur (non PBR) n'est pas surexposé.
    m.usePhysicalLightFalloff = false;
    return m;
  };
  const screens = new Map();
  const unlit = (label, texture) => std(scene, `${name} · ${label}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true });
  const look = {
    palette,
    floor: mat("sol", C.floor, { texture: tex?.tiles, glossy: 0.55 }),
    wall: mat("mur", C.wall, { texture: tex?.wall, glossy: 0.1 }),
    ceiling: mat("plafond", C.ceiling, { glossy: 0 }),
    trim: mat("plinthe", C.trim, { glossy: 0.4 }),
    doorFrame: mat("cadre", C.trim, { glossy: 0.4 }),
    door: mat("porte", C.door, { glossy: 0.5 }),
    sign: unlit("enseigne", signTexture(scene, `${name} · enseigne`, level < 5 ? `NIVEAU ${level + 1} →` : "SUITE →", { color: "#ffffff", background: "#2a3a44" })),
    counter: mat("bar", C.counter, { glossy: 0.5 }),
    counterTop: mat("plateau", C.counterTop, { glossy: 0.85 }),
    backBar: mat("fond du bar", C.wainscot, { glossy: 0.3 }),
    shelf: mat("étagère", C.wood, { texture: tex?.wood, glossy: 0.4 }),
    seat: mat("assise", C.seat, { glossy: 0.45 }),
    tableTop: mat("table", C.wood, { texture: tex?.wood, glossy: 0.7 }),
    metal: mat("métal", C.metal, { glossy: 0.75, metal: true }),
    panel: mat("pupitre", C.panel, { glossy: 0.4 }),
    screen(i, texture) {
      if (!screens.has(i)) screens.set(i, unlit(`écran ${i}`, texture));
      return screens.get(i);
    },
    marquee: (i, texture) => unlit(`fronton ${i}`, texture),
  };
  const glass = C.glass.map((hex, i) => {
    const m = mat(`verre ${i}`, hex, { glossy: 0.95 });
    if (level >= 3) m.alpha = 0.7;
    return m;
  });
  const cabinets = C.cabinet.map((hex, i) => mat(`borne ${i}`, hex, { glossy: 0.55 }));
  const side = mat("flancs", C.side, { glossy: 0.5 });
  const buttons = ["#d23a2a", "#e8e8e8", "#e2b23a", "#2a6ad2"].map((hex, i) => mat(`bouton ${i}`, hex, { glossy: 0.8 }));
  return Object.assign(look, {
    glass: (i) => glass[i % glass.length],
    cabinet: (i) => cabinets[i % cabinets.length],
    cabinetSide: () => side,
    button: (i) => buttons[i % buttons.length],
    shiny: [look.counterTop, look.metal, look.tableTop, look.door, ...cabinets, ...glass],
  });
}

// Mêmes lumières à tous les niveaux (sauf le premier, sans éclairage).
export function lights(ctx, level) {
  const H = ctx.ROOM.height;
  const warm = "#ffe2c0";
  ctx.point("plafonnier ouest", -4.5, H - 0.3, -1, warm, 0.7, 11);
  ctx.point("plafonnier est", 3.5, H - 0.3, 0, warm, 0.7, 11);
  ctx.point("bar", -3.2, H - 0.6, 3, "#ffd9a8", 0.6, 7);
  if (level >= 3) {
    const key = ctx.spot("projecteur", [0.5, H - 0.1, -2.5], [-0.35, -1, 0.35], "#fff1dc", 1.1, 1.6, 1.2, 14);
    ctx.shadows(key, { size: 2048, darkness: level >= 4 ? 0.05 : 0.25, soft: true });
  }
}

const LEVELS = [
  { level: 1, key: "realisme-1", title: "Réalisme 1 · aplats sans lumière", ambient: { hemi: 0 }, glow: 0 },
  { level: 2, key: "realisme-2", title: "Réalisme 2 · éclairage diffus", ambient: { hemi: 0.35, sky: "#ffffff", ground: "#6a6058" }, glow: 0 },
  { level: 3, key: "realisme-3", title: "Réalisme 3 · Phong texturé et ombres", ambient: { hemi: 0.3, sky: "#ffffff", ground: "#6a6058" }, glow: 0 },
  { level: 4, key: "realisme-4", title: "Réalisme 4 · PBR et reflets", ambient: { hemi: 0.35, sky: "#fff4e6", ground: "#5a5048" },
    image: { toneMapping: "aces", exposure: 1.2, contrast: 1.1 }, glow: 0.2 },
  { level: 5, key: "realisme-5", title: "Réalisme 5 · PBR et post-traitement", ambient: { hemi: 0.35, sky: "#fff4e6", ground: "#5a5048" },
    image: { toneMapping: "aces", exposure: 1.2, contrast: 1.1 }, glow: 0 },
];

export const REALISM = LEVELS.map((spec) => ({
  ...spec,
  look: (scene, name) => makeLook(scene, name, spec.level),
  decorate(ctx) {
    if (spec.level >= 2) lights(ctx, spec.level);
    if (spec.level >= 4) {
      ctx.mirrorFloor(ctx.look.floor, { level: 0.18, blur: 24, size: 512 });
      ctx.probe(ctx.look.shiny, { level: 1, at: [0, 1.4, 0] });
    }
  },
  // Niveau 5 : occlusion ambiante, bloom, profondeur de champ légère, grain, aberration et netteté.
  post: spec.level === 5 ? (scene, camera) => {
    const ssao = new SSAO2RenderingPipeline("réalisme · occlusion", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
    ssao.radius = 1.2;
    ssao.totalStrength = 1.3;
    ssao.samples = 16;
    ssao.maxZ = 40;
    const pipeline = new DefaultRenderingPipeline("réalisme · photo", true, scene, [camera]);
    pipeline.samples = 4;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.8;
    pipeline.bloomWeight = 0.35;
    pipeline.bloomKernel = 64;
    pipeline.grainEnabled = true;
    pipeline.grain.intensity = 8;
    pipeline.grain.animated = true;
    pipeline.chromaticAberrationEnabled = true;
    pipeline.chromaticAberration.aberrationAmount = 12;
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.25;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.5;
    return () => {
      pipeline.dispose();
      ssao.dispose();
    };
  } : undefined,
}));
