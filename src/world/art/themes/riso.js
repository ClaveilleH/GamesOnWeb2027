import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 53 · Risographie : l'image est « imprimée » en trois encres de riso (rose fluo, bleu, jaune) sur
// papier blanc cassé. Chaque encre est une trame de points d'angle différent dont la taille suit sa
// densité ; les passages sont légèrement décalés (repérage imparfait) et l'encre mord le papier
// irrégulièrement. Les encres se superposent en multiplication, comme sur papier.
const palette = { background: "#f6f1e7", primary: "#ff48b0", secondary: "#0078bf", accent: "#ffe800", text: "#1a1a1a" };

Effect.ShadersStore.artRisoFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// Trame : point de rayon proportionnel à la racine de la densité, grille tournée d'un angle a.
float screenDot(vec2 px, float a, float cell, float density) {
  mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 q = r * px / cell;
  vec2 f = fract(q) - 0.5;
  float radius = sqrt(clamp(density, 0.0, 1.0)) * 0.62;
  return 1.0 - smoothstep(radius - 0.08, radius + 0.08, length(f));
}
void main(void) {
  vec2 px = vUV * screen;
  float cell = max(6.0, screen.y / 110.0);
  // Densités des trois encres, lues avec un léger décalage par passage.
  vec3 a = texture2D(textureSampler, (px + vec2(1.5, -1.0)) / screen).rgb;
  vec3 b = texture2D(textureSampler, (px + vec2(-1.2, 1.4)) / screen).rgb;
  vec3 c = texture2D(textureSampler, px / screen).rgb;
  // Rose ≈ absence de vert, bleu ≈ absence de rouge, jaune ≈ absence de bleu (soustractif simplifié).
  float pink = 1.0 - a.g;
  float blue = 1.0 - b.r;
  float yellow = 1.0 - c.b;
  // Composante grise commune : confiée au bleu (encre la plus sombre), retirée des deux autres.
  float gray = min(pink, min(blue, yellow));
  pink = pow(max(0.0, pink - gray), 0.8);
  yellow = pow(max(0.0, yellow - gray), 0.8);
  blue = pow(max(0.0, blue - gray), 0.8) + gray * 1.1;
  vec3 paper = vec3(0.965, 0.945, 0.905);
  vec3 col = paper;
  float grain = 0.85 + 0.3 * hash(floor(px));
  col *= mix(vec3(1.0), vec3(1.0, 0.28, 0.69), screenDot(px + 3.0, 0.26, cell, pink) * grain);
  col *= mix(vec3(1.0), vec3(0.0, 0.47, 0.75), screenDot(px - 2.0, 1.31, cell, blue) * grain);
  col *= mix(vec3(1.0), vec3(1.0, 0.91, 0.0), screenDot(px, 0.79, cell, yellow * 0.9) * grain);
  gl_FragColor = vec4(col, 1.0);
}`;

export const riso = {
  key: "risographie",
  title: "Risographie",
  ambient: { hemi: 0.95, sky: "#ffffff", ground: "#808080", sun: 0 },
  image: { contrast: 1.15, exposure: 1.2 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#d8e0ff"),
      wall: m("mur", "#fff2f8"),
      ceiling: m("plafond", "#f0f0ff"),
      trim: m("plinthe", "#3050a0"),
      doorFrame: m("cadre", "#ff70c0"),
      door: m("porte", "#ffe060"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE ↗", { color: "#0078bf", background: "#ffffff", font: "900 76px sans-serif" }) }),
      counter: m("bar", "#ff70c0"),
      counterTop: m("plateau", "#ffe060"),
      backBar: m("fond du bar", "#3050a0"),
      shelf: m("étagère", "#ffffff"),
      glass: (i) => m(`bouteille ${i}`, ["#ff70c0", "#3a80d0", "#ffe060", "#40c080"][i % 4]),
      seat: m("assise", "#3a80d0"),
      tableTop: m("table", "#ffe060"),
      metal: m("pied", "#203060"),
      cabinet: (i) => m(`borne ${i}`, ["#ff70c0", "#3a80d0", "#ffe060", "#40c080"][i % 4]),
      cabinetSide: () => m("flanc", "#203060"),
      panel: m("pupitre", "#ffffff"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", "#ff70c0"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    const key = ctx.spot("lampe", [-4, H - 0.1, -4], [0.5, -1, 0.6], "#ffffff", 1.1, 2.2, 1, 18);
    ctx.shadows(key, { size: 1024, darkness: 0.2, soft: true });
  },

  post(scene, camera) {
    const pass = new PostProcess("riso", "artRiso", ["screen"], null, 1, camera);
    pass.onApply = (effect) => effect.setFloat2("screen", pass.width, pass.height);
    return () => pass.dispose(camera);
  },
};
