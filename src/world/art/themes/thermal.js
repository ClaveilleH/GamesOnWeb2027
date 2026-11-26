import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { signTexture, std } from "../materials.js";

// Salle 36 · Vision thermique : l'image est vue par une caméra infrarouge. La luminance devient une
// température, convertie en palette « fer chaud » (noir, bleu nuit, violet, rouge, orange, jaune, blanc).
// La salle est froide et sombre ; les sources de chaleur (radiateurs, lampes, écrans, tasses fumantes,
// moteurs des bornes) sont claires et ressortent. Bruit de capteur, léger flou, réticule et échelle.
const palette = { background: "#000000", primary: "#ffffff", secondary: "#ff8a00", accent: "#ffd000", text: "#ffffff" };

Effect.ShadersStore.artThermalFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screen;
uniform float time;
vec3 iron(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.0, 0.0, 0.05), vec3(0.15, 0.0, 0.45), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(0.75, 0.05, 0.35), smoothstep(0.2, 0.45, t));
  c = mix(c, vec3(1.0, 0.45, 0.0), smoothstep(0.4, 0.65, t));
  c = mix(c, vec3(1.0, 0.9, 0.2), smoothstep(0.6, 0.85, t));
  c = mix(c, vec3(1.0, 1.0, 1.0), smoothstep(0.85, 1.0, t));
  return c;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(void) {
  vec2 texel = 1.5 / screen;
  vec3 s = texture2D(textureSampler, vUV).rgb * 0.4
    + texture2D(textureSampler, vUV + vec2(texel.x, 0.0)).rgb * 0.15
    + texture2D(textureSampler, vUV - vec2(texel.x, 0.0)).rgb * 0.15
    + texture2D(textureSampler, vUV + vec2(0.0, texel.y)).rgb * 0.15
    + texture2D(textureSampler, vUV - vec2(0.0, texel.y)).rgb * 0.15;
  float heat = dot(s, vec3(0.3, 0.59, 0.11));
  heat += (hash(vUV * screen + floor(time * 30.0)) - 0.5) * 0.05;
  vec3 col = iron(pow(heat, 0.8));
  vec2 px = vUV * screen;
  vec2 c = screen * 0.5;
  // Réticule central.
  vec2 d = abs(px - c);
  float cross = step(d.x, 1.0) * step(14.0, d.y) * step(d.y, 34.0) + step(d.y, 1.0) * step(14.0, d.x) * step(d.x, 34.0);
  col = mix(col, vec3(1.0), cross * 0.9);
  // Échelle de couleurs à droite.
  if (px.x > screen.x - 34.0 && px.x < screen.x - 18.0 && px.y > screen.y * 0.25 && px.y < screen.y * 0.75) {
    col = iron((px.y - screen.y * 0.25) / (screen.y * 0.5));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const thermal = {
  key: "vision-thermique",
  title: "Vision thermique",
  ambient: { hemi: 0.28, sky: "#ffffff", ground: "#202020", sun: 0 },
  image: { contrast: 1 },
  glow: 0,

  look(scene, name) {
    // Température = gris : plus c'est clair, plus c'est chaud.
    const cold = (label, v) => std(scene, `${name} · ${label}`, { diffuse: v });
    const hot = (label, v) => std(scene, `${name} · ${label}`, { diffuse: "#000000", emissive: v });
    const screens = new Map();
    return {
      palette,
      floor: cold("sol", "#3a3a3a"),
      wall: cold("mur", "#2a2a2a"),
      ceiling: cold("plafond", "#1a1a1a"),
      trim: cold("plinthe", "#202020"),
      doorFrame: cold("cadre", "#303030"),
      door: cold("porte", "#262626"),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE", { color: "#bbbbbb", background: "#222222", font: "bold 76px sans-serif" }) }),
      counter: cold("bar", "#404040"),
      counterTop: cold("plateau", "#4a4a4a"),
      backBar: cold("fond du bar", "#2a2a2a"),
      shelf: cold("étagère", "#303030"),
      // Bouteilles : certaines au frais, d'autres à température ambiante.
      glass: (i) => (i % 3 === 0 ? hot(`bouteille ${i}`, "#5a5a5a") : cold(`bouteille ${i}`, "#151515")),
      seat: cold("assise", "#505050"),
      tableTop: cold("table", "#444444"),
      metal: cold("pied", "#1c1c1c"),
      cabinet: () => cold("borne", "#3c3c3c"),
      cabinetSide: () => cold("flanc", "#323232"),
      panel: hot("pupitre tiède", "#4a4a4a"),
      // Écrans : chauds, l'image d'origine est conservée en luminance.
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, emissive: "#505050", unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => hot("bouton", "#707070"),
      scanlines: false,
      hot,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, height: H } } = ctx;
    const key = room.theme.key;
    // Radiateurs sous les fenêtres du mur ouest : très chauds, ils rayonnent sur le mur.
    const radiator = look.hot("radiateur", "#e0e0e0");
    for (const z of [-3.5, 0.5]) {
      for (let k = 0; k < 8; k++) ctx.box(`radiateur ${z} ${k}`, -W / 2 + 0.12, 0.45, z - 0.7 + k * 0.2, 0.1, 0.6, 0.08, radiator);
      ctx.point(`chaleur ${z}`, -W / 2 + 0.5, 0.6, z, "#ffffff", 0.35, 3);
    }
    // Suspensions brûlantes au-dessus du bar et de la table.
    const bulb = look.hot("ampoule", "#ffffff");
    for (const [x, z] of [[-5, 3.4], [-3, 3.4], [-1, 3.4], [-4.6, -2]]) {
      ctx.box(`fil ${x}`, x, H - 0.4, z, 0.02, 0.8, 0.02, look.metal);
      const lamp = CreateCylinder(`${key} · lampe ${x}`, { height: 0.22, diameterTop: 0.08, diameterBottom: 0.3, tessellation: 16 }, scene);
      lamp.position.copyFrom(ctx.local(x, H - 0.9, z));
      ctx.add(lamp, bulb);
      ctx.point(`lampe ${x}`, x, H - 1.1, z, "#ffffff", 0.45, 4);
    }
    // Tasses fumantes sur la table, chaleur résiduelle des sièges (quelqu'un vient de partir).
    const mug = look.hot("tasse", "#c8c8c8");
    for (const [x, z] of [[-4.9, -2.2], [-4.3, -1.8]]) {
      const cup = CreateCylinder(`${key} · tasse ${x}`, { height: 0.1, diameter: 0.08, tessellation: 12 }, scene);
      cup.position.copyFrom(ctx.local(x, 0.8, z));
      ctx.add(cup, mug);
    }
    // Moteurs des bornes : une tache chaude à l'arrière de chacune.
    const motor = look.hot("moteur", "#9a9a9a");
    for (const z of [-4, -2, 0, 2, 4]) ctx.box(`moteur ${z}`, W / 2 - 0.25, 0.4, z, 0.1, 0.5, 0.5, motor);
    // Vapeur des tasses : petites boules tièdes qui montent.
    const steam = look.hot("vapeur", "#777777");
    const puffs = [];
    for (let k = 0; k < 10; k++) {
      const puff = CreateCylinder(`${key} · vapeur ${k}`, { height: 0.04, diameter: 0.05, tessellation: 6 }, scene);
      puff.isPickable = false;
      ctx.add(puff, steam);
      puffs.push({ puff, x: k % 2 ? -4.9 : -4.3, z: k % 2 ? -2.2 : -1.8, phase: k / 10 });
    }
    ctx.onUpdate((time) => {
      const origin = ctx.local(0, 0, 0);
      for (const p of puffs) {
        const t = (time * 0.4 + p.phase) % 1;
        p.puff.position.set(origin.x + p.x + Math.sin(time * 3 + p.phase * 9) * 0.03, 0.9 + t * 0.6, origin.z + p.z);
        p.puff.scaling.setAll(1 + t * 1.5);
        p.puff.visibility = 1 - t;
      }
    });
  },

  post(scene, camera) {
    // Le joueur est la source la plus chaude : ses os rayonnent le temps de la visite.
    const bone = scene.getMaterialByName("os ivoire");
    const saved = bone?.emissiveColor.clone();
    if (bone) bone.emissiveColor.set(0.85, 0.85, 0.85);
    const pass = new PostProcess("thermique", "artThermal", ["screen", "time"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat2("screen", pass.width, pass.height);
      effect.setFloat("time", (performance.now() - start) / 1000);
    };
    return () => {
      pass.dispose(camera);
      if (bone) bone.emissiveColor.copyFrom(saved);
    };
  },
};
