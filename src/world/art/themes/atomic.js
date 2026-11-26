import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 66 · Atomic age : l'optimisme rétro-futuriste de la fin des années 50. Formica à boomerangs
// et paillettes, turquoise, corail et crème, étoiles « starburst » dorées et orbites d'atomes au mur,
// lustre Spoutnik dont les bras portent des ampoules, chrome partout. Lumière franche et gaie.
const palette = { background: "#f4ecd8", primary: "#40b0a8", secondary: "#f07060", accent: "#e8b030", text: "#2a2a2a" };

function boomerangs(ctx, w, h) {
  ctx.fillStyle = "#f4ecd8";
  ctx.fillRect(0, 0, w, h);
  const colors = ["#40b0a8", "#f07060", "#e8b030", "#2a2a2a"];
  for (let i = 0; i < 70; i++) {
    ctx.save();
    ctx.translate(Math.random() * w, Math.random() * h);
    ctx.rotate(Math.random() * Math.PI * 2);
    ctx.fillStyle = colors[i % 4];
    ctx.beginPath();
    ctx.moveTo(-26, 8);
    ctx.quadraticCurveTo(0, -18, 26, 8);
    ctx.quadraticCurveTo(0, -6, -26, 8);
    ctx.fill();
    ctx.restore();
  }
  // Paillettes dorées.
  ctx.fillStyle = "#c8a040";
  for (let i = 0; i < 500; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
}

function atomicWall(ctx, w, h) {
  ctx.fillStyle = "#40b0a8";
  ctx.fillRect(0, 0, w, h * 0.45);
  ctx.fillStyle = "#f4ecd8";
  ctx.fillRect(0, h * 0.45, w, h * 0.55);
  ctx.fillStyle = "#f07060";
  ctx.fillRect(0, h * 0.43, w, h * 0.03);
  // Étoiles « starburst » et orbites d'atomes.
  for (let k = 0; k < 8; k++) {
    const x = (k + 0.5) * (w / 8);
    const y = h * (k % 2 ? 0.2 : 0.7);
    if (k % 2) {
      ctx.strokeStyle = "#e8b030";
      ctx.lineWidth = 3;
      for (let r = 0; r < 12; r++) {
        const a = (r / 12) * Math.PI * 2;
        const len = r % 2 ? 20 : 38;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "#2a2a2a";
      ctx.lineWidth = 2;
      for (let o = 0; o < 3; o++) {
        ctx.beginPath();
        ctx.ellipse(x, y, 40, 13, (o * Math.PI) / 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#f07060";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export const atomic = {
  key: "atomic-age",
  title: "Atomic age",
  ambient: { hemi: 0.7, sky: "#fffaf0", ground: "#c0a080", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.35, contrast: 1.05, saturation: 10 },
  glow: 0.4,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const formica = paintedTexture(scene, `${name} · formica`, 512, 512, boomerangs);
    const floor = paintedTexture(scene, `${name} · damier`, 256, 256, (c, w, h) => {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        c.fillStyle = (x + y) % 2 ? "#f07060" : "#f4ecd8";
        c.fillRect((x * w) / 2, (y * h) / 2, w / 2, h / 2);
      }
    });
    floor.uScale = 8;
    floor.vScale = 6;
    const chrome = m("chrome", { diffuse: "#c8c8d0", specular: "#ffffff", power: 200 });
    const screens = new Map();
    return {
      palette,
      floor: m("damier", { diffuse: "#ffffff", texture: floor, specular: "#ffffff", power: 120 }),
      wall: m("mur", { diffuse: "#ffffff", texture: paintedTexture(scene, `${name} · mur`, 1024, 512, atomicWall) }),
      ceiling: m("plafond", { diffuse: "#f4ecd8" }),
      trim: chrome,
      doorFrame: chrome,
      door: m("porte", { diffuse: "#40b0a8", specular: "#ffffff", power: 60 }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "★ EXIT ★", { color: "#f07060", background: "#f4ecd8", font: "bold italic 70px sans-serif", glow: 4 }) }),
      counter: m("comptoir", { diffuse: "#40b0a8", specular: "#ffffff", power: 80 }),
      counterTop: m("formica", { diffuse: "#ffffff", texture: formica, specular: "#ffffff", power: 100 }),
      backBar: m("fond du bar", { diffuse: "#f07060" }),
      shelf: chrome,
      glass: (i) => m(`verre ${i}`, { diffuse: ["#40b0a8", "#f07060", "#e8b030"][i % 3], specular: "#ffffff", power: 150, alpha: 0.8 }),
      seat: m("skaï", { diffuse: "#f07060", specular: "#ffffff", power: 70 }),
      tableTop: m("table", { diffuse: "#ffffff", texture: formica, specular: "#ffffff", power: 100 }),
      metal: chrome,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#40b0a8", "#f07060", "#e8b030", "#f4ecd8"][i % 4], specular: "#ffffff", power: 60 }),
      cabinetSide: () => chrome,
      panel: m("pupitre", { diffuse: "#2a2a2a" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: ["#f07060", "#e8b030"][i % 2] }),
      scanlines: false,
      chrome,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    // Lustre Spoutnik : sphère chromée, bras rayonnants, ampoules au bout.
    const bulb = std(scene, `${key} · ampoule`, { diffuse: "#000000", emissive: "#fff0c8" });
    const sputnik = new TransformNode(`${key} · spoutnik`, scene);
    sputnik.position.copyFrom(ctx.local(0, H - 1, 0));
    const core = CreateSphere(`${key} · noyau`, { diameter: 0.3, segments: 16 }, scene);
    core.parent = sputnik;
    ctx.add(core, look.chrome);
    ctx.box("tige", 0, H - 0.5, 0, 0.03, 1, 0.03, look.chrome);
    // Bras répartis sur une sphère (spirale de Fibonacci).
    const arms = 18;
    for (let k = 0; k < arms; k++) {
      const y = 1 - (2 * (k + 0.5)) / arms;
      const r = Math.sqrt(1 - y * y);
      const a = k * 2.399963;
      const dir = { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
      const arm = CreateCylinder(`${key} · bras ${k}`, { height: 0.7, diameter: 0.015, tessellation: 6 }, scene);
      arm.parent = sputnik;
      arm.position.set(dir.x * 0.35, dir.y * 0.35, dir.z * 0.35);
      // Orienter l'axe Y du cylindre selon dir.
      arm.rotation.set(Math.acos(dir.y), 0, 0);
      arm.rotation.y = Math.atan2(dir.x, dir.z);
      ctx.add(arm, look.chrome);
      const b = CreateSphere(`${key} · ampoule ${k}`, { diameter: 0.07, segments: 8 }, scene);
      b.parent = sputnik;
      b.position.set(dir.x * 0.72, dir.y * 0.72, dir.z * 0.72);
      ctx.add(b, bulb);
    }
    ctx.point("spoutnik", 0, H - 1, 0, "#fff0c8", 1.1, 14);
    // Suspensions coniques au-dessus du bar et de la table.
    for (const [x, z] of [[-2.2, 4], [1.8, 4], [-4.6, -2]]) {
      const shade = CreateCylinder(`${key} · cône ${x} ${z}`, { height: 0.35, diameterTop: 0.05, diameterBottom: 0.4, tessellation: 24 }, scene);
      shade.position.copyFrom(ctx.local(x, 2.6, z));
      ctx.add(shade, std(scene, `${key} · cône ${x}`, { diffuse: "#e8b030", specular: "#ffffff", power: 80 }));
      ctx.box(`fil ${x} ${z}`, x, (H + 2.78) / 2, z, 0.01, H - 2.78, 0.01, look.chrome);
      ctx.point(`cône ${x} ${z}`, x, 2.3, z, "#fff4d8", 0.7, 5);
    }
    const sun = ctx.spot("lumière", [-3, H - 0.1, -4.5], [0.3, -1, 0.5], "#ffffff", 0.6, 2, 1, 16);
    ctx.shadows(sun, { size: 1024, darkness: 0.25, soft: true });
    ctx.onUpdate((time) => { sputnik.rotation.y = time * 0.15; });
  },
};
