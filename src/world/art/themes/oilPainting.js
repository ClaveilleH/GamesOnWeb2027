import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 63 · Peinture à l'huile en clair-obscur : une seule lumière haute et latérale, comme une
// fenêtre de soupirail, sculpte les formes sur des noirs profonds. Le filtre de Kuwahara (on garde, des
// quatre quadrants autour du pixel, la moyenne de celui dont la variance est la plus faible) aplatit
// les zones en touches de pinceau tout en gardant les bords nets ; un vernis ambré jaunit l'ensemble et
// le grain de la toile apparaît dans les clairs.
const palette = { background: "#0a0806", primary: "#c89050", secondary: "#6a1a10", accent: "#e8d0a0", text: "#e8d0a0" };

Effect.ShadersStore.artOilFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
const int R = 4;
void quadrant(vec2 origin, vec2 dir, vec2 texel, out vec3 mean, out float variance) {
  vec3 sum = vec3(0.0);
  vec3 sq = vec3(0.0);
  for (int i = 0; i <= R; i++) {
    for (int j = 0; j <= R; j++) {
      vec3 c = texture2D(textureSampler, origin + vec2(float(i), float(j)) * dir * texel).rgb;
      sum += c;
      sq += c * c;
    }
  }
  float n = float((R + 1) * (R + 1));
  mean = sum / n;
  vec3 v = sq / n - mean * mean;
  variance = v.r + v.g + v.b;
}
void main(void) {
  vec2 texel = max(2.0, screen.y / 300.0) / screen;
  vec3 m0; vec3 m1; vec3 m2; vec3 m3;
  float v0; float v1; float v2; float v3;
  quadrant(vUV, vec2(-1.0, -1.0), texel, m0, v0);
  quadrant(vUV, vec2(1.0, -1.0), texel, m1, v1);
  quadrant(vUV, vec2(-1.0, 1.0), texel, m2, v2);
  quadrant(vUV, vec2(1.0, 1.0), texel, m3, v3);
  vec3 col = m0;
  float best = v0;
  if (v1 < best) { best = v1; col = m1; }
  if (v2 < best) { best = v2; col = m2; }
  if (v3 < best) { best = v3; col = m3; }
  // Vernis ambré : les clairs jaunissent, les noirs restent chauds et profonds.
  float l = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, col * vec3(1.08, 0.97, 0.78), 0.8);
  col = pow(col, vec3(1.1));
  // Toile : trame croisée, visible surtout dans les clairs.
  vec2 px = vUV * screen;
  float weave = 0.5 + 0.25 * sin(px.x * 1.4) + 0.25 * sin(px.y * 1.4);
  col *= 1.0 - 0.08 * weave * smoothstep(0.1, 0.6, l);
  gl_FragColor = vec4(col, 1.0);
}`;

export const oilPainting = {
  key: "huile",
  title: "Peinture à l'huile (clair-obscur)",
  ambient: { hemi: 0.22, sky: "#ffe0b0", ground: "#000000", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.9, contrast: 1.25, vignette: 3.5 },
  glow: 0,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const walnut = m("noyer", { diffuse: "#4a2a14", specular: "#806040", power: 40 });
    const brass = m("cuivre", { diffuse: "#a06a30", specular: "#ffd090", power: 90 });
    const screens = new Map();
    return {
      palette,
      floor: m("dalles", { diffuse: "#3a3028", specular: "#403020", power: 20 }),
      wall: m("mur", { diffuse: "#4a3a2a" }),
      ceiling: m("plafond", { diffuse: "#100c08" }),
      trim: walnut,
      doorFrame: walnut,
      door: walnut,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Exitus", { color: "#c89050", background: "#0a0806", font: "italic 72px serif" }) }),
      counter: walnut,
      counterTop: m("nappe", { diffuse: "#e8dcc0" }),
      backBar: walnut,
      shelf: walnut,
      glass: (i) => m(`pichet ${i}`, { diffuse: ["#a06a30", "#4a1a10", "#d8d0b0"][i % 3], specular: "#ffffff", power: 120 }),
      seat: m("velours", { diffuse: "#6a1a10" }),
      tableTop: m("nappe blanche", { diffuse: "#f0e4cc" }),
      metal: brass,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#5a3018", "#6a1a10", "#2a3a2a"][i % 3] }),
      cabinetSide: () => walnut,
      panel: walnut,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => brass,
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { width: W, height: H } } = ctx;
    // Une seule source : soupirail haut à gauche, lumière chaude et dure.
    const key = ctx.spot("soupirail", [-W / 2 + 0.5, H - 0.2, -5], [0.65, -0.75, 0.55], "#ffd8a0", 3.2, 1.4, 2, 26);
    ctx.shadows(key, { size: 2048, darkness: 0.05, soft: true });
    // Rebond très faible pour ne pas boucher totalement les noirs.
    ctx.point("rebond", 0, 0.6, 0, "#a07850", 0.7, 12);
    ctx.point("bar", -1, 2.4, 3, "#ffc080", 0.9, 6);
    ctx.point("bornes", 5, 2.2, 0, "#ffb070", 0.7, 6);
    // Une chandelle sur la table pour un second foyer chaud.
    ctx.point("chandelle", -4.6, 1.1, -2, "#ffa050", 0.9, 4);
  },

  post(scene, camera) {
    const pass = new PostProcess("huile", "artOil", ["screen"], null, 1, camera);
    pass.onApply = (effect) => effect.setFloat2("screen", pass.width, pass.height);
    return () => pass.dispose(camera);
  },
};
