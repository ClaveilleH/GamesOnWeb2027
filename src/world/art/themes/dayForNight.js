import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 80 · Nuit américaine : la technique de cinéma qui tourne de jour une scène censée se passer la
// nuit. La salle est éclairée par un soleil franc (ombres dures, ciel en ambiance), puis l'image est
// étalonnée : sous-exposée, désaturée, virée au bleu nuit, les hautes lumières gardées en reflets
// argentés comme un clair de lune, et une vignette resserre le regard. Les écrans des bornes, eux,
// gardent leur couleur : de vraies sources dans une fausse nuit.
const palette = { background: "#0a1428", primary: "#a0c0ff", secondary: "#3a5a8a", accent: "#ffd080", text: "#c0d0f0" };

Effect.ShadersStore.artDayForNightFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
void main(void) {
  vec3 c = texture2D(textureSampler, vUV).rgb;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  // Sources colorées très saturées et vives (écrans) : on les épargne en partie.
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float keep = smoothstep(0.35, 0.6, chroma) * smoothstep(0.4, 0.7, l);
  // Étalonnage nuit : sous-exposition, désaturation, virage bleu, hautes lumières argentées.
  vec3 night = vec3(l) * vec3(0.42, 0.55, 0.85) * 0.75;
  night += vec3(0.75, 0.82, 1.0) * smoothstep(0.65, 1.0, l) * 0.45;
  night = pow(night, vec3(1.15));
  vec3 col = mix(night, c * 0.9, keep);
  vec2 p = vUV - 0.5;
  col *= 1.0 - dot(p, p) * 1.4;
  gl_FragColor = vec4(col, 1.0);
}`;

export const dayForNight = {
  key: "nuit-americaine",
  title: "Nuit américaine",
  ambient: { hemi: 0.5, sky: "#d0e0ff", ground: "#806a50", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.3, contrast: 1.1 },
  glow: 0.3,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const wood = m("bois", { diffuse: "#8a6a4a", specular: "#806040", power: 40 });
    const screens = new Map();
    return {
      palette,
      floor: m("plancher", { diffuse: "#9a8060", specular: "#ffffff", power: 80 }),
      wall: m("crépi", { diffuse: "#d8ccb8" }),
      ceiling: m("plafond", { diffuse: "#a09080" }),
      trim: wood,
      doorFrame: wood,
      door: m("porte", { diffuse: "#6a4a30" }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE", { color: "#ffd080", background: "#2a1a10", font: "bold 76px serif" }) }),
      counter: wood,
      counterTop: m("zinc", { diffuse: "#b0b0b0", specular: "#ffffff", power: 120 }),
      backBar: m("fond du bar", { diffuse: "#4a3a2a" }),
      shelf: wood,
      glass: (i) => m(`bouteille ${i}`, { diffuse: ["#4a7a3a", "#8a4a20", "#e0e0d0"][i % 3], specular: "#ffffff", power: 140, alpha: 0.8 }),
      seat: m("cuir", { diffuse: "#8a3a20" }),
      tableTop: wood,
      metal: m("fer", { diffuse: "#404040", specular: "#a0a0a0", power: 60 }),
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#a03020", "#2a4a8a", "#d0b040"][i % 3] }),
      cabinetSide: () => wood,
      panel: m("pupitre", { diffuse: "#202020" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", { diffuse: "#d0b040" }),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { width: W } } = ctx;
    // Le « clair de lune » est un soleil franc, bas, par l'ouest.
    const sun = ctx.spot("soleil", [-W / 2 - 5, 5, -2], [1, -0.55, 0.3], "#ffffff", 2.6, 1.3, 1, 30);
    ctx.shadows(sun, { size: 2048, darkness: 0.05, soft: false });
  },

  post(scene, camera) {
    const pass = new PostProcess("nuit américaine", "artDayForNight", [], null, 1, camera);
    return () => pass.dispose(camera);
  },
};
