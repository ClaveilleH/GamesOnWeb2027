import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Salle 25 · Vaisseau spatial : la salle de détente d'un vaisseau. Panneaux de coque gris clair et rivets,
// bandes lumineuses bleues au sol et au plafond, grand hublot sur l'espace (planète à anneau, nébuleuse,
// étoiles qui défilent lentement), voyants qui clignotent et gyrophare orange qui tourne près de la porte.
const palette = { background: "#05070d", primary: "#4fc3ff", secondary: "#ff9f1c", accent: "#e0f2ff", text: "#e0f2ff" };

function hull(ctx, w, h) {
  ctx.fillStyle = "#9aa3ad";
  ctx.fillRect(0, 0, w, h);
  const pw = 256;
  const ph = h / 3;
  for (let x = 0; x < w; x += pw) {
    for (let y = 0; y < h; y += ph) {
      const shade = 150 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgb(${shade},${shade + 6},${shade + 14})`;
      ctx.fillRect(x + 4, y + 4, pw - 8, ph - 8);
      ctx.fillStyle = "#5a636d";
      for (const [rx, ry] of [[12, 12], [pw - 14, 12], [12, ph - 14], [pw - 14, ph - 14]]) {
        ctx.beginPath();
        ctx.arc(x + rx, y + ry, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Bandeau d'avertissement jaune et noir en bas.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, h * 0.9, w, h * 0.1);
  ctx.clip();
  for (let x = -h; x < w; x += 40) {
    ctx.fillStyle = (x / 40) % 2 ? "#1a1a1a" : "#f2c200";
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 20, h);
    ctx.lineTo(x + 20 + h * 0.1, h * 0.9);
    ctx.lineTo(x + h * 0.1, h * 0.9);
    ctx.fill();
  }
  ctx.restore();
}

function space(ctx, w, h) {
  ctx.fillStyle = "#02030a";
  ctx.fillRect(0, 0, w, h);
  // Nébuleuse : nappes colorées très douces.
  for (const [x, y, r, c] of [[w * 0.25, h * 0.4, 260, "rgba(120,40,160,0.35)"], [w * 0.4, h * 0.6, 200, "rgba(40,90,180,0.3)"]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
    const s = Math.random() < 0.05 ? 3 : 1.5;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function planet(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = w * 0.3;
  // Anneau arrière, planète, anneau avant.
  const ring = (front) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.scale(1, 0.25);
    ctx.lineWidth = 26;
    ctx.strokeStyle = "rgba(230,200,150,0.8)";
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.65, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
  ring(false);
  const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#ffd9a0");
  g.addColorStop(0.6, "#c0703a");
  g.addColorStop(1, "#2a1008");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(90,40,20,0.35)";
  ctx.lineWidth = 8;
  for (let k = -4; k <= 4; k++) {
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + k * r * 0.22);
    ctx.quadraticCurveTo(cx, cy + k * r * 0.22 + 10, cx + r, cy + k * r * 0.22);
    ctx.stroke();
  }
  ctx.restore();
  ring(true);
}

export const spaceship = {
  key: "vaisseau-spatial",
  title: "Vaisseau spatial",
  ambient: { hemi: 0.4, sky: "#dfeeff", ground: "#2a3440", specular: "#ffffff", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.5, contrast: 1.1, vignette: 1.5 },
  glow: 0.8,

  look(scene, name) {
    const material = (label, options) => {
      const m = pbr(scene, `${name} · ${label}`, options);
      m.usePhysicalLightFalloff = false;
      return m;
    };
    const hullTex = paintedTexture(scene, `${name} · coque`, 2048, 512, hull);
    const floorTex = paintedTexture(scene, `${name} · caillebotis`, 512, 512, (ctx, w, h) => {
      ctx.fillStyle = "#3a414a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#2a3038";
      for (let y = 0; y < h; y += 32) {
        for (let x = (y / 32) % 2 ? 16 : 0; x < w; x += 32) ctx.fillRect(x + 4, y + 10, 20, 6);
      }
    });
    floorTex.uScale = 6;
    floorTex.vScale = 4.5;
    const white = material("composite blanc", { albedo: "#e8edf2", roughness: 0.35 });
    white.clearCoat.isEnabled = true;
    const steel = material("acier", { albedo: "#aab4be", metallic: 1, roughness: 0.25 });
    const dark = material("polymère sombre", { albedo: "#1c2128", roughness: 0.5 });
    const glowBlue = std(scene, `${name} · bande bleue`, { diffuse: "#000000", emissive: "#4fc3ff" });
    const screens = new Map();
    return {
      palette,
      floor: material("caillebotis", { albedo: "#ffffff", metallic: 0.6, roughness: 0.4, texture: floorTex }),
      wall: material("coque", { albedo: "#ffffff", roughness: 0.5, texture: hullTex }),
      ceiling: material("plafond", { albedo: "#7a838d", roughness: 0.6 }),
      trim: glowBlue,
      doorFrame: std(scene, `${name} · sas`, { diffuse: "#000000", emissive: "#ff9f1c" }),
      door: steel,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SAS ▸ PONT B", { color: "#ff9f1c", background: "#10141a", font: "bold 64px monospace", glow: 8 }) }),
      counter: white,
      counterTop: dark,
      backBar: std(scene, `${name} · fond du bar`, { diffuse: "#000000", emissive: "#0a2a40" }),
      shelf: steel,
      glass: (i) => std(scene, `${name} · fiole ${i}`, { diffuse: "#000000", emissive: ["#4fc3ff", "#7cff9e", "#ff9f1c", "#e0f2ff"][i % 4], alpha: 0.8 }),
      seat: dark,
      tableTop: white,
      metal: steel,
      cabinet: () => white,
      cabinetSide: () => dark,
      cabinetEdge: () => glowBlue,
      panel: dark,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => std(scene, `${name} · bouton ${i}`, { diffuse: "#000000", emissive: ["#4fc3ff", "#ff9f1c", "#7cff9e"][i % 3] }),
      scanlines: false,
      shiny: [white, steel],
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Hublot sur le mur ouest : fond étoilé qui défile, planète devant, cadre épais.
    const stars = paintedTexture(scene, `${key} · espace`, 1024, 512, space);
    const starsMat = std(scene, `${key} · espace`, { diffuse: "#000000", unlit: true, emissiveTexture: stars });
    ctx.plane("espace", -W / 2 + 0.02, 2.1, -0.5, 6, 2.4, starsMat, -Math.PI / 2);
    const planetTex = paintedTexture(scene, `${key} · planète`, 512, 512, planet);
    planetTex.hasAlpha = true;
    const planetMat = std(scene, `${key} · planète`, { diffuse: "#000000", unlit: true, emissiveTexture: planetTex });
    planetMat.opacityTexture = planetTex;
    const planetMesh = ctx.plane("planète", -W / 2 + 0.04, 2.2, -1.5, 2, 2, planetMat, -Math.PI / 2);
    const frame = look.metal;
    ctx.box("hublot haut", -W / 2 + 0.12, 3.35, -0.5, 0.25, 0.12, 6.3, frame);
    ctx.box("hublot bas", -W / 2 + 0.12, 0.85, -0.5, 0.35, 0.12, 6.3, frame);
    for (const z of [-3.6, -0.5, 2.6]) ctx.box(`montant ${z}`, -W / 2 + 0.12, 2.1, z, 0.25, 2.5, 0.14, frame);
    // Bandes lumineuses au plafond, voyants qui clignotent le long du mur nord.
    for (const z of [-2.5, 2.5]) ctx.box(`bande ${z}`, 1, H - 0.03, z, W - 4, 0.03, 0.12, look.trim);
    const lights = [];
    for (let k = 0; k < 12; k++) {
      const mat = std(scene, `${key} · voyant ${k}`, { diffuse: "#000000", emissive: ["#7cff9e", "#ff9f1c", "#4fc3ff"][k % 3] });
      ctx.box(`voyant ${k}`, 1 + k * 0.4, 2.6, D / 2 - 0.04, 0.12, 0.08, 0.04, mat);
      lights.push({ mat, base: mat.emissiveColor.clone(), phase: Math.random() * 6, speed: 1 + Math.random() * 4 });
    }
    // Lumières : blanc froid au plafond, bleu du hublot, gyrophare orange près du sas.
    ctx.point("plafond ouest", -3.5, H - 0.4, 0, "#e8f4ff", 0.9, 11);
    ctx.point("plafond est", 3.5, H - 0.4, 0, "#e8f4ff", 0.9, 11);
    ctx.point("hublot", -W / 2 + 1, 2, -0.5, "#6a8cff", 0.6, 7);
    const beacon = ctx.spot("gyrophare", [1.6, 3.6, -D / 2 + 0.4], [1, -0.3, 0], "#ff9f1c", 1.6, 0.9, 2, 12);
    ctx.mirrorFloor(look.floor, { level: 0.15, blur: 24 });
    ctx.probe(look.shiny, { level: 0.6 });
    ctx.onUpdate((time) => {
      stars.uOffset = (time * 0.006) % 1;
      planetMesh.rotation.z = Math.sin(time * 0.05) * 0.05;
      for (const l of lights) {
        const on = Math.sin(time * l.speed + l.phase) > -0.2 ? 1 : 0.15;
        l.mat.emissiveColor.copyFrom(l.base).scaleInPlace(on);
      }
      const a = time * 2.5;
      beacon.direction.set(Math.cos(a), -0.3, Math.sin(a));
    });
  },
};
