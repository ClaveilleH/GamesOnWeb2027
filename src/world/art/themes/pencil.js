import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 43 · Croquis au crayon : la salle est dessinée au graphite sur papier crème. Contours détectés
// sur la luminance, hachures parallèles puis croisées selon l'ombre (trois couches d'angles différents),
// légère touche de crayon de couleur reprise de l'image. Les traits « bouillonnent » : le décalage du
// tracé change quatre fois par seconde, comme une animation dessinée image par image.
const palette = { background: "#f4ecd8", primary: "#2a2a2a", secondary: "#c0392b", accent: "#2a6aa0", text: "#2a2a2a" };

Effect.ShadersStore.artPencilFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
uniform float time;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float lum(vec2 uv) { return dot(texture2D(textureSampler, uv).rgb, vec3(0.3, 0.59, 0.11)); }
// Hachures : bandes fines d'angle a, d'épaisseur variable, tremblées par le bruit.
float hatch(vec2 px, float a, float spacing, float seed) {
  vec2 dir = vec2(cos(a), sin(a));
  float d = dot(px, vec2(-dir.y, dir.x)) + noise(px * 0.05 + seed) * 3.0;
  float line = abs(fract(d / spacing) - 0.5) * spacing;
  return 1.0 - smoothstep(0.4, 1.3, line);
}
void main(void) {
  float frame = floor(time * 4.0);
  vec2 px = vUV * screen;
  // Tremblement du tracé, constant pendant un quart de seconde.
  vec2 wobble = (vec2(noise(px * 0.02 + frame * 7.0), noise(px * 0.02 + frame * 13.0 + 5.0)) - 0.5) * 2.5;
  vec2 uv = (px + wobble) / screen;
  vec2 t = 1.2 / screen;
  float l = lum(uv);
  float gx = lum(uv + vec2(t.x, 0.0)) - lum(uv - vec2(t.x, 0.0));
  float gy = lum(uv + vec2(0.0, t.y)) - lum(uv - vec2(0.0, t.y));
  float edge = smoothstep(0.05, 0.22, length(vec2(gx, gy)));
  // Trois couches de hachures selon l'obscurité.
  float dark = 1.0 - l;
  float ink = 0.0;
  ink = max(ink, hatch(px, 0.8, 7.0, frame) * smoothstep(0.35, 0.55, dark));
  ink = max(ink, hatch(px, -0.7, 6.0, frame + 3.0) * smoothstep(0.55, 0.75, dark));
  ink = max(ink, hatch(px, 0.05, 5.0, frame + 9.0) * smoothstep(0.72, 0.9, dark));
  ink = max(ink * 0.75, edge);
  // Papier : crème, fibres, et touche de couleur de l'image (crayon de couleur léger).
  vec3 paper = vec3(0.96, 0.93, 0.85) * (0.94 + 0.06 * noise(px * 0.7));
  vec3 src = texture2D(textureSampler, uv).rgb;
  float sat = max(src.r, max(src.g, src.b)) - min(src.r, min(src.g, src.b));
  paper = mix(paper, paper * (0.55 + 0.6 * src / max(0.001, max(src.r, max(src.g, src.b)))), smoothstep(0.15, 0.5, sat) * 0.6);
  vec3 graphite = vec3(0.16, 0.16, 0.18);
  vec3 col = mix(paper, graphite, ink * (0.75 + 0.25 * noise(px * 0.3 + frame)));
  gl_FragColor = vec4(col, 1.0);
}`;

export const pencil = {
  key: "croquis-crayon",
  title: "Croquis au crayon",
  ambient: { hemi: 0.45, sky: "#ffffff", ground: "#606060", sun: 0 },
  image: { contrast: 1.1 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#b8b8b8"),
      wall: m("mur", "#e8e8e8"),
      ceiling: m("plafond", "#d0d0d0"),
      trim: m("plinthe", "#606060"),
      doorFrame: m("cadre", "#808080"),
      door: m("porte", "#c0392b"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Sortie", { color: "#202020", background: "#f4ecd8", font: "italic 76px serif" }) }),
      counter: m("bar", "#a0a0a0"),
      counterTop: m("plateau", "#e0e0e0"),
      backBar: m("fond du bar", "#707070"),
      shelf: m("étagère", "#d0d0d0"),
      glass: (i) => m(`bouteille ${i}`, ["#2a6aa0", "#c0392b", "#3a8a4a", "#d0a030"][i % 4]),
      seat: m("assise", "#2a6aa0"),
      tableTop: m("table", "#e8e8e8"),
      metal: m("pied", "#404040"),
      cabinet: (i) => m(`borne ${i}`, ["#c8c8c8", "#909090"][i % 2]),
      cabinetSide: (i) => m(`flanc ${i}`, ["#c0392b", "#2a6aa0", "#3a8a4a"][i % 3]),
      panel: m("pupitre", "#505050"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", "#c0392b"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    // Éclairage de dessinateur : une lumière principale latérale nette pour des ombres à hachurer.
    const key = ctx.spot("lampe", [-6, H - 0.2, -5], [0.7, -0.8, 0.6], "#ffffff", 1.2, 2, 1, 22);
    ctx.shadows(key, { size: 1024, darkness: 0.2, soft: true });
  },

  post(scene, camera) {
    const pass = new PostProcess("crayon", "artPencil", ["screen", "time"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setFloat("time", (performance.now() - start) / 1000);
    };
    return () => pass.dispose(camera);
  },
};
