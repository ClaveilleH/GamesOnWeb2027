import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 72 · Chapiteau : toile rayée rouge et crème sur les murs et le plafond, mât central, piste ronde
// en sciure bordée de rouge à étoiles dorées, guirlandes d'ampoules qui chenillent du mât vers les
// murs, poursuite qui balaie la piste et suit lentement le centre. Chaleur, sciure, dorures.
const palette = { background: "#2a0a08", primary: "#d82a20", secondary: "#f4e4c0", accent: "#e8b030", text: "#fff4d8" };

function stripes(ctx, w, h) {
  const n = 16;
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = k % 2 ? "#f4e4c0" : "#c8201a";
    ctx.fillRect((k * w) / n, 0, w / n, h);
  }
  // Festons en bas de la toile.
  ctx.fillStyle = "#e8b030";
  for (let x = 0; x < w; x += w / n) {
    ctx.beginPath();
    ctx.arc(x + w / n / 2, h * 0.9, w / n / 2, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 1);
}

export const circus = {
  key: "chapiteau",
  title: "Chapiteau",
  ambient: { hemi: 0.3, sky: "#ffd8a0", ground: "#5a2010", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.5, contrast: 1.1, vignette: 2.2 },
  glow: 0.9,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const canvas = paintedTexture(scene, `${name} · toile`, 1024, 512, stripes);
    const sawdust = paintedTexture(scene, `${name} · sciure`, 512, 512, (c, w, h) => {
      c.fillStyle = "#c89858";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 6000; i++) {
        const v = Math.random();
        c.fillStyle = v < 0.5 ? "#b08040" : v < 0.85 ? "#d8b070" : "#8a6030";
        c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 1 + Math.random() * 2);
      }
    });
    sawdust.uScale = 4;
    sawdust.vScale = 3;
    const red = m("rouge", { diffuse: "#c8201a", specular: "#ffffff", power: 60 });
    const gold = m("dorure", { diffuse: "#d8a030", specular: "#ffe8a0", power: 120 });
    const screens = new Map();
    return {
      palette,
      floor: m("sciure", { diffuse: "#ffffff", texture: sawdust }),
      wall: m("toile", { diffuse: "#ffffff", texture: canvas }),
      ceiling: m("toile du toit", { diffuse: "#ffffff", texture: canvas }),
      trim: gold,
      doorFrame: gold,
      door: m("rideau", { diffuse: "#6a1010" }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "★ SORTIE ★", { color: "#e8b030", background: "#6a1010", font: "bold 68px serif", glow: 8 }) }),
      counter: red,
      counterTop: gold,
      backBar: m("fond", { diffuse: "#2a1a40" }),
      shelf: gold,
      glass: (i) => m(`bocal ${i}`, { diffuse: ["#f07090", "#40a0f0", "#f0e040"][i % 3], specular: "#ffffff", power: 140, alpha: 0.85 }),
      seat: red,
      tableTop: m("table", { diffuse: "#2a4ab0", specular: "#ffffff", power: 60 }),
      metal: gold,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#c8201a", "#2a4ab0", "#f4e4c0"][i % 3], specular: "#ffffff", power: 50 }),
      cabinetSide: () => gold,
      panel: m("pupitre", { diffuse: "#2a1a10" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => gold,
      scanlines: false,
      red,
      gold,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Mât central et piste : bordure rouge à étoiles dorées.
    const ringX = 1;
    const ringZ = 0.5;
    ctx.box("mât", ringX, H / 2, ringZ, 0.18, H, 0.18, look.gold);
    const kerb = CreateTorus(`${key} · bordure`, { diameter: 4.4, thickness: 0.3, tessellation: 64 }, scene);
    kerb.scaling.y = 0.6;
    kerb.position.copyFrom(ctx.local(ringX, 0.09, ringZ));
    ctx.add(kerb, look.red);
    const starMat = std(scene, `${key} · étoile`, { diffuse: "#000000", emissive: "#e8b030" });
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const s = CreateSphere(`${key} · clou ${k}`, { diameter: 0.07, segments: 6 }, scene);
      s.position.copyFrom(ctx.local(ringX + Math.cos(a) * 2.2, 0.2, ringZ + Math.sin(a) * 2.2));
      ctx.add(s, starMat);
    }
    // Guirlandes d'ampoules du sommet du mât vers les quatre coins et le milieu des murs.
    const bulbOn = std(scene, `${key} · ampoule allumée`, { diffuse: "#000000", emissive: "#ffe0a0" });
    const bulbOff = std(scene, `${key} · ampoule éteinte`, { diffuse: "#000000", emissive: "#5a4020" });
    const bulbs = [];
    const ends = [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [-W / 2, 0], [W / 2, 0], [0, D / 2], [0, -D / 2]];
    for (const [ex, ez] of ends) {
      const n = 14;
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const x = ringX + (ex - ringX) * t;
        const z = ringZ + (ez - ringZ) * t;
        const sag = Math.sin(t * Math.PI) * 0.5;
        const y = H - 0.1 - (H - 0.1 - 2.9) * t - sag;
        const b = CreateSphere(`${key} · ampoule ${ex} ${ez} ${k}`, { diameter: 0.08, segments: 6 }, scene);
        b.position.copyFrom(ctx.local(x, y, z));
        ctx.add(b, bulbOn);
        bulbs.push({ b, k });
      }
    }
    ctx.point("guirlandes", ringX, H - 0.6, ringZ, "#ffd090", 0.8, 14);
    // Poursuite qui balaie la piste.
    const follow = ctx.spot("poursuite", [-6, H - 0.2, -5], [0.6, -0.7, 0.5], "#fff4e0", 2.4, 0.3, 4, 22);
    ctx.shadows(follow, { size: 1024, darkness: 0.3, soft: true });
    // Projecteur coloré tournant sur la toile.
    const wash = ctx.spot("projecteur", [ringX, H - 0.3, ringZ], [1, -0.4, 0], "#ff4080", 1.4, 0.5, 2, 14);
    ctx.point("bar", -1, 2.5, 3.5, "#ffb070", 0.8, 7);
    ctx.point("table", -4.6, 2.5, -2, "#ffb070", 0.7, 6);
    const ringCenter = ctx.local(ringX, 0, ringZ);
    ctx.onUpdate((time) => {
      // Chenillard : une ampoule sur trois s'éteint, le motif avance.
      const step = Math.floor(time * 6);
      for (const { b, k } of bulbs) b.material = (k + step) % 3 === 0 ? bulbOff : bulbOn;
      // Poursuite : vise un point qui tourne sur la piste.
      const a = time * 0.5;
      const target = ringCenter.add(new Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4));
      follow.direction.copyFrom(target.subtract(follow.position).normalize());
      const b = time * 0.8;
      wash.direction.set(Math.cos(b), -0.35, Math.sin(b));
    });
  },
};
