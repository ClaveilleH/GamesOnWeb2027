import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 37 · Izakaya : cloisons shoji rétroéclairées (papier blanc chaud derrière une grille de bois),
// plancher clair ciré qui reflète doucement, comptoir et table en laque noire brillante, lanternes de
// papier rouge qui se balancent, rideau noren à l'entrée du bar, pétales de cerisier qui tombent.
const palette = { background: "#1a1410", primary: "#c8102e", secondary: "#f4e4c1", accent: "#ffb7c5", text: "#f4e4c1" };

// Shoji : panneaux de papier lumineux et grille de bois. Utilisée en diffuse et en émissive (la lumière
// traverse le papier, pas le bois).
function shoji(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#fff3d8");
  g.addColorStop(1, "#f0d8a8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#3a2414";
  const cols = 4;
  const rows = 6;
  for (let c = 0; c <= cols; c++) ctx.fillRect((c * w) / cols - (c % cols === 0 ? 0 : 3), 0, c % cols === 0 ? 10 : 6, h);
  for (let r = 0; r <= rows; r++) ctx.fillRect(0, (r * h) / rows - 3, w, r === 2 ? 14 : 6);
  // Bas du panneau en bois plein.
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
}

function planks(ctx, w, h) {
  for (let y = 0; y < h; y += 48) {
    const v = 175 + Math.floor(Math.random() * 25);
    ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.8)},${Math.floor(v * 0.58)})`;
    ctx.fillRect(0, y, w, 46);
    ctx.strokeStyle = "rgba(110,70,40,0.18)";
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(0, y + 8 + k * 10);
      for (let x = 0; x <= w; x += 40) ctx.lineTo(x, y + 8 + k * 10 + Math.sin(x / 90 + y) * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#6a4a30";
    ctx.fillRect(0, y + 46, w, 2);
  }
}

export const izakaya = {
  key: "izakaya",
  title: "Izakaya",
  ambient: { hemi: 0.5, sky: "#fff1d6", ground: "#5a3a20", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.7, contrast: 1.05, vignette: 1.6 },
  glow: 0.5,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const paper = paintedTexture(scene, `${name} · shoji`, 512, 512, shoji);
    paper.uScale = 2.5;
    const floor = paintedTexture(scene, `${name} · plancher`, 1024, 768, planks);
    const lacquer = m("laque noire", { diffuse: "#0a0606", specular: "#ffffff", power: 180 });
    const lightWood = m("bois clair", { diffuse: "#c8a070", specular: "#3a2a1a", power: 30 });
    const darkWood = m("bois sombre", { diffuse: "#3a2414", specular: "#2a1a10", power: 20 });
    const screens = new Map();
    return {
      palette,
      floor: m("plancher", { diffuse: "#ffffff", texture: floor, specular: "#4a3a2a", power: 60 }),
      wall: m("shoji", { diffuse: "#ffffff", texture: paper, emissiveTexture: paper, emissive: "#000000" }),
      ceiling: m("plafond", { diffuse: "#4a3020" }),
      trim: darkWood,
      doorFrame: darkWood,
      door: lightWood,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "出口 · SORTIE", { color: "#f4e4c1", background: "#3a2414", font: "bold 60px serif" }) }),
      counter: lightWood,
      counterTop: lacquer,
      backBar: darkWood,
      shelf: lightWood,
      glass: (i) => m(`flacon ${i}`, { diffuse: ["#f4e4c1", "#2a5a3a", "#c8102e", "#e8e8f0"][i % 4], specular: "#ffffff", power: 120, alpha: i % 4 === 3 ? 0.6 : 1 }),
      seat: m("coussin", { diffuse: "#6a1a1a" }),
      tableTop: lacquer,
      metal: darkWood,
      cabinet: () => lacquer,
      cabinetSide: () => lightWood,
      panel: darkWood,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", { diffuse: "#c8102e" }),
      scanlines: false,
      paper,
      lacquer,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    look.paper.level = 0.55;
    // Lanternes de papier rouge (chōchin) : cylindres bombés lumineux, cerclages sombres.
    const lanternMat = std(scene, `${key} · lanterne`, { diffuse: "#000000", emissiveTexture: paintedTexture(scene, `${key} · lanterne`, 256, 256, (c, w, h) => {
      c.fillStyle = "#d8202e";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(0,0,0,0.35)";
      for (let y = 8; y < h; y += 20) c.fillRect(0, y, w, 3);
      c.fillStyle = "#1a0a0a";
      c.font = "bold 110px serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("酒", w / 2, h / 2);
    }) });
    const lanterns = [];
    for (const [x, z] of [[-5.2, 3.2], [-2.6, 3.2], [-4.6, -2], [4, -3.5]]) {
      const lantern = CreateCylinder(`${key} · lanterne ${x}`, { height: 0.7, diameter: 0.46, tessellation: 20 }, scene);
      lantern.position.copyFrom(ctx.local(x, H - 1.45, z));
      ctx.add(lantern, lanternMat);
      ctx.box(`cerclage haut ${x}`, x, H - 1.1, z, 0.32, 0.05, 0.32, look.trim);
      ctx.box(`cerclage bas ${x}`, x, H - 1.8, z, 0.32, 0.05, 0.32, look.trim);
      ctx.box(`cordon ${x}`, x, H - 0.55, z, 0.02, 1.1, 0.02, look.trim);
      lanterns.push({ lantern, light: ctx.point(`lanterne ${x}`, x, H - 1.55, z, "#ff7a50", 0.8, 6), phase: x });
    }
    // Noren : rideau en trois bandes devant le fond du bar, qui ondule.
    const norenMat = std(scene, `${key} · noren`, { diffuse: "#1a2a4a", emissiveTexture: signTexture(scene, `${key} · noren`, "居 酒 屋", { color: "#f4e4c1", background: "#1a2a4a", font: "bold 72px serif" }) });
    norenMat.backFaceCulling = false;
    const noren = [];
    for (let k = 0; k < 3; k++) {
      noren.push(ctx.plane(`noren ${k}`, -4 + k * 0.62, H - 0.95, 5.6, 0.6, 0.9, norenMat, Math.PI));
    }
    // Reflets : plancher ciré (faible) et laque du comptoir et de la table.
    ctx.mirrorFloor(look.floor, { level: 0.18, blur: 6 });
    ctx.probe([look.lacquer], { level: 0.6, at: [-3, 1.2, 0] });
    // Pétales de cerisier qui tombent en tournoyant.
    const petalMat = std(scene, `${key} · pétale`, { diffuse: "#ffb7c5", emissive: "#5a3038" });
    petalMat.backFaceCulling = false;
    const petals = [];
    for (let k = 0; k < 50; k++) {
      const petal = CreatePlane(`${key} · pétale ${k}`, { width: 0.05, height: 0.035 }, scene);
      petal.isPickable = false;
      ctx.add(petal, petalMat);
      petals.push({ petal, x: (Math.random() - 0.5) * 14, z: (Math.random() - 0.5) * 10, speed: 0.15 + Math.random() * 0.15, phase: Math.random() * 20 });
    }
    ctx.onUpdate((time) => {
      for (const { lantern, light, phase } of lanterns) {
        lantern.rotation.z = Math.sin(time * 0.8 + phase) * 0.04;
        light.intensity = 0.72 + Math.sin(time * 2.3 + phase) * 0.04;
      }
      noren.forEach((strip, k) => { strip.rotation.x = Math.sin(time * 1.1 + k * 0.7) * 0.06; });
      const origin = ctx.local(0, 0, 0);
      for (const p of petals) {
        const y = H - ((time * p.speed + p.phase) % H);
        p.petal.position.set(origin.x + p.x + Math.sin(time * 0.9 + p.phase) * 0.4, y, origin.z + p.z + Math.cos(time * 0.7 + p.phase) * 0.3);
        p.petal.rotation.set(time * 1.3 + p.phase, time * 0.9, time * 0.7 + p.phase);
      }
    });
  },
};
