import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 51 · Années 70 psychédéliques : papier peint à vagues concentriques orange, moutarde, brun et
// crème, moquette à poils longs, lampes à lave dont les bulles montent et fusionnent, boule à facettes
// dont les éclats tournent sur les murs. Post-traitement : ondulation douce et teinte qui dérive.
const palette = { background: "#3a1a0a", primary: "#f28c28", secondary: "#c8a020", accent: "#a0522d", text: "#fff0d0" };
const SEVENTIES = ["#f28c28", "#d9a520", "#8a4a1a", "#f4e4c0", "#c04a20"];

Effect.ShadersStore.artGroovyFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
void main(void) {
  vec2 p = vUV - 0.5;
  float r = length(p);
  vec2 uv = vUV + p * 0.012 * sin(r * 26.0 - time * 2.0);
  vec3 c = texture2D(textureSampler, uv).rgb;
  c = hueShift(c, 0.18 * sin(time * 0.4) + 0.08 * sin(r * 8.0 - time));
  gl_FragColor = vec4(c, 1.0);
}`;

function waves(ctx, w, h) {
  ctx.fillStyle = SEVENTIES[3];
  ctx.fillRect(0, 0, w, h);
  const cell = 256;
  for (let cy = 0; cy < h + cell; cy += cell) {
    for (let cx = (cy / cell) % 2 ? cell / 2 : 0; cx < w + cell; cx += cell) {
      for (let k = 6; k > 0; k--) {
        ctx.fillStyle = SEVENTIES[k % 5];
        ctx.beginPath();
        ctx.arc(cx, cy, k * 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export const seventies = {
  key: "annees-70",
  title: "Années 70 psychédéliques",
  ambient: { hemi: 0.45, sky: "#ffd8a0", ground: "#5a2a10", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.6, contrast: 1.05, vignette: 2, saturation: 20 },
  glow: 0.7,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const wall = paintedTexture(scene, `${name} · vagues`, 1024, 512, waves);
    const shag = paintedTexture(scene, `${name} · moquette`, 512, 512, (c, w, h) => {
      c.fillStyle = "#8a4a1a";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const v = Math.random();
        c.fillStyle = v < 0.5 ? "#a05a20" : v < 0.8 ? "#6a3410" : "#c07a30";
        c.fillRect(Math.random() * w, Math.random() * h, 2, 3);
      }
    });
    shag.uScale = 6;
    shag.vScale = 4.5;
    const teak = m("teck", { diffuse: "#7a4a20", specular: "#5a3a1a", power: 50 });
    const velvet = m("velours", { diffuse: "#d9a520" });
    const screens = new Map();
    return {
      palette,
      floor: m("moquette", { diffuse: "#ffffff", texture: shag }),
      wall: m("papier peint", { diffuse: "#ffffff", texture: wall }),
      ceiling: m("plafond", { diffuse: "#5a2a10" }),
      trim: teak,
      doorFrame: teak,
      door: m("porte", { diffuse: "#c04a20" }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "far out → exit", { color: "#f28c28", background: "#3a1a0a", font: "bold italic 60px serif", glow: 10 }) }),
      counter: teak,
      counterTop: m("formica", { diffuse: "#f28c28", specular: "#ffffff", power: 90 }),
      backBar: m("miroir fumé", { diffuse: "#3a2a1a", specular: "#ffffff", power: 120 }),
      shelf: teak,
      glass: (i) => m(`verre ${i}`, { diffuse: SEVENTIES[i % 5], specular: "#ffffff", power: 120, alpha: 0.8 }),
      seat: velvet,
      tableTop: m("table", { diffuse: "#f4e4c0", specular: "#ffffff", power: 80 }),
      metal: m("chrome", { diffuse: "#c0c0c0", specular: "#ffffff", power: 160 }),
      cabinet: (i) => m(`borne ${i}`, { diffuse: SEVENTIES[i % 5] }),
      cabinetSide: () => teak,
      panel: m("pupitre", { diffuse: "#3a1a0a" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: SEVENTIES[i % 5] }),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Lampes à lave : socle et chapeau chromés, flacon de verre teinté, bulles qui montent et redescendent.
    const chrome = std(scene, `${key} · chrome`, { diffuse: "#c0c0c0", specular: "#ffffff", power: 160 });
    const lamps = [];
    for (const [x, z, color] of [[-6.9, 5.2, "#ff4a20"], [6.9, 5.2, "#ff2a8a"], [-0.4, 3.9, "#ffaa00"]]) {
      const y0 = x === -0.4 ? 1.12 : 0;
      const base = CreateCylinder(`${key} · socle ${x}`, { height: 0.2, diameterTop: 0.12, diameterBottom: 0.2, tessellation: 16 }, scene);
      base.position.copyFrom(ctx.local(x, y0 + 0.1, z));
      ctx.add(base, chrome);
      const glass = CreateCylinder(`${key} · flacon ${x}`, { height: 0.45, diameterTop: 0.08, diameterBottom: 0.14, tessellation: 16 }, scene);
      glass.position.copyFrom(ctx.local(x, y0 + 0.43, z));
      ctx.add(glass, std(scene, `${key} · flacon ${x}`, { diffuse: "#000000", emissive: color, alpha: 0.35 }));
      const blobMat = std(scene, `${key} · cire ${x}`, { diffuse: "#000000", emissive: color });
      const blobs = [0, 1, 2].map((k) => {
        const blob = CreateSphere(`${key} · bulle ${x} ${k}`, { diameter: 0.06, segments: 8 }, scene);
        ctx.add(blob, blobMat);
        return { blob, phase: k * 2.1 };
      });
      lamps.push({ x, z, y0, blobs });
      ctx.point(`lave ${x}`, x, y0 + 0.5, z, color, 0.6, 4);
    }
    // Boule à facettes au centre du plafond et éclats lumineux qui tournent sur les murs.
    const ball = CreateSphere(`${key} · boule`, { diameter: 0.45, segments: 6 }, scene);
    ball.position.copyFrom(ctx.local(0, H - 0.5, 0));
    ctx.add(ball, std(scene, `${key} · facettes`, { diffuse: "#a0a0a0", specular: "#ffffff", power: 300, emissive: "#303030" }));
    const sparkMat = std(scene, `${key} · éclat`, { diffuse: "#000000", emissive: "#fff4d0" });
    const sparks = [];
    for (let k = 0; k < 40; k++) {
      const spark = ctx.plane(`éclat ${k}`, 0, 0, 0, 0.08, 0.08, sparkMat);
      sparks.push({ spark, a: (k / 40) * Math.PI * 2 + Math.random() * 0.2, y: 0.8 + Math.random() * 2.6 });
    }
    ctx.spot("boule", [0, H - 0.05, -3], [0, -0.3, 1], "#fff0d0", 1.2, 0.35, 4, 8);
    ctx.point("ambiance", 0, H - 0.6, -2, "#ff9a40", 0.6, 12);
    ctx.onUpdate((time) => {
      const origin = ctx.local(0, 0, 0);
      for (const { x, z, y0, blobs } of lamps) {
        for (const { blob, phase } of blobs) {
          const t = 0.5 + 0.5 * Math.sin(time * 0.5 + phase);
          blob.position.set(origin.x + x + Math.sin(time * 0.7 + phase) * 0.015, y0 + 0.25 + t * 0.35, origin.z + z);
          const s = 0.8 + 0.5 * Math.abs(Math.sin(time * 0.9 + phase));
          blob.scaling.set(s, s * 1.3, s);
        }
      }
      ball.rotation.y = time * 0.4;
      // Éclats : projection de la boule sur les murs (rayon allant jusqu'au mur le plus proche dans la direction).
      for (const { spark, a, y } of sparks) {
        const ang = a + time * 0.4;
        const dx = Math.cos(ang);
        const dz = Math.sin(ang);
        const tx = Math.abs(dx) > 1e-3 ? (W / 2 - 0.03) / Math.abs(dx) : Infinity;
        const tz = Math.abs(dz) > 1e-3 ? (D / 2 - 0.03) / Math.abs(dz) : Infinity;
        const t = Math.min(tx, tz);
        spark.position.set(origin.x + dx * t, y, origin.z + dz * t);
        spark.rotation.y = tx < tz ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dz > 0 ? 0 : Math.PI);
      }
    });
  },

  post(scene, camera) {
    const pass = new PostProcess("groovy", "artGroovy", ["time"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => effect.setFloat("time", (performance.now() - start) / 1000);
    return () => pass.dispose(camera);
  },
};
