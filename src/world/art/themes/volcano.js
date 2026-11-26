import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 35 · Forge volcanique : basalte noir veiné de fissures incandescentes qui pulsent, sol d'obsidienne
// polie qui reflète tout, rivière de lave qui coule le long du mur ouest, braises qui montent. Lumière
// presque uniquement orange et rouge venue d'en bas. Post-traitement : ondulation de chaleur, plus forte
// en bas de l'image.
const palette = { background: "#120604", primary: "#ff6a00", secondary: "#ffd000", accent: "#ff2a00", text: "#ffd9a0" };

Effect.ShadersStore.artHeatFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
void main(void) {
  float strength = 0.0035 * (1.2 - vUV.y);
  vec2 offset = vec2(sin(vUV.y * 60.0 + time * 4.0) + sin(vUV.y * 23.0 - time * 2.3) * 0.6,
                     cos(vUV.x * 40.0 + time * 3.0) * 0.5) * strength;
  vec3 col = texture2D(textureSampler, vUV + offset).rgb;
  // Légère dominante chaude dans les ombres.
  col += vec3(0.03, 0.008, 0.0) * (1.0 - col);
  gl_FragColor = vec4(col, 1.0);
}`;

// Basalte : blocs sombres et fissures. Deux calques : la roche (diffuse) et les fissures (émissives).
function basalt(ctx, w, h) {
  ctx.fillStyle = "#16110f";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) {
    const v = 20 + Math.floor(Math.random() * 25);
    ctx.fillStyle = `rgba(${v + 6},${v},${v - 2},0.6)`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 30, 0, Math.PI * 2);
    ctx.fill();
  }
}
function cracks(ctx, w, h) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < 8; i++) {
    // Tracé calculé une fois, puis dessiné en halo puis en cœur.
    const points = [[Math.random() * w, h - Math.random() * h * 0.3]];
    for (let k = 0; k < 7; k++) {
      const [px, py] = points[points.length - 1];
      points.push([px + (Math.random() - 0.5) * 36, py - 8 - Math.random() * 22]);
    }
    for (const [width, color] of [[9, "rgba(255,60,0,0.25)"], [3, "#ff9a20"]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      points.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    }
  }
}

function lava(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#ff3a00");
  g.addColorStop(0.5, "#ff8a00");
  g.addColorStop(1, "#ff3a00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,220,80,0.7)" : "rgba(60,10,0,0.75)";
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 4 + Math.random() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const volcano = {
  key: "forge-volcanique",
  title: "Forge volcanique",
  ambient: { hemi: 0.4, sky: "#5a2010", ground: "#ff6a20", sun: 0 },
  image: { toneMapping: "aces", exposure: 2.4, contrast: 1.15, vignette: 2 },
  glow: 0.7,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const crackTex = paintedTexture(scene, `${name} · fissures`, 1024, 512, cracks);
    // StandardMaterial multiplie l'émissif par la texture diffuse : les fissures sont donc aussi peintes
    // dans la roche, sinon le basalte sombre les éteint.
    const rockTex = paintedTexture(scene, `${name} · basalte`, 1024, 512, (c, w, h) => {
      basalt(c, w, h);
      c.globalCompositeOperation = "lighter";
      c.drawImage(crackTex.getContext().canvas, 0, 0);
    });
    const rock = m("basalte", { diffuse: "#ffffff", texture: rockTex, emissiveTexture: crackTex, specular: "#221510" });
    const obsidian = m("obsidienne", { diffuse: "#060404", specular: "#ffffff", power: 200 });
    const iron = m("fer noir", { diffuse: "#1a1716", specular: "#806050", power: 40 });
    const ember = m("braise", { diffuse: "#000000", emissive: "#ff7a10" });
    const screens = new Map();
    return {
      palette,
      floor: obsidian,
      wall: rock,
      ceiling: m("voûte", { diffuse: "#0e0a09" }),
      trim: iron,
      doorFrame: iron,
      door: m("porte", { diffuse: "#2a1a12", specular: "#402018" }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE", { color: "#ffb030", background: "#120604", font: "bold 78px serif", glow: 14 }) }),
      counter: rock,
      counterTop: obsidian,
      backBar: m("fond du bar", { diffuse: "#0e0a09" }),
      shelf: iron,
      glass: (i) => m(`fiole ${i}`, { diffuse: "#000000", emissive: ["#ff5a00", "#ffb000", "#ff2a00"][i % 3], alpha: 0.85 }),
      seat: iron,
      tableTop: obsidian,
      metal: iron,
      cabinet: () => iron,
      cabinetSide: () => rock,
      panel: iron,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => ember,
      scanlines: false,
      crackTex,
      obsidian,
      ember,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, height: H } } = ctx;
    const key = room.theme.key;
    // Rivière de lave le long du mur ouest, du bar jusqu'au foyer.
    const lavaTex = paintedTexture(scene, `${key} · lave`, 512, 256, lava);
    lavaTex.vScale = 4;
    const lavaMat = std(scene, `${key} · lave`, { diffuse: "#000000", unlit: true, emissiveTexture: lavaTex });
    const river = ctx.plane("rivière", -W / 2 + 0.45, 0.04, 1.6, 0.7, 7.4, lavaMat);
    river.rotation.x = Math.PI / 2;
    ctx.box("berge", -W / 2 + 0.85, 0.06, 1.6, 0.1, 0.12, 7.4, look.trim);
    // Forge : enclume sur un billot près de la table, foyer rougeoyant.
    ctx.box("billot", -6.6, 0.35, -4.6, 0.6, 0.7, 0.6, look.metal);
    ctx.box("enclume", -6.6, 0.82, -4.6, 0.7, 0.25, 0.3, look.metal);
    ctx.box("foyer", -6.9, 0.5, -2.8, 0.8, 1, 0.9, look.wall);
    ctx.box("braises du foyer", -6.9, 1.02, -2.8, 0.6, 0.04, 0.7, look.ember);
    const lavaLight = ctx.point("lave", -W / 2 + 1.2, 0.6, 1.6, "#ff5a10", 2.4, 12);
    const forge = ctx.point("forge", -6.5, 1.4, -3.2, "#ff7a20", 1.2, 6);
    ctx.point("lueur", 4, 0.5, 0, "#ff3a00", 1.1, 12);
    ctx.point("voûte", 0, H - 0.3, 0, "#ff9a50", 0.5, 14);
    ctx.shadows(forge, { size: 1024, darkness: 0.3, soft: true });
    ctx.mirrorFloor(look.obsidian, { level: 0.55, blur: 4 });
    // Braises qui montent en tourbillonnant puis renaissent au sol.
    const embers = [];
    for (let k = 0; k < 60; k++) {
      const mote = CreateSphere(`${key} · braise ${k}`, { diameter: 0.035, segments: 3 }, scene);
      mote.isPickable = false;
      ctx.add(mote, look.ember);
      const fromRiver = k % 3 !== 0;
      embers.push({ mote, x: fromRiver ? -W / 2 + 0.45 + (Math.random() - 0.5) * 0.5 : -6.9 + (Math.random() - 0.5) * 0.6,
        z: fromRiver ? 1.6 + (Math.random() - 0.5) * 7 : -2.8, speed: 0.3 + Math.random() * 0.5, phase: Math.random() * 10 });
    }
    ctx.onUpdate((time) => {
      lavaTex.vOffset = (time * 0.04) % 1;
      lavaTex.uOffset = Math.sin(time * 0.3) * 0.05;
      look.crackTex.level = 0.8 + 0.3 * Math.sin(time * 1.3) + 0.08 * Math.sin(time * 7.1);
      lavaLight.intensity = 2.3 + Math.sin(time * 1.3) * 0.3;
      forge.intensity = 1.1 + Math.sin(time * 9) * 0.12 + Math.sin(time * 23) * 0.06;
      const origin = ctx.local(0, 0, 0);
      for (const e of embers) {
        const y = ((time * e.speed + e.phase) % H);
        e.mote.position.set(origin.x + e.x + Math.sin(time * 2 + e.phase) * 0.2 * (y / H),
          0.1 + y, origin.z + e.z + Math.cos(time * 1.7 + e.phase) * 0.2 * (y / H));
        e.mote.scaling.setAll(1 - y / H);
      }
    });
  },

  post(scene, camera) {
    const pass = new PostProcess("chaleur", "artHeat", ["time"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => effect.setFloat("time", (performance.now() - start) / 1000);
    return () => pass.dispose(camera);
  },
};
