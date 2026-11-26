import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 60 · Glitch numérique : l'image se corrompt par salves. Bandes horizontales décalées, canaux
// RGB séparés, macroblocs de compression figés en aplats, traînées verticales de « tri de pixels » à
// partir des zones claires, et quelques lignes de données parasites. Entre deux salves, l'image est
// presque propre : la scène, minimaliste et sombre, ne garde que des arêtes néon cyan et magenta.
const palette = { background: "#05050a", primary: "#00f0ff", secondary: "#ff00a0", accent: "#ffffff", text: "#e0ffff" };

Effect.ShadersStore.artGlitchFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(void) {
  // Intensité de la salve : forte par intermittence.
  float burst = step(0.62, hash(vec2(floor(time * 4.0), 1.0)));
  float level = 0.15 + 0.85 * burst;
  vec2 uv = vUV;
  // Bandes horizontales décalées.
  float band = floor(uv.y * 24.0 + hash(vec2(floor(time * 9.0), 3.0)) * 4.0);
  float shift = (hash(vec2(band, floor(time * 12.0))) - 0.5) * 0.12 * step(0.8, hash(vec2(band, floor(time * 6.0))));
  uv.x += shift * level;
  // Macroblocs figés : on lit le centre du bloc.
  vec2 block = floor(uv * screen / 24.0);
  float frozen = step(0.93, hash(block + floor(time * 5.0))) * level;
  vec2 buv = mix(uv, (block + 0.5) * 24.0 / screen, frozen);
  // Séparation des canaux.
  float split = 0.004 + 0.02 * level * hash(vec2(floor(time * 15.0), band));
  float r = texture2D(textureSampler, buv + vec2(split, 0.0)).r;
  float g = texture2D(textureSampler, buv).g;
  float b = texture2D(textureSampler, buv - vec2(split, 0.0)).b;
  vec3 col = vec3(r, g, b);
  // Tri de pixels : dans certaines colonnes, on étire vers le bas la couleur claire la plus haute.
  float column = floor(uv.x * screen.x / 3.0);
  if (hash(vec2(column, floor(time * 3.0))) > 1.0 - 0.18 * level) {
    for (int k = 1; k < 10; k++) {
      vec3 above = texture2D(textureSampler, buv + vec2(0.0, float(k) * 0.012)).rgb;
      if (dot(above, vec3(0.33)) > 0.55) { col = max(col, above * (1.0 - float(k) * 0.07)); }
    }
  }
  // Lignes de données parasites.
  float line = step(0.985, hash(vec2(floor(uv.y * screen.y / 2.0), floor(time * 20.0)))) * level;
  col = mix(col, vec3(hash(vec2(floor(uv.x * 40.0), time)) > 0.5 ? 1.0 : 0.0, 1.0, 1.0) * vec3(0.0, 0.9, 1.0), line * 0.8);
  // Inversion brève d'un bloc.
  col = mix(col, 1.0 - col, step(0.985, hash(block * 0.37 + floor(time * 7.0))) * level);
  gl_FragColor = vec4(col, 1.0);
}`;

export const glitch = {
  key: "glitch",
  title: "Glitch numérique",
  ambient: { hemi: 0.4, sky: "#80a0ff", ground: "#100010", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.4, contrast: 1.2 },
  glow: 1,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const black = m("noir", { diffuse: "#101018", specular: "#404060", power: 80 });
    const cyan = m("néon cyan", { diffuse: "#000000", emissive: "#00e8ff" });
    const magenta = m("néon magenta", { diffuse: "#000000", emissive: "#ff00a0" });
    const screens = new Map();
    return {
      palette,
      floor: m("sol", { diffuse: "#0a0a10", specular: "#ffffff", power: 200 }),
      wall: m("mur", { diffuse: "#14141c" }),
      ceiling: m("plafond", { diffuse: "#050508" }),
      trim: cyan,
      doorFrame: magenta,
      door: black,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EX1T_", { color: "#00f0ff", background: "#05050a", font: "bold 80px monospace", glow: 14 }) }),
      counter: black,
      counterTop: magenta,
      backBar: black,
      shelf: cyan,
      glass: (i) => (i % 2 ? cyan : magenta),
      seat: black,
      tableTop: cyan,
      metal: black,
      cabinet: () => black,
      cabinetSide: (i) => (i % 2 ? cyan : magenta),
      panel: black,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => magenta,
      scanlines: false,
      cyan,
      magenta,
    };
  },

  decorate(ctx) {
    const { look, ROOM: { width: W, depth: D, height: H } } = ctx;
    // Arêtes néon le long du plafond et lignes verticales dans les coins.
    ctx.box("arête nord", 0, H - 0.02, D / 2 - 0.02, W, 0.04, 0.04, look.cyan);
    ctx.box("arête sud", 0, H - 0.02, -D / 2 + 0.02, W, 0.04, 0.04, look.magenta);
    ctx.box("arête ouest", -W / 2 + 0.02, H - 0.02, 0, 0.04, 0.04, D, look.magenta);
    ctx.box("arête est", W / 2 - 0.02, H - 0.02, 0, 0.04, 0.04, D, look.cyan);
    for (const [x, z, mat] of [[-W / 2, D / 2, look.cyan], [W / 2, D / 2, look.magenta], [-W / 2, -D / 2, look.cyan], [W / 2, -D / 2, look.magenta]]) {
      ctx.box(`coin ${x} ${z}`, x * 0.997, H / 2, z * 0.997, 0.04, H, 0.04, mat);
    }
    ctx.point("cyan", 4, 2.5, 2, "#00e8ff", 1.4, 10);
    ctx.point("magenta", -4, 2.5, -2, "#ff00a0", 1.4, 10);
    ctx.point("bar", -2, 2.2, 4, "#a040ff", 0.8, 7);
    ctx.mirrorFloor(ctx.look.floor, { level: 0.5, blur: 1 });
  },

  post(scene, camera) {
    const pass = new PostProcess("glitch", "artGlitch", ["time", "screen"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat("time", (performance.now() - start) / 1000);
      effect.setFloat2("screen", pass.width, pass.height);
    };
    return () => pass.dispose(camera);
  },
};
