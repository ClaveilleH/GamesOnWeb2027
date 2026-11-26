import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 57 · Écran LCD de console portable : 144 lignes, quatre teintes de vert olive, tramage ordonné
// pour les dégradés, grille visible entre les pixels de la matrice, légère ombre des pixels sur le fond.
const palette = { background: "#9bbc0f", primary: "#0f380f", secondary: "#306230", accent: "#8bac0f", text: "#0f380f" };

Effect.ShadersStore.artLcdFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
float bayer(vec2 p) {
  vec2 q = mod(p, 4.0);
  int i = int(q.x) + int(q.y) * 4;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0;
  return 0.0;
}
vec3 shade(float level) {
  if (level < 0.5) return vec3(0.059, 0.22, 0.059);
  if (level < 1.5) return vec3(0.19, 0.384, 0.19);
  if (level < 2.5) return vec3(0.545, 0.675, 0.059);
  return vec3(0.608, 0.737, 0.059);
}
void main(void) {
  float rows = 144.0;
  float size = screen.y / rows;
  vec2 cell = floor(vUV * screen / size);
  vec2 center = (cell + 0.5) * size / screen;
  vec3 c = texture2D(textureSampler, center).rgb;
  float l = smoothstep(0.08, 0.85, dot(c, vec3(0.3, 0.59, 0.11)));
  float level = floor(clamp(l * 3.0 + bayer(cell) - 0.5, 0.0, 3.0) + 0.5);
  vec3 pixel = shade(level);
  // Grille de la matrice et ombre portée vers le bas-droite.
  vec2 f = fract(vUV * screen / size);
  float gap = step(0.86, max(f.x, f.y));
  vec3 bg = vec3(0.62, 0.74, 0.08);
  vec3 col = mix(pixel, mix(bg, pixel, 0.55), gap);
  vec2 shadowUv = vUV - vec2(1.0, -1.0) * size * 0.35 / screen;
  col *= 0.97 + 0.03 * step(0.5, fract(shadowUv.y * screen.y / size));
  gl_FragColor = vec4(col, 1.0);
}`;

export const lcd = {
  key: "lcd",
  title: "Écran LCD de console portable",
  ambient: { hemi: 0.5, sky: "#ffffff", ground: "#606060", sun: 0 },
  image: { contrast: 1.2 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#787878"),
      wall: m("mur", "#c8c8c8"),
      ceiling: m("plafond", "#202020"),
      trim: m("plinthe", "#202020"),
      doorFrame: m("cadre", "#303030"),
      door: m("porte", "#a0a0a0"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EXIT", { color: "#000000", background: "#ffffff", font: "bold 90px monospace" }) }),
      counter: m("bar", "#606060"),
      counterTop: m("plateau", "#f0f0f0"),
      backBar: m("fond du bar", "#303030"),
      shelf: m("étagère", "#e0e0e0"),
      glass: (i) => m(`bouteille ${i}`, ["#202020", "#909090", "#f0f0f0"][i % 3]),
      seat: m("assise", "#404040"),
      tableTop: m("table", "#f0f0f0"),
      metal: m("pied", "#202020"),
      cabinet: (i) => m(`borne ${i}`, ["#b0b0b0", "#707070"][i % 2]),
      cabinetSide: () => m("flanc", "#303030"),
      panel: m("pupitre", "#202020"),
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
    const key = ctx.spot("lampe", [-3, H - 0.1, -3], [0.4, -1, 0.5], "#ffffff", 1.3, 2.2, 1, 18);
    ctx.shadows(key, { size: 1024, darkness: 0.5, soft: false });
  },

  post(scene, camera) {
    const pass = new PostProcess("lcd", "artLcd", ["screen"], null, 1, camera);
    pass.onApply = (effect) => effect.setFloat2("screen", pass.width, pass.height);
    return () => pass.dispose(camera);
  },
};
