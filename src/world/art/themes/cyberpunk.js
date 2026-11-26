import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 12 · Cyberpunk sous la pluie : béton sombre détrempé, brouillard bleu-vert, enseignes verticales
// en katakana, tuyaux apparents. La pluie tombe par une trouée du plafond dans une flaque qui reflète
// les néons ; une enseigne grésille.
const palette = { background: "#05121a", primary: "#00f0ff", secondary: "#ff1f8f", accent: "#f4ff3a", text: "#e6fbff" };

function concrete(ctx, w, h, base) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 12000; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.05})` : `rgba(0,0,0,${v * 0.12})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

export const cyberpunk = {
  key: "cyberpunk",
  title: "Cyberpunk sous la pluie",
  ambient: { hemi: 0.45, sky: "#5ab8d4", ground: "#3a1440", specular: "#334455", sun: 0 },
  image: { toneMapping: "aces", exposure: 2, contrast: 1.15, vignette: 1.6, tint: { hue: 190, density: 8 } },
  fog: { color: "#123444", density: 0.035 },
  glow: 1,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const floor = paintedTexture(scene, `${name} · béton mouillé`, 1024, 768, (ctx, w, h) => {
      concrete(ctx, w, h, "#1c2226");
      // Joints de dalles et traces d'eau plus sombres.
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 3;
      for (let x = 0; x <= w; x += w / 8) ctx.strokeRect(x, 0, 0, h);
      for (let y = 0; y <= h; y += h / 6) ctx.strokeRect(0, y, w, 0);
      for (let i = 0; i < 25; i++) {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h, 30 + Math.random() * 80, 15 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const wall = paintedTexture(scene, `${name} · mur`, 2048, 512, (ctx, w, h) => {
      concrete(ctx, w, h, "#20262b");
      // Coulures verticales et tags lumineux.
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.2})`;
        ctx.fillRect(Math.random() * w, 0, 2 + Math.random() * 5, h * (0.2 + Math.random() * 0.6));
      }
      ctx.font = "bold 70px sans-serif";
      ctx.shadowBlur = 14;
      for (const [text, x, y, c] of [["NO FUTURE", 300, 300, "#ff1f8f"], ["グリッチ", 1100, 220, "#00f0ff"], ["2099", 1700, 330, "#f4ff3a"]]) {
        ctx.shadowColor = c;
        ctx.fillStyle = c;
        ctx.fillText(text, x, y);
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#101418";
      ctx.fillRect(0, h * 0.85, w, h * 0.15);
    });
    const steel = m("acier mouillé", { diffuse: "#2a3238", specular: "#cfe8ff", power: 200 });
    const neonEdge = ["#00f0ff", "#ff1f8f", "#f4ff3a"];
    const screens = new Map();
    return {
      palette,
      floor: m("béton", { diffuse: "#ffffff", texture: floor, specular: "#9fd8ff", power: 240 }),
      wall: m("mur", { diffuse: "#ffffff", texture: wall, emissiveTexture: wall, emissive: "#000000" }),
      ceiling: m("plafond", { diffuse: "#0b0f12" }),
      trim: steel,
      doorFrame: m("cadre", { diffuse: "#000000", emissive: "#ff1f8f" }),
      door: steel,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "出口 EXIT", { color: "#00f0ff", background: "#05121a", glow: 18 }) }),
      counter: m("comptoir", { diffuse: "#14181c", specular: "#ff1f8f", power: 120 }),
      counterTop: m("plateau", { diffuse: "#0a0c0e", specular: "#ffffff", power: 256 }),
      backBar: m("fond du bar", { diffuse: "#000000", unlit: true, emissiveTexture: paintedTexture(scene, `${name} · fond du bar`, 512, 128,
        (ctx, w, h) => {
          ctx.fillStyle = "#06080a";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "#ff1f8f";
          ctx.shadowColor = "#ff1f8f";
          ctx.shadowBlur = 10;
          ctx.lineWidth = 4;
          for (let x = 20; x < w; x += 40) ctx.strokeRect(x, 14, 24, h - 28);
        }) }),
      shelf: steel,
      glass: (i) => m(`verre ${i}`, { diffuse: "#000000", emissive: ["#00f0ff", "#ff1f8f", "#9cff57", "#f4ff3a"][i % 4], alpha: 0.75 }),
      seat: m("assise", { diffuse: "#3a0f2a", specular: "#ff8fd0", power: 80 }),
      tableTop: m("table", { diffuse: "#101418", specular: "#ffffff", power: 220 }),
      metal: steel,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#14181c", "#1a1020", "#0e1a1c"][i % 3], specular: "#88aabb", power: 90 }),
      cabinetSide: () => steel,
      cabinetEdge: (i) => m(`liseré ${i}`, { diffuse: "#000000", emissive: neonEdge[i % 3] }),
      panel: m("pupitre", { diffuse: "#0e1114" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: "#000000", emissive: neonEdge[i % 3] }),
      steel,
      reflective: [steel],
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Enseignes verticales en katakana, l'une d'elles grésille.
    const vertical = (label, text, x, z, yaw, hex) => {
      const texture = paintedTexture(scene, `${key} · ${label}`, 128, 512, (c, w, h) => {
        c.fillStyle = "#05080a";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = hex;
        c.lineWidth = 6;
        c.shadowColor = hex;
        c.shadowBlur = 16;
        c.strokeRect(8, 8, w - 16, h - 16);
        c.fillStyle = hex;
        c.font = "bold 84px sans-serif";
        c.textAlign = "center";
        [...text].forEach((ch, i) => c.fillText(ch, w / 2, 100 + i * 100));
      });
      const mat = std(scene, `${key} · ${label}`, { diffuse: "#000000", unlit: true, emissiveTexture: texture });
      ctx.plane(label, x, 2.3, z, 0.5, 2, mat, yaw);
      return mat;
    };
    vertical("enseigne ゲーム", "ゲーム", -W / 2 + 0.04, 4.6, -Math.PI / 2, "#00f0ff");
    const flicker = vertical("enseigne 酒場", "酒場", -1.2, D / 2 - 0.04, 0, "#ff1f8f");
    vertical("enseigne ネオン", "ネオン", W / 2 - 0.04, -5.2, Math.PI / 2, "#f4ff3a");
    // Tuyaux apparents au plafond.
    for (let i = 0; i < 3; i++) {
      const pipe = CreateCylinder(`${key} · tuyau ${i}`, { height: W - 0.6, diameter: 0.12 + i * 0.04 }, scene);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.copyFrom(ctx.local(0, H - 0.25 - i * 0.05, -3 + i * 0.35));
      ctx.add(pipe, look.steel);
    }
    // Lumières : magenta côté bar, cyan côté bornes, verte froide qui tombe de la trouée.
    ctx.point("magenta", -3.5, H - 0.6, 3.4, "#ff1f8f", 1.6, 10);
    ctx.point("cyan", 5.2, 2.6, -1, "#00f0ff", 1.6, 10);
    ctx.point("table", -4.6, H - 0.8, -2, "#b07cff", 1.2, 8);
    ctx.point("entrée", 0, H - 0.6, -4.5, "#7fe8ff", 0.9, 8);
    const hole = { x: 0.8, z: -1.6 };
    const shaft = ctx.spot("trouée", [hole.x, H - 0.05, hole.z], [0, -1, 0], "#9fffe0", 1.4, 0.7, 2, 8);
    ctx.shadows(shaft, { size: 1024, darkness: 0.2 });
    // Trouée au plafond et pluie qui tombe dedans : traits allongés face caméra.
    const sky = std(scene, `${key} · trouée`, { diffuse: "#000000", emissive: "#1a4a55" });
    ctx.plane("trouée", hole.x, H - 0.01, hole.z, 1.6, 1.6, sky).rotation.x = -Math.PI / 2;
    const streak = paintedTexture(scene, `${key} · goutte`, 16, 128, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(200,255,255,0)");
      g.addColorStop(1, "rgba(200,255,255,0.8)");
      c.fillStyle = g;
      c.fillRect(w / 2 - 1, 0, 2, h);
    });
    streak.hasAlpha = true;
    const rainMat = std(scene, `${key} · pluie`, { diffuse: "#000000", emissive: "#bff8ff", unlit: true });
    rainMat.opacityTexture = streak;
    const drops = [];
    const base = CreatePlane(`${key} · goutte`, { width: 0.02, height: 0.5 }, scene);
    base.billboardMode = Mesh.BILLBOARDMODE_Y;
    ctx.add(base, rainMat);
    for (let i = 0; i < 45; i++) {
      const drop = i === 0 ? base : base.clone(`${key} · goutte ${i}`);
      if (i > 0) ctx.add(drop, rainMat);
      drops.push({ drop, x: hole.x + (Math.random() - 0.5) * 1.4, z: hole.z + (Math.random() - 0.5) * 1.4, phase: Math.random(), speed: 0.9 + Math.random() * 0.4 });
    }
    // Flaque sous la trouée : disque sombre très brillant.
    const puddle = std(scene, `${key} · flaque`, { diffuse: "#05080a", specular: "#ffffff", power: 512 });
    const disc = ctx.plane("flaque", hole.x, 0.006, hole.z, 2.4, 1.8, puddle);
    disc.rotation.x = Math.PI / 2;
    // Reflets : sol détrempé presque net, acier par sonde.
    ctx.mirrorFloor(look.floor, { level: 0.45, blur: 5 });
    ctx.probe(look.reflective, { level: 0.5 });
    ctx.onUpdate((time) => {
      const origin = ctx.local(0, 0, 0);
      for (const d of drops) {
        const t = (time * d.speed + d.phase) % 1;
        d.drop.position.set(origin.x + d.x, H - t * H, origin.z + d.z);
      }
      // Grésillement : coupures brèves et irrégulières.
      const s = Math.sin(time * 23) + Math.sin(time * 7.3);
      flicker.alpha = s > 1.6 ? 0.15 : 1;
    });
  },
};
