import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { pbr, signTexture, std } from "../materials.js";

// Salle 40 · Studio blanc (high-key) : tout est blanc, avec trois accents de couleur (corail, menthe,
// bleu ciel). Lumière douce et enveloppante, très peu d'ombres portées : ce sont l'occlusion ambiante
// (SSAO) et les dégradés de la lumière qui dessinent les volumes. Le sol blanc laqué reflète, les
// angles de la salle sont arrondis visuellement par l'occlusion. Exposition haute, contraste bas.
const palette = { background: "#ffffff", primary: "#ff6f61", secondary: "#88d8b0", accent: "#7ec8e3", text: "#3a3a3a" };

export const highKey = {
  key: "studio-blanc",
  title: "Studio blanc (high-key)",
  ambient: { hemi: 0.9, sky: "#ffffff", ground: "#e8e4e0", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.15, contrast: 1.05, saturation: 15 },
  glow: 0,

  look(scene, name) {
    const mat = (label, albedo, roughness = 0.5, extra = {}) => {
      const m = pbr(scene, `${name} · ${label}`, { albedo, roughness, ...extra });
      m.usePhysicalLightFalloff = false;
      return m;
    };
    const white = mat("blanc mat", "#f4f2ef", 0.8);
    const gloss = mat("blanc laqué", "#f8f6f4", 0.12);
    const coral = mat("corail", "#ff6f61", 0.35);
    const mint = mat("menthe", "#88d8b0", 0.4);
    const sky = mat("bleu ciel", "#7ec8e3", 0.3);
    const screens = new Map();
    return {
      palette,
      floor: mat("sol laqué", "#f2f0ed", 0.08),
      wall: white,
      ceiling: white,
      trim: white,
      doorFrame: white,
      door: coral,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "sortie", { color: "#3a3a3a", background: "#ffffff", font: "300 72px sans-serif" }) }),
      counter: white,
      counterTop: gloss,
      backBar: white,
      shelf: gloss,
      glass: (i) => [coral, mint, sky, gloss][i % 4],
      seat: mint,
      tableTop: gloss,
      metal: mat("acier blanc", "#e0e0e0", 0.3, { metallic: 0.6 }),
      cabinet: (i) => [white, gloss][i % 2],
      cabinetSide: (i) => [coral, mint, sky][i % 3],
      panel: white,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => [coral, mint, sky][i % 3],
      scanlines: false,
      coral, mint, sky, gloss,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    // Lumière enveloppante : trois grandes sources douces au plafond, ombre très légère de la principale.
    const main = ctx.spot("boîte à lumière", [0, H - 0.05, -1], [0, -1, 0.15], "#ffffff", 0.6, 2.6, 1, 14);
    ctx.shadows(main, { size: 1024, darkness: 0.75, soft: true });
    ctx.point("remplissage bar", -3.5, H - 0.5, 3, "#fff8f0", 0.35, 10);
    ctx.point("remplissage bornes", 5, H - 0.5, 0, "#f0f8ff", 0.35, 10);
    // Sculptures : sphères et anneau sur des socles blancs, accents de couleur.
    ctx.box("socle 1", 2.5, 0.45, 4.6, 0.6, 0.9, 0.6, look.gloss);
    ctx.box("socle 2", 3.4, 0.3, 4.8, 0.5, 0.6, 0.5, look.gloss);
    const ball = CreateSphere(`${key} · sphère corail`, { diameter: 0.5, segments: 32 }, scene);
    ball.position.copyFrom(ctx.local(2.5, 1.15, 4.6));
    ctx.add(ball, look.coral);
    const ring = CreateTorus(`${key} · anneau`, { diameter: 0.45, thickness: 0.09, tessellation: 48 }, scene);
    ring.position.copyFrom(ctx.local(3.4, 0.85, 4.8));
    ring.rotation.x = Math.PI / 2.4;
    ctx.add(ring, look.sky);
    const small = CreateSphere(`${key} · bille menthe`, { diameter: 0.2, segments: 24 }, scene);
    small.position.copyFrom(ctx.local(-4.6, 0.86, -2));
    ctx.add(small, look.mint);
    // Reflets : sol laqué (miroir doux) et sonde pour les surfaces brillantes.
    ctx.mirrorFloor(look.floor, { level: 0.3, blur: 10, size: 512 });
    ctx.probe([look.gloss, look.coral, look.sky, look.mint], { level: 0.8, at: [0, 1.4, 0] });
    ctx.onUpdate((time) => {
      ring.rotation.z = time * 0.4;
      small.position.y = ctx.local(0, 0.86 + Math.abs(Math.sin(time * 2.2)) * 0.25, 0).y;
    });
  },

  // Occlusion ambiante marquée (elle fait tout le dessin des volumes), bloom doux, netteté.
  post(scene, camera) {
    const ssao = new SSAO2RenderingPipeline("studio · occlusion", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
    ssao.radius = 1.6;
    ssao.totalStrength = 1.6;
    ssao.samples = 16;
    ssao.maxZ = 40;
    const pipeline = new DefaultRenderingPipeline("studio · image", true, scene, [camera]);
    pipeline.samples = 4;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.9;
    pipeline.bloomWeight = 0.25;
    pipeline.bloomKernel = 64;
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.2;
    return () => {
      pipeline.dispose();
      ssao.dispose();
    };
  },
};
