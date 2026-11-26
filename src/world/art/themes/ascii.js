import { Effect } from "@babylonjs/core/Materials/effect";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 34 · Art ASCII : l'image est découpée en cellules ; chacune devient un caractère choisi selon sa
// luminance ( . : * o & 8 @ # ), dessiné en phosphore vert sur noir comme un vieux terminal, avec une
// pointe de la couleur d'origine. Les glyphes 5×5 sont codés en nombres (un bit par pixel), décodés en
// arithmétique flottante. La scène elle-même est éclairée franchement pour couvrir toute la gamme.
const palette = { background: "#000000", primary: "#33ff66", secondary: "#a0ffb0", accent: "#ffffff", text: "#33ff66" };

Effect.ShadersStore.artAsciiFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
uniform float cell;
uniform float time;
// Bit (x, y) d'un glyphe 5×5 codé dans n : bit = x + 5·y, ligne du haut en y = 4.
float glyph(float n, vec2 p) {
  p = floor(p * vec2(4.0, -4.0) + 2.5);
  if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y) {
    if (mod(floor(n / exp2(p.x + 5.0 * p.y)), 2.0) == 1.0) return 1.0;
  }
  return 0.0;
}
void main(void) {
  vec2 px = vUV * screen;
  vec2 base = floor(px / cell) * cell;
  vec3 src = texture2D(textureSampler, (base + 0.5 * cell) / screen).rgb;
  float g = dot(src, vec3(0.3, 0.59, 0.11));
  float n = 0.0;
  if (g > 0.06) n = 4096.0;      // .
  if (g > 0.14) n = 65600.0;     // :
  if (g > 0.24) n = 332772.0;    // *
  if (g > 0.34) n = 15255086.0;  // o
  if (g > 0.46) n = 23385164.0;  // &
  if (g > 0.58) n = 15252014.0;  // 8
  if (g > 0.70) n = 13199452.0;  // @
  if (g > 0.82) n = 11512810.0;  // #
  vec2 p = mod(px / (cell * 0.5), 2.0) - vec2(1.0);
  float on = glyph(n, p);
  vec3 phosphor = vec3(0.2, 1.0, 0.4) * (0.55 + 0.6 * g);
  vec3 col = mix(phosphor, src * 1.4 + 0.15, 0.35) * on;
  // Lignes de balayage et léger scintillement du tube.
  col *= 0.9 + 0.1 * sin(px.y * 1.7);
  col *= 0.97 + 0.03 * sin(time * 50.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export const ascii = {
  key: "ascii",
  title: "Art ASCII",
  ambient: { hemi: 0.75, sky: "#ffffff", ground: "#404040", sun: 0 },
  image: { contrast: 1.2 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#2a2a2a", { specular: "#666666", power: 30 }),
      wall: m("mur", "#303030"),
      ceiling: m("plafond", "#101010"),
      trim: m("plinthe", "#1a1a1a"),
      doorFrame: m("cadre", "#e0e0e0"),
      door: m("porte", "#3a3a3a"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "> EXIT_", { color: "#ffffff", background: "#000000", font: "bold 80px monospace" }) }),
      counter: m("bar", "#d0d0d0"),
      counterTop: m("plateau", "#ffffff", { specular: "#ffffff" }),
      backBar: m("fond du bar", "#202020"),
      shelf: m("étagère", "#e8e8e8"),
      glass: (i) => m(`bouteille ${i}`, ["#ff5050", "#50ff80", "#5080ff", "#ffff60"][i % 4], { emissive: "#303030" }),
      seat: m("assise", "#ffffff"),
      tableTop: m("table", "#f0f0f0"),
      metal: m("pied", "#303030"),
      cabinet: (i) => m(`borne ${i}`, ["#c0c0c0", "#707070"][i % 2]),
      cabinetSide: () => m("flanc", "#404040"),
      panel: m("pupitre", "#1a1a1a"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", "#ffffff"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    // Éclairage franc et contrasté : un projecteur à ombres dures donne des aplats sombres et clairs.
    const key = ctx.spot("projecteur", [-3, H - 0.1, -3], [0.4, -1, 0.5], "#ffffff", 1.4, 2.2, 1, 18);
    ctx.shadows(key, { size: 1024, darkness: 0.1, soft: false });
    ctx.point("contre-jour", 5, H - 0.4, 3, "#ffffff", 0.5, 12);
  },

  post(scene, camera) {
    const pass = new PostProcess("ascii", "artAscii", ["screen", "cell", "time"], null, 1, camera, Texture.NEAREST_SAMPLINGMODE, scene.getEngine());
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setFloat("cell", Math.max(6, Math.round(pass.height / 64)));
      effect.setFloat("time", (performance.now() - start) / 1000);
    };
    return () => pass.dispose(camera);
  },
};
