import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Salle 46 · Palais de glace : murs taillés dans la glace (texture de blocs et de fissures, reflet de
// vernis), mobilier en blocs de glace qui réfractent la salle (PBR, réfraction par sonde), sol gelé
// poli comme un miroir, stalactites de glace, cristaux qui scintillent. Lumière froide et bleutée,
// avec une seule source chaude : un brasero près de la table.
const palette = { background: "#0a1a2a", primary: "#a8e0ff", secondary: "#ffffff", accent: "#ffb060", text: "#e8f8ff" };

function iceBlocks(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#b8e4f8");
  g.addColorStop(1, "#5aa0c8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Joints des blocs, puis fissures blanches et bulles.
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 3;
  for (let y = 0; y < h; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    for (let x = (y / 128) % 2 ? 96 : 0; x < w; x += 192) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 128);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.4})`;
    ctx.beginPath();
    let x = Math.random() * w;
    let y = Math.random() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) ctx.lineTo((x += (Math.random() - 0.5) * 60), (y += (Math.random() - 0.5) * 60));
    ctx.stroke();
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const icePalace = {
  key: "palais-de-glace",
  title: "Palais de glace",
  ambient: { hemi: 0.55, sky: "#cfefff", ground: "#2a5a7a", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.5, contrast: 1.1, vignette: 1.8 },
  fog: { color: "#9cc8e0", density: 0.02 },
  glow: 0.6,

  look(scene, name) {
    const mat = (label, options) => {
      const m = pbr(scene, `${name} · ${label}`, options);
      m.usePhysicalLightFalloff = false;
      return m;
    };
    const blocks = paintedTexture(scene, `${name} · blocs`, 1024, 512, iceBlocks);
    const wall = mat("mur de glace", { albedo: "#ffffff", roughness: 0.2, texture: blocks });
    wall.clearCoat.isEnabled = true;
    wall.clearCoat.intensity = 0.8;
    // Glace réfringente : presque transparente, indice 1,31, teinte cyan dans l'épaisseur.
    const ice = mat("glace", { albedo: "#e8f8ff", roughness: 0.05 });
    ice.subSurface.isRefractionEnabled = true;
    ice.subSurface.refractionIntensity = 0.9;
    ice.subSurface.indexOfRefraction = 1.31;
    ice.subSurface.tintColor.set(0.6, 0.85, 1);
    ice.subSurface.tintColorAtDistance = 0.6;
    const frost = mat("givre", { albedo: "#f4fbff", roughness: 0.7 });
    const furs = mat("fourrure", { albedo: "#e8e0d4", roughness: 1 });
    furs.sheen.isEnabled = true;
    furs.sheen.intensity = 0.8;
    const screens = new Map();
    return {
      palette,
      floor: mat("sol gelé", { albedo: "#4a7a9a", roughness: 0.06 }),
      wall,
      ceiling: frost,
      trim: frost,
      doorFrame: ice,
      door: mat("porte givrée", { albedo: "#c8e8f8", roughness: 0.4 }),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "❄ SORTIE ❄", { color: "#e8f8ff", background: "#2a6a9a", font: "bold 62px sans-serif", glow: 10 }) }),
      counter: ice,
      counterTop: frost,
      backBar: wall,
      shelf: ice,
      glass: (i) => mat(`verre ${i}`, { albedo: ["#a8e0ff", "#ffffff", "#c8b0ff"][i % 3], roughness: 0.05, alpha: 0.7 }),
      seat: furs,
      tableTop: ice,
      metal: ice,
      cabinet: () => ice,
      cabinetSide: () => frost,
      panel: frost,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => frost,
      scanlines: false,
      ice, frost,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Stalactites de glace.
    for (let k = 0; k < 26; k++) {
      const len = 0.2 + Math.random() * 0.7;
      const cone = CreateCylinder(`${key} · glaçon ${k}`, { height: len, diameterTop: 0.08 + Math.random() * 0.1, diameterBottom: 0, tessellation: 6 }, scene);
      cone.position.copyFrom(ctx.local((Math.random() - 0.5) * (W - 0.6), H - len / 2, (Math.random() - 0.5) * (D - 0.6)));
      ctx.add(cone, look.ice);
    }
    // Cristaux : octaèdres (sphères à 4 segments) lumineux qui scintillent dans les angles.
    const crystalMat = std(scene, `${key} · cristal`, { diffuse: "#000000", emissive: "#a8e8ff" });
    const crystals = [];
    for (const [x, z, s] of [[-7.3, -5.3, 1], [-7.1, -4.8, 0.6], [7.3, 5.3, 1.2], [6.9, 5.4, 0.7], [-7.3, 5.3, 0.9], [7.3, -5.3, 0.8]]) {
      const c = CreateSphere(`${key} · cristal ${x} ${z}`, { diameter: 0.5 * s, segments: 1 }, scene);
      c.scaling.y = 2.2;
      c.position.copyFrom(ctx.local(x, 0.5 * s, z));
      c.rotation.y = x;
      ctx.add(c, crystalMat);
      crystals.push({ c, phase: x * z });
    }
    // Brasero : seule chaleur de la salle.
    ctx.box("trépied", -6.6, 0.4, -4.5, 0.35, 0.8, 0.35, std(scene, `${key} · fer`, { diffuse: "#2a2420" }));
    const embers = std(scene, `${key} · braises`, { diffuse: "#000000", emissive: "#ff8030" });
    const bowl = CreateSphere(`${key} · vasque`, { diameter: 0.55, segments: 12, slice: 0.5 }, scene);
    bowl.rotation.x = Math.PI;
    bowl.position.copyFrom(ctx.local(-6.6, 0.95, -4.5));
    ctx.add(bowl, std(scene, `${key} · vasque`, { diffuse: "#3a2a20" }));
    ctx.box("braises", -6.6, 0.95, -4.5, 0.4, 0.04, 0.4, embers);
    const fire = ctx.point("brasero", -6.6, 1.3, -4.5, "#ff9040", 1.4, 7);
    ctx.shadows(fire, { size: 1024, darkness: 0.3, soft: true });
    // Lumière froide : grande lueur du plafond translucide, contre-jour bleu.
    ctx.point("voûte", 0, H - 0.3, 0, "#d8f0ff", 0.7, 16);
    ctx.point("bleu bar", -3, 1.2, 4.5, "#60b0ff", 0.6, 8);
    ctx.point("bleu bornes", 6, 1.5, 0, "#60b0ff", 0.5, 8);
    // Reflets et réfraction : sol miroir ; la glace reflète et réfracte une sonde (murs compris).
    ctx.mirrorFloor(look.floor, { level: 0.45, blur: 3, size: 512 });
    const probe = ctx.probe([look.ice], { level: 1, at: [0, 1.4, 0] });
    look.ice.subSurface.refractionTexture = probe.cubeTexture;
    ctx.onUpdate((time) => {
      for (const { c, phase } of crystals) c.visibility = 0.75 + 0.25 * Math.sin(time * 2.3 + phase);
      fire.intensity = 1.35 + Math.sin(time * 9) * 0.1 + Math.sin(time * 21) * 0.05;
    });
  },
};
