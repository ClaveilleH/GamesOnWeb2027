import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 64 · Vision nocturne : la salle est quasiment noire (veilleuses, écrans en veille) et l'image
// passe par un intensificateur de lumière. Le post-traitement amplifie fortement la luminance, la
// rend en vert phosphore, ajoute un bruit de photons d'autant plus fort que l'image est sombre, fait
// baver les sources vives (halo), cercle l'image comme un oculaire et y superpose un réticule gradué.
// Un illuminateur infrarouge (invisible à l'œil nu, mais pas pour le tube) éclaire devant le joueur.
const palette = { background: "#000000", primary: "#30ff60", secondary: "#105020", accent: "#ffffff", text: "#a0ffb0" };

Effect.ShadersStore.artNightVisionFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(void) {
  vec2 t = 1.0 / screen;
  float l = dot(texture2D(textureSampler, vUV).rgb, vec3(0.3, 0.59, 0.11));
  // Halo : les zones très lumineuses bavent autour d'elles.
  float halo = 0.0;
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.785;
    vec2 o = vec2(cos(a), sin(a)) * 9.0 * t;
    halo += max(0.0, dot(texture2D(textureSampler, vUV + o).rgb, vec3(0.33)) - 0.55);
  }
  float gain = 4.5;
  float v = 1.0 - exp(-l * gain) + halo * 0.18;
  // Bruit de photons, plus fort dans les ombres ; scintillement d'ensemble.
  float n = hash(floor(vUV * screen) + fract(time * 37.0) * 91.0);
  v += (n - 0.5) * (0.35 - 0.25 * v);
  v *= 0.95 + 0.05 * sin(time * 50.0);
  vec3 col = vec3(0.12, 1.0, 0.3) * v + vec3(0.0, 0.03, 0.0);
  // Oculaire : image cerclée, assombrie vers le bord.
  vec2 p = (vUV - 0.5) * vec2(screen.x / screen.y, 1.0);
  float r = length(p);
  col *= smoothstep(0.64, 0.55, r) * (1.0 - 0.5 * r * r);
  // Réticule : croix fine graduée.
  float line = (1.0 - smoothstep(0.0, 1.5 * t.y, abs(p.y))) * step(0.04, abs(p.x)) * step(abs(p.x), 0.25)
             + (1.0 - smoothstep(0.0, 1.5 * t.y, abs(p.x))) * step(0.04, abs(p.y)) * step(abs(p.y), 0.25);
  float ticks = step(0.92, fract(p.x * 40.0)) * step(abs(p.y), 0.008) * step(abs(p.x), 0.25);
  col += vec3(0.25, 1.0, 0.4) * 0.45 * clamp(line + ticks, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export const nightVision = {
  key: "vision-nocturne",
  title: "Vision nocturne",
  ambient: { hemi: 0.06, sky: "#ffffff", ground: "#202020", sun: 0 },
  image: { contrast: 1 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#5a5a5a", { specular: "#303030", power: 40 }),
      wall: m("mur", "#7a7a7a"),
      ceiling: m("plafond", "#3a3a3a"),
      trim: m("plinthe", "#2a2a2a"),
      doorFrame: m("cadre", "#4a4a4a"),
      door: m("porte", "#6a6a6a"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EXIT", { color: "#606060", background: "#101010", font: "bold 90px sans-serif" }) }),
      counter: m("bar", "#6a6a6a"),
      counterTop: m("plateau", "#9a9a9a", { specular: "#ffffff", power: 100 }),
      backBar: m("fond du bar", "#3a3a3a"),
      shelf: m("étagère", "#8a8a8a"),
      glass: (i) => m(`bouteille ${i}`, ["#a0a0a0", "#606060", "#d0d0d0"][i % 3], { specular: "#ffffff", power: 140 }),
      seat: m("assise", "#5a5a5a"),
      tableTop: m("table", "#9a9a9a"),
      metal: m("pied", "#4a4a4a", { specular: "#ffffff", power: 80 }),
      cabinet: (i) => m(`borne ${i}`, ["#7a7a7a", "#5a5a5a"][i % 2]),
      cabinetSide: () => m("flanc", "#3a3a3a"),
      panel: m("pupitre", "#2a2a2a"),
      // Écrans en veille : très faiblement lumineux.
      screen(i, texture) {
        if (!screens.has(i)) {
          const mat = m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true });
          mat.emissiveColor.setAll(0.25);
          screens.set(i, mat);
        }
        return screens.get(i);
      },
      marquee: (i, texture) => {
        const mat = m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true });
        mat.emissiveColor.setAll(0.2);
        return mat;
      },
      button: () => m("bouton", "#8a8a8a"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { scene, room } = ctx;
    // Veilleuses : quelques petites sources vives (qui bavent dans le tube).
    const led = std(scene, `${room.theme.key} · veilleuse`, { diffuse: "#000000", emissive: "#ffffff" });
    for (const [x, y, z] of [[-7.9, 2.2, 0], [0.6, 2.9, -5.95], [7.9, 0.3, 4.5], [-2, 2.6, 5.95]]) {
      ctx.box(`veilleuse ${x} ${z}`, x, y, z, 0.08, 0.08, 0.08, led);
      ctx.point(`veilleuse ${x} ${z}`, x, y, z, "#ffffff", 0.25, 3);
    }
    // Illuminateur infrarouge porté : un projecteur large qui suit la caméra.
    const ir = ctx.spot("infrarouge", [0, 1.6, -3.5], [0, 0, 1], "#ffffff", 0.9, 1.1, 2, 14);
    ctx.onUpdate(() => {
      const camera = scene.activeCamera;
      if (!camera) return;
      ir.position.copyFrom(camera.position);
      ir.direction.copyFrom(camera.getTarget().subtract(camera.position).normalize());
    });
  },

  post(scene, camera) {
    const pass = new PostProcess("vision nocturne", "artNightVision", ["time", "screen"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat("time", (performance.now() - start) / 1000);
      effect.setFloat2("screen", pass.width, pass.height);
    };
    return () => pass.dispose(camera);
  },
};
