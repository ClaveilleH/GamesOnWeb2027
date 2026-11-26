import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 38 · Couleur sélective : noir et blanc très contrasté, à l'exception des rouges qui gardent toute
// leur saturation (enseigne, une borne, tabourets, robe de la chanteuse sur l'affiche, une bouteille).
// Les zones claires sont poussées vers le blanc pur, les ombres vers le noir, avec du grain.
const palette = { background: "#000000", primary: "#ffffff", secondary: "#e00000", accent: "#ffffff", text: "#ffffff" };

Effect.ShadersStore.artSelectiveFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(void) {
  vec3 c = texture2D(textureSampler, vUV).rgb;
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  // Courbe en S forte : noirs bouchés, blancs francs.
  float bw = smoothstep(0.02, 0.42, l);
  bw = bw * bw * (3.0 - 2.0 * bw);
  // Rougeur : rouge nettement au-dessus du vert et du bleu.
  float red = smoothstep(0.12, 0.35, c.r - max(c.g, c.b)) * smoothstep(0.05, 0.2, c.r);
  vec3 col = mix(vec3(bw), vec3(min(1.0, c.r * 1.5), c.g * 0.3, c.b * 0.3), red);
  col += (hash(vUV * 731.0 + fract(time)) - 0.5) * 0.07;
  gl_FragColor = vec4(col, 1.0);
}`;

export const selectiveRed = {
  key: "couleur-selective",
  title: "Couleur sélective",
  ambient: { hemi: 0.55, sky: "#ffffff", ground: "#000000", sun: 0 },
  image: { contrast: 1.1 },
  glow: 0.5,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const red = m("rouge", { diffuse: "#d00000", specular: "#ffffff", power: 80 });
    const bricks = paintedTexture(scene, `${name} · briques`, 1024, 512, (c, w, h) => {
      c.fillStyle = "#202020";
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) {
          const v = 70 + Math.floor(Math.random() * 50);
          c.fillStyle = `rgb(${v},${v},${v})`;
          c.fillRect(x + 2, y + 2, 60, 28);
        }
      }
    });
    bricks.uScale = 2;
    const screens = new Map();
    return {
      palette,
      floor: m("sol", { diffuse: "#303030", specular: "#ffffff", power: 120 }),
      wall: m("briques", { diffuse: "#ffffff", texture: bricks }),
      ceiling: m("plafond", { diffuse: "#101010" }),
      trim: m("plinthe", { diffuse: "#101010" }),
      doorFrame: m("cadre", { diffuse: "#e0e0e0" }),
      door: red,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EXIT", { color: "#ff1010", background: "#000000", font: "bold 90px sans-serif", glow: 16 }) }),
      counter: m("bar", { diffuse: "#1a1a1a", specular: "#ffffff", power: 90 }),
      counterTop: m("plateau", { diffuse: "#d8d8d8", specular: "#ffffff", power: 120 }),
      backBar: m("fond du bar", { diffuse: "#101010" }),
      shelf: m("étagère", { diffuse: "#c0c0c0" }),
      glass: (i) => (i === 5 ? red : m(`bouteille ${i}`, { diffuse: ["#e0e0e0", "#606060", "#a0a0a0"][i % 3], specular: "#ffffff", power: 150 })),
      seat: red,
      tableTop: m("table", { diffuse: "#e8e8e8", specular: "#ffffff", power: 100 }),
      metal: m("chrome", { diffuse: "#404040", specular: "#ffffff", power: 200 }),
      cabinet: (i) => (i === 2 ? red : m(`borne ${i}`, { diffuse: ["#1a1a1a", "#bbbbbb"][i % 2] })),
      cabinetSide: () => m("flanc", { diffuse: "#303030" }),
      panel: m("pupitre", { diffuse: "#151515" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => red,
      scanlines: false,
      red,
    };
  },

  decorate(ctx) {
    const { scene, room, ROOM: { width: W, height: H } } = ctx;
    const key = room.theme.key;
    // Affiche : silhouette de chanteuse en robe rouge, sur le mur ouest.
    const poster = paintedTexture(scene, `${key} · affiche`, 384, 576, (c, w, h) => {
      c.fillStyle = "#f0f0f0";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#101010";
      c.fillRect(14, 14, w - 28, h - 28);
      c.fillStyle = "#f0f0f0";
      c.beginPath();
      c.arc(w / 2, h * 0.25, 34, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#e00000";
      c.beginPath();
      c.moveTo(w / 2 - 30, h * 0.32);
      c.lineTo(w / 2 + 30, h * 0.32);
      c.lineTo(w / 2 + 95, h * 0.88);
      c.lineTo(w / 2 - 95, h * 0.88);
      c.fill();
      c.fillStyle = "#f0f0f0";
      c.font = "bold 46px serif";
      c.textAlign = "center";
      c.fillText("ROSA", w / 2, h * 0.96);
    });
    ctx.plane("affiche", -W / 2 + 0.03, 2, -1.5, 1.1, 1.65, std(scene, `${key} · affiche`, { diffuse: "#ffffff", texture: poster }), -Math.PI / 2);
    // Néon rouge au-dessus du bar.
    const neon = std(scene, `${key} · néon`, { diffuse: "#000000", emissive: "#ff1a1a" });
    ctx.box("néon bar", -3.2, H - 0.6, 5.55, 5, 0.05, 0.05, neon);
    // Lumière dure : projecteur blanc sur la table, contre-jour sur le bar, rouge sous le néon.
    const keyLight = ctx.spot("projecteur", [-4.6, H - 0.05, -2], [0, -1, 0], "#ffffff", 1.6, 0.9, 2, 8);
    ctx.shadows(keyLight, { size: 1024, darkness: 0, soft: false });
    const back = ctx.spot("contre-jour", [3, H - 0.1, -4], [-0.5, -0.8, 1], "#ffffff", 1.1, 1.2, 2, 16);
    ctx.shadows(back, { size: 1024, darkness: 0, soft: false });
    ctx.point("néon", -3.2, H - 0.9, 5, "#ff2020", 0.8, 6);
    ctx.point("bornes", W / 2 - 2.5, H - 0.4, 0, "#ffffff", 0.7, 9);
    ctx.mirrorFloor(ctx.look.floor, { level: 0.35, blur: 2 });
  },

  post(scene, camera) {
    const pass = new PostProcess("couleur sélective", "artSelective", ["time"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => effect.setFloat("time", (performance.now() - start) / 1000);
    return () => pass.dispose(camera);
  },
};
