import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 59 · Parking souterrain : réalisme urbain froid. Béton taché, piliers numérotés à bande
// jaune et noire, marquage au sol, tubes fluorescents à la lumière verdâtre (l'un d'eux grésille),
// sol mouillé dont les flaques reflètent les tubes, coulures d'humidité, grain de film et vignette.
const palette = { background: "#1a1e1c", primary: "#e8c020", secondary: "#9ab0a0", accent: "#30a050", text: "#e0e8e0" };

function stainedConcrete(ctx, w, h) {
  ctx.fillStyle = "#7a7e7a";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const v = 90 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgba(${v},${v + 3},${v},0.2)`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 25, 0, Math.PI * 2);
    ctx.fill();
  }
  // Coulures d'humidité depuis le plafond.
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const len = h * (0.2 + Math.random() * 0.6);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, "rgba(40,45,40,0.45)");
    g.addColorStop(1, "rgba(40,45,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 3 + Math.random() * 10, len);
  }
}

export const parking = {
  key: "parking",
  title: "Parking souterrain",
  ambient: { hemi: 0.3, sky: "#c8e0d0", ground: "#202420", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.8, contrast: 1.2, vignette: 3, saturation: -25 },
  fog: { color: "#1a201c", density: 0.03 },
  glow: 0.6,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const floor = paintedTexture(scene, `${name} · sol`, 1024, 768, (c, w, h) => {
      stainedConcrete(c, w, h);
      // Taches d'huile et marquage jaune des places.
      c.fillStyle = "rgba(20,20,20,0.35)";
      for (let i = 0; i < 12; i++) {
        c.beginPath();
        c.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 10 + Math.random() * 25, Math.random() * 3, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#c8a020";
      for (let x = w * 0.15; x < w; x += w * 0.17) c.fillRect(x, 0, 8, h * 0.3);
      c.fillRect(0, h * 0.3, w, 8);
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.font = "bold 60px sans-serif";
      c.fillText("→", w * 0.45, h * 0.6);
    });
    const concrete = paintedTexture(scene, `${name} · béton`, 1024, 512, stainedConcrete);
    const steel = m("acier galva", { diffuse: "#8a908c", specular: "#c0c8c0", power: 60 });
    const screens = new Map();
    return {
      palette,
      floor: m("sol mouillé", { diffuse: "#ffffff", texture: floor, specular: "#a0b0a0", power: 120 }),
      wall: m("béton", { diffuse: "#ffffff", texture: concrete }),
      ceiling: m("dalle", { diffuse: "#5a5e5a" }),
      trim: m("bande", { diffuse: "#c8a020" }),
      doorFrame: steel,
      door: m("porte coupe-feu", { diffuse: "#a02a20", specular: "#ffffff", power: 40 }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "🚶 SORTIE PIÉTONS", { color: "#ffffff", background: "#20a050", font: "bold 58px sans-serif" }) }),
      counter: m("comptoir", { diffuse: "#5a5e5a" }),
      counterTop: steel,
      backBar: m("grillage", { diffuse: "#4a4e4a" }),
      shelf: steel,
      glass: (i) => m(`bidon ${i}`, { diffuse: ["#a02a20", "#2a5aa0", "#c8a020"][i % 3], specular: "#ffffff", power: 60 }),
      seat: m("assise", { diffuse: "#3a3e3a" }),
      tableTop: m("touret", { diffuse: "#8a6a40" }),
      metal: steel,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#3a3e3a", "#2a3a5a"][i % 2], specular: "#808080", power: 30 }),
      cabinetSide: () => steel,
      panel: m("pupitre", { diffuse: "#202220" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", { diffuse: "#c8a020" }),
      scanlines: false,
      steel,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    // Piliers numérotés, bande de danger en pied.
    const pillarTex = paintedTexture(scene, `${key} · pilier`, 256, 512, (c, w, h) => {
      stainedConcrete(c, w, h);
      for (let x = -h; x < w + h; x += 40) {
        c.fillStyle = "#e8c020";
        c.beginPath();
        c.moveTo(x, h);
        c.lineTo(x + 20, h);
        c.lineTo(x + 20 + 60, h - 60);
        c.lineTo(x + 60, h - 60);
        c.fill();
      }
      c.fillStyle = "#1a1a1a";
      c.fillRect(0, h - 64, w, 4);
      c.fillStyle = "#e8c020";
      c.fillRect(w * 0.2, h * 0.3, w * 0.6, h * 0.18);
      c.fillStyle = "#1a1a1a";
      c.font = "bold 80px sans-serif";
      c.textAlign = "center";
      c.fillText("B2", w / 2, h * 0.45);
    });
    const pillarMat = std(scene, `${key} · pilier`, { diffuse: "#ffffff", texture: pillarTex });
    for (const [x, z] of [[-2.2, 0.8], [2.8, 1.2]]) ctx.box(`pilier ${x}`, x, H / 2, z, 0.6, H, 0.6, pillarMat);
    // Tubes fluorescents : réglettes émissives et lumières verdâtres ; l'un grésille.
    const tubeMat = std(scene, `${key} · tube`, { diffuse: "#000000", emissive: "#d8ffe8" });
    const flickerMat = std(scene, `${key} · tube défaillant`, { diffuse: "#000000", emissive: "#d8ffe8" });
    const tubes = [[-4, -2.5], [0, 3], [4, -2.5], [4, 3], [-4, 3]];
    let flicker = null;
    tubes.forEach(([x, z], k) => {
      const broken = k === 2;
      ctx.box(`réglette ${k}`, x, H - 0.08, z, 1.3, 0.06, 0.12, look.steel);
      ctx.box(`tube ${k}`, x, H - 0.13, z, 1.2, 0.04, 0.04, broken ? flickerMat : tubeMat);
      const light = ctx.point(`néon ${k}`, x, H - 0.3, z, "#c8ffd8", broken ? 0.9 : 0.75, 7);
      if (broken) flicker = light;
    });
    // Conduites de ventilation et sprinklers.
    ctx.box("gaine", 0, H - 0.35, -4.5, 14, 0.4, 0.5, look.steel);
    for (let x = -6; x <= 6; x += 3) ctx.box(`sprinkler ${x}`, x, H - 0.1, 0.5, 0.04, 0.2, 0.04, std(scene, `${key} · laiton`, { diffuse: "#a08030" }));
    // Flaques : le sol (StandardMaterial) devient un miroir partiel.
    ctx.mirrorFloor(look.floor, { level: 0.4, blur: 4 });
    ctx.onUpdate((time) => {
      // Grésillement : coupures brèves et irrégulières.
      const on = Math.sin(time * 23) + Math.sin(time * 7.3) + Math.sin(time * 1.7) > -0.6;
      flicker.intensity = on ? 0.9 : 0.05;
      flickerMat.emissiveColor.set(0.85, 1, 0.91).scaleInPlace(on ? 1 : 0.1);
    });
  },

  post(scene, camera) {
    const pipeline = new DefaultRenderingPipeline("parking · image", true, scene, [camera]);
    pipeline.grainEnabled = true;
    pipeline.grain.intensity = 12;
    pipeline.grain.animated = true;
    pipeline.chromaticAberrationEnabled = true;
    pipeline.chromaticAberration.aberrationAmount = 12;
    return () => pipeline.dispose();
  },
};
