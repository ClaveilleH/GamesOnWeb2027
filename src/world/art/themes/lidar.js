import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 67 · Scan LiDAR : la salle n'est vue qu'à travers un relevé laser. Le post-traitement lit la
// profondeur (depth renderer) : chaque point d'une grille serrée est allumé avec une couleur qui
// dépend de la distance (palette arc-en-ciel « turbo »), les discontinuités de profondeur dessinent
// les arêtes, et une onde de balayage part de la caméra et parcourt la salle en ravivant les points.
// Un peu de la couleur réelle de la scène teinte les points proches.
const palette = { background: "#000000", primary: "#30c0ff", secondary: "#ff4020", accent: "#a0ff40", text: "#c0e0ff" };

Effect.ShadersStore.artLidarFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform float time;
uniform vec2 screen;
uniform float far;
vec3 turbo(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 c = vec3(0.1357 + x * (4.5974 - x * (42.3277 - x * (130.5887 - x * (150.5666 - x * 58.1375)))),
                0.0914 + x * (2.1856 + x * (4.8052 - x * (14.0195 - x * (4.2109 + x * 2.7747)))),
                0.1067 + x * (12.5925 - x * (60.1097 - x * (109.0745 - x * (88.5066 - x * 26.8183)))));
  return clamp(c, 0.0, 1.0);
}
float depthAt(vec2 uv) { return texture2D(depthSampler, uv).r * far; }
void main(void) {
  float cell = max(5.0, screen.y / 110.0);
  vec2 px = vUV * screen;
  vec2 center = (floor(px / cell) + 0.5) * cell;
  vec2 cuv = center / screen;
  float d = depthAt(cuv);
  vec3 col = vec3(0.0);
  if (d < far * 0.99) {
    // Point rond, plus petit au loin.
    float r = mix(0.34, 0.16, clamp(d / 20.0, 0.0, 1.0)) * cell;
    float dot = 1.0 - smoothstep(r - 0.5, r + 0.5, length(px - center));
    vec3 tint = turbo(1.0 - clamp((d - 1.0) / 12.0, 0.0, 1.0));
    vec3 real = texture2D(textureSampler, cuv).rgb;
    tint = mix(tint, real * 1.4, 0.25 * clamp(1.0 - d / 6.0, 0.0, 1.0));
    // Onde de balayage qui s'éloigne de la caméra.
    float wave = mod(time * 6.0, 22.0);
    float sweep = exp(-pow((d - wave) * 1.6, 2.0));
    col = tint * dot * (0.8 + 1.5 * sweep);
  }
  // Arêtes : discontinuités de profondeur.
  vec2 t = 1.0 / screen;
  float dc = depthAt(vUV);
  float e = abs(depthAt(vUV + vec2(t.x, 0.0)) - dc) + abs(depthAt(vUV + vec2(0.0, t.y)) - dc);
  float edge = smoothstep(0.15, 0.5, e / max(dc, 0.5) * 6.0);
  col += vec3(0.75, 0.95, 1.0) * edge * 0.55;
  gl_FragColor = vec4(col, 1.0);
}`;

export const lidar = {
  key: "lidar",
  title: "Scan LiDAR",
  ambient: { hemi: 0.8, sky: "#ffffff", ground: "#808080", sun: 0 },
  image: { contrast: 1 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#808080"),
      wall: m("mur", "#a0a0a0"),
      ceiling: m("plafond", "#606060"),
      trim: m("plinthe", "#404040"),
      doorFrame: m("cadre", "#606060"),
      door: m("porte", "#8080a0"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EXIT", { color: "#ffffff", background: "#000000", font: "bold 90px monospace" }) }),
      counter: m("bar", "#a06040"),
      counterTop: m("plateau", "#c0c0c0"),
      backBar: m("fond du bar", "#604030"),
      shelf: m("étagère", "#c0c0c0"),
      glass: (i) => m(`bouteille ${i}`, ["#40a040", "#a04040", "#4040a0"][i % 3]),
      seat: m("assise", "#c04040"),
      tableTop: m("table", "#c0a080"),
      metal: m("pied", "#606060"),
      cabinet: (i) => m(`borne ${i}`, ["#4060c0", "#c04060", "#40c060"][i % 3]),
      cabinetSide: () => m("flanc", "#404040"),
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

  decorate() {},

  post(scene, camera) {
    // Profondeur linéaire (non normalisée par défaut : divisée par camera.maxZ dans le shader de Babylon).
    const depth = scene.enableDepthRenderer(camera, false);
    // Le rendu des portails restreint camera.layerMask au calque « world » pendant la passe principale,
    // ce qui exclurait le joueur (calque « late ») : une liste par prédicat contourne ce filtre.
    depth.getDepthMap().renderListPredicate = (mesh) => mesh.isEnabled() && mesh.isVisible && mesh.subMeshes?.length > 0;
    const pass = new PostProcess("lidar", "artLidar", ["time", "screen", "far"], ["depthSampler"], 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat("time", (performance.now() - start) / 1000);
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setFloat("far", camera.maxZ);
      effect.setTexture("depthSampler", depth.getDepthMap());
    };
    return () => {
      pass.dispose(camera);
      scene.disableDepthRenderer(camera);
    };
  },
};
