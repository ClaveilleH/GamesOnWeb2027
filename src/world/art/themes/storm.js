import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 62 · Nuit d'orage : salon lambrissé plongé dans le noir, éclairé seulement par quelques
// bougies, jusqu'à ce qu'un éclair (double flash irrégulier) l'illumine d'un bleu cru. Les hautes
// fenêtres du mur ouest montrent la pluie qui ruisselle (texture qui défile) et la silhouette des arbres ;
// le croisillon se projette en ombre au sol pendant l'éclair. Parquet ciré qui reflète.
const palette = { background: "#08080c", primary: "#c0d0ff", secondary: "#ffb060", accent: "#5a3a20", text: "#d0d8f0" };

function rain(ctx, w, h) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = 10 + Math.random() * 40;
    const g = ctx.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, "rgba(180,200,255,0)");
    g.addColorStop(1, "rgba(200,215,255,0.55)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.random() * 3 - 1.5, y + len);
    ctx.stroke();
    // Goutte au bout de la coulure.
    ctx.fillStyle = "rgba(220,230,255,0.6)";
    ctx.beginPath();
    ctx.arc(x, y + len, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function night(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#3a4868");
  g.addColorStop(1, "#101420");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Arbres tourmentés en silhouette.
  ctx.fillStyle = "#020304";
  ctx.strokeStyle = "#020304";
  for (let k = 0; k < 5; k++) {
    const x = (k + 0.3 + Math.random() * 0.4) * (w / 5);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 10, h * 0.45);
    ctx.stroke();
    for (let b = 0; b < 7; b++) {
      const by = h * (0.45 + Math.random() * 0.3);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 8, by);
      ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 120, by - 40, x + (Math.random() - 0.5) * 160, by - 60 - Math.random() * 60);
      ctx.stroke();
    }
  }
  ctx.fillRect(0, h * 0.9, w, h * 0.1);
}

