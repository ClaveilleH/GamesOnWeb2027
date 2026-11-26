import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 30 · Pâte à modeler : tout semble modelé à la main. Couleurs franches et mates, empreintes de
// doigts et petites bosses (texture de relief partagée), lumière douce de studio avec ombres floues.
// Des figurines en pâte (chat sur le comptoir, plante, escargot) bougent par à-coups à 12 images par
// seconde, comme en stop motion, et respirent en se déformant légèrement.
const palette = { background: "#2b2d42", primary: "#ffbe0b", secondary: "#fb5607", accent: "#3a86ff", text: "#ffffff" };

// Relief commun : empreintes de doigts (arcs concentriques) et petites bosses, en carte de normales
// approximative (teinte bleutée neutre, variations rouge/vert selon la pente).
function fingerprints(ctx, w, h) {
  ctx.fillStyle = "rgb(128,128,255)";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 4 + Math.random() * 14;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, "rgba(160,160,255,0.6)");
    g.addColorStop(1, "rgba(100,100,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    for (let k = 1; k < 9; k++) {
      ctx.strokeStyle = k % 2 ? "rgba(150,140,255,0.5)" : "rgba(108,118,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, k * 4, k * 3, 0.4, 0.2, Math.PI * 1.6);
      ctx.stroke();
    }
  }
}

