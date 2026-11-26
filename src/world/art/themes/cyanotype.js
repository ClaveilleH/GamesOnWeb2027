import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 77 · Cyanotype : l'image devient un tirage au bleu de Prusse sur papier aquarelle, le procédé
// photographique du XIXᵉ siècle. Les ombres sont d'un bleu profond, les lumières gardent le blanc du
// papier ; l'émulsion, étalée au pinceau, laisse des bords irréguliers et des coulures, et le grain du
// papier marque les aplats. Lumière franche de plein soleil pour des contrastes nets.
const palette = { background: "#f4f0e4", primary: "#123a78", secondary: "#2a5aa0", accent: "#ffffff", text: "#123a78" };

Effect.ShadersStore.artCyanotypeFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * noise(p) + 0.25 * noise(p * 2.1) + 0.125 * noise(p * 4.3) + 0.0625 * noise(p * 8.7); }
void main(void) {
  float l = dot(texture2D(textureSampler, vUV).rgb, vec3(0.3, 0.59, 0.11));
  l = smoothstep(0.05, 0.85, l);
  // Densité de bleu : forte dans les ombres, nulle dans les lumières, modulée par le grain du papier.
  vec2 px = vUV * screen;
  float grain = fbm(px * 0.08);
  float density = clamp((1.0 - l) * (0.85 + 0.3 * grain), 0.0, 1.0);
  vec3 paper = vec3(0.96, 0.94, 0.89);
  vec3 prussian = vec3(0.07, 0.2, 0.45);
  vec3 col = mix(paper, prussian, density);
  // Zone enduite au pinceau : bord irrégulier, hors de quoi le papier reste nu.
  vec2 p = vUV - 0.5;
  float edge = max(abs(p.x) * 1.0, abs(p.y) * 1.08);
  float brush = 0.44 + 0.035 * fbm(vUV * vec2(9.0, 30.0)) + 0.02 * fbm(vUV * 60.0);
  float coated = 1.0 - smoothstep(brush - 0.01, brush + 0.005, edge);
  // Hors de la zone enduite : traces de pinceau bleu pâle.
  float stroke = smoothstep(0.55, 0.75, fbm(vec2(vUV.x * 4.0, vUV.y * 40.0))) * 0.35;
  col = mix(mix(paper, prussian, stroke * step(brush, edge)), col, coated);
  // Taches d'émulsion plus denses.
  col = mix(col, prussian * 0.8, smoothstep(0.82, 0.9, fbm(px * 0.01 + 3.0)) * 0.4 * coated);
  gl_FragColor = vec4(col, 1.0);
}`;

export const cyanotype = {
  key: "cyanotype",
  title: "Cyanotype",
  ambient: { hemi: 0.45, sky: "#ffffff", ground: "#404040", sun: 0 },
  image: { contrast: 1.15 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#909090"),
      wall: m("mur", "#d0d0d0"),
      ceiling: m("plafond", "#606060"),
      trim: m("plinthe", "#303030"),
      doorFrame: m("cadre", "#404040"),
      door: m("porte", "#a0a0a0"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Sortie", { color: "#000000", background: "#ffffff", font: "italic bold 74px serif" }) }),
      counter: m("bar", "#707070"),
      counterTop: m("plateau", "#e0e0e0", { specular: "#ffffff", power: 80 }),
      backBar: m("fond du bar", "#404040"),
      shelf: m("étagère", "#c0c0c0"),
      glass: (i) => m(`bouteille ${i}`, ["#505050", "#a0a0a0", "#f0f0f0"][i % 3], { specular: "#ffffff", power: 120 }),
      seat: m("assise", "#606060"),
      tableTop: m("table", "#e0e0e0"),
      metal: m("pied", "#303030"),
      cabinet: (i) => m(`borne ${i}`, ["#b0b0b0", "#707070"][i % 2]),
      cabinetSide: () => m("flanc", "#404040"),
      panel: m("pupitre", "#303030"),
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
    const { ROOM: { width: W } } = ctx;
    const sun = ctx.spot("soleil", [-W / 2 - 3, 6, -3], [1, -0.85, 0.45], "#ffffff", 2, 1.3, 1, 30);
    ctx.shadows(sun, { size: 2048, darkness: 0.1, soft: false });
  },

  post(scene, camera) {
    const pass = new PostProcess("cyanotype", "artCyanotype", ["screen"], null, 1, camera);
    pass.onApply = (effect) => effect.setFloat2("screen", pass.width, pass.height);
    return () => pass.dispose(camera);
  },
};
