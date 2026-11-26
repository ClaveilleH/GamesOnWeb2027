import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 78 · Pays des bonbons : tout semble en sucre. Murs à rayures obliques de sucre d'orge, sol en
// damier de guimauve laquée qui reflète, sucettes géantes en spirale, boules de gomme, beignets glacés
// à vermicelles, nuages de barbe à papa au plafond. Pastels saturés, reflets très brillants partout.
const palette = { background: "#ffe8f4", primary: "#ff5aa0", secondary: "#5ad0e0", accent: "#ffe060", text: "#a02a60" };
const SWEETS = ["#ff5aa0", "#5ad0e0", "#ffe060", "#a0e070", "#c080ff", "#ff9a5a"];

function candyStripes(ctx, w, h) {
  ctx.fillStyle = "#fff4f8";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 4);
  for (let k = -40; k < 40; k++) {
    ctx.fillStyle = k % 2 ? "#ff6aa8" : "#fff4f8";
    ctx.fillRect(k * 24, -w, 24, w * 2);
  }
  ctx.restore();
}

function spiral(ctx, w, h) {
  ctx.fillStyle = "#fff4f8";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = SWEETS[k % 3];
    ctx.beginPath();
    for (let t = 0; t < 1; t += 0.005) {
      const a = t * Math.PI * 6 + (k * Math.PI) / 3;
      ctx.lineTo(Math.cos(a) * t * w * 0.5, Math.sin(a) * t * w * 0.5);
    }
    for (let t = 1; t > 0; t -= 0.005) {
      const a = t * Math.PI * 6 + (k * Math.PI) / 3 + 0.5;
      ctx.lineTo(Math.cos(a) * t * w * 0.5, Math.sin(a) * t * w * 0.5);
    }
    ctx.fill();
  }
}

