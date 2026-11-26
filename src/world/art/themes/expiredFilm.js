import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 65 · Pellicule périmée : une salle de jeux de quartier photographiée au compact sur un film
// couleur périmé. Émulation : courbe en S douce avec noirs relevés, ombres virées au cyan, hautes
// lumières chaudes, couleurs un peu passées, halation rouge autour des zones claires (la lumière
// traverse l'émulsion et se réfléchit sur le dos du film), grain fort, fuite de lumière orangée sur le
// bord, vignette du petit objectif et date incrustée en chiffres orange dans le coin.
const palette = { background: "#2a2018", primary: "#e86a30", secondary: "#2a6a7a", accent: "#f0d080", text: "#f0e0c0" };

Effect.ShadersStore.artFilmFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D stamp;
uniform float time;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(void) {
  vec2 t = 1.0 / screen;
  vec3 c = texture2D(textureSampler, vUV).rgb;
  // Halation : flou large des zones claires, ajouté en rouge orangé.
  vec3 glow = vec3(0.0);
  for (int k = 0; k < 12; k++) {
    float a = float(k) * 0.5236;
    for (int s = 1; s <= 2; s++) {
      vec2 o = vec2(cos(a), sin(a)) * float(s) * 7.0 * t;
      glow += max(vec3(0.0), texture2D(textureSampler, vUV + o).rgb - 0.6);
    }
  }
  c += glow / 24.0 * vec3(1.0, 0.35, 0.15) * 1.6;
  // Courbe : noirs relevés, hautes lumières adoucies.
  c = 0.07 + 0.88 * c / (c + 0.12) * 1.12;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  // Virage : cyan dans les ombres, chaud dans les hautes lumières ; couleurs un peu passées.
  c = mix(c, c * vec3(0.8, 1.02, 1.08), (1.0 - l) * 0.6);
  c = mix(c, c * vec3(1.1, 1.0, 0.82), l * 0.6);
  c = mix(vec3(l), c, 0.82);
  // Fuite de lumière sur le bord droit.
  float leak = smoothstep(0.65, 1.05, vUV.x) * (0.6 + 0.4 * sin(vUV.y * 3.0 + 1.0));
  c += vec3(1.0, 0.45, 0.1) * leak * 0.35;
  // Vignette d'objectif et grain.
  vec2 p = vUV - 0.5;
  c *= 1.0 - dot(p, p) * 0.9;
  float g = hash(floor(vUV * screen / 1.5) + fract(time * 24.0) * 37.0) - 0.5;
  c += g * 0.09;
  // Date incrustée.
  vec4 date = texture2D(stamp, vUV);
  c = mix(c, vec3(1.0, 0.55, 0.15), date.a * 0.9);
  gl_FragColor = vec4(c, 1.0);
}`;

export const expiredFilm = {
  key: "pellicule",
  title: "Pellicule périmée",
  ambient: { hemi: 0.55, sky: "#fff0e0", ground: "#605040", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.3 },
  glow: 0,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const carpet = paintedTexture(scene, `${name} · moquette`, 512, 512, (c, w, h) => {
      c.fillStyle = "#2a3a6a";
      c.fillRect(0, 0, w, h);
      // Motif de moquette de salle de jeux : confettis géométriques.
      const colors = ["#e86a30", "#f0d040", "#40b0a0", "#e04080"];
      for (let i = 0; i < 260; i++) {
        c.fillStyle = colors[i % 4];
        c.save();
        c.translate(Math.random() * w, Math.random() * h);
        c.rotate(Math.random() * Math.PI);
        if (i % 3 === 0) c.fillRect(-8, -2, 16, 4);
        else if (i % 3 === 1) {
          c.beginPath();
          c.moveTo(0, -7);
          c.lineTo(6, 5);
          c.lineTo(-6, 5);
          c.fill();
        } else {
          c.beginPath();
          c.arc(0, 0, 4, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }
    });
    carpet.uScale = 5;
    carpet.vScale = 4;
    const wood = m("contreplaqué", { diffuse: "#a07040", specular: "#403020", power: 30 });
    const screens = new Map();
    return {
      palette,
      floor: m("moquette", { diffuse: "#ffffff", texture: carpet }),
      wall: m("mur", { diffuse: "#d8c8a0" }),
      ceiling: m("dalles", { diffuse: "#e0dcd0" }),
      trim: wood,
      doorFrame: wood,
      door: m("porte vitrée", { diffuse: "#406070", specular: "#ffffff", power: 120 }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE", { color: "#ffffff", background: "#30a040", font: "bold 80px sans-serif" }) }),
      counter: wood,
      counterTop: m("formica", { diffuse: "#e8e0c8", specular: "#ffffff", power: 60 }),
      backBar: m("fond", { diffuse: "#704830" }),
      shelf: wood,
      glass: (i) => m(`canette ${i}`, { diffuse: ["#d03020", "#2050c0", "#f0c020", "#30a040"][i % 4], specular: "#ffffff", power: 90 }),
      seat: m("skaï", { diffuse: "#c04020", specular: "#ffffff", power: 50 }),
      tableTop: m("table", { diffuse: "#e8e0c8" }),
      metal: m("chrome", { diffuse: "#b0b0b0", specular: "#ffffff", power: 120 }),
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#202020", "#e04020", "#2050a0", "#f0c020"][i % 4] }),
      cabinetSide: (i) => m(`flanc ${i}`, { diffuse: ["#2050a0", "#202020"][i % 2] }),
      panel: m("pupitre", { diffuse: "#202020" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: ["#e04020", "#f0c020"][i % 2] }),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { width: W, height: H } } = ctx;
    // Néons de plafond et vitrine ensoleillée côté ouest : lumière mixte, typique des photos de l'époque.
    for (const x of [-4, 0, 4]) ctx.point(`plafonnier ${x}`, x, H - 0.3, 0, "#fff4e0", 0.5, 9);
    const sun = ctx.spot("vitrine", [-W / 2 - 3, 3.5, -1], [1, -0.55, 0.2], "#ffd8a0", 1.8, 1.2, 1, 20);
    ctx.shadows(sun, { size: 1024, darkness: 0.35, soft: true });
    // Flash du compact : lumière frontale dure depuis la caméra (lumière plate, ombre derrière).
    ctx.point("flash", 0, 1.8, -5.5, "#ffffff", 0.5, 10);
  },

  post(scene, camera) {
    // Date incrustée dans le coin inférieur droit, dessinée une fois sur une texture transparente.
    const stamp = new DynamicTexture("pellicule · date", { width: 1024, height: 576 }, scene, false);
    const c = stamp.getContext();
    c.clearRect(0, 0, 1024, 576);
    c.font = "bold 34px monospace";
    c.fillStyle = "#ffffff";
    c.textAlign = "right";
    c.fillText("'94 11 26", 980, 540);
    stamp.hasAlpha = true;
    stamp.update(true);
    const pass = new PostProcess("pellicule", "artFilm", ["time", "screen"], ["stamp"], 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat("time", (performance.now() - start) / 1000);
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setTexture("stamp", stamp);
    };
    return () => {
      pass.dispose(camera);
      stamp.dispose();
    };
  },
};
