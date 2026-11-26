import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 73 · Pointillisme : l'image est recomposée en petites touches rondes de couleur, posées sur une
// grille désordonnée (chaque cellule décale sa touche au hasard) sur une toile blanche. Chaque touche
// prend la couleur de la scène sous elle, saturée et poussée vers la teinte pure la plus proche ; deux
// couches de touches décalées se chevauchent et leurs couleurs se mélangent à l'œil, comme dans la
// peinture néo-impressionniste. Une lumière d'après-midi d'été donne des ombres colorées violettes.
const palette = { background: "#fbf8ee", primary: "#2a6ad0", secondary: "#f0a020", accent: "#40a050", text: "#2a2a2a" };

Effect.ShadersStore.artPointillismFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
vec3 saturateColor(vec3 c, float amount) {
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  return clamp(mix(vec3(l), c, amount), 0.0, 1.0);
}
// Une couche de touches : renvoie la couleur et la couverture de la touche la plus proche.
vec4 layer(vec2 px, float cell, vec2 offset) {
  vec2 g = floor((px + offset) / cell);
  vec4 best = vec4(0.0);
  float bestD = 10.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = g + vec2(float(i), float(j));
      vec2 center = (id + 0.2 + 0.6 * hash2(id)) * cell - offset;
      float d = length(px - center) / cell;
      float radius = 0.38 + 0.12 * hash2(id + 7.0).x;
      if (d < radius && d < bestD) {
        bestD = d;
        vec3 c = texture2D(textureSampler, center / screen).rgb;
        // Variation de teinte par touche : une composante est poussée, comme un pigment voisin.
        vec2 h = hash2(id + 3.0);
        c += (vec3(h.x, h.y, 1.0 - h.x) - 0.5) * 0.22;
        best = vec4(saturateColor(c, 1.6), 1.0 - smoothstep(radius - 0.08, radius, d));
      }
    }
  }
  return best;
}
void main(void) {
  vec2 px = vUV * screen;
  float cell = max(5.0, screen.y / 120.0);
  vec3 col = vec3(0.985, 0.972, 0.935);
  vec4 a = layer(px, cell, vec2(0.0));
  col = mix(col, a.rgb, a.a);
  vec4 b = layer(px, cell * 1.1, vec2(cell * 0.5, cell * 0.37));
  col = mix(col, b.rgb, b.a * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

export const pointillism = {
  key: "pointillisme",
  title: "Pointillisme",
  ambient: { hemi: 0.55, sky: "#c0d8ff", ground: "#a07850", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.3, saturation: 25 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("parquet clair", "#d8b080"),
      wall: m("mur", "#a8c8e0"),
      ceiling: m("plafond", "#f0ecd8"),
      trim: m("plinthe", "#f0ecd8"),
      doorFrame: m("cadre", "#f0ecd8"),
      door: m("porte", "#40a050"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Sortie", { color: "#2a4a8a", background: "#fbf8ee", font: "italic bold 72px serif" }) }),
      counter: m("bar", "#e08030"),
      counterTop: m("plateau", "#f0ecd8"),
      backBar: m("fond du bar", "#3a7a50"),
      shelf: m("étagère", "#f0ecd8"),
      glass: (i) => m(`bouteille ${i}`, ["#d03030", "#2a6ad0", "#f0c020"][i % 3]),
      seat: m("assise", "#d03030"),
      tableTop: m("nappe", "#f8f4e8"),
      metal: m("pied", "#3a3a5a"),
      cabinet: (i) => m(`borne ${i}`, ["#2a6ad0", "#d03030", "#40a050", "#f0c020"][i % 4]),
      cabinetSide: () => m("flanc", "#f0ecd8"),
      panel: m("pupitre", "#3a3a5a"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", "#f0c020"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { width: W } } = ctx;
    // Soleil d'après-midi chaud par l'ouest ; le ciel bleu de l'ambiance colore les ombres.
    const sun = ctx.spot("soleil", [-W / 2 - 4, 6, -2], [1, -0.7, 0.3], "#ffe0a0", 2, 1.3, 1, 30);
    ctx.shadows(sun, { size: 1024, darkness: 0.1, soft: true });
  },

  post(scene, camera) {
    const pass = new PostProcess("pointillisme", "artPointillism", ["screen"], null, 1, camera);
    pass.onApply = (effect) => effect.setFloat2("screen", pass.width, pass.height);
    return () => pass.dispose(camera);
  },
};
