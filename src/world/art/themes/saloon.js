import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { Engine } from "@babylonjs/core/Engines/engine";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 44 · Saloon : planches patinées et délavées, comptoir massif avec barre de pied en laiton, lustre
// en roue de chariot garni de bougies, portes battantes qui oscillent, affiche « recherché ». Le soleil de
// fin d'après-midi entre en biais par deux fenêtres : faisceaux poussiéreux et grains de poussière.
// Étalonnage sépia (saturation basse, teinte ocre).
const palette = { background: "#2a1a0c", primary: "#d9a441", secondary: "#8a4a1a", accent: "#f4e2b8", text: "#f4e2b8" };

function boards(ctx, w, h, { vertical = false, base = 120, n = 14 } = {}) {
  const step = (vertical ? w : h) / n;
  for (let k = 0; k < n; k++) {
    const v = base + Math.floor(Math.random() * 40) - 20;
    ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.7)},${Math.floor(v * 0.45)})`;
    if (vertical) ctx.fillRect(k * step, 0, step - 3, h);
    else ctx.fillRect(0, k * step, w, step - 3);
    // Fibres et nœuds.
    ctx.strokeStyle = "rgba(40,20,5,0.25)";
    for (let f = 0; f < 3; f++) {
      ctx.beginPath();
      for (let t = 0; t <= (vertical ? h : w); t += 30) {
        const a = k * step + 3 + f * (step / 4) + Math.sin(t / 50 + f + k) * 2;
        if (vertical) ctx.lineTo(a, t);
        else ctx.lineTo(t, a);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(30,15,5,0.6)";
    ctx.beginPath();
    const p = Math.random() * (vertical ? h : w);
    if (vertical) ctx.ellipse(k * step + step / 2, p, 3, 6, 0, 0, Math.PI * 2);
    else ctx.ellipse(p, k * step + step / 2, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const saloon = {
  key: "saloon",
  title: "Saloon",
  ambient: { hemi: 0.4, sky: "#ffd9a0", ground: "#5a3a1a", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.7, contrast: 1.15, vignette: 2.8, saturation: -35, tint: { hue: 35, density: 30 } },
  fog: { color: "#a07848", density: 0.018 },
  glow: 0.4,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const planks = m("planches", { diffuse: "#ffffff", texture: paintedTexture(scene, `${name} · planches`, 1024, 512, (c, w, h) => boards(c, w, h, { vertical: true, base: 130, n: 48 })) });
    const floor = m("plancher", { diffuse: "#ffffff", texture: paintedTexture(scene, `${name} · plancher`, 1024, 768, (c, w, h) => boards(c, w, h, { base: 100, n: 40 })), specular: "#201008" });
    const dark = m("bois sombre", { diffuse: "#4a2a12", specular: "#3a2010", power: 30 });
    const brass = m("laiton", { diffuse: "#a07830", specular: "#ffe0a0", power: 80 });
    const screens = new Map();
    return {
      palette,
      floor,
      wall: planks,
      ceiling: m("plafond", { diffuse: "#3a2410" }),
      trim: dark,
      doorFrame: dark,
      door: dark,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EXIT", { color: "#f4e2b8", background: "#3a2410", font: "bold 84px serif" }) }),
      counter: dark,
      counterTop: m("plateau", { diffuse: "#6a3a18", specular: "#ffffff", power: 90 }),
      backBar: dark,
      shelf: dark,
      glass: (i) => m(`bouteille ${i}`, { diffuse: ["#6a3a10", "#3a5a2a", "#c8a060", "#e0d8c8"][i % 4], specular: "#ffffff", power: 120, alpha: 0.85 }),
      seat: dark,
      tableTop: m("table", { diffuse: "#5a3418", specular: "#3a2010", power: 40 }),
      metal: m("fer", { diffuse: "#2a2420", specular: "#605040" }),
      cabinet: () => dark,
      cabinetSide: () => planks,
      panel: m("pupitre", { diffuse: "#3a2410" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => brass,
      scanlines: false,
      brass,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Barre de pied en laiton le long du comptoir et crachoir.
    const rail = CreateCylinder(`${key} · barre`, { height: 6.2, diameter: 0.05, tessellation: 12 }, scene);
    rail.rotation.z = Math.PI / 2;
    rail.position.copyFrom(ctx.local(-3.2, 0.18, 2.7));
    ctx.add(rail, look.brass);
    const spittoon = CreateCylinder(`${key} · crachoir`, { height: 0.25, diameterTop: 0.22, diameterBottom: 0.3, tessellation: 20 }, scene);
    spittoon.position.copyFrom(ctx.local(0.4, 0.125, 2.6));
    ctx.add(spittoon, look.brass);
    // Lustre en roue de chariot : jante, rayons, bougies.
    const wheel = new TransformNode(`${key} · lustre`, scene);
    wheel.position.copyFrom(ctx.local(-1, H - 0.9, 0));
    const rim = CreateTorus(`${key} · jante`, { diameter: 1.4, thickness: 0.07, tessellation: 40 }, scene);
    rim.parent = wheel;
    ctx.add(rim, look.trim);
    const flame = std(scene, `${key} · flamme`, { diffuse: "#000000", emissive: "#ffc060" });
    const wax = std(scene, `${key} · cire`, { diffuse: "#f0e8d0" });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const spoke = ctx.box(`rayon ${k}`, 0, 0, 0, 0.7, 0.04, 0.04, look.trim);
      spoke.parent = wheel;
      spoke.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
      spoke.rotation.y = -a;
      const candle = CreateCylinder(`${key} · bougie ${k}`, { height: 0.14, diameter: 0.04, tessellation: 8 }, scene);
      candle.parent = wheel;
      candle.position.set(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7);
      ctx.add(candle, wax);
      const fire = CreateSphere(`${key} · flamme ${k}`, { diameter: 0.035, segments: 6 }, scene);
      fire.parent = wheel;
      fire.scaling.y = 1.7;
      fire.position.set(Math.cos(a) * 0.7, 0.2, Math.sin(a) * 0.7);
      ctx.add(fire, flame);
    }
    for (const [dx, dz] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) {
      const chain = ctx.box(`chaîne ${dx} ${dz}`, -1 + dx * 0.4, H - 0.45, dz * 0.4, 0.015, 0.9, 0.015, look.metal);
      chain.rotation.set(dz * 0.5, 0, -dx * 0.5);
    }
    const chandelier = ctx.point("lustre", -1, H - 0.8, 0, "#ffb860", 0.8, 9);
    // Portes battantes dans l'encadrement de la sortie.
    const doors = [];
    for (const side of [-1, 1]) {
      const hinge = new TransformNode(`${key} · gond ${side}`, scene);
      hinge.position.copyFrom(ctx.local(side * 0.55, 1.15, -D / 2 + 0.22));
      const leaf = ctx.box(`battant ${side}`, 0, 0, 0, 0.52, 0.9, 0.04, look.trim);
      leaf.parent = hinge;
      leaf.position.set(-side * 0.27, 0, 0);
      doors.push({ hinge, side });
    }
    // Affiche « recherché » sur le mur est.
    const wanted = paintedTexture(scene, `${key} · affiche`, 384, 512, (c, w, h) => {
      c.fillStyle = "#e8d4a8";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#3a2410";
      c.textAlign = "center";
      c.font = "bold 64px serif";
      c.fillText("WANTED", w / 2, 80);
      c.strokeStyle = "#3a2410";
      c.lineWidth = 4;
      c.strokeRect(70, 110, w - 140, 230);
      c.beginPath();
      c.arc(w / 2, 200, 55, 0, Math.PI * 2);
      c.stroke();
      c.font = "bold 40px serif";
      c.fillText("$ 5 000", w / 2, 410);
      c.font = "italic 28px serif";
      c.fillText("mort ou vif", w / 2, 460);
    });
    ctx.plane("affiche", W / 2 - 0.03, 2.1, -4.5, 0.7, 0.95, std(scene, `${key} · affiche`, { diffuse: "#ffffff", texture: wanted }), Math.PI / 2);
    // Fenêtres du mur ouest : lumière dorée qui entre en biais, faisceaux poussiéreux.
    const glare = std(scene, `${key} · fenêtre`, { diffuse: "#000000", emissive: "#fff0c0" });
    const beamTex = paintedTexture(scene, `${key} · faisceau`, 64, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(255,220,150,0.22)");
      g.addColorStop(1, "rgba(255,220,150,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    for (const z of [-2.5, 1.5]) {
      ctx.plane(`fenêtre ${z}`, -W / 2 + 0.02, 2.2, z, 1.2, 1.2, glare, -Math.PI / 2);
      ctx.box(`croisée ${z}`, -W / 2 + 0.05, 2.2, z, 0.05, 1.25, 0.06, look.trim);
      ctx.box(`traverse ${z}`, -W / 2 + 0.05, 2.2, z, 0.05, 0.06, 1.25, look.trim);
      const mat = std(scene, `${key} · faisceau ${z}`, { diffuse: "#000000", emissiveTexture: beamTex, unlit: true });
      mat.opacityTexture = beamTex;
      mat.alphaMode = Engine.ALPHA_ADD;
      mat.backFaceCulling = false;
      mat.disableDepthWrite = true;
      const beam = ctx.box(`faisceau ${z}`, -W / 2 + 2.2, 1.3, z, 4.6, 1.2, 1.2, mat);
      beam.rotation.z = -0.5;
      beam.isPickable = false;
      ctx.noGlow(beam);
    }
    const sun = ctx.spot("soleil", [-W / 2 - 3, 4.2, -0.5], [1, -0.55, 0.05], "#ffd090", 2.2, 1.1, 1, 22);
    ctx.shadows(sun, { size: 1024, darkness: 0.35, soft: true });
    // Poussière en suspension dans la lumière.
    const dustMat = std(scene, `${key} · poussière`, { diffuse: "#000000", emissive: "#ffe8b0" });
    const motes = [];
    for (let k = 0; k < 45; k++) {
      const mote = CreateSphere(`${key} · poussière ${k}`, { diameter: 0.02, segments: 3 }, scene);
      mote.isPickable = false;
      ctx.add(mote, dustMat);
      motes.push({ mote, x: -W / 2 + 0.5 + Math.random() * 4, y: 0.4 + Math.random() * 2.6, z: -3.5 + Math.random() * 6, phase: Math.random() * 10 });
    }
    ctx.onUpdate((time) => {
      wheel.rotation.y = Math.sin(time * 0.3) * 0.05;
      chandelier.intensity = 0.78 + Math.sin(time * 7) * 0.03 + Math.sin(time * 17) * 0.02;
      for (const { hinge, side } of doors) hinge.rotation.y = side * Math.sin(time * 1.1) * 0.35 * Math.exp(-((time % 9) / 3));
      const origin = ctx.local(0, 0, 0);
      for (const p of motes) {
        p.mote.position.set(origin.x + p.x + Math.sin(time * 0.2 + p.phase) * 0.3, p.y + Math.sin(time * 0.15 + p.phase * 3) * 0.2, origin.z + p.z + Math.cos(time * 0.18 + p.phase) * 0.3);
      }
    });
  },
};
