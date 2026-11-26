import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 14 · Memphis pastel, plein jour : couleurs pastel, motifs géométriques (gribouillis, triangles,
// pois), terrazzo au sol. Le soleil entre par de grandes baies côté ouest et projette des ombres douces.
// Formes géométriques suspendues. Pas de néon : tout est éclairé par la lumière du jour.
const palette = { background: "#fff1e6", primary: "#ff6f91", secondary: "#2ec4b6", accent: "#ffbf69", text: "#22223b" };
const INK = "#22223b";
const PASTELS = ["#ffafcc", "#a2d2ff", "#b9fbc0", "#ffd6a5", "#cdb4db"];

function terrazzo(ctx, w, h) {
  ctx.fillStyle = "#f4efe9";
  ctx.fillRect(0, 0, w, h);
  const chips = ["#ff8fab", "#7ec8e3", "#f9c74f", "#90be6d", "#22223b", "#cdb4db"];
  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle = chips[i % chips.length];
    ctx.beginPath();
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 1.5 + Math.random() * 4;
    ctx.moveTo(x + r, y);
    for (let k = 1; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.random();
      ctx.lineTo(x + Math.cos(a) * r * (0.6 + Math.random() * 0.5), y + Math.sin(a) * r * (0.6 + Math.random() * 0.5));
    }
    ctx.fill();
  }
}

function memphisWall(ctx, w, h) {
  ctx.fillStyle = "#ffe5ec";
  ctx.fillRect(0, 0, w, h);
  // Pois noirs en haut, gribouillis, triangles et soubassement menthe.
  ctx.fillStyle = INK;
  for (let y = 18; y < h * 0.3; y += 26) {
    for (let x = (y / 26) % 2 ? 13 : 0; x < w; x += 26) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  for (let i = 0; i < 14; i++) {
    const x0 = (i / 14) * w + 40;
    const y0 = h * (0.4 + (i % 3) * 0.08);
    ctx.strokeStyle = ["#2ec4b6", "#ff6f91", "#ffbf69", INK][i % 4];
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let k = 1; k <= 6; k++) ctx.lineTo(x0 + k * 14, y0 + (k % 2 ? -18 : 18));
    ctx.stroke();
    ctx.fillStyle = PASTELS[i % PASTELS.length];
    ctx.beginPath();
    const tx = x0 + 70;
    const ty = h * 0.33;
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + 40, ty + 50);
    ctx.lineTo(tx - 30, ty + 46);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 7;
  }
  ctx.fillStyle = "#b9fbc0";
  ctx.fillRect(0, h * 0.74, w, h * 0.26);
  ctx.fillStyle = INK;
  for (let x = 0; x < w; x += 24) ctx.fillRect(x, h * 0.74, 12, 6);
}

function stripes(ctx, w, h) {
  for (let x = 0; x < w; x += 16) {
    ctx.fillStyle = (x / 16) % 2 ? "#ffffff" : INK;
    ctx.fillRect(x, 0, 16, h);
  }
}

