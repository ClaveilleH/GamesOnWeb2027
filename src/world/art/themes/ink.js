import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 23 · Encre de Chine : la salle dessinée au pinceau sur papier de riz. Post-traitement maison :
// contours détectés (Sobel sur la couleur), épaissis et rendus irréguliers par du bruit ; tons réduits
// à trois lavis d'encre ; grain et fibres du papier. Une seule couleur survit : le rouge vermillon.
const palette = { background: "#f1ead8", primary: "#1a1a1a", secondary: "#c8102e", accent: "#c8102e", text: "#1a1a1a" };
const RED = "#c8102e";

Effect.ShadersStore.artInkFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float luma(vec2 uv) { return dot(texture2D(textureSampler, uv).rgb, vec3(0.299, 0.587, 0.114)); }
void main(void) {
  vec2 px = 1.0 / screen;
  // Le trait tremble : décalage d'échantillonnage par bruit basse fréquence.
  vec2 wobble = (vec2(noise(vUV * 40.0), noise(vUV * 40.0 + 9.1)) - 0.5) * 3.0 * px;
  vec2 uv = vUV + wobble;
  // Sobel sur la luminance, à pas de 1,5 pixel pour un trait épais.
  vec2 s = px * 1.5;
  float tl = luma(uv + vec2(-s.x, s.y)), t = luma(uv + vec2(0.0, s.y)), tr = luma(uv + vec2(s.x, s.y));
  float l = luma(uv + vec2(-s.x, 0.0)), r = luma(uv + vec2(s.x, 0.0));
  float bl = luma(uv + vec2(-s.x, -s.y)), b = luma(uv + vec2(0.0, -s.y)), br = luma(uv + vec2(s.x, -s.y));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
  float edge = smoothstep(0.12, 0.35, sqrt(gx * gx + gy * gy));
  // Pression du pinceau : le trait s'interrompt par endroits.
  edge *= smoothstep(0.25, 0.55, noise(vUV * vec2(screen.x / screen.y, 1.0) * 18.0));
  // Trois lavis d'encre selon la luminance, bords des plages adoucis par le bruit.
  vec3 src = texture2D(textureSampler, uv).rgb;
  float lum = dot(src, vec3(0.299, 0.587, 0.114)) + (noise(vUV * 90.0) - 0.5) * 0.035;
  float wash = lum < 0.22 ? 0.72 : lum < 0.45 ? 0.42 : lum < 0.7 ? 0.16 : 0.0;
  // Vermillon : pixels nettement rouges, gardés en couleur.
  float red = smoothstep(0.18, 0.35, src.r - max(src.g, src.b));
  // Papier de riz : fond crème, fibres et grain.
  float fibers = noise(vUV * vec2(screen.x / screen.y, 1.0) * vec2(220.0, 30.0));
  vec3 paper = vec3(0.945, 0.918, 0.847) * (0.95 + fibers * 0.06 + hash(vUV * screen) * 0.02);
  vec3 ink = vec3(0.07, 0.07, 0.08);
  vec3 col = mix(paper, ink, wash * (0.85 + noise(vUV * 25.0) * 0.3));
  col = mix(col, vec3(0.78, 0.06, 0.18) * (0.9 + fibers * 0.1), red * 0.9);
  col = mix(col, ink, edge);
  gl_FragColor = vec4(col, 1.0);
}`;

export const ink = {
  key: "encre-de-chine",
  title: "Encre de Chine",
  ambient: { hemi: 0.85, sky: "#ffffff", ground: "#555555", sun: 0 },
  glow: 0,

  look(scene, name) {
    // Valeurs de gris choisies pour tomber chacune dans un lavis différent.
    const m = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: hex, specular: "#000000" });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", "#d8d8d8"),
      wall: m("mur", "#f4f4f4"),
      ceiling: m("plafond", "#bdbdbd"),
      trim: m("plinthe", "#222222"),
      doorFrame: m("cadre", "#222222"),
      door: m("porte", RED),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "出口", { color: "#c8102e", background: "#ffffff", font: "bold 96px serif" }) }),
      counter: m("bar", "#555555"),
      counterTop: m("plateau", "#999999"),
      backBar: m("fond du bar", "#7a7a7a"),
      shelf: m("étagère", "#333333"),
      glass: (i) => m(`bouteille ${i}`, i % 4 === 0 ? RED : ["#444444", "#888888"][i % 2]),
      seat: m("assise", RED),
      tableTop: m("table", "#666666"),
      metal: m("métal", "#333333"),
      cabinet: (i) => m(`borne ${i}`, ["#5a5a5a", "#8a8a8a"][i % 2]),
      cabinetSide: () => m("flanc", "#3a3a3a"),
      panel: m("pupitre", "#222222"),
      // Écrans en niveaux de gris : le post-traitement les dessine en lavis.
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, i % 2 ? RED : "#222222"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { scene, ROOM: { width: W, depth: D, height: H } } = ctx;
    // Soleil en disque vermillon peint au mur nord et lumière latérale qui sépare les volumes.
    const round = paintedTexture(scene, "encre · soleil", 256, 256, (c) => {
      c.fillStyle = RED;
      c.beginPath();
      c.arc(128, 128, 120, 0, Math.PI * 2);
      c.fill();
    });
    round.hasAlpha = true;
    const sun = std(scene, "encre · soleil", { diffuse: "#000000", unlit: true, emissiveTexture: round });
    sun.opacityTexture = round;
    ctx.plane("soleil", 3.2, 2.9, D / 2 - 0.03, 1.1, 1.1, sun);
    const key = ctx.spot("lumière", [-W / 2 - 4, 6, -2], [1, -0.7, 0.3], "#ffffff", 1, 2.2, 1, 30);
    ctx.shadows(key, { size: 1024, darkness: 0.4, soft: false });
    ctx.point("plafond", 0, H - 0.3, 0, "#ffffff", 0.3, 14);
  },

  post(scene, camera) {
    const pass = new PostProcess("encre", "artInk", ["screen"], null, 1, camera);
    pass.onApply = (effect) => effect.setFloat2("screen", pass.width, pass.height);
    return () => pass.dispose(camera);
  },
};
