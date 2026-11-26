import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 21 · Aquarelle : la scène 3D devient une peinture. Post-traitement maison : filtre de Kuwahara
// (aplats lissés qui gardent les bords), contours assombris là où le pigment s'accumule, papier grenu,
// taches et légère dérive des couleurs, bords de l'image qui se fondent dans le blanc du papier.
// Les matériaux restent simples : de grandes plages de couleurs douces sous une lumière de jour.
const palette = { background: "#f4ecdc", primary: "#3d6f9e", secondary: "#c8553d", accent: "#e8b04b", text: "#2b2b2b" };

Effect.ShadersStore.artWatercolorFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }
void main(void) {
  vec2 px = 1.0 / screen;
  // Dérive : le pinceau ne suit pas exactement les formes.
  vec2 uv = vUV + (vec2(fbm(vUV * 6.0), fbm(vUV * 6.0 + 7.3)) - 0.5) * 0.006;
  // Kuwahara à quatre quadrants, rayon 4 (pas de 2 pixels).
  vec3 mean[4]; vec3 sq[4];
  for (int k = 0; k < 4; k++) { mean[k] = vec3(0.0); sq[k] = vec3(0.0); }
  for (int j = 0; j <= 4; j++) {
    for (int i = 0; i <= 4; i++) {
      vec2 o = vec2(float(i), float(j)) * 2.0 * px;
      vec3 a = texture2D(textureSampler, uv + vec2(-o.x, -o.y)).rgb;
      vec3 b = texture2D(textureSampler, uv + vec2( o.x, -o.y)).rgb;
      vec3 c = texture2D(textureSampler, uv + vec2(-o.x,  o.y)).rgb;
      vec3 d = texture2D(textureSampler, uv + vec2( o.x,  o.y)).rgb;
      mean[0] += a; sq[0] += a * a; mean[1] += b; sq[1] += b * b;
      mean[2] += c; sq[2] += c * c; mean[3] += d; sq[3] += d * d;
    }
  }
  vec3 col = vec3(0.0); float best = 1e9;
  for (int k = 0; k < 4; k++) {
    vec3 m = mean[k] / 25.0;
    vec3 v = abs(sq[k] / 25.0 - m * m);
    float s = v.r + v.g + v.b;
    if (s < best) { best = s; col = m; }
  }
  // Contours : le pigment s'accumule là où la luminance varie fort.
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float lx = dot(texture2D(textureSampler, uv + vec2(3.0 * px.x, 0.0)).rgb, vec3(0.333));
  float ly = dot(texture2D(textureSampler, uv + vec2(0.0, 3.0 * px.y)).rgb, vec3(0.333));
  float edge = clamp((abs(lx - l) + abs(ly - l)) * 3.0, 0.0, 1.0);
  // Couleurs éclaircies et un peu désaturées, comme un lavis.
  col = mix(vec3(l), col, 0.85);
  col = mix(col, vec3(1.0), 0.12);
  col *= 1.0 - edge * 0.35;
  // Taches (lavis inégal) et grain du papier.
  float blot = fbm(vUV * vec2(screen.x / screen.y, 1.0) * 5.0);
  col *= 0.9 + blot * 0.18;
  float grain = noise(vUV * screen * 0.5) * 0.6 + noise(vUV * screen * 0.12) * 0.4;
  col *= 0.93 + grain * 0.09;
  // Bords de la feuille : la peinture s'efface vers le papier.
  vec2 c = abs(vUV - 0.5) * 2.0;
  float fade = smoothstep(0.9, 1.0, max(c.x, c.y) + (fbm(vUV * 9.0) - 0.5) * 0.12);
  vec3 paper = vec3(0.96, 0.93, 0.86) * (0.95 + grain * 0.05);
  gl_FragColor = vec4(mix(col * paper * 1.04, paper, fade), 1.0);
}`;

export const watercolor = {
  key: "aquarelle",
  title: "Aquarelle",
  ambient: { hemi: 0.75, sky: "#fff8ea", ground: "#a8b4c4", sun: 0 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: hex, specular: "#111111", power: 10 });
    const screens = new Map();
    const cabinets = ["#c8553d", "#3d6f9e", "#e8b04b", "#5f9e6e", "#8a5a9e"].map((hex, i) => m(`borne ${i}`, hex));
    return {
      palette,
      floor: m("parquet", "#c49a6c"),
      wall: m("mur", "#efe3c8"),
      ceiling: m("plafond", "#f7f0e0"),
      trim: m("plinthe", "#7a5a3a"),
      doorFrame: m("cadre", "#7a5a3a"),
      door: m("porte", "#3d6f9e"),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "la suite…", { color: "#2b2b2b", background: "#f4ecdc", font: "italic 70px serif" }) }),
      counter: m("comptoir", "#7a4a3a"),
      counterTop: m("plateau", "#e8dcc8"),
      backBar: m("fond du bar", "#5f7a8a"),
      shelf: m("étagère", "#7a5a3a"),
      glass: (i) => m(`bouteille ${i}`, ["#5f9e6e", "#c8553d", "#e8b04b", "#3d6f9e"][i % 4]),
      seat: m("assise", "#c8553d"),
      tableTop: m("table", "#e8b04b"),
      metal: m("métal", "#5a5a60"),
      cabinet: (i) => cabinets[i % cabinets.length],
      cabinetSide: (i) => cabinets[(i + 1) % cabinets.length],
      panel: m("pupitre", "#3a3a40"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, ["#c8553d", "#3d6f9e", "#e8b04b"][i % 3]),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    // Lumière de jour douce venant de l'ouest, ombres légères pour donner du volume aux aplats.
    const sun = ctx.spot("jour", [-16, 9, -1], [1, -0.55, 0.12], "#fff4e0", 1.3, 2.6, 1, 40);
    ctx.shadows(sun, { size: 1024, darkness: 0.55, soft: true });
    ctx.point("plafond", 1, H - 0.4, 0, "#fff8ee", 0.4, 14);
  },

  post(scene, camera) {
    const pass = new PostProcess("aquarelle", "artWatercolor", ["screen"], null, 1, camera);
    pass.onApply = (effect) => effect.setFloat2("screen", pass.width, pass.height);
    return () => pass.dispose(camera);
  },
};
