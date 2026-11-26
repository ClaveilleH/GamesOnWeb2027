import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 42 · Grotte bioluminescente : roche sombre et humide, mousse phosphorescente cyan sur les murs,
// champignons géants aux chapeaux lumineux (cyan, magenta, vert) qui respirent, stalactites, lucioles qui
// errent. Le sol mouillé reflète toutes les lueurs. Aucune lumière blanche : seulement le vivant.
const palette = { background: "#020814", primary: "#3fffd8", secondary: "#ff4fd8", accent: "#a0ff60", text: "#bfffff" };
const GLOWS = ["#3fffd8", "#ff4fd8", "#a0ff60"];

// Roche et mousse : la même peinture sert de diffuse (roche + mousse claire) et d'émissive (mousse seule),
// car StandardMaterial multiplie l'émissif par la diffuse.
function moss(ctx, w, h, withRock) {
  ctx.fillStyle = withRock ? "#10141c" : "#000000";
  ctx.fillRect(0, 0, w, h);
  if (withRock) {
    for (let i = 0; i < 300; i++) {
      const v = 18 + Math.floor(Math.random() * 22);
      ctx.fillStyle = `rgba(${v},${v + 4},${v + 12},0.7)`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 34, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
function mossSpots(ctx, w, h, seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 110; i++) {
    const x = rand() * w;
    const y = h * (0.45 + rand() * 0.55);
    const r = 3 + rand() * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(120,255,230,0.95)");
    g.addColorStop(1, "rgba(40,200,180,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const biolum = {
  key: "grotte-bioluminescente",
  title: "Grotte bioluminescente",
  ambient: { hemi: 0.35, sky: "#2a6a8a", ground: "#000000", sun: 0 },
  image: { toneMapping: "aces", exposure: 2.3, contrast: 1.15, vignette: 2.6 },
  fog: { color: "#06182a", density: 0.025 },
  glow: 1.1,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const rockTex = paintedTexture(scene, `${name} · roche`, 1024, 512, (c, w, h) => { moss(c, w, h, true); mossSpots(c, w, h, 7); });
    const glowTex = paintedTexture(scene, `${name} · mousse`, 1024, 512, (c, w, h) => { moss(c, w, h, false); mossSpots(c, w, h, 7); });
    const rock = m("roche", { diffuse: "#ffffff", texture: rockTex, emissiveTexture: glowTex, specular: "#203040", power: 40 });
    const dark = m("roche sombre", { diffuse: "#141820", specular: "#203040", power: 40 });
    const screens = new Map();
    return {
      palette,
      floor: m("sol mouillé", { diffuse: "#0a0e14", specular: "#8090a0", power: 120 }),
      wall: rock,
      ceiling: m("voûte", { diffuse: "#080a10" }),
      trim: dark,
      doorFrame: m("cadre", { diffuse: "#000000", emissive: "#2a9a88" }),
      door: dark,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "sortie", { color: "#3fffd8", background: "#020814", font: "italic 70px serif", glow: 14 }) }),
      counter: dark,
      counterTop: m("dalle", { diffuse: "#1a2028", specular: "#a0b0c0", power: 140 }),
      backBar: dark,
      shelf: dark,
      glass: (i) => m(`fiole ${i}`, { diffuse: "#000000", emissive: GLOWS[i % 3], alpha: 0.85 }),
      seat: m("souche", { diffuse: "#2a2018" }),
      tableTop: m("champignon plat", { diffuse: "#203a40", emissive: "#0a3a34" }),
      metal: dark,
      cabinet: () => dark,
      cabinetSide: () => rock,
      panel: dark,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: "#000000", emissive: GLOWS[i % 3] }),
      scanlines: false,
      glowTex,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Champignons : pied pâle, chapeau lumineux aplati, lamelles sombres dessous.
    const stem = std(scene, `${key} · pied`, { diffuse: "#a0b0b0", emissive: "#102020" });
    const caps = GLOWS.map((hex) => std(scene, `${key} · chapeau ${hex}`, { diffuse: "#000000", emissive: hex }));
    const shrooms = [];
    const lit = new Set([0, 3, 6, 9, 10, 11]);
    [[-6.8, -4.8, 1.6, 0], [-7.2, -3.6, 0.9, 1], [-6.2, -5.3, 0.6, 2], [6.9, 5.1, 1.4, 1], [6.3, 5.4, 0.7, 0],
      [-7.1, 1.5, 1.1, 2], [2.5, 5.2, 1.3, 0], [3.3, 5.4, 0.6, 1], [-0.8, -5.3, 0.8, 2],
      [1.5, -1.5, 1.2, 1], [-2.2, 0.6, 0.9, 0], [3.8, 2.2, 1, 2]].forEach(([x, z, size, color], k) => {
      const height = 0.5 * size;
      const foot = CreateCylinder(`${key} · pied ${k}`, { height, diameterTop: 0.06 * size + 0.03, diameterBottom: 0.1 * size + 0.04, tessellation: 12 }, scene);
      foot.position.copyFrom(ctx.local(x, height / 2, z));
      ctx.add(foot, stem);
      const cap = CreateSphere(`${key} · chapeau ${k}`, { diameter: 0.55 * size, segments: 16, slice: 0.5 }, scene);
      cap.position.copyFrom(ctx.local(x, height, z));
      cap.scaling.y = 0.6;
      ctx.add(cap, caps[color]);
      shrooms.push({ cap, phase: k * 1.7, size });
      if (lit.has(k)) ctx.point(`lueur ${k}`, x, height + 0.3, z, GLOWS[color], 1.1 * size, 5 + size * 2);
    });
    // Stalactites : cônes sombres au plafond, pointe humide.
    const drip = std(scene, `${key} · stalactite`, { diffuse: "#1a2028", specular: "#6080a0", power: 60 });
    for (let k = 0; k < 18; k++) {
      const len = 0.3 + Math.random() * 0.9;
      const cone = CreateCylinder(`${key} · stalactite ${k}`, { height: len, diameterTop: 0.12 + Math.random() * 0.12, diameterBottom: 0, tessellation: 8 }, scene);
      cone.position.copyFrom(ctx.local((Math.random() - 0.5) * (W - 1), H - len / 2, (Math.random() - 0.5) * (D - 1)));
      ctx.add(cone, drip);
    }
    // Lucioles : points vert-jaune qui errent et clignotent.
    const flyMat = std(scene, `${key} · luciole`, { diffuse: "#000000", emissive: "#d0ff60" });
    const flies = [];
    for (let k = 0; k < 30; k++) {
      const fly = CreateSphere(`${key} · luciole ${k}`, { diameter: 0.04, segments: 4 }, scene);
      fly.isPickable = false;
      ctx.add(fly, flyMat);
      flies.push({ fly, x: (Math.random() - 0.5) * (W - 2), y: 0.6 + Math.random() * 2.2, z: (Math.random() - 0.5) * (D - 2), phase: Math.random() * 20 });
    }
    ctx.point("bar", -3.2, H - 0.8, 3.6, "#3fffd8", 0.6, 8);
    ctx.mirrorFloor(look.floor, { level: 0.5, blur: 3 });
    ctx.onUpdate((time) => {
      look.glowTex.level = 0.75 + 0.25 * Math.sin(time * 0.6);
      for (const { cap, phase, size } of shrooms) {
        const b = 1 + 0.04 * Math.sin(time * 1.3 + phase);
        cap.scaling.set(b, 0.6 / b, b);
        cap.visibility = 0.8 + 0.2 * Math.sin(time * 0.9 + phase * size);
      }
      const origin = ctx.local(0, 0, 0);
      for (const f of flies) {
        f.fly.position.set(origin.x + f.x + Math.sin(time * 0.4 + f.phase) * 0.8, f.y + Math.sin(time * 0.7 + f.phase * 2) * 0.3, origin.z + f.z + Math.cos(time * 0.35 + f.phase) * 0.8);
        f.fly.isVisible = Math.sin(time * 1.8 + f.phase * 3) > -0.3;
      }
    });
  },
};
