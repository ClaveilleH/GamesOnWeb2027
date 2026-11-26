import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { signTexture, std } from "../materials.js";

// Salle 71 · Caméra de surveillance : l'image passe par une caméra de sécurité bon marché. Objectif
// fish-eye (distorsion en barillet et coins noirs), noir et blanc légèrement verdâtre, contraste dur,
// bruit et bande de compression qui avancent à 8 images par seconde, incrustation « CAM 03 », horodatage
// qui défile et « ● REC » qui clignote.
const palette = { background: "#101010", primary: "#e0e0e0", secondary: "#808080", accent: "#ff2020", text: "#e0e0e0" };

Effect.ShadersStore.artCctvFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D overlay;
uniform float frame;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(void) {
  // Fish-eye : distorsion en barillet autour du centre.
  vec2 p = (vUV - 0.5) * vec2(screen.x / screen.y, 1.0);
  float r2 = dot(p, p);
  vec2 q = p * (0.78 + 0.42 * r2);
  vec2 uv = q / vec2(screen.x / screen.y, 1.0) + 0.5;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  // Résolution réduite (capteur bas de gamme).
  vec2 cell = vec2(screen.x / screen.y * 360.0, 360.0);
  uv = (floor(uv * cell) + 0.5) / cell;
  float l = dot(texture2D(textureSampler, uv).rgb, vec3(0.3, 0.59, 0.11));
  l = smoothstep(0.04, 0.8, l);
  // Bruit qui change à chaque image enregistrée, bande de compression horizontale qui descend.
  l += (hash(floor(uv * cell) + frame * 13.1) - 0.5) * 0.12;
  float band = fract(frame * 0.037);
  l *= 1.0 - 0.15 * smoothstep(0.02, 0.0, abs(vUV.y - (1.0 - band)));
  vec3 col = vec3(l) * vec3(0.92, 1.0, 0.94) * inside;
  // Vignette du petit objectif.
  col *= 1.0 - 0.7 * r2;
  vec4 text = texture2D(overlay, vUV);
  col = mix(col, text.rgb, text.a);
  gl_FragColor = vec4(col, 1.0);
}`;

export const cctv = {
  key: "videosurveillance",
  title: "Caméra de surveillance",
  ambient: { hemi: 0.5, sky: "#ffffff", ground: "#404040", sun: 0 },
  image: { contrast: 1.1 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex, extra = {}) => std(scene, `${name} · ${label}`, { diffuse: hex, ...extra });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#707070", { specular: "#404040", power: 40 }),
      wall: m("mur", "#a0a0a0"),
      ceiling: m("plafond", "#606060"),
      trim: m("plinthe", "#303030"),
      doorFrame: m("cadre", "#404040"),
      door: m("porte", "#808080"),
      sign: m("enseigne", "#000000", { unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EXIT", { color: "#ffffff", background: "#20a040", font: "bold 90px sans-serif" }) }),
      counter: m("bar", "#5a5a5a"),
      counterTop: m("plateau", "#b0b0b0", { specular: "#ffffff", power: 80 }),
      backBar: m("fond du bar", "#3a3a3a"),
      shelf: m("étagère", "#909090"),
      glass: (i) => m(`bouteille ${i}`, ["#404040", "#a0a0a0", "#e0e0e0"][i % 3]),
      seat: m("assise", "#505050"),
      tableTop: m("table", "#b0b0b0"),
      metal: m("pied", "#303030"),
      cabinet: (i) => m(`borne ${i}`, ["#707070", "#4a4a4a"][i % 2]),
      cabinetSide: () => m("flanc", "#3a3a3a"),
      panel: m("pupitre", "#2a2a2a"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, "#000000", { emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, "#000000", { emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", "#c0c0c0"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    for (const [x, z] of [[-4, -2], [0, 2.5], [4, -2], [4, 3]]) ctx.point(`néon ${x} ${z}`, x, H - 0.3, z, "#ffffff", 0.45, 8);
  },

  post(scene, camera) {
    const width = 1024;
    const height = 576;
    const overlay = new DynamicTexture("surveillance · incrustation", { width, height }, scene, false);
    overlay.hasAlpha = true;
    const pad = (n) => String(n).padStart(2, "0");
    let lastSecond = -1;
    let blink = false;
    const draw = (seconds) => {
      const c = overlay.getContext();
      c.clearRect(0, 0, width, height);
      c.font = "bold 30px monospace";
      c.fillStyle = "#ffffff";
      c.shadowColor = "#000000";
      c.shadowBlur = 4;
      c.fillText("CAM 03 · SALLE DE JEUX", 70, 70);
      const t = 23 * 3600 + 47 * 60 + 12 + seconds;
      c.fillText(`26-11-2026  ${pad(Math.floor(t / 3600) % 24)}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`, 70, height - 50);
      if (blink) {
        c.fillStyle = "#ff2020";
        c.fillText("● REC", width - 190, 70);
      }
      overlay.update(true);
    };
    draw(0);
    const pass = new PostProcess("surveillance", "artCctv", ["frame", "screen"], ["overlay"], 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      const elapsed = (performance.now() - start) / 1000;
      const frame = Math.floor(elapsed * 8);
      const second = Math.floor(elapsed);
      if (second !== lastSecond) {
        lastSecond = second;
        blink = !blink;
        draw(second);
      }
      effect.setFloat("frame", frame);
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setTexture("overlay", overlay);
    };
    return () => {
      pass.dispose(camera);
      overlay.dispose();
    };
  },
};
