import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 54 · Observatoire : murs et plafond ouverts sur un ciel nocturne (Voie lactée, étoiles de
// couleurs et d'éclats variés, constellations tracées) qui défile lentement comme la rotation de la Terre.
// Éclairage rouge d'astronome, qui préserve la vision nocturne ; télescope de laiton pointé vers le ciel,
// sphère armillaire qui tourne, sol de pierre polie où se reflètent les étoiles.
const palette = { background: "#02030a", primary: "#ff3a2a", secondary: "#c8a050", accent: "#a0c0ff", text: "#ffb0a0" };

function starfield(ctx, w, h, { milkyWay = true } = {}) {
  ctx.fillStyle = "#02030a";
  ctx.fillRect(0, 0, w, h);
  if (milkyWay) {
    // Bande laiteuse diagonale : nuages flous et poussière sombre.
    for (let i = 0; i < 260; i++) {
      const t = Math.random();
      const x = t * w;
      const y = h * (0.75 - t * 0.5) + (Math.random() - 0.5) * h * 0.18;
      const r = 20 + Math.random() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${180 + Math.random() * 60},${170 + Math.random() * 50},${200 + Math.random() * 55},0.06)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 1800; i++) {
    const big = Math.random() < 0.03;
    const tint = ["#ffffff", "#a8c0ff", "#ffe0b0", "#ffb0a0"][Math.floor(Math.random() * 4)];
    ctx.fillStyle = tint;
    ctx.globalAlpha = 0.3 + Math.random() * 0.7;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, big ? 1.8 + Math.random() * 1.5 : 0.5 + Math.random() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Quelques constellations tracées finement.
  ctx.strokeStyle = "rgba(160,190,255,0.35)";
  ctx.lineWidth = 1.2;
  for (let c = 0; c < 6; c++) {
    let x = Math.random() * w;
    let y = Math.random() * h * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (Math.random() - 0.5) * 120;
      y += (Math.random() - 0.5) * 80;
      ctx.lineTo(x, y);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.stroke();
  }
}

export const observatory = {
  key: "observatoire",
  title: "Observatoire",
  ambient: { hemi: 0.4, sky: "#ff5040", ground: "#200808", sun: 0 },
  image: { toneMapping: "aces", exposure: 2.2, contrast: 1.15, vignette: 2.4 },
  glow: 0.8,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const sky = paintedTexture(scene, `${name} · ciel`, 2048, 1024, starfield);
    const dome = paintedTexture(scene, `${name} · voûte`, 1024, 1024, (c, w, h) => starfield(c, w, h, { milkyWay: false }));
    const brass = m("laiton", { diffuse: "#a07830", specular: "#ffe0a0", power: 90 });
    const wood = m("noyer", { diffuse: "#3a2010", specular: "#4a2a1a", power: 40 });
    const screens = new Map();
    return {
      palette,
      floor: m("pierre polie", { diffuse: "#141418", specular: "#ffffff", power: 160 }),
      wall: m("ciel", { diffuse: "#000000", unlit: true, emissiveTexture: sky }),
      ceiling: m("voûte", { diffuse: "#000000", unlit: true, emissiveTexture: dome }),
      trim: brass,
      doorFrame: brass,
      door: wood,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "☾ sortie", { color: "#ff5040", background: "#0a0204", font: "italic 70px serif", glow: 10 }) }),
      counter: wood,
      counterTop: m("cuir vert", { diffuse: "#143020" }),
      backBar: wood,
      shelf: brass,
      glass: (i) => m(`fiole ${i}`, { diffuse: ["#203040", "#402010", "#a0a0b0"][i % 3], specular: "#ffffff", power: 140, alpha: 0.8 }),
      seat: wood,
      tableTop: m("carte du ciel", { diffuse: "#ffffff", texture: paintedTexture(scene, `${name} · carte`, 512, 512, (c, w, h) => {
        c.fillStyle = "#1a2a4a";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "rgba(200,180,120,0.6)";
        for (let r = 40; r < w / 2; r += 40) {
          c.beginPath();
          c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
          c.stroke();
        }
        for (let k = 0; k < 12; k++) {
          c.beginPath();
          c.moveTo(w / 2, h / 2);
          c.lineTo(w / 2 + Math.cos((k / 12) * Math.PI * 2) * w / 2, h / 2 + Math.sin((k / 12) * Math.PI * 2) * h / 2);
          c.stroke();
        }
        c.fillStyle = "#f0e0b0";
        for (let i = 0; i < 120; i++) c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }) }),
      metal: brass,
      cabinet: () => wood,
      cabinetSide: () => brass,
      panel: wood,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => brass,
      scanlines: false,
      sky, dome, brass, wood,
    };
  },

  decorate(ctx) {
    const { look, scene, room } = ctx;
    const key = room.theme.key;
    // Télescope : trépied, tube de laiton pointé vers le haut, oculaire.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = ctx.box(`pied ${k}`, 2.4 + Math.cos(a) * 0.25, 0.6, 1 + Math.sin(a) * 0.25, 0.05, 1.3, 0.05, look.wood);
      leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    }
    const mount = new TransformNode(`${key} · monture`, scene);
    mount.position.copyFrom(ctx.local(2.4, 1.25, 1));
    const tube = CreateCylinder(`${key} · tube`, { height: 1.6, diameterTop: 0.22, diameterBottom: 0.16, tessellation: 28 }, scene);
    tube.parent = mount;
    tube.rotation.set(-0.9, 0, 0);
    tube.position.set(0, 0.5, 0.4);
    ctx.add(tube, look.brass);
    const lens = CreateCylinder(`${key} · lentille`, { height: 0.02, diameter: 0.2, tessellation: 28 }, scene);
    lens.parent = tube;
    lens.position.y = 0.81;
    ctx.add(lens, std(scene, `${key} · lentille`, { diffuse: "#000000", specular: "#ffffff", power: 300, emissive: "#101830" }));
    // Sphère armillaire sur la table : anneaux de laiton imbriqués qui tournent.
    const armillary = new TransformNode(`${key} · armillaire`, scene);
    armillary.position.copyFrom(ctx.local(-4.6, 1.15, -2));
    const rings = [0, 1, 2].map((k) => {
      const ring = CreateTorus(`${key} · anneau ${k}`, { diameter: 0.5 - k * 0.08, thickness: 0.015, tessellation: 40 }, scene);
      ring.parent = armillary;
      ring.rotation.set(k * 0.9, 0, k * 0.5);
      ctx.add(ring, look.brass);
      return ring;
    });
    const earth = CreateSphere(`${key} · terre`, { diameter: 0.08, segments: 12 }, scene);
    earth.parent = armillary;
    ctx.add(earth, std(scene, `${key} · terre`, { diffuse: "#2a4a8a" }));
    // Lumière rouge d'astronome : lampes basses à filtre rouge.
    ctx.point("lampe bar", -3.2, 1.8, 3, "#ff2a1a", 2, 9);
    const table = ctx.point("lampe table", -4.6, 1.8, -2.4, "#ff3a20", 1.8, 7);
    ctx.shadows(table, { size: 1024, darkness: 0.3, soft: true });
    ctx.point("bornes", 5, 1.6, 0, "#ff2a1a", 1.4, 9);
    ctx.point("télescope", 2.4, 2.2, 0, "#ff3a20", 1.2, 6);
    ctx.point("étoiles", 0, 3.5, 0, "#a0c0ff", 0.25, 14);
    ctx.mirrorFloor(look.floor, { level: 0.45, blur: 2 });
    ctx.onUpdate((time) => {
      // Rotation apparente du ciel.
      look.sky.uOffset = (time * 0.004) % 1;
      look.dome.wAng = time * 0.01;
      armillary.rotation.y = time * 0.3;
      rings.forEach((ring, k) => { ring.rotation.y = time * (0.2 + k * 0.15); });
      mount.rotation.y = Math.sin(time * 0.1) * 0.3;
    });
  },
};
