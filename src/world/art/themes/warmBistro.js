import { Plane } from "@babylonjs/core/Maths/math.plane";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Salle 2 · Bistrot chaud : rendu réaliste (PBR) à la lumière de lampes à incandescence. Parquet vernis
// qui reflète flou, comptoir en marbre, laiton, cuir, miroir derrière les bouteilles, ombres portées
// sous les suspensions, tone mapping ACES et vignette.
const palette = { background: "#0b0d14", primary: "#ffd08a", secondary: "#e2563b", accent: "#ffffff", text: "#ffe9c8" };
const tungsten = "#ffb36a";

// Grain de bois : lames décalées, veines sombres.
function planks(ctx, w, h, { base, dark, rows, stagger = true }) {
  const row = h / rows;
  for (let r = 0; r < rows; r++) {
    const offset = stagger ? ((r * 37) % 5) / 5 * w : 0;
    const shade = 0.85 + ((r * 13) % 7) / 25;
    ctx.fillStyle = base;
    ctx.globalAlpha = 1;
    ctx.fillRect(0, r * row, w, row);
    ctx.fillStyle = `rgba(0,0,0,${1 - shade})`;
    ctx.fillRect(0, r * row, w, row);
    ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.25;
    for (let v = 0; v < 6; v++) {
      ctx.lineWidth = 1 + (v % 3);
      ctx.beginPath();
      const y = r * row + (v + 0.5) * row / 6;
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin((x + r * 50 + v * 20) / 60) * row * 0.06);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = dark;
    ctx.fillRect(0, r * row, w, 2);
    for (const x of [offset % w, (offset + w / 2) % w]) ctx.fillRect(x, r * row, 2, row);
  }
  ctx.globalAlpha = 1;
}

