import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 39 · Ombres chinoises : aucune lumière dans la salle. Le mobilier et le joueur deviennent des
// silhouettes d'un noir d'encre devant des murs qui rayonnent comme un ciel de papier au couchant
// (dégradé, soleil, lune). Branches, oiseaux et nuages découpés sont collés devant les murs ; les oiseaux
// volent. Post-traitement : grain de papier et bord brûlé.
const palette = { background: "#000000", primary: "#ffb347", secondary: "#ff6b35", accent: "#ffe8a0", text: "#000000" };

Effect.ShadersStore.artPaperFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main(void) {
  vec3 c = texture2D(textureSampler, vUV).rgb;
  // Fibres du papier : bruit à deux échelles, plus visible dans les zones claires.
  float fiber = noise(vUV * vec2(500.0, 380.0)) * 0.6 + noise(vUV * vec2(60.0, 45.0)) * 0.4;
  c *= 0.9 + 0.15 * fiber;
  // Bord brûlé : assombrissement irrégulier près du cadre.
  vec2 d = abs(vUV - 0.5) * 2.0;
  float edge = max(d.x, d.y) + (noise(vUV * 12.0) - 0.5) * 0.12;
  c *= 1.0 - smoothstep(0.82, 1.0, edge) * 0.85;
  gl_FragColor = vec4(c, 1.0);
}`;

function dusk(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#5a2a6a");
  g.addColorStop(0.35, "#e0603a");
  g.addColorStop(0.7, "#ffb347");
  g.addColorStop(1, "#ffe8a0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Soleil couchant et lune pâle.
  const sun = ctx.createRadialGradient(w * 0.3, h * 0.72, 10, w * 0.3, h * 0.72, 120);
  sun.addColorStop(0, "rgba(255,250,220,1)");
  sun.addColorStop(0.5, "rgba(255,220,140,0.6)");
  sun.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,245,220,0.9)";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.2, 26, 0, Math.PI * 2);
  ctx.fill();
  // Collines découpées en bas, en deux plans.
  for (const [base, color] of [[0.82, "#2a1018"], [0.9, "#000000"]]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 32) ctx.lineTo(x, h * base - Math.sin(x / 140 + base * 10) * 26 - Math.sin(x / 47) * 8);
    ctx.lineTo(w, h);
    ctx.fill();
  }
}

// Silhouette découpée : branche, oiseau ou nuage, noir sur transparent.
function cutout(kind) {
  return (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "#000000";
    ctx.lineCap = "round";
    if (kind === "branche") {
      const grow = (x, y, angle, len, width) => {
        if (len < 10) {
          ctx.beginPath();
          ctx.ellipse(x, y, 9, 4, angle, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        const x2 = x + Math.cos(angle) * len;
        const y2 = y + Math.sin(angle) * len;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        grow(x2, y2, angle - 0.45 + Math.random() * 0.2, len * 0.72, width * 0.7);
        grow(x2, y2, angle + 0.35 + Math.random() * 0.2, len * 0.68, width * 0.7);
      };
      grow(0, h * 0.2, 0.25, w * 0.32, 22);
    } else if (kind === "oiseau") {
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.4);
      ctx.quadraticCurveTo(w * 0.3, h * 0.15, w * 0.5, h * 0.55);
      ctx.quadraticCurveTo(w * 0.7, h * 0.15, w * 0.9, h * 0.4);
      ctx.stroke();
    } else {
      for (const [x, y, r] of [[0.25, 0.6, 0.18], [0.45, 0.45, 0.24], [0.68, 0.58, 0.2], [0.5, 0.68, 0.2]]) {
        ctx.beginPath();
        ctx.arc(w * x, h * y, w * r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
}

export const shadowPuppets = {
  key: "ombres-chinoises",
  title: "Ombres chinoises",
  ambient: { hemi: 0, sky: "#000000", ground: "#000000", sun: 0 },
  image: { contrast: 1 },
  glow: 0,

  look(scene, name) {
    const ink = std(scene, `${name} · encre`, { diffuse: "#000000", specular: "#000000" });
    const sky = paintedTexture(scene, `${name} · couchant`, 2048, 512, dusk);
    const screens = new Map();
    return {
      palette,
      floor: std(scene, `${name} · sol`, { diffuse: "#000000", unlit: true, emissive: "#1a0a10" }),
      wall: std(scene, `${name} · ciel`, { diffuse: "#000000", unlit: true, emissiveTexture: sky }),
      ceiling: std(scene, `${name} · plafond`, { diffuse: "#000000", unlit: true, emissive: "#3a1a4a" }),
      trim: ink,
      doorFrame: ink,
      door: ink,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "sortie", { color: "#000000", background: "#ffe8a0", font: "italic bold 76px serif" }) }),
      counter: ink,
      counterTop: ink,
      backBar: ink,
      shelf: ink,
      glass: () => ink,
      seat: ink,
      tableTop: ink,
      metal: ink,
      cabinet: () => ink,
      cabinetSide: () => ink,
      panel: ink,
      // Écrans et frontons : seule lueur parmi les silhouettes, en ambre éteint.
      screen(i, texture) {
        if (!screens.has(i)) {
          const mat = std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true });
          texture.level = 0.35;
          screens.set(i, mat);
        }
        return screens.get(i);
      },
      marquee: () => ink,
      button: () => ink,
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    const cut = (label, kind, w, h) => {
      const texture = paintedTexture(scene, `${key} · ${label}`, 512, Math.round((512 * h) / w), cutout(kind));
      texture.hasAlpha = true;
      const mat = std(scene, `${key} · ${label}`, { diffuse: "#000000", unlit: true });
      mat.opacityTexture = texture;
      mat.backFaceCulling = false;
      return mat;
    };
    // Branches qui entrent dans le cadre depuis les angles, nuages découpés devant le ciel.
    const branch = cut("branche", "branche", 4, 2.4);
    ctx.plane("branche nord", -W / 2 + 2, H - 1.1, D / 2 - 0.05, 4, 2.4, branch, Math.PI);
    ctx.plane("branche est", W / 2 - 0.05, H - 1.2, -D / 2 + 2.2, 4, 2.4, branch, Math.PI / 2);
    const cloud = cut("nuage", "nuage", 2, 1);
    ctx.plane("nuage ouest", -W / 2 + 0.06, H - 0.9, 2, 2, 1, cloud, -Math.PI / 2);
    ctx.plane("nuage sud", 4, H - 0.8, -D / 2 + 0.06, 1.6, 0.8, cloud, 0);
    // Oiseaux qui traversent le mur nord en battant des ailes.
    const bird = cut("oiseau", "oiseau", 0.5, 0.25);
    const birds = [0, 1, 2].map((k) => ({ mesh: ctx.plane(`oiseau ${k}`, 0, 0, D / 2 - 0.08, 0.5 - k * 0.1, 0.25 - k * 0.05, bird, Math.PI), k }));
    ctx.onUpdate((time) => {
      const origin = ctx.local(0, 0, 0);
      for (const { mesh, k } of birds) {
        const t = ((time * 0.06 + k * 0.13) % 1);
        mesh.position.x = origin.x + W / 2 - t * W;
        mesh.position.y = H - 1 - k * 0.3 + Math.sin(time * 0.8 + k) * 0.2;
        mesh.scaling.y = 0.6 + 0.4 * Math.abs(Math.sin(time * 6 + k * 2));
      }
    });
  },

  post(scene, camera) {
    const pass = new PostProcess("papier", "artPaper", [], null, 1, camera);
    return () => pass.dispose(camera);
  },
};