export const candy = {
  key: "bonbons",
  title: "Pays des bonbons",
  ambient: { hemi: 0.75, sky: "#fff0f8", ground: "#ffc0e0", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.3, contrast: 1.05, saturation: 20 },
  glow: 0.3,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, { specular: "#ffffff", power: 160, ...options });
    const checker = paintedTexture(scene, `${name} · damier`, 256, 256, (c, w, h) => {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        c.fillStyle = (x + y) % 2 ? "#ffd0e8" : "#d0f4f8";
        c.fillRect((x * w) / 2, (y * h) / 2, w / 2, h / 2);
      }
    });
    checker.uScale = 8;
    checker.vScale = 6;
    const stripes = paintedTexture(scene, `${name} · sucre d'orge`, 512, 512, candyStripes);
    stripes.uScale = 4;
    stripes.vScale = 1.5;
    const icing = m("glaçage", { diffuse: "#fff4f8" });
    const screens = new Map();
    return {
      palette,
      floor: m("guimauve laquée", { diffuse: "#ffffff", texture: checker }),
      wall: m("sucre d'orge", { diffuse: "#ffffff", texture: stripes }),
      ceiling: m("plafond", { diffuse: "#d8c0ff" }),
      trim: m("réglisse", { diffuse: "#ff5aa0" }),
      doorFrame: m("cadre", { diffuse: "#5ad0e0" }),
      door: m("porte chocolat", { diffuse: "#6a3a20", power: 60 }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "♥ sortie ♥", { color: "#ff5aa0", background: "#fff4f8", font: "bold italic 70px sans-serif", glow: 4 }) }),
      counter: m("comptoir", { diffuse: "#5ad0e0" }),
      counterTop: icing,
      backBar: m("fond", { diffuse: "#ffb0d0" }),
      shelf: icing,
      glass: (i) => m(`bocal ${i}`, { diffuse: SWEETS[i % 6], alpha: 0.8 }),
      seat: m("assise", { diffuse: "#ffe060" }),
      tableTop: icing,
      metal: m("pied", { diffuse: "#ff5aa0" }),
      cabinet: (i) => m(`borne ${i}`, { diffuse: SWEETS[i % 6] }),
      cabinetSide: () => icing,
      panel: m("pupitre", { diffuse: "#6a3a20" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: SWEETS[i % 6] }),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    const gloss = (label, hex) => std(scene, `${key} · ${label}`, { diffuse: hex, specular: "#ffffff", power: 200 });
    // Sucettes géantes : bâton blanc et disque à spirale, tournées vers la salle.
    const swirl = std(scene, `${key} · spirale`, { diffuse: "#ffffff", texture: paintedTexture(scene, `${key} · spirale`, 512, 512, spiral), specular: "#ffffff", power: 200 });
    for (const [x, z, yaw, h] of [[-7.2, -5, 0.8, 2.6], [7.2, 5.2, -2.4, 3], [-7.2, 5, 2.4, 2.2]]) {
      const stick = CreateCylinder(`${key} · bâton ${x} ${z}`, { height: h, diameter: 0.08, tessellation: 12 }, scene);
      stick.position.copyFrom(ctx.local(x, h / 2, z));
      ctx.add(stick, gloss("bâton", "#fff8f8"));
      // Deux disques dos à dos (face avant et face arrière) portent la spirale ; une tranche les borde.
      for (const flip of [0, Math.PI]) {
        const disc = CreateDisc(`${key} · sucette ${x} ${z} ${flip}`, { radius: 0.55, tessellation: 48 }, scene);
        disc.rotation.set(0, yaw + flip, 0);
        disc.position.copyFrom(ctx.local(x, h + 0.5, z));
        disc.position.x += Math.sin(yaw + flip) * -0.05;
        disc.position.z += Math.cos(yaw + flip) * -0.05;
        ctx.add(disc, swirl);
      }
      const rim = CreateCylinder(`${key} · tranche ${x} ${z}`, { height: 0.1, diameter: 1.1, tessellation: 48, cap: 0 }, scene);
      rim.rotation.set(Math.PI / 2, yaw, 0);
      rim.position.copyFrom(ctx.local(x, h + 0.5, z));
      ctx.add(rim, gloss("tranche", "#ff8ac0"));
    }
    // Boules de gomme sur le bar et beignets glacés sur la table.
    for (let k = 0; k < 14; k++) {
      const ball = CreateSphere(`${key} · gomme ${k}`, { diameter: 0.12, segments: 12 }, scene);
      ball.position.copyFrom(ctx.local(-3.2 + k * 0.28, 1.18, 3.6 + (k % 2) * 0.1));
      ctx.add(ball, gloss(`gomme ${k % 6}`, ["#ff5aa0", "#5ad0e0", "#ffe060", "#a0e070", "#c080ff", "#ff9a5a"][k % 6]));
    }
    for (const [dx, dz] of [[-0.3, 0], [0.3, 0.15], [0, -0.3]]) {
      const donut = CreateTorus(`${key} · beignet ${dx}`, { diameter: 0.26, thickness: 0.1, tessellation: 24 }, scene);
      donut.position.copyFrom(ctx.local(-4.6 + dx, 0.84, -2 + dz));
      ctx.add(donut, gloss(`beignet ${dx}`, dx > 0 ? "#ff9ac8" : "#8a5a3a"));
    }
    // Nuages de barbe à papa au plafond.
    const floss = std(scene, `${key} · barbe à papa`, { diffuse: "#ffc8e8", emissive: "#402030" });
    for (const [x, z, s] of [[-4, -2, 1.4], [2, 3, 1.8], [4, -3, 1.2], [-1, 0.5, 1]]) {
      for (let k = 0; k < 5; k++) {
        const puff = CreateSphere(`${key} · nuage ${x} ${k}`, { diameter: s * (0.6 + Math.random() * 0.4), segments: 10 }, scene);
        puff.position.copyFrom(ctx.local(x + (k - 2) * s * 0.3, H - 0.35 + Math.random() * 0.1, z + (Math.random() - 0.5) * s * 0.4));
        ctx.add(puff, floss);
      }
    }
    const sun = ctx.spot("lumière", [-3, H - 0.2, -4], [0.4, -1, 0.6], "#fff8f0", 0.8, 2.2, 1, 18);
    ctx.shadows(sun, { size: 1024, darkness: 0.3, soft: true });
    ctx.point("rose", 4, 2.6, 2, "#ffa0d0", 0.6, 9);
    ctx.mirrorFloor(look.floor, { level: 0.3, blur: 2 });
  },
};