export const clay = {
  key: "pate-a-modeler",
  title: "Pâte à modeler",
  ambient: { hemi: 0.55, sky: "#fff6e8", ground: "#5a4a6a", sun: 0 },
  image: { contrast: 1.05, saturation: 15 },
  glow: 0,

  look(scene, name) {
    const bump = paintedTexture(scene, `${name} · empreintes`, 512, 512, fingerprints);
    bump.uScale = 2;
    bump.vScale = 2;
    // Pâte : couleur mate, petit reflet gras, relief d'empreintes.
    const cache = new Map();
    const clayMat = (label, hex) => {
      if (cache.has(hex)) return cache.get(hex);
      const m = std(scene, `${name} · pâte ${label}`, { diffuse: hex, specular: "#3a3a3a", power: 18 });
      m.bumpTexture = bump;
      m.bumpTexture.level = 1.3;
      cache.set(hex, m);
      return m;
    };
    const screens = new Map();
    return {
      palette,
      floor: clayMat("sol", "#8ecae6"),
      wall: clayMat("mur", "#ffe5b4"),
      ceiling: clayMat("plafond", "#fff1d6"),
      trim: clayMat("plinthe", "#fb5607"),
      doorFrame: clayMat("cadre", "#8338ec"),
      door: clayMat("porte", "#ffbe0b"),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Ta-daa !", { color: "#fb5607", background: "#fff1d6", font: "900 80px sans-serif" }) }),
      counter: clayMat("bar", "#ff006e"),
      counterTop: clayMat("plateau", "#ffbe0b"),
      backBar: clayMat("fond du bar", "#3a86ff"),
      shelf: clayMat("étagère", "#8338ec"),
      glass: (i) => clayMat(`bouteille ${i}`, ["#06d6a0", "#ffbe0b", "#fb5607", "#ffffff"][i % 4]),
      seat: clayMat("assise", "#06d6a0"),
      tableTop: clayMat("table", "#fb5607"),
      metal: clayMat("pied", "#2b2d42"),
      cabinet: (i) => clayMat(`borne ${i}`, ["#3a86ff", "#ff006e", "#06d6a0", "#8338ec", "#ffbe0b"][i % 5]),
      cabinetSide: (i) => clayMat(`flanc ${i}`, ["#ffbe0b", "#3a86ff", "#ff006e"][i % 3]),
      panel: clayMat("pupitre", "#2b2d42"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => clayMat(`bouton ${i}`, ["#ff006e", "#ffbe0b", "#06d6a0"][i % 3]),
      scanlines: false,
      clayMat,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    const ball = (label, d, x, y, z, hex, sx = 1, sy = 1, sz = 1) => {
      const mesh = CreateSphere(`${key} · ${label}`, { diameter: d, segments: 12 }, scene);
      mesh.position.copyFrom(ctx.local(x, y, z));
      mesh.scaling.set(sx, sy, sz);
      return ctx.add(mesh, look.clayMat(label, hex));
    };
    // Chat orange sur le comptoir : corps, tête, oreilles, queue.
    const cat = [
      ball("chat corps", 0.4, -2.2, 1.28, 3.9, "#fb8500", 1.3, 0.8, 0.9),
      ball("chat tête", 0.26, -1.95, 1.45, 3.9, "#fb8500"),
      ball("chat oreille g", 0.08, -1.92, 1.6, 3.83, "#fb8500", 1, 1.5, 1),
      ball("chat oreille d", 0.08, -1.92, 1.6, 3.97, "#fb8500", 1, 1.5, 1),
      ball("chat œil g", 0.04, -1.83, 1.48, 3.85, "#2b2d42"),
      ball("chat œil d", 0.04, -1.83, 1.48, 3.95, "#2b2d42"),
    ];
    const tail = CreateCapsule(`${key} · chat queue`, { height: 0.45, radius: 0.04 }, scene);
    tail.position.copyFrom(ctx.local(-2.5, 1.4, 3.9));
    tail.rotation.z = 0.6;
    ctx.add(tail, look.clayMat("queue", "#fb8500"));
    // Plante en pot dans l'angle : pot, tiges en capsules, feuilles en boules aplaties.
    ball("pot", 0.5, -7.2, 0.25, -5.2, "#c1440e", 1, 1.1, 1);
    const leaves = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      leaves.push(ball(`feuille ${k}`, 0.35, -7.2 + Math.cos(a) * 0.25, 0.65 + (k % 3) * 0.2, -5.2 + Math.sin(a) * 0.25, "#2a9d8f", 1, 0.35, 0.6));
    }
    // Escargot qui avance le long du mur nord.
    const snail = [ball("escargot coquille", 0.3, 2, 0.17, 5.6, "#ffbe0b", 1, 1, 0.6), ball("escargot corps", 0.2, 2.22, 0.08, 5.6, "#9ef01a", 1.8, 0.5, 0.7)];
    // Lumière de studio : douce, deux projecteurs à ombres floues.
    const keyLight = ctx.spot("projecteur", [-2, H - 0.1, -4], [0.1, -1, 0.7], "#fff1dc", 1.1, 2.8, 1, 18);
    ctx.shadows(keyLight, { size: 1024, darkness: 0.45, soft: true });
    ctx.point("remplissage", 4, H - 0.5, 1, "#e8f0ff", 0.4, 12);
    // Stop motion : poses quantifiées à 12 images par seconde, petites variations d'une image à l'autre.
    const catBase = cat.map((mesh) => mesh.position.clone());
    const snailBase = snail.map((mesh) => mesh.position.clone());
    ctx.onUpdate((time) => {
      const t = Math.floor(time * 12) / 12;
      const jitter = (Math.sin(Math.floor(time * 12) * 12.9898) * 43758.5453) % 1;
      const breathe = 1 + 0.03 * Math.sin(t * 3);
      cat[0].scaling.set(1.3 * breathe, 0.8 / breathe, 0.9);
      cat.slice(1).forEach((mesh, i) => { mesh.position.y = catBase[i + 1].y + Math.sin(t * 2) * 0.02; });
      tail.rotation.z = 0.6 + Math.sin(t * 4) * 0.35;
      leaves.forEach((mesh, k) => { mesh.rotation.y = Math.sin(t * 1.5 + k) * 0.25 + jitter * 0.02; });
      const crawl = (t * 0.06) % 3;
      snail.forEach((mesh, i) => { mesh.position.x = snailBase[i].x + crawl; });
      snail[1].scaling.x = 1.8 + Math.sin(t * 6) * 0.15;
    });
  },
};
