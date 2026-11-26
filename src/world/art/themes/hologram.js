import "@babylonjs/core/Rendering/edgesRenderer";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 31 · Hologramme : le mobilier est une projection. Matériaux à effet de Fresnel : bords
// lumineux et centres presque transparents ; arêtes cyan ; lignes de balayage qui défilent sur chaque
// surface ; scintillement et coupures brèves. Fond noir quadrillé, projecteurs au sol et au plafond.
const palette = { background: "#000814", primary: "#3fe8ff", secondary: "#7b61ff", accent: "#ffffff", text: "#bff7ff" };
const CYAN = Color3.FromHexString("#3fe8ff");

export const hologram = {
  key: "hologramme",
  title: "Hologramme",
  ambient: { hemi: 0.15, sky: "#3fe8ff", ground: "#000000", sun: 0 },
  image: { contrast: 1.1, vignette: 1.5 },
  glow: 0.9,

  look(scene, name) {
    const scan = paintedTexture(scene, `${name} · balayage`, 8, 256, (ctx, w, h) => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        ctx.fillStyle = `rgba(63,232,255,${0.35 + (y % 32 === 0 ? 0.5 : 0)})`;
        ctx.fillRect(0, y, w, 3);
      }
    });
    scan.vScale = 6;
    // Matériau holographique : couleur émissive en Fresnel (bords), opacité en Fresnel (centre transparent).
    const holo = (label, hex = "#3fe8ff", strength = 1) => {
      const m = std(scene, `${name} · holo ${label}`, { diffuse: "#000000", emissive: "#000000", emissiveTexture: scan });
      const tint = Color3.FromHexString(hex);
      m.emissiveFresnelParameters = Object.assign(new FresnelParameters(), { bias: 0.15, power: 1.6, leftColor: tint.scale(strength), rightColor: tint.scale(0.35) });
      m.opacityFresnelParameters = Object.assign(new FresnelParameters(), { bias: 0.1, power: 1.4, leftColor: Color3.White(), rightColor: new Color3(0.35, 0.35, 0.35) });
      m.alpha = 0.95;
      m.backFaceCulling = false;
      m.disableDepthWrite = true;
      return m;
    };
    const paintGrid = (ctx, w, h) => {
      ctx.fillStyle = "#000510";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(63,232,255,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(63,232,255,0.12)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 64) ctx.strokeRect(x, 0, 0, h);
      for (let y = 0; y < h; y += 64) ctx.strokeRect(0, y, w, 0);
    };
    // Deux textures distinctes : le clone d'une DynamicTexture ne recopie pas son dessin.
    const grid = paintedTexture(scene, `${name} · grille`, 512, 512, paintGrid);
    grid.uScale = 8;
    grid.vScale = 6;
    const wallGrid = paintedTexture(scene, `${name} · grille murale`, 512, 512, paintGrid);
    wallGrid.uScale = 8;
    wallGrid.vScale = 2;
    const solid = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: hex });
    const screens = new Map();
    const blue = holo("bleu");
    const violet = holo("violet", "#7b61ff");
    const white = holo("blanc", "#e0fbff", 1.2);
    return {
      palette,
      floor: std(scene, `${name} · sol`, { diffuse: "#000000", unlit: true, emissiveTexture: grid }),
      wall: std(scene, `${name} · mur`, { diffuse: "#000000", unlit: true, emissiveTexture: wallGrid }),
      ceiling: solid("plafond", "#000000"),
      trim: std(scene, `${name} · liseré`, { diffuse: "#000000", emissive: "#3fe8ff" }),
      doorFrame: std(scene, `${name} · cadre`, { diffuse: "#000000", emissive: "#7b61ff" }),
      door: violet,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "[ SORTIE ]", { color: "#3fe8ff", background: "#000814", font: "bold 64px monospace", glow: 12 }) }),
      counter: blue,
      counterTop: white,
      backBar: violet,
      shelf: white,
      glass: (i) => [blue, violet, white][i % 3],
      seat: violet,
      tableTop: white,
      metal: blue,
      cabinet: () => blue,
      cabinetSide: () => violet,
      panel: blue,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => white,
      scanlines: false,
      scan,
      holos: [blue, violet, white],
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, height: H } } = ctx;
    // Arêtes cyan sur tout ce qui est projeté.
    const skip = new Set([room.anchors.floor, room.anchors.ceiling, ...room.anchors.walls]);
    const edge = new Color4(CYAN.r, CYAN.g, CYAN.b, 0.9);
    for (const mesh of room.meshes) {
      if (skip.has(mesh) || !look.holos.includes(mesh.material)) continue;
      mesh.enableEdgesRendering(0.95);
      mesh.edgesWidth = 1.6;
      mesh.edgesColor = edge;
    }
    // Projecteurs : barres lumineuses au sol sous chaque zone, lumière cyan diffuse.
    const emitter = std(scene, `${room.theme.key} · projecteur`, { diffuse: "#000000", emissive: "#3fe8ff" });
    ctx.box("projecteur bar", -3.2, 0.02, 3.2, 6.4, 0.03, 0.08, emitter);
    ctx.box("projecteur bornes", W / 2 - 1.3, 0.02, 0, 0.08, 0.03, 10, emitter);
    ctx.box("projecteur table", -4.6, 0.02, -2, 1.6, 0.03, 0.08, emitter);
    ctx.box("projecteur plafond", 0, H - 0.03, 0, W - 2, 0.03, 0.08, emitter);
    ctx.point("halo", 0, 1.5, 0, "#3fe8ff", 0.5, 14);
    // Balayage qui défile, scintillement et coupures brèves.
    ctx.onUpdate((time) => {
      look.scan.vOffset = (time * 0.15) % 1;
      const glitch = Math.sin(time * 17) * Math.sin(time * 3.3) > 0.85;
      const k = glitch ? 0.25 : 0.92 + 0.08 * Math.sin(time * 40);
      for (const m of look.holos) m.alpha = 0.95 * k;
    });
  },
};
