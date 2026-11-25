import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 15 · Lumière noire : salle presque noire, éclairée par des tubes UV violets. Ce ne sont pas les
// lampes qui brillent mais les surfaces : moquette d'arcade à motifs cosmiques, éclaboussures de peinture
// fluo aux murs, liserés et bouteilles fluorescents. La fluorescence « respire » au rythme des tubes.
const palette = { background: "#07020f", primary: "#39ff14", secondary: "#ff2fd6", accent: "#fff700", text: "#ffffff" };
const FLUO = ["#39ff14", "#ff2fd6", "#fff700", "#00e5ff", "#ff7b00"];

function carpet(ctx, w, h) {
  ctx.fillStyle = "#06020c";
  ctx.fillRect(0, 0, w, h);
  const rand = (n) => Math.random() * n;
  // Planètes à anneau, étoiles, éclairs et gribouillis, répartis au hasard.
  for (let i = 0; i < 90; i++) {
    const x = rand(w);
    const y = rand(h);
    const c = FLUO[i % FLUO.length];
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.lineWidth = 4;
    switch (i % 4) {
      case 0:
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x, y, 30, 8, -0.4, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 1:
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const r = k % 2 ? 6 : 15;
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.fill();
        break;
      case 2:
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 12, y + 18);
        ctx.lineTo(x + 4, y + 18);
        ctx.lineTo(x + 16, y + 38);
        ctx.stroke();
        break;
      default:
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 1; k < 6; k++) ctx.quadraticCurveTo(x + k * 10 - 5, y + (k % 2 ? -14 : 14), x + k * 10, y);
        ctx.stroke();
    }
  }
}

function splatter(ctx, w, h) {
  ctx.fillStyle = "#0a0612";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.7;
    const c = FLUO[i % FLUO.length];
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, 18 + Math.random() * 30, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 70;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + Math.random() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    // Coulure vers le bas.
    ctx.fillRect(x - 3, y, 6, 40 + Math.random() * 120);
  }
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, h * 0.8, w, h * 0.2);
  ctx.fillStyle = "#39ff14";
  ctx.fillRect(0, h * 0.8, w, 5);
}

export const blacklight = {
  key: "lumiere-noire",
  title: "Lumière noire",
  ambient: { hemi: 0.08, sky: "#6a2cff", ground: "#000000", sun: 0 },
  image: { contrast: 1.2, exposure: 1.1, vignette: 1.4 },
  glow: 1.2,

  look(scene, name) {
    // Fluorescent : diffuse quasi noire, texture émissive dont l'intensité est modulée à l'animation.
    const fluo = (label, texture) => std(scene, `${name} · ${label}`, { diffuse: "#0b0614", emissiveTexture: texture });
    const glow = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: "#000000", emissive: hex });
    const dark = (label) => std(scene, `${name} · ${label}`, { diffuse: "#1a1030", specular: "#6a2cff", power: 40 });
    const carpetTex = paintedTexture(scene, `${name} · moquette`, 1024, 1024, carpet);
    carpetTex.uScale = 3;
    carpetTex.vScale = 2.25;
    const wallTex = paintedTexture(scene, `${name} · éclaboussures`, 2048, 512, splatter);
    const floor = fluo("moquette", carpetTex);
    const wall = fluo("mur", wallTex);
    const screens = new Map();
    const black = dark("noir");
    return {
      palette,
      floor,
      wall,
      ceiling: dark("plafond"),
      trim: glow("plinthe", "#39ff14"),
      doorFrame: glow("cadre", "#ff2fd6"),
      door: black,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "→ GLOW ON", { color: "#fff700", background: "#07020f", glow: 20 }) }),
      counter: black,
      counterTop: glow("plateau", "#00e5ff"),
      backBar: black,
      shelf: glow("étagère", "#ff2fd6"),
      glass: (i) => glow(`bouteille ${i}`, FLUO[i % FLUO.length]),
      seat: glow("assise", "#ff7b00"),
      tableTop: glow("table", "#39ff14"),
      metal: black,
      cabinet: () => black,
      cabinetSide: () => fluo("flanc", wallTex),
      cabinetEdge: (i) => glow(`liseré ${i}`, FLUO[i % FLUO.length]),
      panel: black,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => glow(`bouton ${i}`, FLUO[i % FLUO.length]),
      fluorescent: [floor, wall],
    };
  },

  decorate(ctx) {
    const { look, scene, ROOM: { width: W, depth: D, height: H } } = ctx;
    // Tubes UV au plafond : violet profond, lumières faibles.
    const tube = std(scene, "lumière noire · tube", { diffuse: "#000000", emissive: "#7b2cff" });
    for (const z of [-3, 0, 3]) ctx.box(`tube ${z}`, 0, H - 0.06, z, W - 2, 0.05, 0.05, tube);
    for (const [x, z] of [[-4, -2], [-3, 3], [4, 0]]) ctx.point(`UV ${x} ${z}`, x, H - 0.4, z, "#6a2cff", 0.8, 9);
    ctx.point("bar", -3.2, 2, D / 2 - 1.5, "#ff2fd6", 0.4, 5);
    // La fluorescence pulse doucement ; les tubes vacillent légèrement.
    ctx.onUpdate((time) => {
      const k = 0.85 + 0.15 * Math.sin(time * 1.3);
      // emissiveColor s'ajoute à la texture : on module plutôt l'intensité de la texture.
      for (const mat of look.fluorescent) mat.emissiveTexture.level = k;
      const flick = 0.9 + 0.1 * Math.sin(time * 31) * Math.sin(time * 4.7);
      tube.emissiveColor.set(0.48 * flick, 0.17 * flick, flick);
    });
  },
};
