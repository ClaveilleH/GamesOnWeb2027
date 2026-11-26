import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Engine } from "@babylonjs/core/Engines/engine";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 33 · Temple dans la jungle : blocs de pierre couverts de mousse, ouverture au plafond d'où tombe
// un soleil vertical. Des faisceaux de lumière (cylindres additifs à dégradé) et des poussières en descendent.
// Un bassin d'eau sombre reflète la salle, des lianes pendent et se balancent, deux torches vacillent.
const palette = { background: "#14200f", primary: "#e9c46a", secondary: "#2a9d5c", accent: "#f4a261", text: "#f1e3c0" };

// Blocs de pierre irréguliers, joints sombres, taches de mousse plus denses vers le bas.
function mossyStone(ctx, w, h, { rows = 6, moss = 0.5 } = {}) {
  ctx.fillStyle = "#2a2620";
  ctx.fillRect(0, 0, w, h);
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -((r * 53) % 90);
    while (x < w) {
      const bw = 90 + Math.random() * 110;
      const v = 95 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgb(${v},${v - 8},${v - 22})`;
      ctx.fillRect(x + 3, r * rh + 3, bw - 6, rh - 6);
      x += bw;
    }
  }
  for (let i = 0; i < 260 * moss; i++) {
    const y = h * Math.pow(Math.random(), 0.6);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, "rgba(70,120,40,0.55)");
    g.addColorStop(1, "rgba(50,90,30,0)");
    ctx.save();
    ctx.translate(Math.random() * w, y);
    ctx.scale(1 + Math.random() * 2, 0.6 + Math.random());
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export const jungleTemple = {
  key: "temple-jungle",
  title: "Temple dans la jungle",
  ambient: { hemi: 0.45, sky: "#bfe3a0", ground: "#2a2018", sun: 0 },
  image: { toneMapping: "aces", exposure: 2, contrast: 1.15, vignette: 2.2 },
  fog: { color: "#4a5a36", density: 0.02 },
  glow: 0.6,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const wallTex = paintedTexture(scene, `${name} · pierre`, 1024, 512, (c, w, h) => mossyStone(c, w, h, { rows: 5, moss: 0.7 }));
    const floorTex = paintedTexture(scene, `${name} · dalles`, 1024, 768, (c, w, h) => mossyStone(c, w, h, { rows: 8, moss: 0.4 }));
    const stone = m("pierre", { diffuse: "#ffffff", texture: wallTex, specular: "#1a1a1a" });
    const carved = m("pierre taillée", { diffuse: "#b8a888", specular: "#222222" });
    const gold = m("or", { diffuse: "#c8962a", specular: "#ffe08a", power: 90, emissive: "#2a1a00" });
    const wood = m("bois", { diffuse: "#5a3a1e" });
    const screens = new Map();
    return {
      palette,
      floor: m("dalles", { diffuse: "#ffffff", texture: floorTex, specular: "#222222", power: 20 }),
      wall: stone,
      ceiling: m("voûte", { diffuse: "#4a4236" }),
      trim: carved,
      doorFrame: carved,
      door: wood,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "→ SORTIE", { color: "#e9c46a", background: "#2a2018", font: "bold 66px serif" }) }),
      counter: carved,
      counterTop: m("dalle de comptoir", { diffuse: "#8a7a5a", specular: "#333333" }),
      backBar: stone,
      shelf: wood,
      glass: (i) => i % 3 === 0 ? gold : m(`jarre ${i}`, { diffuse: ["#a0522d", "#6b8e23", "#8b5a2b"][i % 3] }),
      seat: wood,
      tableTop: carved,
      metal: m("bronze", { diffuse: "#6a4a2a", specular: "#c89a5a", power: 40 }),
      cabinet: () => carved,
      cabinetSide: () => stone,
      panel: wood,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => gold,
      scanlines: false,
      gold,
      carved,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    // Ouverture au plafond : panneau de ciel éblouissant, source des rayons et du soleil.
    const sky = ctx.plane("ouverture", 0.5, H - 0.02, -0.5, 2.4, 2.4, std(scene, `${key} · ciel`, { diffuse: "#000000", emissive: "#fff6d0" }));
    sky.rotation.x = -Math.PI / 2;
    // Faisceaux : cylindres ouverts, additifs, plus lumineux en haut, légèrement inclinés.
    const beamTex = paintedTexture(scene, `${key} · faisceau`, 64, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(255,240,190,0.16)");
      g.addColorStop(0.7, "rgba(255,230,170,0.05)");
      g.addColorStop(1, "rgba(255,230,170,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    const beams = [];
    for (const [dx, dz, d, tilt] of [[0, 0, 2.2, 0.06], [-0.6, 0.4, 0.9, 0.1], [0.7, -0.5, 1.1, 0.03], [0.2, 0.7, 0.6, 0.08]]) {
      const mat = std(scene, `${key} · faisceau ${dx}`, { diffuse: "#000000", emissiveTexture: beamTex, unlit: true });
      mat.opacityTexture = beamTex;
      mat.alphaMode = Engine.ALPHA_ADD;
      mat.backFaceCulling = false;
      mat.disableDepthWrite = true;
      const beam = CreateCylinder(`${key} · faisceau ${dx}`, { height: H, diameterTop: d, diameterBottom: d * 1.25, tessellation: 24, cap: 0 }, scene);
      beam.position.copyFrom(ctx.local(0.5 + dx, H / 2, -0.5 + dz));
      beam.rotation.set(tilt, 0, -tilt * 0.6);
      beam.isPickable = false;
      ctx.add(beam, mat);
      ctx.noGlow(beam);
      beams.push({ mat, phase: dx * 5 });
    }
    // Poussières qui flottent dans la lumière.
    const moteMat = std(scene, `${key} · poussière`, { diffuse: "#000000", emissive: "#fff2c0" });
    const motes = [];
    for (let k = 0; k < 40; k++) {
      const mote = CreateSphere(`${key} · poussière ${k}`, { diameter: 0.025, segments: 3 }, scene);
      const base = { x: 0.5 + (Math.random() - 0.5) * 2, y: 0.3 + Math.random() * (H - 0.6), z: -0.5 + (Math.random() - 0.5) * 2 };
      mote.position.copyFrom(ctx.local(base.x, base.y, base.z));
      mote.isPickable = false;
      ctx.add(mote, moteMat);
      motes.push({ mote, base, phase: Math.random() * 6 });
    }
    ctx.box("rebord nord", 0.5, H - 0.1, 0.8, 2.8, 0.2, 0.2, look.carved);
    ctx.box("rebord sud", 0.5, H - 0.1, -1.8, 2.8, 0.2, 0.2, look.carved);
    const sun = ctx.spot("soleil", [0.5, H + 2, -0.5], [0.08, -1, 0.05], "#fff0c8", 2.2, 0.75, 2, 16);
    ctx.shadows(sun, { size: 1024, darkness: 0.25, soft: true });
    // Bassin sombre sous l'ouverture, bordé de pierre, qui reflète la salle.
    const water = std(scene, `${key} · eau`, { diffuse: "#0a1a14", specular: "#ffffff", power: 200 });
    const ripples = paintedTexture(scene, `${key} · rides`, 256, 256, (c, w, h) => {
      c.fillStyle = "rgb(128,128,255)";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        c.strokeStyle = i % 2 ? "rgba(150,150,255,0.4)" : "rgba(108,108,255,0.4)";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 0, Math.PI * 2);
        c.stroke();
      }
    });
    ripples.wrapU = ripples.wrapV = Texture.WRAP_ADDRESSMODE;
    water.bumpTexture = ripples;
    water.bumpTexture.level = 0.25;
    const pool = ctx.plane("bassin", 0.5, 0.03, -0.5, 3, 2.2, water);
    pool.rotation.x = Math.PI / 2;
    ctx.mirror(water, pool, new Plane(0, -1, 0, 0.03), { level: 0.7, blur: 2 });
    for (const [label, x, z, w, d] of [["n", 0.5, 0.67, 3.3, 0.15], ["s", 0.5, -1.67, 3.3, 0.15], ["o", -1.07, -0.5, 0.15, 2.2], ["e", 2.07, -0.5, 0.15, 2.2]]) {
      ctx.box(`margelle ${label}`, x, 0.06, z, w, 0.12, d, look.carved);
    }
    // Idole dorée au fond du bassin, côté nord.
    const idol = CreateSphere(`${key} · idole`, { diameter: 0.35, segments: 16 }, scene);
    idol.scaling.set(1, 1.3, 1);
    idol.position.copyFrom(ctx.local(0.5, 0.95, 0.67));
    ctx.add(idol, look.gold);
    ctx.box("socle idole", 0.5, 0.4, 0.67, 0.4, 0.7, 0.3, look.carved);
    // Lianes : chaînes de boîtes fines suspendues au plafond, qui se balancent.
    const vineMat = std(scene, `${key} · liane`, { diffuse: "#3f7a2a" });
    const leafMat = std(scene, `${key} · feuille`, { diffuse: "#4f9a35", specular: "#223322" });
    const vines = [];
    for (const [x, z, len] of [[-6.5, -4.5, 2.2], [-5.6, 4.6, 1.6], [3.5, -4.8, 2.4], [-1.4, 1.5, 1.3], [2.6, 1.6, 1.8], [6.8, -4.6, 1.5], [-3.5, -1.2, 1.1]]) {
      const vine = ctx.box(`liane ${x}`, x, H - len / 2, z, 0.05, len, 0.05, vineMat);
      vine.setPivotPoint(new Vector3(0, len / 2, 0));
      for (let k = 0; k < 3; k++) {
        const leaf = CreateSphere(`${key} · feuille ${x} ${k}`, { diameter: 0.22, segments: 6 }, scene);
        leaf.scaling.set(1, 0.25, 0.55);
        leaf.position.set(k % 2 ? 0.07 : -0.07, len / 2 - 0.4 - k * (len / 3.5), 0);
        leaf.parent = vine;
        ctx.add(leaf, leafMat);
      }
      vines.push({ vine, phase: x * 1.3 + z });
    }
    // Fougères aux angles.
    for (const [x, z] of [[-7.2, -5.2], [7.2, -5.2], [-7.2, 1.2]]) {
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const frond = CreateSphere(`${key} · fougère ${x} ${z} ${k}`, { diameter: 0.9, segments: 6 }, scene);
        frond.scaling.set(1, 0.12, 0.35);
        frond.rotation.set(0, a, -0.4);
        frond.position.copyFrom(ctx.local(x + Math.cos(a) * 0.35, 0.3, z + Math.sin(a) * 0.35));
        ctx.add(frond, leafMat);
      }
    }
    // Torches de part et d'autre de la porte.
    const flame = std(scene, `${key} · flamme`, { diffuse: "#000000", emissive: "#ffa040" });
    const torches = [];
    for (const x of [-1.6, 1.6]) {
      ctx.box(`torche ${x}`, x, 1.7, -5.85, 0.08, 0.4, 0.08, look.metal);
      const fire = CreateSphere(`${key} · feu ${x}`, { diameter: 0.16, segments: 8 }, scene);
      fire.scaling.y = 1.6;
      fire.position.copyFrom(ctx.local(x, 2.0, -5.85));
      ctx.add(fire, flame);
      torches.push({ light: ctx.point(`torche ${x}`, x, 2.1, -5.4, "#ff9a40", 0.9, 6), fire });
    }
    ctx.point("reflet vert", -4, 1.2, 3, "#6ab04c", 0.3, 9);
    ctx.onUpdate((time) => {
      for (const { vine, phase } of vines) {
        vine.rotation.z = Math.sin(time * 0.7 + phase) * 0.06;
        vine.rotation.x = Math.sin(time * 0.5 + phase * 0.7) * 0.04;
      }
      torches.forEach(({ light, fire }, i) => {
        light.intensity = 0.85 + Math.sin(time * 13 + i * 2) * 0.12 + Math.sin(time * 31 + i) * 0.06;
        fire.scaling.y = 1.6 + Math.sin(time * 17 + i) * 0.2;
      });
      for (const { mat, phase } of beams) mat.alpha = 0.85 + Math.sin(time * 0.6 + phase) * 0.15;
      const origin = ctx.local(0, 0, 0);
      for (const { mote, base, phase } of motes) {
        mote.position.set(origin.x + base.x + Math.sin(time * 0.3 + phase) * 0.15, base.y + Math.sin(time * 0.2 + phase * 2) * 0.2, origin.z + base.z + Math.cos(time * 0.25 + phase) * 0.15);
      }
      ripples.uOffset = time * 0.01;
      ripples.vOffset = Math.sin(time * 0.3) * 0.02;
    });
  },

};
