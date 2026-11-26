import { Engine } from "@babylonjs/core/Engines/engine";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 61 · Riad : zelliges (mosaïque d'étoiles à huit branches) en soubassement, enduit tadelakt ocre
// au-dessus, arcs outrepassés peints sur les murs, lanternes de laiton ajourées dont les motifs étoilés
// sont projetés sur les murs et le sol (panneaux additifs), coussins et tapis, vapeur de hammam.
const palette = { background: "#2a1408", primary: "#e0a040", secondary: "#1a6a6a", accent: "#c03020", text: "#fff0d8" };

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const rr = k % 2 ? r * 0.62 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function zellige(ctx, w, h) {
  ctx.fillStyle = "#f0e8d8";
  ctx.fillRect(0, 0, w, h);
  const cell = 64;
  for (let y = 0; y < h + cell; y += cell) {
    for (let x = 0; x < w + cell; x += cell) {
      ctx.fillStyle = (x / cell + y / cell) % 2 ? "#1a6a6a" : "#1a3a7a";
      star(ctx, x, y, cell * 0.42);
      ctx.fill();
      ctx.fillStyle = "#e0a040";
      star(ctx, x, y, cell * 0.14);
      ctx.fill();
      ctx.fillStyle = "#c03020";
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

function wallPaint(ctx, w, h) {
  // Tadelakt ocre nuancé au-dessus, zelliges en soubassement, arcs outrepassés.
  ctx.fillStyle = "#c88850";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(${170 + Math.random() * 50},${110 + Math.random() * 30},${60 + Math.random() * 20},0.12)`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 0, Math.PI * 2);
    ctx.fill();
  }
  const zh = h * 0.28;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, h - zh, w, zh);
  ctx.clip();
  ctx.translate(0, h - zh);
  zellige(ctx, w, zh);
  ctx.restore();
  ctx.fillStyle = "#e0a040";
  ctx.fillRect(0, h - zh - 8, w, 8);
  // Arcs en fer à cheval, creusés plus sombres, bordés d'un filet doré.
  for (let k = 0; k < 4; k++) {
    const cx = (k + 0.5) * (w / 4);
    const r = w / 14;
    const top = h * 0.2;
    ctx.fillStyle = "#7a4020";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, h - zh - 8);
    ctx.lineTo(cx - r * 0.8, top + r);
    ctx.arc(cx, top + r, r, Math.PI * 0.82, Math.PI * 0.18, false);
    ctx.lineTo(cx + r * 0.8, h - zh - 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#e0b060";
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function lanternPattern(ctx, w, h) {
  // Taches de lumière en étoiles : centre fort, s'estompant vers le bord.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  for (let ring = 0; ring < 4; ring++) {
    const n = 6 + ring * 6;
    const rad = ring * w * 0.12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.3;
      const fade = 1 - ring * 0.22;
      ctx.fillStyle = `rgba(255,190,110,${fade})`;
      star(ctx, w / 2 + Math.cos(a) * rad, h / 2 + Math.sin(a) * rad, w * (0.035 + ring * 0.006));
      ctx.fill();
    }
  }
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export const riad = {
  key: "riad",
  title: "Riad",
  ambient: { hemi: 0.35, sky: "#ffc890", ground: "#3a1a0a", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.6, contrast: 1.1, vignette: 2 },
  fog: { color: "#a06a40", density: 0.025 },
  glow: 0.8,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const tiles = paintedTexture(scene, `${name} · zelliges`, 512, 512, zellige);
    tiles.uScale = 8;
    tiles.vScale = 6;
    const cedar = m("cèdre", { diffuse: "#6a3a1a", specular: "#4a2a10", power: 40 });
    const brass = m("laiton", { diffuse: "#c89040", specular: "#ffe0a0", power: 120 });
    const screens = new Map();
    return {
      palette,
      floor: m("zelliges", { diffuse: "#ffffff", texture: tiles, specular: "#ffffff", power: 150 }),
      wall: m("tadelakt", { diffuse: "#ffffff", texture: paintedTexture(scene, `${name} · murs`, 1024, 512, wallPaint), specular: "#806040", power: 30 }),
      ceiling: cedar,
      trim: brass,
      doorFrame: brass,
      door: cedar,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "خروج · sortie", { color: "#e0a040", background: "#2a1408", font: "bold 64px serif", glow: 8 }) }),
      counter: m("comptoir", { diffuse: "#ffffff", texture: tiles }),
      counterTop: brass,
      backBar: cedar,
      shelf: brass,
      glass: (i) => m(`verre à thé ${i}`, { diffuse: ["#1a6a6a", "#c03020", "#e0a040"][i % 3], specular: "#ffffff", power: 140, alpha: 0.8 }),
      seat: m("coussin", { diffuse: "#a02a20" }),
      tableTop: brass,
      metal: brass,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#1a6a6a", "#a02a20", "#1a3a7a"][i % 3] }),
      cabinetSide: () => cedar,
      panel: cedar,
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
    const pattern = paintedTexture(scene, `${key} · motif`, 256, 256, lanternPattern);
    const spill = std(scene, `${key} · motif projeté`, { diffuse: "#000000", emissiveTexture: pattern, unlit: true });
    spill.alphaMode = Engine.ALPHA_ADD;
    spill.alpha = 0.9;
    spill.disableDepthWrite = true;
    ctx.noGlow(spill);
    const glowMat = std(scene, `${key} · flamme`, { diffuse: "#000000", emissive: "#ffb060" });
    const lanterns = [];
    // Lanternes suspendues : corps ajouré (cylindre à facettes), flamme, lumière, motifs projetés.
    for (const [x, z, y] of [[-4.6, -2, 2.6], [-2.5, 4.4, 2.9], [5.5, 0, 3], [0, -4.5, 3]]) {
      ctx.box(`chaîne ${x} ${z}`, x, (H + y) / 2 + 0.25, z, 0.01, H - y - 0.5, 0.01, look.brass);
      const body = CreateCylinder(`${key} · lanterne ${x} ${z}`, { height: 0.5, diameterTop: 0.12, diameterBottom: 0.3, tessellation: 8 }, scene);
      body.position.copyFrom(ctx.local(x, y, z));
      ctx.add(body, look.brass);
      const flame = CreateCylinder(`${key} · flamme ${x} ${z}`, { height: 0.32, diameter: 0.24, tessellation: 8 }, scene);
      flame.position.copyFrom(ctx.local(x, y - 0.04, z));
      ctx.add(flame, glowMat);
      const light = ctx.point(`lanterne ${x} ${z}`, x, y - 0.2, z, "#ffb060", 1.1, 7);
      lanterns.push({ light, base: 1.1, phase: x + z });
      // Motif au sol, et sur le mur le plus proche.
      const floorSpot = CreatePlane(`${key} · motif sol ${x} ${z}`, { size: 3.6 }, scene);
      floorSpot.rotation.x = Math.PI / 2;
      floorSpot.position.copyFrom(ctx.local(x, 0.02, z));
      ctx.add(floorSpot, spill);
      const nearest = [[W / 2 - Math.abs(x), x > 0 ? "est" : "ouest"], [D / 2 - Math.abs(z), z > 0 ? "nord" : "sud"]].sort((a, b) => a[0] - b[0])[0];
      const wallSpot = CreatePlane(`${key} · motif mur ${x} ${z}`, { size: 3 }, scene);
      if (nearest[1] === "est" || nearest[1] === "ouest") {
        const wx = (x > 0 ? 1 : -1) * (W / 2 - 0.03);
        wallSpot.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
        wallSpot.position.copyFrom(ctx.local(wx, y - 0.4, z));
      } else {
        const wz = (z > 0 ? 1 : -1) * (D / 2 - 0.03);
        wallSpot.rotation.y = z > 0 ? 0 : Math.PI;
        wallSpot.position.copyFrom(ctx.local(x, y - 0.4, wz));
      }
      ctx.add(wallSpot, spill);
    }
    // Tapis berbère sous la table.
    ctx.plane("tapis", -4.6, 0.015, -2, 3.4, 2.4, std(scene, `${key} · tapis`, { diffuse: "#ffffff",
      texture: paintedTexture(scene, `${key} · tapis`, 512, 360, (c, w, h) => {
        c.fillStyle = "#a02a20";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "#f0e0c0";
        c.lineWidth = 6;
        c.strokeRect(14, 14, w - 28, h - 28);
        for (let k = 0; k < 5; k++) {
          const cx = w * (0.15 + k * 0.175);
          c.fillStyle = k % 2 ? "#1a3a7a" : "#e0a040";
          c.beginPath();
          c.moveTo(cx, h * 0.25);
          c.lineTo(cx + 30, h / 2);
          c.lineTo(cx, h * 0.75);
          c.lineTo(cx - 30, h / 2);
          c.fill();
        }
      }) }), Math.PI / 2).rotation.x = Math.PI / 2;
    ctx.onUpdate((time) => {
      // Flammes qui vacillent.
      for (const { light, base, phase } of lanterns) {
        light.intensity = base * (0.85 + 0.1 * Math.sin(time * 9 + phase) + 0.05 * Math.sin(time * 23 + phase * 2));
      }
    });
  },
};
