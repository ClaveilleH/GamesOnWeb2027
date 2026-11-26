import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 58 · Estampe sur bois : chaque couleur de l'image est ramenée à la plus proche d'une palette
// d'encres d'estampe (bleu de Prusse, indigo, vermillon, ocre, vert-de-gris, chair, papier), les contours
// sont tracés au trait noir, le papier washi montre ses fibres, et un dégradé « bokashi » de bleu
// assombrit le haut de l'image comme le ciel d'une estampe de paysage. Le grain du bois de la planche
// transparaît légèrement dans les aplats.
const palette = { background: "#efe4cc", primary: "#1f3a5f", secondary: "#c8402a", accent: "#d8a040", text: "#1a1a1a" };

Effect.ShadersStore.artWoodblockFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 nearestInk(vec3 c) {
  vec3 inks[8];
  inks[0] = vec3(0.937, 0.894, 0.8);
  inks[1] = vec3(0.122, 0.227, 0.373);
  inks[2] = vec3(0.29, 0.45, 0.62);
  inks[3] = vec3(0.784, 0.251, 0.165);
  inks[4] = vec3(0.847, 0.627, 0.251);
  inks[5] = vec3(0.4, 0.55, 0.45);
  inks[6] = vec3(0.88, 0.74, 0.6);
  inks[7] = vec3(0.12, 0.11, 0.1);
  vec3 best = inks[0];
  float bestD = 10.0;
  for (int k = 0; k < 8; k++) {
    vec3 d = (c - inks[k]) * vec3(1.0, 1.3, 0.8);
    float dd = dot(d, d);
    if (dd < bestD) { bestD = dd; best = inks[k]; }
  }
  return best;
}
float lum(vec2 uv) { return dot(texture2D(textureSampler, uv).rgb, vec3(0.3, 0.59, 0.11)); }
void main(void) {
  vec2 t = 1.5 / screen;
  vec3 c = texture2D(textureSampler, vUV).rgb;
  // Léger lissage avant quantification pour des aplats propres.
  c = (c * 4.0 + texture2D(textureSampler, vUV + vec2(t.x, 0.0)).rgb + texture2D(textureSampler, vUV - vec2(t.x, 0.0)).rgb
    + texture2D(textureSampler, vUV + vec2(0.0, t.y)).rgb + texture2D(textureSampler, vUV - vec2(0.0, t.y)).rgb) / 8.0;
  vec3 ink = nearestInk(c);
  // Grain de la planche : veines horizontales ondulées qui modulent l'encre.
  vec2 px = vUV * screen;
  float grain = noise(vec2(px.x * 0.01, px.y * 0.25 + noise(px * 0.004) * 6.0));
  ink *= 0.93 + 0.1 * grain;
  // Contours au trait.
  float gx = lum(vUV + vec2(t.x, 0.0)) - lum(vUV - vec2(t.x, 0.0));
  float gy = lum(vUV + vec2(0.0, t.y)) - lum(vUV - vec2(0.0, t.y));
  float edge = smoothstep(0.08, 0.2, length(vec2(gx, gy)));
  vec3 col = mix(ink, vec3(0.1, 0.09, 0.08), edge);
  // Bokashi : dégradé de bleu de Prusse dans le haut de l'image.
  col = mix(col, vec3(0.122, 0.227, 0.373), smoothstep(0.75, 1.0, vUV.y) * 0.6);
  // Fibres du washi.
  float fibre = noise(px * vec2(0.6, 0.05)) * noise(px * vec2(0.05, 0.6));
  col *= 0.96 + 0.06 * fibre;
  gl_FragColor = vec4(col, 1.0);
}`;

export const woodblock = {
  key: "estampe",
  title: "Estampe sur bois",
  ambient: { hemi: 0.75, sky: "#ffffff", ground: "#a0a0a0", sun: 0 },
  image: { contrast: 1.05 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("tatami", "#d8b878"),
      wall: m("mur", "#f0e6d0"),
      ceiling: m("plafond", "#3a5a7a"),
      trim: m("bois sombre", "#3a2a20"),
      doorFrame: m("cadre", "#3a2a20"),
      door: m("porte", "#c8402a"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "出口 · sortie", { color: "#c8402a", background: "#efe4cc", font: "bold 64px serif" }) }),
      counter: m("bar", "#4a74a0"),
      counterTop: m("plateau", "#e0b860"),
      backBar: m("fond du bar", "#1f3a5f"),
      shelf: m("étagère", "#e0b860"),
      glass: (i) => m(`flacon ${i}`, ["#c8402a", "#668c74", "#e0b860"][i % 3]),
      seat: m("assise", "#c8402a"),
      tableTop: m("table", "#e0b860"),
      metal: m("pied", "#2a2420"),
      cabinet: (i) => m(`borne ${i}`, ["#4a74a0", "#c8402a", "#668c74"][i % 3]),
      cabinetSide: () => m("flanc", "#1f3a5f"),
      panel: m("pupitre", "#2a2420"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", "#e0b860"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    // Lumière douce et diffuse, une seule ombre nette pour dessiner les formes.
    const key = ctx.spot("lumière", [-3, H - 0.1, -4], [0.4, -1, 0.6], "#ffffff", 0.7, 2.2, 1, 18);
    ctx.shadows(key, { size: 1024, darkness: 0.35, soft: false });
  },

  post(scene, camera) {
    const pass = new PostProcess("estampe", "artWoodblock", ["screen"], null, 1, camera);
    pass.onApply = (effect) => effect.setFloat2("screen", pass.width, pass.height);
    return () => pass.dispose(camera);
  },
};