export const memphis = {
  key: "memphis-pastel",
  title: "Memphis pastel, plein jour",
  ambient: { hemi: 0.75, sky: "#fff8f0", ground: "#ffd6e0", sun: 0 },
  image: { toneMapping: "neutral", exposure: 1.15, contrast: 1.05, saturation: 10 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, options = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, specular: "#222222", power: 24, ...options });
    const floor = paintedTexture(scene, `${name} · terrazzo`, 1024, 768, terrazzo);
    floor.uScale = 2;
    floor.vScale = 2;
    const wall = paintedTexture(scene, `${name} · mur`, 2048, 512, memphisWall);
    const striped = paintedTexture(scene, `${name} · rayures`, 128, 128, stripes);
    const screens = new Map();
    const body = PASTELS.map((hex, i) => m(`borne ${i}`, hex));
    return {
      palette,
      floor: m("terrazzo", "#ffffff", { texture: floor, specular: "#555555", power: 60 }),
      wall: m("mur", "#ffffff", { texture: wall }),
      ceiling: m("plafond", "#fff7f0"),
      trim: m("plinthe", INK),
      doorFrame: m("cadre", "#ff6f91"),
      door: m("porte", "#2ec4b6"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "ciao !", { color: INK, background: "#ffbf69", font: "italic 900 86px sans-serif" }) }),
      counter: m("bar", "#ffffff", { texture: striped }),
      counterTop: m("plateau", "#ff6f91", { specular: "#ffffff", power: 80 }),
      backBar: m("fond du bar", "#a2d2ff"),
      shelf: m("étagère", "#ffbf69"),
      glass: (i) => m(`vase ${i}`, PASTELS[i % PASTELS.length], { specular: "#ffffff", power: 90 }),
      seat: m("assise", "#2ec4b6"),
      tableTop: m("table", "#ffbf69", { specular: "#ffffff", power: 60 }),
      metal: m("pied", INK),
      cabinet: (i) => body[i % body.length],
      cabinetSide: () => m("flanc", "#ffffff", { texture: striped }),
      cabinetEdge: () => m("liseré", "#ff6f91"),
      panel: m("pupitre", INK),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, ["#ff6f91", "#2ec4b6", "#ffbf69", INK][i % 4]),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { scene, room, ROOM: { width: W, height: H } } = ctx;
    const key = room.theme.key;
    // Baies vitrées côté ouest : ciel clair et nuages, montants noirs.
    const sky = paintedTexture(scene, `${key} · ciel`, 512, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#8fd3ff");
      g.addColorStop(1, "#e6f7ff");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#ffffff";
      for (const [x, y, s] of [[90, 70, 1], [330, 110, 1.4], [460, 50, 0.8]]) {
        for (const [dx, dy, r] of [[0, 0, 26], [28, -10, 30], [56, 0, 24]]) {
          c.beginPath();
          c.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
          c.fill();
        }
      }
    });
    const glass = std(scene, `${key} · baie`, { diffuse: "#000000", unlit: true, emissiveTexture: sky });
    const ink = std(scene, `${key} · montant`, { diffuse: INK });
    for (const z of [-3.2, 0.6]) {
      ctx.plane(`baie ${z}`, -W / 2 + 0.02, 2.15, z, 3, 2.3, glass, -Math.PI / 2);
      for (const dz of [-1.5, 0, 1.5]) ctx.box(`montant ${z} ${dz}`, -W / 2 + 0.05, 2.15, z + dz, 0.08, 2.4, 0.08, ink);
      ctx.box(`traverse ${z}`, -W / 2 + 0.05, 2.15, z, 0.08, 0.06, 3, ink);
    }
    // Formes suspendues : sphère, tore, cône, aux couleurs vives, qui tournent doucement.
    const shapes = [];
    const hang = (mesh, x, y, z, hex) => {
      mesh.position.copyFrom(ctx.local(x, y, z));
      ctx.add(mesh, std(scene, `${key} · forme ${mesh.name}`, { diffuse: hex, specular: "#ffffff", power: 60 }));
      const wire = CreateCylinder(`${key} · fil ${mesh.name}`, { height: H - y, diameter: 0.012 }, scene);
      wire.position.copyFrom(ctx.local(x, (H + y) / 2, z));
      ctx.add(wire, ink);
      shapes.push(mesh);
    };
    hang(CreateSphere(`${key} · sphère`, { diameter: 0.6, segments: 16 }, scene), 1, 3, 1.5, "#ff6f91");
    hang(CreateTorus(`${key} · tore`, { diameter: 0.7, thickness: 0.18, tessellation: 32 }, scene), -1.6, 3.1, -0.5, "#2ec4b6");
    hang(CreateCylinder(`${key} · cône`, { height: 0.7, diameterTop: 0, diameterBottom: 0.55, tessellation: 24 }, scene), 3.2, 2.9, -2.4, "#ffbf69");
    hang(CreateCylinder(`${key} · cylindre`, { height: 0.5, diameter: 0.4, tessellation: 24 }, scene), -5.6, 3.2, 1.5, "#cdb4db");
    // Soleil, ajouté après tout le décor pour que chaque objet porte une ombre. : projecteur placé loin dehors, qui entre par les baies (les murs ne portent pas d'ombre).
    const sun = ctx.spot("soleil", [-W / 2 - 6, 6.5, -2], [1, -0.85, 0.25], "#fff2d6", 1.6, 1.1, 1, 30);
    ctx.shadows(sun, { size: 2048, darkness: 0.45, soft: true });
    ctx.point("rebond", 3, H - 0.5, 1, "#ffe8f0", 0.35, 12);
    ctx.onUpdate((time) => {
      shapes.forEach((mesh, i) => {
        mesh.rotation.y = time * (0.4 + i * 0.15);
        mesh.rotation.z = Math.sin(time * 0.7 + i) * 0.15;
      });
    });
  },
};
