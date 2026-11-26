import { Effect } from "@babylonjs/core/Materials/effect";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 47 · 3D rétro 32 bits : l'esthétique des premières consoles 3D. Image calculée vers 240 lignes,
// couleurs ramenées à 5 bits par canal avec tramage ordonné 4×4, textures minuscules sans filtrage
// (gros texels nets), brouillard proche et épais qui avale le fond comme une distance d'affichage courte,
// éclairage par sommet tout simple. Les écrans gardent leurs couleurs vives.
const palette = { background: "#101018", primary: "#ffcc33", secondary: "#33aaff", accent: "#ff3355", text: "#ffffff" };

Effect.ShadersStore.artRetro3dFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
uniform float lines;
float bayer(vec2 p) {
  vec2 q = mod(p, 4.0);
  float i = q.x + q.y * 4.0;
  // Matrice de Bayer 4×4 dépliée.
  if (i < 1.0) return 0.0; if (i < 2.0) return 8.0; if (i < 3.0) return 2.0; if (i < 4.0) return 10.0;
  if (i < 5.0) return 12.0; if (i < 6.0) return 4.0; if (i < 7.0) return 14.0; if (i < 8.0) return 6.0;
  if (i < 9.0) return 3.0; if (i < 10.0) return 11.0; if (i < 11.0) return 1.0; if (i < 12.0) return 9.0;
  if (i < 13.0) return 15.0; if (i < 14.0) return 7.0; if (i < 15.0) return 13.0; return 5.0;
}
void main(void) {
  float cell = screen.y / lines;
  vec2 low = floor(vUV * screen / cell);
  vec2 uv = (low + 0.5) * cell / screen;
  vec3 c = texture2D(textureSampler, uv).rgb;
  float threshold = (bayer(low) / 16.0 - 0.5) / 31.0;
  c = floor((c + threshold) * 31.0 + 0.5) / 31.0;
  gl_FragColor = vec4(c, 1.0);
}`;

// Textures volontairement minuscules (32 ou 64 texels) : chaque texel devient un carré net.
function tiny(scene, name, size, paint) {
  return paintedTexture(scene, name, size, size, paint, { pixelated: true, mipmaps: false });
}

export const retro3d = {
  key: "retro-3d",
  title: "3D rétro 32 bits",
  ambient: { hemi: 0.55, sky: "#ffffff", ground: "#404060", sun: 0 },
  image: { contrast: 1.1, saturation: 20 },
  fog: { color: "#201830", density: 0.11 },
  glow: 0,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const checker = tiny(scene, `${name} · carrelage`, 32, (c, w, h) => {
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          c.fillStyle = ((x + y) / 8) % 2 ? "#5a3a6a" : "#8a6a9a";
          c.fillRect(x, y, 8, 8);
        }
      }
      c.fillStyle = "#3a2a4a";
      for (let k = 0; k < 20; k++) c.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 1, 1);
    });
    checker.uScale = 8;
    checker.vScale = 6;
    const brick = tiny(scene, `${name} · briques`, 32, (c, w, h) => {
      c.fillStyle = "#3a2030";
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        for (let x = (y / 8) % 2 ? -8 : 0; x < w; x += 16) {
          c.fillStyle = ["#8a3a3a", "#9a4a40", "#7a3030"][(x + y) % 3 === 0 ? 0 : (x + y) % 2];
          c.fillRect(x + 1, y + 1, 14, 6);
        }
      }
    });
    brick.uScale = 10;
    brick.vScale = 3;
    const wood = tiny(scene, `${name} · bois`, 32, (c, w, h) => {
      for (let y = 0; y < h; y += 4) {
        c.fillStyle = y % 8 ? "#8a5a2a" : "#7a4a20";
        c.fillRect(0, y, w, 4);
      }
      c.fillStyle = "#5a3010";
      for (let k = 0; k < 6; k++) c.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 2, 1);
    });
    const metal = tiny(scene, `${name} · métal`, 32, (c, w, h) => {
      c.fillStyle = "#7a8090";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#a0a8b8";
      for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 1);
      c.fillStyle = "#4a5060";
      for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) c.fillRect(x, y, 1, 1);
    });
    const tex = (label, texture, extra = {}) => m(label, { diffuse: "#ffffff", texture, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: tex("carrelage", checker),
      wall: tex("briques", brick),
      ceiling: m("plafond", { diffuse: "#2a2038" }),
      trim: tex("plinthe", metal),
      doorFrame: tex("cadre", metal),
      door: tex("porte", wood),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EXIT", { color: "#ffcc33", background: "#101018", font: "bold 90px monospace" }) }),
      counter: tex("bar", wood),
      counterTop: tex("plateau", metal),
      backBar: tex("fond du bar", wood),
      shelf: tex("étagère", metal),
      glass: (i) => m(`bouteille ${i}`, { diffuse: ["#33aa55", "#ffcc33", "#ff3355", "#33aaff"][i % 4] }),
      seat: m("assise", { diffuse: "#ff3355" }),
      tableTop: tex("table", wood),
      metal: tex("pied", metal),
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#3355cc", "#cc3344", "#33aa55", "#ffaa22"][i % 4] }),
      cabinetSide: () => tex("flanc", metal),
      panel: m("pupitre", { diffuse: "#222230" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: ["#ff3355", "#ffcc33"][i % 2] }),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    // Éclairage simple : deux ponctuelles colorées, comme un éclairage par sommet d'époque.
    ctx.point("néon jaune", -3, H - 0.4, 3, "#ffdd88", 0.8, 9);
    ctx.point("néon bleu", 4, H - 0.4, -1, "#88bbff", 0.8, 10);
  },

  post(scene, camera) {
    const pass = new PostProcess("rétro 3d", "artRetro3d", ["screen", "lines"], null, 1, camera, Texture.NEAREST_SAMPLINGMODE, scene.getEngine());
    pass.onApply = (effect) => {
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setFloat("lines", 240);
    };
    return () => pass.dispose(camera);
  },
};
