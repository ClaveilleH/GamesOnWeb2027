import "@babylonjs/core/Rendering/outlineRenderer";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 26 · Dessin animé des années 30 : aplats de gris cernés d'encre, comme un vieux court métrage.
// Post-traitement maison de pellicule usée : virage sépia, scintillement de l'exposition, image qui
// flotte dans le couloir du projecteur, rayures verticales, poussières et cheveux, vignette en iris.
// Les bornes et les bouteilles dansent en rythme, comme dans les dessins animés de l'époque.
const palette = { background: "#1a1208", primary: "#f4e6c8", secondary: "#2a1e10", accent: "#f4e6c8", text: "#f4e6c8" };
const ink = Color3.FromHexString("#120c06");

Effect.ShadersStore.artFilmFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
uniform vec2 screen;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(void) {
  // 12 images par seconde pour les défauts, comme une projection saccadée.
  float frame = floor(time * 12.0);
  vec2 uv = vUV + vec2(hash(frame) - 0.5, hash(frame + 3.1) - 0.5) * vec2(0.002, 0.004);
  vec3 src = texture2D(textureSampler, uv).rgb;
  float l = dot(src, vec3(0.299, 0.587, 0.114));
  // Contraste fort et virage sépia.
  l = clamp((l - 0.5) * 1.35 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.10, 0.07, 0.03), vec3(0.98, 0.91, 0.76), l);
  // Scintillement de l'exposition.
  col *= 0.92 + hash(frame + 7.7) * 0.1;
  // Rayures verticales : deux ou trois par image, fines et claires ou sombres.
  for (int k = 0; k < 3; k++) {
    float x = hash(frame * 1.3 + float(k) * 17.0);
    float on = step(0.45, hash(frame + float(k) * 5.0));
    float d = abs(vUV.x - x) * screen.x;
    col = mix(col, vec3(k == 1 ? 0.15 : 0.95), on * smoothstep(1.5, 0.0, d) * 0.6);
  }
  // Poussières : taches rondes sombres, une poignée par image.
  for (int k = 0; k < 6; k++) {
    vec2 p = vec2(hash(frame + float(k) * 11.0), hash(frame + float(k) * 23.0));
    float r = (1.0 + hash(frame + float(k)) * 4.0) / screen.y;
    float d = length((vUV - p) * vec2(screen.x / screen.y, 1.0));
    col *= 1.0 - smoothstep(r, r * 0.4, d) * 0.8;
  }
  // Grain.
  col += (hash2(vUV * screen + frame) - 0.5) * 0.09;
  // Iris : vignette ronde et marquée.
  vec2 c = (vUV - 0.5) * vec2(screen.x / screen.y, 1.0);
  col *= smoothstep(0.95, 0.35, length(c));
  gl_FragColor = vec4(col, 1.0);
}`;

export const oldCartoon = {
  key: "dessin-anime-30",
  title: "Dessin animé des années 30",
  ambient: { hemi: 1.1, sky: "#ffffff", ground: "#666666", sun: 0 },
  glow: 0,

  look(scene, name) {
    const flat = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: hex, specular: "#000000" });
    const floor = paintedTexture(scene, `${name} · plancher`, 1024, 768, (ctx, w, h) => {
      ctx.fillStyle = "#b8b8b8";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#202020";
      ctx.lineWidth = 5;
      for (let y = 0; y <= h; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y + Math.sin(y) * 3);
        ctx.lineTo(w, y - Math.sin(y) * 3);
        ctx.stroke();
      }
      for (let i = 0; i < 70; i++) {
        const y = Math.floor(Math.random() * (h / 48)) * 48;
        const x = Math.random() * w;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 48);
        ctx.stroke();
      }
    });
    const wall = paintedTexture(scene, `${name} · mur`, 2048, 512, (ctx, w, h) => {
      ctx.fillStyle = "#d8d8d8";
      ctx.fillRect(0, 0, w, h);
      // Papier peint à motifs simples et lambris dessiné.
      ctx.fillStyle = "#a8a8a8";
      for (let x = 30; x < w; x += 80) {
        for (let y = 30; y < h * 0.65; y += 80) {
          ctx.beginPath();
          ctx.moveTo(x, y - 12);
          ctx.lineTo(x + 10, y);
          ctx.lineTo(x, y + 12);
          ctx.lineTo(x - 10, y);
          ctx.fill();
        }
      }
      ctx.fillStyle = "#6a6a6a";
      ctx.fillRect(0, h * 0.7, w, h * 0.3);
      ctx.strokeStyle = "#151515";
      ctx.lineWidth = 6;
      ctx.strokeRect(-4, h * 0.7, w + 8, 0);
      for (let x = 0; x < w; x += 128) ctx.strokeRect(x + 16, h * 0.76, 96, h * 0.18);
    });
    const screens = new Map();
    return {
      palette,
      floor: std(scene, `${name} · plancher`, { diffuse: "#ffffff", texture: floor, specular: "#000000" }),
      wall: std(scene, `${name} · mur`, { diffuse: "#ffffff", texture: wall, specular: "#000000" }),
      ceiling: flat("plafond", "#8a8a8a"),
      trim: flat("plinthe", "#151515"),
      doorFrame: flat("cadre", "#151515"),
      door: flat("porte", "#4a4a4a"),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "THE END →", { color: "#151515", background: "#f0f0f0", font: "italic bold 74px serif" }) }),
      counter: flat("bar", "#3a3a3a"),
      counterTop: flat("plateau", "#e8e8e8"),
      backBar: flat("fond du bar", "#9a9a9a"),
      shelf: flat("étagère", "#151515"),
      glass: (i) => flat(`bouteille ${i}`, ["#2a2a2a", "#f0f0f0", "#7a7a7a"][i % 3]),
      seat: flat("assise", "#2a2a2a"),
      tableTop: flat("table", "#f0f0f0"),
      metal: flat("pied", "#151515"),
      cabinet: (i) => flat(`borne ${i}`, ["#4a4a4a", "#dadada"][i % 2]),
      cabinetSide: (i) => flat(`flanc ${i}`, ["#dadada", "#2a2a2a"][i % 2]),
      panel: flat("pupitre", "#151515"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => flat(`bouton ${i}`, i % 2 ? "#f0f0f0" : "#151515"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { room } = ctx;
    // Contours d'encre épais sur tout le mobilier.
    const skip = new Set([room.anchors.floor, room.anchors.ceiling, ...room.anchors.walls, ...room.screens]);
    for (const mesh of room.meshes) {
      if (skip.has(mesh) || mesh.name.includes("fronton") || mesh.name.includes("enseigne")) continue;
      mesh.renderOutline = true;
      mesh.outlineColor = ink;
      mesh.outlineWidth = 0.03;
    }
    // Les bornes se dandinent et les bouteilles sautillent, en rythme.
    const cabinets = room.anchors.cabinets.map((c) => ({ pivot: c.pivot, y: c.pivot.position.y }));
    const bottles = room.meshes.filter((mesh) => mesh.name.includes("bouteille"));
    const bottleBase = bottles.map((mesh) => mesh.position.y);
    ctx.onUpdate((time) => {
      const beat = time * Math.PI * 2 * 1.1;
      cabinets.forEach((c, i) => {
        c.pivot.rotation.x = Math.sin(beat + i * 0.9) * 0.05;
        c.pivot.position.y = c.y + Math.max(0, Math.sin(beat * 2 + i)) * 0.04;
        c.pivot.scaling.y = 1 + Math.sin(beat * 2 + i) * 0.025;
      });
      bottles.forEach((mesh, i) => {
        mesh.position.y = bottleBase[i] + Math.max(0, Math.sin(beat * 2 + i * 0.5)) * 0.05;
      });
    });
  },

  post(scene, camera) {
    const pass = new PostProcess("pellicule", "artFilm", ["time", "screen"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat("time", (performance.now() - start) / 1000);
      effect.setFloat2("screen", pass.width, pass.height);
    };
    return () => pass.dispose(camera);
  },
};