export const warmBistro = {
  key: "bistrot-chaud",
  title: "Bistrot chaud (réaliste)",
  ambient: { hemi: 0.3, sky: "#ffcf9a", ground: "#4a3020", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.7, contrast: 1.2, vignette: 1.6 },
  glow: 0.35,

  look(scene, name) {
    const P = (label, options) => pbr(scene, `${name} · ${label}`, options);
    const S = (label, options) => std(scene, `${name} · ${label}`, options);
    const floorWood = paintedTexture(scene, `${name} · parquet`, 1024, 1024, (ctx, w, h) =>
      planks(ctx, w, h, { base: "#7a4a26", dark: "#2a160a", rows: 24 }));
    floorWood.uScale = 2;
    floorWood.vScale = 1.5;
    const walnut = paintedTexture(scene, `${name} · noyer`, 512, 512, (ctx, w, h) =>
      planks(ctx, w, h, { base: "#4a2a16", dark: "#1a0c05", rows: 6, stagger: false }));
    const wall = paintedTexture(scene, `${name} · lambris`, 2048, 512, (ctx, w, h) => {
      // Enduit en haut, lambris de noyer sur le bas du mur (26 %).
      const top = h * 0.74;
      const plaster = ctx.createLinearGradient(0, 0, 0, top);
      plaster.addColorStop(0, "#6a4a32");
      plaster.addColorStop(1, "#c49a6c");
      ctx.fillStyle = plaster;
      ctx.fillRect(0, 0, w, top);
      for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = `rgba(60,30,10,${Math.random() * 0.06})`;
        ctx.fillRect(Math.random() * w, Math.random() * top, 3, 3);
      }
      ctx.fillStyle = "#4a2814";
      ctx.fillRect(0, top, w, h - top);
      for (let x = 0; x < w; x += w / 24) {
        ctx.strokeStyle = "#1c0d05";
        ctx.lineWidth = 6;
        ctx.strokeRect(x + 12, top + 18, w / 24 - 24, h - top - 34);
        ctx.strokeStyle = "#7a4a24";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 16, top + 22, w / 24 - 32, h - top - 42);
      }
      ctx.fillStyle = "#24130a";
      ctx.fillRect(0, top - 8, w, 12);
    });
    const marble = paintedTexture(scene, `${name} · marbre`, 1024, 256, (ctx, w, h) => {
      ctx.fillStyle = "#e9e4dc";
      ctx.fillRect(0, 0, w, h);
      for (let v = 0; v < 26; v++) {
        ctx.strokeStyle = `rgba(110,100,95,${0.15 + (v % 4) * 0.08})`;
        ctx.lineWidth = 1 + (v % 3);
        ctx.beginPath();
        let x = (v * 97) % w;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < h) {
          x += Math.sin(v + y / 17) * 14;
          y += 10;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
    const sideArt = paintedTexture(scene, `${name} · flancs`, 256, 512, (ctx, w, h) => {
      planks(ctx, w, h, { base: "#5a3418", dark: "#1c0d05", rows: 1, stagger: false });
      ctx.fillStyle = "#e2563b";
      ctx.fillRect(0, h * 0.35, w, 24);
      ctx.fillStyle = "#ffd08a";
      ctx.fillRect(0, h * 0.35 + 30, w, 10);
    });
    const glass = ["#7a4a12", "#2e5a26", "#c8d6d8", "#8a2016"].map((tint, i) =>
      P(`verre ${i}`, { albedo: tint, roughness: 0.05, metallic: 0, alpha: 0.6 }));
    const brass = P("laiton", { albedo: "#c9a25a", metallic: 1, roughness: 0.28 });
    const walnutMat = P("noyer", { albedo: "#ffffff", texture: walnut, roughness: 0.42 });
    const marbleMat = P("marbre", { albedo: "#ffffff", texture: marble, roughness: 0.12 });
    const cabinetWood = P("bois des bornes", { albedo: "#ffffff", texture: walnut, roughness: 0.5 });
    const screens = new Map();
    return {
      palette,
      floor: P("parquet", { albedo: "#ffffff", texture: floorWood, roughness: 0.3 }),
      wall: P("lambris", { albedo: "#ffffff", texture: wall, roughness: 0.85 }),
      ceiling: P("plafond", { albedo: "#3a2a20", roughness: 0.95 }),
      trim: walnutMat,
      doorFrame: walnutMat,
      door: P("porte", { albedo: "#5a1c14", roughness: 0.4 }),
      sign: S("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE", { color: "#9cff9c", background: "#06140a", glow: 8 }) }),
      counter: walnutMat,
      counterTop: marbleMat,
      backBar: P("miroir du bar", { albedo: "#1a1410", metallic: 1, roughness: 0.05 }),
      shelf: brass,
      glass: (i) => glass[i % glass.length],
      seat: P("cuir", { albedo: "#5a1a12", roughness: 0.45 }),
      tableTop: marbleMat,
      metal: brass,
      cabinet: () => cabinetWood,
      cabinetSide: () => P("flancs", { albedo: "#ffffff", texture: sideArt, roughness: 0.5 }),
      panel: P("pupitre", { albedo: "#1c1c1c", roughness: 0.6 }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, S(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => S(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => P(`bouton ${i}`, { albedo: ["#d23a2a", "#e8e8e8", "#e2b23a", "#2a6ad2"][i % 4], roughness: 0.25 }),
      brass, walnutMat, marbleMat, cabinetWood,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H, depth: D } } = ctx;
    // Suspensions en laiton au-dessus du bar et de la table : abat-jour, ampoule lumineuse, fil.
    const bulb = std(scene, "ampoule à incandescence", { diffuse: "#000000", emissive: "#ffd9a0" });
    const pendant = (label, x, z, drop) => {
      const y = H - drop;
      const shade = CreateCylinder(`${label} · abat-jour`, { height: 0.28, diameterTop: 0.12, diameterBottom: 0.46, tessellation: 32 }, scene);
      shade.position.copyFrom(ctx.local(x, y, z));
      ctx.add(shade, look.brass);
      const cord = CreateCylinder(`${label} · fil`, { height: drop - 0.14, diameter: 0.012 }, scene);
      cord.position.copyFrom(ctx.local(x, y + 0.14 + (drop - 0.14) / 2, z));
      ctx.add(cord, look.walnutMat);
      const globe = CreateSphere(`${label} · ampoule`, { diameter: 0.13, segments: 12 }, scene);
      globe.position.copyFrom(ctx.local(x, y - 0.12, z));
      ctx.add(globe, bulb);
      return ctx.local(x, y - 0.2, z);
    };
    for (const x of [-5.2, -3.2, -1.2]) pendant(`suspension du bar ${x}`, x, 3.3, 1.5);
    const tableLamp = pendant("suspension de la table", -4.6, -2, 1.9);
    // Lumières : chaudes, physiques (PBR). Projecteur avec ombres au-dessus de la table.
    ctx.point("bar gauche", -5.2, H - 1.75, 3.3, tungsten, 14, 9);
    ctx.point("bar droite", -1.2, H - 1.75, 3.3, tungsten, 14, 9);
    const spot = ctx.spot("table", [-4.6, tableLamp.y, -2], [0, -1, 0], tungsten, 40, 1.4, 1.5, 9);
    ctx.shadows(spot, { darkness: 0.1 });
    ctx.point("bornes", 5, 3.2, 0, "#ffc890", 14, 10);
    ctx.point("salle", 1, 3.6, -2, "#ffbf80", 16, 14);
    // Reflets : parquet vernis (miroir très flouté), miroir derrière les bouteilles, sonde pour le reste.
    ctx.mirrorFloor(look.floor, { level: 0.35, blur: 48, size: 512 });
    const zBack = ctx.local(0, 0, D / 2 - 0.08).z;
    ctx.mirror(look.backBar, room.anchors.backBar, new Plane(0, 0, 1, -zBack), { level: 1, blur: 2, size: 1024 });
    ctx.probe([look.brass, look.marbleMat, look.walnutMat, look.cabinetWood, ...[0, 1, 2, 3].map((i) => look.glass(i))],
      { level: 1, at: [0, 1.4, 0] });
    // Les ampoules vacillent à peine.
    const base = bulb.emissiveColor.clone();
    ctx.onUpdate((time) => {
      const k = 0.94 + 0.04 * Math.sin(time * 13) * Math.sin(time * 3.1);
      bulb.emissiveColor.copyFrom(base).scaleInPlace(k);
    });
  },
};
