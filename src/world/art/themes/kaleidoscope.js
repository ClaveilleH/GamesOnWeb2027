import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 79 · Kaléidoscope : l'image est repliée en six secteurs en miroir autour du centre de l'écran,
// comme vue à travers les trois miroirs d'un kaléidoscope, et la symétrie tourne lentement. Le centre
// (où se tient le joueur) reste lisible : le repli ne s'applique pleinement qu'en s'éloignant du centre.
// La salle elle-même est en verres colorés et en lumières vives pour nourrir les motifs.
const palette = { background: "#100818", primary: "#ff40a0", secondary: "#40e0ff", accent: "#ffe040", text: "#ffffff" };

Effect.ShadersStore.artKaleidoscopeFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
uniform vec2 screen;
void main(void) {
  float aspect = screen.x / screen.y;
  vec2 p = (vUV - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x) + time * 0.12;
  float sector = 3.14159265 / 3.0;
  // Repli en miroir dans un secteur de 60°.
  float folded = mod(a, sector);
  folded = abs(folded - sector * 0.5);
  vec2 q = vec2(cos(folded), sin(folded)) * r;
  vec2 kuv = q / vec2(aspect, 1.0) + 0.5;
  // Transition douce : centre intact, repli complet vers les bords.
  float k = smoothstep(0.12, 0.3, r);
  vec2 uv = mix(vUV, kuv, k);
  vec3 col = texture2D(textureSampler, uv).rgb;
  // Liseré lumineux sur les arêtes des miroirs.
  float seam = 1.0 - smoothstep(0.0, 0.012, abs(folded - sector * 0.5) * r);
  col += vec3(0.6, 0.7, 1.0) * seam * k * 0.25;
  col *= 1.0 - 0.35 * smoothstep(0.45, 0.8, r);
  gl_FragColor = vec4(col, 1.0);
}`;

export const kaleidoscope = {
  key: "kaleidoscope",
  title: "Kaléidoscope",
  ambient: { hemi: 0.45, sky: "#ffffff", ground: "#402060", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.4, contrast: 1.1, saturation: 30 },
  glow: 0.8,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, { specular: "#ffffff", power: 140, ...options });
    const glassColors = ["#ff40a0", "#40e0ff", "#ffe040", "#80ff60", "#a060ff", "#ff8040"];
    const screens = new Map();
    return {
      palette,
      floor: m("sol", { diffuse: "#201030" }),
      wall: m("mur", { diffuse: "#302050" }),
      ceiling: m("plafond", { diffuse: "#100818" }),
      trim: m("liseré", { diffuse: "#000000", emissive: "#40e0ff" }),
      doorFrame: m("cadre", { diffuse: "#000000", emissive: "#ff40a0" }),
      door: m("porte", { diffuse: "#a060ff" }),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "✶ SORTIE ✶", { color: "#ffe040", background: "#100818", font: "bold 70px sans-serif", glow: 10 }) }),
      counter: m("bar", { diffuse: "#ff40a0" }),
      counterTop: m("plateau", { diffuse: "#ffe040" }),
      backBar: m("fond du bar", { diffuse: "#40e0ff" }),
      shelf: m("étagère", { diffuse: "#ffffff" }),
      glass: (i) => m(`verre ${i}`, { diffuse: "#000000", emissive: glassColors[i % 6] }),
      seat: m("assise", { diffuse: "#80ff60" }),
      tableTop: m("table", { diffuse: "#a060ff" }),
      metal: m("pied", { diffuse: "#ffffff" }),
      cabinet: (i) => m(`borne ${i}`, { diffuse: glassColors[i % 6] }),
      cabinetSide: () => m("flanc", { diffuse: "#ffffff" }),
      panel: m("pupitre", { diffuse: "#100818" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: glassColors[i % 6] }),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    ctx.point("magenta", -4, H - 0.6, -2, "#ff40a0", 1.2, 10);
    ctx.point("cyan", 4, H - 0.6, 2, "#40e0ff", 1.2, 10);
    ctx.point("jaune", 0, H - 0.6, 4, "#ffe040", 1, 9);
    ctx.point("blanc", 0, 2, -3, "#ffffff", 0.5, 8);
  },

  post(scene, camera) {
    const pass = new PostProcess("kaléidoscope", "artKaleidoscope", ["time", "screen"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat("time", (performance.now() - start) / 1000);
      effect.setFloat2("screen", pass.width, pass.height);
    };
    return () => pass.dispose(camera);
  },
};
