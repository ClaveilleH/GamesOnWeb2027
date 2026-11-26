import { Engine } from "@babylonjs/core/Engines/engine";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 70 · Aurore boréale : refuge de bois clair dont le plafond et le mur nord sont vitrés sur un ciel
// polaire. Deux couches de rideaux d'aurore (vert et violet), peintes en traits verticaux qui
// s'estompent vers le haut, défilent à des vitesses différentes et respirent ; leur lueur verte baigne
// la salle et contraste avec l'orangé du poêle à bois. Sol de pin verni qui reflète le ciel.
const palette = { background: "#020814", primary: "#40ff9a", secondary: "#a060ff", accent: "#ff9040", text: "#e0fff0" };

function polarSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#020610");
  g.addColorStop(1, "#0a1a30");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
    ctx.fillRect(Math.random() * w, Math.random() * h * 0.85, Math.random() < 0.05 ? 2 : 1, Math.random() < 0.05 ? 2 : 1);
  }
  // Montagnes enneigées en silhouette.
  ctx.fillStyle = "#0c1420";
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h * 0.85 - 40 * Math.abs(Math.sin(x * 0.006)) - 20 * Math.sin(x * 0.023));
  ctx.lineTo(w, h);
  ctx.fill();
}

function curtain(ctx, w, h, hue) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  // Traits verticaux dont la base suit une onde : rideau d'aurore.
  for (let x = 0; x < w; x += 2) {
    const base = h * (0.62 + 0.12 * Math.sin(x * 0.012) + 0.05 * Math.sin(x * 0.041));
    const height = h * (0.25 + 0.2 * Math.abs(Math.sin(x * 0.007 + 1)));
    const strength = 0.4 + 0.6 * Math.abs(Math.sin(x * 0.019));
    const g = ctx.createLinearGradient(0, base, 0, base - height);
    g.addColorStop(0, `hsla(${hue},100%,65%,${strength})`);
    g.addColorStop(0.15, `hsla(${hue},100%,55%,${strength * 0.8})`);
    g.addColorStop(1, `hsla(${hue + 40},100%,50%,0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, base - height, 2, height);
  }
}

export const aurora = {
  key: "aurore",
  title: "Aurore boréale",
  ambient: { hemi: 0.35, sky: "#b0d8d0", ground: "#402010", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.6, contrast: 1.1, vignette: 1.8 },
  glow: 0.8,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const pine = paintedTexture(scene, `${name} · pin`, 512, 512, (c, w, h) => {
      for (let y = 0; y < h; y += 32) {
        const v = 180 + Math.random() * 30;
        c.fillStyle = `rgb(${v},${v * 0.75},${v * 0.5})`;
        c.fillRect(0, y, w, 31);
        c.strokeStyle = "rgba(120,80,40,0.25)";
        for (let k = 0; k < 4; k++) {
          c.beginPath();
          c.moveTo(0, y + 4 + k * 7);
          c.bezierCurveTo(w * 0.3, y + 2 + k * 7, w * 0.6, y + 9 + k * 7, w, y + 5 + k * 7);
          c.stroke();
        }
      }
    });
    pine.uScale = 3;
    pine.vScale = 3;
    const wood = m("pin", { diffuse: "#ffffff", texture: pine, specular: "#806040", power: 40 });
    const wool = m("laine", { diffuse: "#a02a20" });
    const screens = new Map();
    return {
      palette,
      floor: m("plancher verni", { diffuse: "#ffffff", texture: pine, specular: "#ffffff", power: 120 }),
      wall: wood,
      ceiling: m("ciel", { diffuse: "#000000", unlit: true, emissiveTexture: paintedTexture(scene, `${name} · voûte`, 1024, 512, polarSky) }),
      trim: m("bois sombre", { diffuse: "#5a3a20" }),
      doorFrame: m("bois sombre", { diffuse: "#5a3a20" }),
      door: wood,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "utgang · sortie", { color: "#ffb060", background: "#1a1008", font: "bold 60px serif" }) }),
      counter: wood,
      counterTop: m("plateau", { diffuse: "#5a3a20", specular: "#ffffff", power: 60 }),
      backBar: wood,
      shelf: m("bois sombre", { diffuse: "#5a3a20" }),
      glass: (i) => m(`bocal ${i}`, { diffuse: ["#c03020", "#d0a040", "#f0f0f0"][i % 3], specular: "#ffffff", power: 140, alpha: 0.8 }),
      seat: wool,
      tableTop: wood,
      metal: m("fonte", { diffuse: "#202020", specular: "#606060", power: 30 }),
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#a02a20", "#2a4a6a", "#e0d0b0"][i % 3] }),
      cabinetSide: () => wood,
      panel: m("pupitre", { diffuse: "#2a1a10" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => wool,
      scanlines: false,
      wood,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Baie vitrée nord : ciel polaire au fond, puis deux rideaux d'aurore en additif devant.
    const skyTex = paintedTexture(scene, `${key} · ciel`, 1024, 512, polarSky);
    const sky = std(scene, `${key} · baie`, { diffuse: "#000000", unlit: true, emissiveTexture: skyTex });
    ctx.plane("baie", 0, H / 2 + 0.3, D / 2 - 0.02, W - 0.6, H - 0.6, sky, 0);
    const layers = [[140, 0.025, 1], [275, -0.017, 0.7]].map(([hue, speed, strength], k) => {
      const tex = paintedTexture(scene, `${key} · aurore ${k}`, 1024, 512, (c, w, h) => curtain(c, w, h, hue));
      const mat = std(scene, `${key} · aurore ${k}`, { diffuse: "#000000", unlit: true, emissiveTexture: tex });
      mat.alphaMode = Engine.ALPHA_ADD;
      mat.alpha = strength;
      mat.disableDepthWrite = true;
      ctx.plane(`aurore baie ${k}`, 0, H / 2 + 0.3, D / 2 - 0.05 - k * 0.01, W - 0.6, H - 0.6, mat, 0);
      // Même rideau au plafond, à plat.
      const top = ctx.plane(`aurore plafond ${k}`, 0, H - 0.03 - k * 0.01, 0, W, D, mat, 0);
      top.rotation.x = -Math.PI / 2;
      return { tex, mat, speed, strength };
    });
    // Montants de la baie.
    for (let k = -3; k <= 3; k++) ctx.box(`montant ${k}`, k * ((W - 0.6) / 6), H / 2 + 0.3, D / 2 - 0.08, 0.08, H - 0.6, 0.08, look.trim);
    // Lueur verte de l'aurore, et poêle à bois orangé dans le coin.
    const glowLight = ctx.point("aurore", 0, H - 0.3, 4, "#40ff9a", 0.45, 12);
    const stove = CreateCylinder(`${key} · poêle`, { height: 1, diameter: 0.7, tessellation: 20 }, scene);
    stove.position.copyFrom(ctx.local(-7.2, 0.5, 4.8));
    ctx.add(stove, std(scene, `${key} · fonte`, { diffuse: "#1a1a1a", specular: "#606060", power: 30 }));
    ctx.box("tuyau", -7.2, (H + 1) / 2, 4.8, 0.15, H - 1, 0.15, std(scene, `${key} · tuyau`, { diffuse: "#1a1a1a" }));
    ctx.box("hublot du poêle", -6.86, 0.5, 4.8, 0.02, 0.25, 0.3, std(scene, `${key} · braises`, { diffuse: "#000000", emissive: "#ff7020" }));
    const fire = ctx.point("poêle", -6.6, 0.7, 4.6, "#ff8030", 1.6, 8);
    ctx.shadows(fire, { size: 1024, darkness: 0.4, soft: true });
    ctx.point("bar", -1, 2.6, 3.5, "#ffc080", 0.9, 7);
    ctx.point("table", -4.6, 2.4, -2, "#ffb070", 0.8, 6);
    ctx.point("bornes", 5.5, 2.4, 0, "#ffb070", 0.7, 6);
    ctx.mirrorFloor(look.floor, { level: 0.2, blur: 8, size: 512 });
    ctx.onUpdate((time) => {
      for (const { tex, mat, speed, strength } of layers) {
        tex.uOffset = (time * speed) % 1;
        mat.alpha = strength * (0.75 + 0.25 * Math.sin(time * 0.6 + speed * 100));
      }
      glowLight.intensity = 0.45 + 0.2 * Math.sin(time * 0.6);
      fire.intensity = 1.6 * (0.85 + 0.1 * Math.sin(time * 8) + 0.05 * Math.sin(time * 21));
    });
  },
};