export const storm = {
  key: "orage",
  title: "Nuit d'orage",
  ambient: { hemi: 0.35, sky: "#8090c0", ground: "#201008", sun: 0 },
  image: { toneMapping: "aces", exposure: 2.2, contrast: 1.15, vignette: 3 },
  glow: 0.7,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const panelling = paintedTexture(scene, `${name} · lambris`, 1024, 512, (c, w, h) => {
      c.fillStyle = "#3a2214";
      c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += w / 8) {
        c.fillStyle = "#2a160c";
        c.fillRect(x + 10, h * 0.45, w / 8 - 20, h * 0.5);
        c.fillStyle = "#4a2c1a";
        c.fillRect(x + 16, h * 0.47, w / 8 - 32, h * 0.46);
      }
      c.fillStyle = "#1e1210";
      c.fillRect(0, h * 0.42, w, 8);
      // Papier peint sombre à motif au-dessus.
      c.fillStyle = "#24161a";
      c.fillRect(0, 0, w, h * 0.42);
      c.fillStyle = "#30202a";
      for (let y = 20; y < h * 0.4; y += 40) for (let x = (y / 40) % 2 ? 20 : 0; x < w; x += 40) {
        c.beginPath();
        c.ellipse(x, y, 6, 12, 0, 0, Math.PI * 2);
        c.fill();
      }
    });
    const parquet = paintedTexture(scene, `${name} · parquet`, 512, 512, (c, w, h) => {
      for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -64 : 0; x < w; x += 128) {
        const v = 70 + Math.random() * 30;
        c.fillStyle = `rgb(${v},${v * 0.6},${v * 0.35})`;
        c.fillRect(x, y, 127, 31);
      }
    });
    parquet.uScale = 4;
    parquet.vScale = 3;
    const oak = m("chêne", { diffuse: "#4a2c1a", specular: "#5a3a20", power: 60 });
    const velvet = m("velours", { diffuse: "#4a1018" });
    const screens = new Map();
    return {
      palette,
      floor: m("parquet ciré", { diffuse: "#ffffff", texture: parquet, specular: "#ffffff", power: 140 }),
      wall: m("lambris", { diffuse: "#ffffff", texture: panelling }),
      ceiling: m("plafond", { diffuse: "#1a1210" }),
      trim: oak,
      doorFrame: oak,
      door: oak,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "sortie", { color: "#d0a060", background: "#100a08", font: "italic 70px serif" }) }),
      counter: oak,
      counterTop: m("marbre noir", { diffuse: "#141214", specular: "#ffffff", power: 160 }),
      backBar: oak,
      shelf: oak,
      glass: (i) => m(`carafe ${i}`, { diffuse: ["#6a2a10", "#a08040", "#d0d0e0"][i % 3], specular: "#ffffff", power: 140, alpha: 0.75 }),
      seat: velvet,
      tableTop: oak,
      metal: m("bronze", { diffuse: "#5a4020", specular: "#c0a060", power: 80 }),
      cabinet: () => oak,
      cabinetSide: () => oak,
      panel: m("pupitre", { diffuse: "#1a1210" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", { diffuse: "#a08040" }),
      scanlines: false,
      oak,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W } } = ctx;
    const key = room.theme.key;
    // Fenêtres : ciel nocturne, puis pluie qui ruisselle par-dessus, croisillons de bois.
    const sky = std(scene, `${key} · nuit`, { diffuse: "#000000", unlit: true, emissiveTexture: paintedTexture(scene, `${key} · nuit`, 512, 512, night) });
    const rainTex = paintedTexture(scene, `${key} · pluie`, 256, 512, rain);
    const rainMat = std(scene, `${key} · pluie`, { diffuse: "#000000", unlit: true, emissiveTexture: rainTex });
    rainMat.opacityTexture = rainTex;
    rainMat.alpha = 0.9;
    ctx.noGlow(rainMat);
    for (const z of [-3, 1.5]) {
      ctx.plane(`fenêtre ${z}`, -W / 2 + 0.02, 2.1, z, 1.8, 2.6, sky, -Math.PI / 2);
      ctx.plane(`pluie ${z}`, -W / 2 + 0.04, 2.1, z, 1.8, 2.6, rainMat, -Math.PI / 2);
      ctx.box(`meneau ${z}`, -W / 2 + 0.07, 2.1, z, 0.06, 2.6, 0.06, look.oak);
      ctx.box(`traverse ${z}`, -W / 2 + 0.07, 2.4, z, 0.06, 0.06, 1.8, look.oak);
      for (const dz of [-0.93, 0.93]) ctx.box(`jambage ${z} ${dz}`, -W / 2 + 0.07, 2.1, z + dz, 0.1, 2.7, 0.08, look.oak);
      ctx.box(`appui ${z}`, -W / 2 + 0.12, 0.78, z, 0.2, 0.06, 2, look.oak);
    }
    // Éclair : projecteur blanc-bleu derrière les fenêtres, éteint hors des flashs.
    const lightning = ctx.spot("éclair", [-W / 2 - 4, 5, -1], [1, -0.7, 0.1], "#c8d8ff", 0, 1.3, 1, 30);
    ctx.shadows(lightning, { size: 1024, darkness: 0.2, soft: false });
    // Bougies : chandeliers sur le bar et la table.
    const wax = std(scene, `${key} · cire`, { diffuse: "#f0e8d0" });
    const flameMat = std(scene, `${key} · flamme`, { diffuse: "#000000", emissive: "#ffb050" });
    const candles = [];
    for (const [x, y, z] of [[-4.6, 0.78, -2], [-2.2, 1.1, 4], [1.8, 1.1, 4]]) {
      for (const dx of [-0.08, 0.08]) {
        const c = CreateCylinder(`${key} · bougie ${x} ${dx}`, { height: 0.22, diameter: 0.04, tessellation: 10 }, scene);
        c.position.copyFrom(ctx.local(x + dx, y + 0.11, z));
        ctx.add(c, wax);
        const f = CreateCylinder(`${key} · flamme ${x} ${dx}`, { height: 0.05, diameterTop: 0, diameterBottom: 0.025, tessellation: 8 }, scene);
        f.position.copyFrom(ctx.local(x + dx, y + 0.25, z));
        ctx.add(f, flameMat);
      }
      candles.push(ctx.point(`bougie ${x}`, x, y + 0.35, z, "#ffa040", 1.6, 7));
    }
    const sconce = ctx.point("applique", 7.3, 2.4, 0, "#ff9040", 1.2, 8);
    candles.push(sconce);
    // Lumière d'ambiance partagée par la carte ; les mises à jour ne tournent que dans la salle active.
    const hemi = scene.getLightByName("ciel");
    const hemiBase = room.theme.ambient.hemi;
    ctx.onUpdate((time) => {
      // Éclair : période d'environ 7 s, deux flashs rapprochés puis décroissance.
      const t = time % 7.3;
      const flash = Math.max(Math.exp(-((t - 0.05) ** 2) / 0.002), 0.7 * Math.exp(-((t - 0.3) ** 2) / 0.004), Math.exp(-t * 3) * (t > 0.3 ? 0.4 : 0));
      lightning.intensity = 0.7 + flash * 4;
      if (hemi) hemi.intensity = hemiBase + flash * 0.5;
      sky.emissiveColor.setAll(1 + flash * 2);
      rainTex.uOffset = 0;
      rainTex.vOffset = (time * 0.6) % 1;
      for (const [k, light] of candles.entries()) light.intensity = (k === candles.length - 1 ? 1.2 : 1.6) * (0.85 + 0.12 * Math.sin(time * 11 + k * 1.7) + 0.05 * Math.sin(time * 27 + k));
    });
  },
};
