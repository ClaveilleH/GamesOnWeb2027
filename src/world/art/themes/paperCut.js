import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 75 · Papier découpé : chaque surface est une feuille de papier coloré (fibres, grain), en aplats
// presque sans modelé. Le post-traitement donne l'épaisseur du papier : là où un objet plus proche se
// trouve un peu au-dessus et à gauche du pixel, ce pixel est dans l'ombre portée de la découpe, comme
// des couches de papier superposées dans un diorama. Un liseré clair souligne le bord des découpes.
const palette = { background: "#f4ecd8", primary: "#e05a3a", secondary: "#3a7ab0", accent: "#f0c040", text: "#3a2a20" };

Effect.ShadersStore.artPaperCutFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D depthSampler;
uniform vec2 screen;
uniform float far;
float depthAt(vec2 uv) { return texture2D(depthSampler, uv).r * far; }
void main(void) {
  vec2 t = 1.0 / screen;
  vec3 c = texture2D(textureSampler, vUV).rgb;
  float d = depthAt(vUV);
  // Ombre portée : cherche, le long d'une diagonale vers le haut-gauche, une découpe plus proche.
  float shade = 0.0;
  for (int k = 1; k <= 8; k++) {
    vec2 o = vec2(-1.0, 1.0) * float(k) * 1.6 * t;
    float dk = depthAt(vUV + o);
    float closer = step(0.05 * max(d, 1.0), d - dk);
    shade = max(shade, closer * (1.0 - float(k) / 9.0));
  }
  c *= 1.0 - 0.45 * shade;
  // Liseré clair sur le bord haut-gauche des découpes (tranche du papier).
  float dn = depthAt(vUV + vec2(1.0, -1.0) * 1.5 * t);
  float rim = step(0.05 * max(d, 1.0), dn - d);
  c = mix(c, c * 1.25 + 0.08, rim * 0.6);
  gl_FragColor = vec4(c, 1.0);
}`;

function paper(hex) {
  return (ctx, w, h) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);
    // Fibres et grain du papier.
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)";
      ctx.lineWidth = 0.6;
      const x = Math.random() * w;
      const y = Math.random() * h;
      const a = Math.random() * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
      ctx.stroke();
    }
  };
}

export const paperCut = {
  key: "papier-decoupe",
  title: "Papier découpé",
  ambient: { hemi: 0.9, sky: "#ffffff", ground: "#d0c8b8", sun: 0 },
  image: { contrast: 1.05 },
  glow: 0,

  look(scene, name) {
    const cache = new Map();
    // Papier : texture de fibres teintée, surtout éclairé par l'ambiance (très peu de modelé).
    const sheet = (label, hex) => {
      if (cache.has(hex)) return cache.get(hex);
      const tex = paintedTexture(scene, `${name} · papier ${label}`, 256, 256, paper(hex));
      const m = std(scene, `${name} · ${label}`, { diffuse: "#ffffff", texture: tex });
      m.emissiveColor.set(0.25, 0.25, 0.25);
      cache.set(hex, m);
      return m;
    };
    const screens = new Map();
    return {
      palette,
      floor: sheet("sol", "#d8b888"),
      wall: sheet("mur", "#8ab8d8"),
      ceiling: sheet("plafond", "#f4ecd8"),
      trim: sheet("plinthe", "#3a7ab0"),
      doorFrame: sheet("cadre", "#f4ecd8"),
      door: sheet("porte", "#e05a3a"),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "sortie", { color: "#3a2a20", background: "#f4ecd8", font: "bold 72px serif" }) }),
      counter: sheet("bar", "#e05a3a"),
      counterTop: sheet("plateau", "#f4ecd8"),
      backBar: sheet("fond du bar", "#4a8a5a"),
      shelf: sheet("étagère", "#f0c040"),
      glass: (i) => sheet(`bouteille ${i % 3}`, ["#3a7ab0", "#f0c040", "#e05a3a"][i % 3]),
      seat: sheet("assise", "#f0c040"),
      tableTop: sheet("table", "#f4ecd8"),
      metal: sheet("pied", "#5a4a3a"),
      cabinet: (i) => sheet(`borne ${i % 4}`, ["#3a7ab0", "#e05a3a", "#4a8a5a", "#f0c040"][i % 4]),
      cabinetSide: () => sheet("flanc", "#f4ecd8"),
      panel: sheet("pupitre", "#5a4a3a"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => sheet("bouton", "#f4ecd8"),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { scene, room, ROOM: { depth: D } } = ctx;
    const key = room.theme.key;
    // Découpe : feuille de papier dont la silhouette vient de la transparence de sa texture.
    const cutout = (label, hex, shape) => {
      const tex = paintedTexture(scene, `${key} · découpe ${label}`, 256, 256, (c, w, h) => {
        c.clearRect(0, 0, w, h);
        c.save();
        c.beginPath();
        shape(c, w, h);
        c.clip();
        paper(hex)(c, w, h);
        c.restore();
      });
      tex.hasAlpha = true;
      const m = std(scene, `${key} · découpe ${label}`, { diffuse: "#ffffff", texture: tex });
      m.useAlphaFromDiffuseTexture = true;
      m.emissiveColor.set(0.25, 0.25, 0.25);
      return m;
    };
    const hill = (c, w, h) => {
      c.moveTo(0, h);
      c.quadraticCurveTo(w * 0.25, h * 0.1, w * 0.5, h * 0.35);
      c.quadraticCurveTo(w * 0.75, h * 0.0, w, h);
      c.closePath();
    };
    const cloud = (c, w, h) => {
      for (const [x, y, r] of [[0.3, 0.6, 0.22], [0.5, 0.45, 0.28], [0.72, 0.6, 0.2]]) {
        c.moveTo(w * x + w * r, h * y);
        c.arc(w * x, h * y, w * r, 0, Math.PI * 2);
      }
      c.rect(w * 0.1, h * 0.6, w * 0.8, h * 0.25);
    };
    const sun = (c, w, h) => {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const r = (k % 2 ? 0.36 : 0.48) * w;
        c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
      }
      c.closePath();
    };
    // Plaquées au mur nord à quelques centimètres, en couches : les plus proches portent ombre sur les autres.
    const z = D / 2 - 0.04;
    ctx.plane("soleil", 5.2, 3.2, z, 1.1, 1.1, cutout("soleil", "#f0c040", sun), 0);
    for (const [x, w, h, hex, k] of [[-6, 4, 2, "#4a8a5a", 0], [-3.2, 3.4, 1.5, "#6aa86a", 1], [6, 4.2, 1.8, "#4a8a5a", 2]]) {
      ctx.plane(`colline ${x}`, x, h / 2 + 0.2, z - 0.06 - k * 0.04, w, h, cutout(`colline ${x}`, hex, hill), 0);
    }
    for (const [x, y, k] of [[-5, 3.4, 0], [2.5, 3.6, 1], [-1.5, 3.1, 2]]) {
      ctx.plane(`nuage ${x}`, x, y, z - 0.1 - k * 0.03, 1.6, 0.8, cutout(`nuage ${x}`, "#f4ecd8", cloud), 0);
    }
  },

  post(scene, camera) {
    const depth = scene.enableDepthRenderer(camera, false);
    // Le rendu des portails masque le calque du joueur pendant la passe principale (voir salle 67).
    depth.getDepthMap().renderListPredicate = (mesh) => mesh.isEnabled() && mesh.isVisible && mesh.subMeshes?.length > 0;
    const pass = new PostProcess("papier découpé", "artPaperCut", ["screen", "far"], ["depthSampler"], 1, camera);
    pass.onApply = (effect) => {
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setFloat("far", camera.maxZ);
      effect.setTexture("depthSampler", depth.getDepthMap());
    };
    return () => {
      pass.dispose(camera);
      scene.disableDepthRenderer(camera);
    };
  },
};
