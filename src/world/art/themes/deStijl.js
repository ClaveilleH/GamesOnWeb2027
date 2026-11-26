import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 49 · De Stijl / Bauhaus : murs composés d'une grille de lignes noires épaisses et de grands aplats
// rouge, bleu, jaune sur fond blanc (composition générée), mobilier en volumes purs aux couleurs
// primaires, lumière franche de grand atelier, ombres nettes, sol blanc laqué qui reflète. Sculptures
// élémentaires : cylindre, cube, sphère.
const palette = { background: "#f4f1ea", primary: "#d42a20", secondary: "#1a4aa8", accent: "#f4c20d", text: "#111111" };
const RED = "#d42a20";
const BLUE = "#1a4aa8";
const YELLOW = "#f4c20d";

// Composition : découpe récursive en rectangles, quelques-uns remplis de primaires, lignes noires.
function composition(ctx, w, h, seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, w, h);
  const rects = [];
  const split = (x, y, rw, rh, depth) => {
    if (depth === 0 || (rw < 160 && rh < 160)) {
      rects.push([x, y, rw, rh]);
      return;
    }
    if (rw > rh) {
      const cut = rw * (0.3 + rand() * 0.4);
      split(x, y, cut, rh, depth - 1);
      split(x + cut, y, rw - cut, rh, depth - 1);
    } else {
      const cut = rh * (0.3 + rand() * 0.4);
      split(x, y, rw, cut, depth - 1);
      split(x, y + cut, rw, rh - cut, depth - 1);
    }
  };
  split(0, 0, w, h, 6);
  for (const [x, y, rw, rh] of rects) {
    const r = rand();
    if (r < 0.12) ctx.fillStyle = RED;
    else if (r < 0.22) ctx.fillStyle = BLUE;
    else if (r < 0.3) ctx.fillStyle = YELLOW;
    else if (r < 0.33) ctx.fillStyle = "#111111";
    else continue;
    ctx.fillRect(x, y, rw, rh);
  }
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 12;
  for (const [x, y, rw, rh] of rects) ctx.strokeRect(x, y, rw, rh);
}

export const deStijl = {
  key: "de-stijl",
  title: "De Stijl / Bauhaus",
  ambient: { hemi: 0.65, sky: "#ffffff", ground: "#c8c4bc", sun: 0 },
  image: { contrast: 1.1 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, specular: "#202020", ...extra });
    const wallTex = paintedTexture(scene, `${name} · composition`, 2048, 512, (c, w, h) => composition(c, w, h, 4242));
    const red = m("rouge", RED);
    const blue = m("bleu", BLUE);
    const yellow = m("jaune", YELLOW);
    const black = m("noir", "#111111");
    const white = m("blanc", "#f4f1ea");
    const screens = new Map();
    return {
      palette,
      floor: m("sol laqué", "#ecebe6", { specular: "#ffffff", power: 140 }),
      wall: m("composition", "#ffffff", { texture: wallTex }),
      ceiling: white,
      trim: black,
      doorFrame: black,
      door: yellow,
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "AUSGANG", { color: "#f4f1ea", background: "#111111", font: "bold 74px sans-serif" }) }),
      counter: blue,
      counterTop: black,
      backBar: white,
      shelf: black,
      glass: (i) => [red, blue, yellow, white][i % 4],
      seat: red,
      tableTop: yellow,
      metal: black,
      cabinet: (i) => [red, blue, yellow, white][i % 4],
      cabinetSide: () => black,
      panel: white,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: (i) => [red, yellow, blue][i % 3],
      scanlines: false,
      red, blue, yellow, black,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    // Sculptures élémentaires sur socles noirs : cylindre rouge, cube bleu, sphère jaune.
    ctx.box("socle cube", 1.6, 0.25, 4.8, 0.7, 0.5, 0.7, look.black);
    const cube = ctx.box("cube", 1.6, 0.85, 4.8, 0.6, 0.6, 0.6, look.blue);
    ctx.box("socle cylindre", 3, 0.2, 4.6, 0.6, 0.4, 0.6, look.black);
    const cyl = CreateCylinder(`${key} · cylindre`, { height: 1.1, diameter: 0.45, tessellation: 32 }, scene);
    cyl.position.copyFrom(ctx.local(3, 0.95, 4.6));
    ctx.add(cyl, look.red);
    ctx.box("socle sphère", 0.3, 0.3, 4.9, 0.5, 0.6, 0.5, look.black);
    const ball = CreateSphere(`${key} · sphère`, { diameter: 0.5, segments: 32 }, scene);
    ball.position.copyFrom(ctx.local(0.3, 0.85, 4.9));
    ctx.add(ball, look.yellow);
    // Lumière d'atelier : grande verrière zénithale simulée par un projecteur large à ombres nettes.
    const sky = ctx.spot("verrière", [-2, H + 3, -2], [0.25, -1, 0.2], "#ffffff", 1.1, 2.4, 1, 18);
    ctx.shadows(sky, { size: 2048, darkness: 0.35, soft: false });
    ctx.point("remplissage", 4, H - 0.3, 2, "#ffffff", 0.3, 12);
    ctx.mirrorFloor(look.floor, { level: 0.25, blur: 3 });
    ctx.onUpdate((time) => {
      cube.rotation.y = time * 0.25;
    });
  },
};
