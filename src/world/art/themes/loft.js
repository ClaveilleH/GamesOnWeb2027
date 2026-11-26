import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Salle 52 · Loft industriel, lumière du jour : réalisme diurne. Béton brut banché (trous de banche,
// nuances), verrière d'atelier à petits carreaux sur le mur ouest qui laisse entrer un soleil franc et
// un ciel bleuté, béton ciré au sol qui reflète la verrière, acier noir, bois brut, plantes vertes.
// Rendu : PBR, ombres douces du soleil, occlusion ambiante, bloom léger sur la verrière.
const palette = { background: "#e8e6e2", primary: "#2a2a2a", secondary: "#c87a3a", accent: "#3a7a4a", text: "#2a2a2a" };

function concrete(ctx, w, h, { holes = true } = {}) {
  ctx.fillStyle = "#9a958e";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    const v = 130 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${v},${v - 3},${v - 8},0.25)`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 22, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!holes) return;
  // Panneaux de banche et trous de tiges.
  ctx.strokeStyle = "rgba(60,58,55,0.35)";
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += w / 6) ctx.strokeRect(x, 0, w / 6, h / 2);
  for (let x = 0; x < w; x += w / 6) ctx.strokeRect(x, h / 2, w / 6, h / 2);
  ctx.fillStyle = "rgba(50,48,45,0.6)";
  for (let x = w / 12; x < w; x += w / 6) {
    for (const y of [h / 4, (3 * h) / 4]) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export const loft = {
  key: "loft-industriel",
  title: "Loft industriel (jour)",
  ambient: { hemi: 0.5, sky: "#cfe0ff", ground: "#8a8278", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.35, contrast: 1.05 },
  glow: 0,

  look(scene, name) {
    const mat = (label, options) => {
      const m = pbr(scene, `${name} · ${label}`, options);
      m.usePhysicalLightFalloff = false;
      return m;
    };
    const wallTex = paintedTexture(scene, `${name} · béton`, 1024, 512, concrete);
    const floorTex = paintedTexture(scene, `${name} · béton ciré`, 1024, 768, (c, w, h) => concrete(c, w, h, { holes: false }));
    const steel = mat("acier noir", { albedo: "#1e1e20", metallic: 0.8, roughness: 0.45 });
    const wood = mat("bois brut", { albedo: "#8a6440", roughness: 0.7 });
    const leather = mat("cuir fauve", { albedo: "#a0602a", roughness: 0.55 });
    const screens = new Map();
    return {
      palette,
      floor: mat("béton ciré", { albedo: "#ffffff", roughness: 0.18, texture: floorTex }),
      wall: mat("béton banché", { albedo: "#ffffff", roughness: 0.9, texture: wallTex }),
      ceiling: mat("plafond", { albedo: "#7a7670", roughness: 0.9 }),
      trim: steel,
      doorFrame: steel,
      door: wood,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EXIT", { color: "#2a2a2a", background: "#e8e6e2", font: "bold 80px sans-serif" }) }),
      counter: wood,
      counterTop: steel,
      backBar: steel,
      shelf: wood,
      glass: (i) => mat(`bouteille ${i}`, { albedo: ["#3a5a2a", "#6a3a10", "#d8d0c0"][i % 3], roughness: 0.08, alpha: 0.8 }),
      seat: leather,
      tableTop: wood,
      metal: steel,
      cabinet: () => steel,
      cabinetSide: () => wood,
      panel: steel,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => leather,
      scanlines: false,
      steel,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, height: H } } = ctx;
    const key = room.theme.key;
    // Verrière d'atelier : grand panneau de ciel lumineux et grille d'acier à petits carreaux.
    const skyMat = std(scene, `${key} · ciel`, { diffuse: "#000000", unlit: true, emissiveTexture: paintedTexture(scene, `${key} · ciel`, 512, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#9ec4f0");
      g.addColorStop(0.7, "#dceaf8");
      g.addColorStop(1, "#c8c0b0");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(255,255,255,0.8)";
      for (const [x, y, r] of [[0.2, 0.3, 40], [0.28, 0.28, 30], [0.7, 0.22, 50], [0.78, 0.25, 34]]) {
        c.beginPath();
        c.ellipse(w * x, h * y, r * 1.6, r * 0.6, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#8a9aa8";
      c.fillRect(0, h * 0.82, w, h * 0.18);
    }) });
    const span = 8;
    ctx.plane("verrière", -W / 2 + 0.02, 2.2, 0, span, 2.8, skyMat, -Math.PI / 2);
    for (let k = 0; k <= 16; k++) ctx.box(`meneau ${k}`, -W / 2 + 0.05, 2.2, -span / 2 + (k * span) / 16, 0.05, 2.8, 0.04, look.steel);
    for (let k = 0; k <= 6; k++) ctx.box(`traverse ${k}`, -W / 2 + 0.05, 0.8 + (k * 2.8) / 6, 0, 0.05, 0.04, span, look.steel);
    // Soleil franc par la verrière et ciel bleuté en remplissage.
    const sun = ctx.spot("soleil", [-W / 2 - 5, 6, -1.5], [1, -0.85, 0.25], "#fff2dc", 2.2, 1.2, 1, 30);
    ctx.shadows(sun, { size: 2048, darkness: 0.25, soft: true });
    ctx.point("ciel", -W / 2 + 1.5, 2.2, 0, "#cfe0ff", 0.5, 12);
    // Suspensions industrielles éteintes, poutre IPN, plantes en pot.
    ctx.box("poutre", 0, H - 0.15, 0, W - 0.4, 0.3, 0.2, look.steel);
    for (const x of [-4, 0, 4]) {
      ctx.box(`câble ${x}`, x, H - 0.7, 0, 0.01, 0.9, 0.01, look.steel);
      const shade = CreateCylinder(`${key} · suspension ${x}`, { height: 0.25, diameterTop: 0.1, diameterBottom: 0.45, tessellation: 24 }, scene);
      shade.position.copyFrom(ctx.local(x, H - 1.25, 0));
      ctx.add(shade, look.steel);
    }
    const leaf = pbr(scene, `${key} · feuillage`, { albedo: "#3a7a3a", roughness: 0.6 });
    leaf.usePhysicalLightFalloff = false;
    const pot = pbr(scene, `${key} · pot`, { albedo: "#c87a3a", roughness: 0.8 });
    pot.usePhysicalLightFalloff = false;
    for (const [x, z, s] of [[-7.1, -5.1, 1.2], [-7.1, 4.6, 0.9], [7.1, 5.1, 1]]) {
      const p = CreateCylinder(`${key} · pot ${x} ${z}`, { height: 0.5 * s, diameterTop: 0.5 * s, diameterBottom: 0.35 * s, tessellation: 20 }, scene);
      p.position.copyFrom(ctx.local(x, 0.25 * s, z));
      ctx.add(p, pot);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const l = CreateSphere(`${key} · feuille ${x} ${z} ${k}`, { diameter: 0.6 * s, segments: 8 }, scene);
        l.scaling.set(0.35, 1, 0.12);
        l.rotation.set(0.5 * Math.cos(a), a, 0.5 * Math.sin(a));
        l.position.copyFrom(ctx.local(x + Math.cos(a) * 0.15 * s, 0.75 * s, z + Math.sin(a) * 0.15 * s));
        ctx.add(l, leaf);
      }
    }
    ctx.mirrorFloor(look.floor, { level: 0.25, blur: 10, size: 512 });
  },

  post(scene, camera) {
    const ssao = new SSAO2RenderingPipeline("loft · occlusion", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
    ssao.radius = 1.2;
    ssao.totalStrength = 1.2;
    ssao.samples = 16;
    ssao.maxZ = 40;
    const pipeline = new DefaultRenderingPipeline("loft · image", true, scene, [camera]);
    pipeline.samples = 4;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.85;
    pipeline.bloomWeight = 0.3;
    pipeline.bloomKernel = 64;
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.2;
    return () => {
      pipeline.dispose();
      ssao.dispose();
    };
  },
};
