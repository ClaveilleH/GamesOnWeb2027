import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 55 · Gravure en taille-douce : l'image est gravée comme une illustration du XIXᵉ siècle ou un
// billet de banque. Des lignes parallèles, légèrement ondulées selon le relief de l'image, s'épaississent
// dans les ombres ; une seconde passe croisée n'apparaît que dans les noirs. Encre brun-noir sur papier
// vergé crème, contours renforcés. Aucune trame de points, aucun dégradé : seulement des tailles.
const palette = { background: "#f2e8d0", primary: "#2a1e14", secondary: "#6a4a2a", accent: "#8a2a1a", text: "#2a1e14" };

Effect.ShadersStore.artEngravingFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
float lum(vec2 uv) { return dot(texture2D(textureSampler, uv).rgb, vec3(0.3, 0.59, 0.11)); }
// Taille : ligne d'épaisseur proportionnelle à l'obscurité, ondulée par la luminance locale.
float cut(vec2 px, float angle, float spacing, float dark, float warp) {
  vec2 n = vec2(-sin(angle), cos(angle));
  float d = dot(px, n) + warp;
  float f = abs(fract(d / spacing) - 0.5) * 2.0;
  float width = clamp(dark * 1.15, 0.0, 1.0);
  return 1.0 - smoothstep(width - 0.18, width + 0.02, f);
}
void main(void) {
  vec2 px = vUV * screen;
  vec2 t = 1.0 / screen;
  float l = lum(vUV);
  float lx = lum(vUV + vec2(t.x * 2.0, 0.0)) - lum(vUV - vec2(t.x * 2.0, 0.0));
  float ly = lum(vUV + vec2(0.0, t.y * 2.0)) - lum(vUV - vec2(0.0, t.y * 2.0));
  float edge = smoothstep(0.06, 0.25, length(vec2(lx, ly)));
  float dark = pow(1.0 - l, 1.2);
  float spacing = max(4.0, screen.y / 170.0);
  // Ondulation : les lignes suivent un peu les formes (luminance lissée).
  float warp = lum(vUV) * 6.0 + sin(px.x * 0.02) * 1.5;
  float ink = cut(px, 0.35, spacing, dark, warp);
  ink = max(ink, cut(px, -0.9, spacing * 1.1, smoothstep(0.55, 0.95, dark), warp * 0.5));
  ink = max(ink, edge);
  // Papier vergé : fines vergeures horizontales et pontuseaux verticaux.
  vec3 paper = vec3(0.95, 0.91, 0.81);
  paper *= 0.97 + 0.03 * step(0.5, fract(px.y / 3.0));
  paper *= 0.98 + 0.02 * step(0.96, fract(px.x / 90.0));
  vec3 inkColor = vec3(0.17, 0.12, 0.08);
  gl_FragColor = vec4(mix(paper, inkColor, ink), 1.0);
}`;

export const engraving = {
  key: "gravure",
  title: "Gravure en taille-douce",
  ambient: { hemi: 0.45, sky: "#ffffff", ground: "#505050", sun: 0 },
  image: { contrast: 1.15 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#b0b0b0"),
      wall: m("mur", "#e0e0e0"),
      ceiling: m("plafond", "#909090"),
      trim: m("plinthe", "#404040"),
      doorFrame: m("cadre", "#606060"),
      door: m("porte", "#707070"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Sortie", { color: "#2a1e14", background: "#f2e8d0", font: "italic bold 74px serif" }) }),
      counter: m("bar", "#8a8a8a"),
      counterTop: m("plateau", "#d0d0d0", { specular: "#ffffff", power: 60 }),
      backBar: m("fond du bar", "#5a5a5a"),
      shelf: m("étagère", "#c0c0c0"),
      glass: (i) => m(`bouteille ${i}`, ["#404040", "#909090", "#c0c0c0"][i % 3], { specular: "#ffffff", power: 120 }),
      seat: m("assise", "#7a7a7a"),
      tableTop: m("table", "#dadada", { specular: "#ffffff", power: 50 }),
      metal: m("pied", "#3a3a3a"),
      cabinet: (i) => m(`borne ${i}`, ["#a0a0a0", "#707070"][i % 2]),
      cabinetSide: () => m("flanc", "#505050"),
      panel: m("pupitre", "#404040"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", "#303030"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    // Lumière d'atelier de graveur : une fenêtre haute latérale, modelé marqué.
    const key = ctx.spot("fenêtre", [-7, H, -4], [0.8, -0.7, 0.5], "#ffffff", 1.3, 2, 1, 22);
    ctx.shadows(key, { size: 1024, darkness: 0.15, soft: true });
    ctx.point("contre-jour", 5, H - 0.4, 4, "#ffffff", 0.3, 10);
  },

  post(scene, camera) {
    const pass = new PostProcess("gravure", "artEngraving", ["screen"], null, 1, camera);
    pass.onApply = (effect) => effect.setFloat2("screen", pass.width, pass.height);
    return () => pass.dispose(camera);
  },
};
