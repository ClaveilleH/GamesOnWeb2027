import { Effect } from "@babylonjs/core/Materials/effect";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 13 · Pixel 8 bits : l'image est rendue en basse définition (gros pixels nets), chaque pixel
// est ramené à une palette de 16 couleurs avec un tramage ordonné (Bayer 4×4). Textures en pixel art,
// éclairage simple et franc, pas de reflet : tout le style vient du post-traitement.
const palette = { background: "#1a1c2c", primary: "#ffcd75", secondary: "#ef7d57", accent: "#73eff7", text: "#f4f4f4" };

// Palette maison de 16 couleurs, du plus sombre au plus clair.
const COLORS = ["#0f0b1e", "#2a1f3d", "#43305e", "#5a3f2b", "#8a5a34", "#c4813d", "#ef7d57", "#b13e53",
  "#ffcd75", "#a7f070", "#38b764", "#257179", "#29366f", "#3b5dc9", "#73eff7", "#f4f4f4"];

Effect.ShadersStore.artPixelFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
uniform float pixel;
uniform vec3 colors[16];
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
  m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  float v = 0.;
  for (int k = 0; k < 16; k++) if (k == i) v = m[k];
  return v / 16. - 0.5;
}
void main(void) {
  vec2 cells = floor(screen / pixel);
  vec2 cell = floor(vUV * cells);
  vec3 c = texture2D(textureSampler, (cell + 0.5) / cells).rgb;
  c += bayer(cell) * 0.12;
  float best = 1e9;
  vec3 pick = c;
  for (int k = 0; k < 16; k++) {
    vec3 d = c - colors[k];
    float e = dot(d * vec3(0.3, 0.59, 0.11), d);
    if (e < best) { best = e; pick = colors[k]; }
  }
  gl_FragColor = vec4(pick, 1.0);
}`;

export const pixel = {
  key: "pixel-8-bits",
  title: "Pixel 8 bits",
  ambient: { hemi: 0.7, sky: "#ffffff", ground: "#43305e", sun: 0 },
  glow: 0,

  look(scene, name) {
    const px = (label, w, h, paint) => paintedTexture(scene, `${name} · ${label}`, w, h, paint, { pixelated: true, mipmaps: false });
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const floor = px("sol", 64, 48, (ctx, w, h) => {
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          ctx.fillStyle = ((x + y) / 4) % 2 ? "#29366f" : "#3b5dc9";
          ctx.fillRect(x, y, 4, 4);
        }
      }
    });
    const bricks = px("briques", 128, 32, (ctx, w, h) => {
      ctx.fillStyle = "#43305e";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#b13e53";
      for (let y = 0; y < h * 0.75; y += 4) {
        for (let x = (y / 4) % 2 ? -4 : 0; x < w; x += 8) ctx.fillRect(x + 1, y + 1, 7, 3);
      }
      ctx.fillStyle = "#5a3f2b";
      ctx.fillRect(0, h * 0.75, w, h * 0.25);
      ctx.fillStyle = "#ffcd75";
      ctx.fillRect(0, h * 0.75, w, 1);
    });
    const coin = px("pièce", 16, 16, (ctx) => {
      ctx.fillStyle = "#2a1f3d";
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = "#ffcd75";
      ctx.fillRect(5, 2, 6, 12);
      ctx.fillRect(3, 4, 10, 8);
      ctx.fillStyle = "#c4813d";
      ctx.fillRect(7, 5, 2, 6);
    });
    const colors = ["#b13e53", "#38b764", "#3b5dc9", "#ef7d57", "#257179"];
    const screens = new Map();
    return {
      palette,
      floor: m("sol", { diffuse: "#ffffff", texture: floor }),
      wall: m("briques", { diffuse: "#ffffff", texture: bricks }),
      ceiling: m("plafond", { diffuse: "#2a1f3d" }),
      trim: m("plinthe", { diffuse: "#ffcd75" }),
      doorFrame: m("cadre", { diffuse: "#ffcd75" }),
      door: m("porte", { diffuse: "#8a5a34" }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "1UP ▶", { color: "#73eff7", background: "#0f0b1e", font: "bold 80px monospace" }) }),
      counter: m("bar", { diffuse: "#8a5a34" }),
      counterTop: m("plateau", { diffuse: "#ffcd75" }),
      backBar: m("fond du bar", { diffuse: "#ffffff", texture: px("fond du bar", 32, 8, (ctx) => {
        ctx.fillStyle = "#2a1f3d";
        ctx.fillRect(0, 0, 32, 8);
        for (let x = 1; x < 32; x += 4) { ctx.fillStyle = "#73eff7"; ctx.fillRect(x, 3, 2, 2); }
      }) }),
      shelf: m("étagère", { diffuse: "#5a3f2b" }),
      glass: (i) => m(`bouteille ${i}`, { diffuse: colors[i % colors.length] }),
      seat: m("assise", { diffuse: "#b13e53" }),
      tableTop: m("table", { diffuse: "#38b764" }),
      metal: m("métal", { diffuse: "#a0a0b0" }),
      cabinet: (i) => m(`borne ${i}`, { diffuse: colors[(i + 2) % colors.length] }),
      cabinetSide: () => m("flanc", { diffuse: "#ffffff", texture: coin }),
      panel: m("pupitre", { diffuse: "#2a1f3d" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: colors[i % colors.length] }),
      coin,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    // Deux lumières chaudes, sans reflet spéculaire.
    ctx.point("gauche", -4, H - 0.4, 0, "#ffcd75", 0.6, 12);
    ctx.point("droite", 4, H - 0.4, 0, "#73eff7", 0.5, 12);
    // Pièces qui tournent et flottent au-dessus du bar et de la table.
    const coinMat = std(scene, `${room.theme.key} · pièce`, { diffuse: "#000000", unlit: true, emissiveTexture: look.coin });
    const coins = [];
    for (let i = 0; i < 6; i++) {
      const x = i < 4 ? -5.4 + i * 1.5 : -4.6 + (i - 4) * 0.8;
      const z = i < 4 ? D / 2 - 2.6 : -2;
      const mesh = ctx.plane(`pièce ${i}`, x, 2, z, 0.35, 0.35, coinMat);
      mesh.material.backFaceCulling = false;
      coins.push({ mesh, y: i < 4 ? 2.1 : 1.6, phase: i * 0.7 });
    }
    // Nuages pixelisés aux murs.
    const cloud = paintedTexture(scene, `${room.theme.key} · nuage`, 32, 16, (c) => {
      c.fillStyle = "#f4f4f4";
      c.fillRect(6, 6, 20, 6);
      c.fillRect(10, 3, 8, 4);
      c.fillRect(17, 4, 5, 3);
    }, { pixelated: true, mipmaps: false });
    cloud.hasAlpha = true;
    const cloudMat = std(scene, `${room.theme.key} · nuage`, { diffuse: "#000000", unlit: true, emissiveTexture: cloud });
    cloudMat.opacityTexture = cloud;
    ctx.plane("nuage 1", -W / 2 + 0.03, 3.3, -3, 2, 1, cloudMat, -Math.PI / 2);
    ctx.plane("nuage 2", 2.5, 3.4, D / 2 - 0.03, 2.4, 1.2, cloudMat, 0);
    ctx.onUpdate((time) => {
      const origin = ctx.local(0, 0, 0);
      for (const c of coins) {
        c.mesh.rotation.y = time * 3 + c.phase;
        c.mesh.position.y = origin.y + c.y + Math.round(Math.sin(time * 2 + c.phase) * 4) / 40;
      }
    });
  },

  post(scene, camera) {
    const engine = scene.getEngine();
    const pass = new PostProcess("pixel 8 bits", "artPixel", ["screen", "pixel", "colors"], null, 1, camera,
      Texture.NEAREST_SAMPLINGMODE, engine);
    const flat = COLORS.flatMap((hex) => Color3.FromHexString(hex).asArray());
    pass.onApply = (effect) => {
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setFloat("pixel", Math.max(3, Math.round(pass.height / 180)));
      effect.setArray3("colors", flat);
    };
    return () => pass.dispose(camera);
  },
};
