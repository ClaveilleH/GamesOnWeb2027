import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Salle 41 · Steampunk : atelier victorien. Laiton, cuivre patiné et fonte en PBR qui reflètent une sonde,
// lambris d'acajou et papier peint damassé, tuyauterie de cuivre le long des murs, engrenages qui
// tournent en s'engrenant sur le mur nord, manomètres dont l'aiguille tremble, jets de vapeur
// intermittents, ampoules à filament au bout de leurs fils.
const palette = { background: "#1e1208", primary: "#d4a045", secondary: "#b5651d", accent: "#f0e0b0", text: "#f0e0b0" };

function damask(ctx, w, h) {
  ctx.fillStyle = "#3a1a14";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(200,150,80,0.18)";
  for (let y = 0; y < h; y += 96) {
    for (let x = (y / 96) % 2 ? 48 : 0; x < w + 48; x += 96) {
      ctx.beginPath();
      ctx.ellipse(x, y + 48, 18, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y + 48, 34, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Lambris d'acajou en bas du mur.
  ctx.fillStyle = "#4a2010";
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  ctx.fillStyle = "#2a1008";
  for (let x = 0; x < w; x += 128) ctx.fillRect(x, h * 0.62, 6, h * 0.38);
  ctx.fillRect(0, h * 0.62, w, 10);
}

export const steampunk = {
  key: "steampunk",
  title: "Steampunk",
  ambient: { hemi: 0.6, sky: "#ffe0a0", ground: "#3a2010", sun: 0 },
  image: { toneMapping: "aces", exposure: 2.1, contrast: 1.1, vignette: 2, saturation: -10 },
  glow: 0.6,

  look(scene, name) {
    const mat = (label, options) => {
      const m = pbr(scene, `${name} · ${label}`, options);
      m.usePhysicalLightFalloff = false;
      return m;
    };
    const brass = mat("laiton", { albedo: "#d4a045", metallic: 0.7, roughness: 0.32 });
    const copper = mat("cuivre", { albedo: "#c06a3a", metallic: 0.7, roughness: 0.35 });
    const iron = mat("fonte", { albedo: "#3a3430", metallic: 0.5, roughness: 0.6 });
    const mahogany = mat("acajou", { albedo: "#5a2414", roughness: 0.35 });
    const leather = mat("cuir", { albedo: "#5a3018", roughness: 0.6 });
    const screens = new Map();
    return {
      palette,
      floor: mat("parquet", { albedo: "#ffffff", roughness: 0.4, texture: paintedTexture(scene, `${name} · parquet`, 1024, 768, (c, w, h) => {
        for (let y = 0; y < h; y += 24) {
          for (let x = (y / 24) % 2 ? -48 : 0; x < w; x += 96) {
            const v = 90 + Math.floor(Math.random() * 35);
            c.fillStyle = `rgb(${v},${Math.floor(v * 0.55)},${Math.floor(v * 0.3)})`;
            c.fillRect(x, y, 94, 22);
          }
        }
      }) }),
      wall: mat("papier peint", { albedo: "#ffffff", roughness: 0.8, texture: paintedTexture(scene, `${name} · damas`, 1024, 512, damask) }),
      ceiling: mat("plafond", { albedo: "#2a1a10", roughness: 0.8 }),
      trim: brass,
      doorFrame: brass,
      door: mahogany,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "~ Sortie ~", { color: "#f0e0b0", background: "#2a1008", font: "italic bold 66px serif" }) }),
      counter: mahogany,
      counterTop: brass,
      backBar: mahogany,
      shelf: copper,
      glass: (i) => mat(`fiole ${i}`, { albedo: ["#7ac070", "#c07040", "#e0c070"][i % 3], roughness: 0.05, alpha: 0.7 }),
      seat: leather,
      tableTop: mahogany,
      metal: iron,
      cabinet: () => mahogany,
      cabinetSide: () => copper,
      panel: brass,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => copper,
      scanlines: false,
      brass, copper, iron, mahogany,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Engrenage : disque, moyeu et dents, regroupés sous un nœud qui tourne.
    const gear = (label, x, y, radius, teeth, material) => {
      // Nœud extérieur : couche le disque contre le mur ; nœud intérieur : tourne autour de son axe.
      const mount = new TransformNode(`${key} · ${label} support`, scene);
      mount.position.copyFrom(ctx.local(x, y, D / 2 - 0.12));
      mount.rotation.x = Math.PI / 2;
      const node = new TransformNode(`${key} · ${label}`, scene);
      node.parent = mount;
      const disc = CreateCylinder(`${key} · ${label} disque`, { height: 0.06, diameter: radius * 2, tessellation: 40 }, scene);
      disc.parent = node;
      ctx.add(disc, material);
      const hub = CreateCylinder(`${key} · ${label} moyeu`, { height: 0.12, diameter: radius * 0.4, tessellation: 20 }, scene);
      hub.parent = node;
      ctx.add(hub, look.iron);
      for (let k = 0; k < teeth; k++) {
        const a = (k / teeth) * Math.PI * 2;
        const tooth = ctx.box(`${label} dent ${k}`, 0, 0, 0, 0.12, 0.06, 0.14, material);
        tooth.parent = node;
        tooth.position.set(Math.cos(a) * (radius + 0.05), 0, Math.sin(a) * (radius + 0.05));
        tooth.rotation.y = -a;
      }
      return { node, teeth };
    };
    // Trois engrenages en prise au-dessus du fond du bar : les vitesses suivent le rapport des dents.
    const gears = [gear("grand", 1.6, H - 1.6, 0.8, 22, look.brass), gear("moyen", 2.97, H - 2.05, 0.48, 13, look.copper), gear("petit", 3.55, H - 1.37, 0.3, 8, look.brass)];
    // Tuyauterie de cuivre le long des murs nord et ouest, avec coudes.
    const pipe = (label, x, y, z, length, axis) => {
      const tube = CreateCylinder(`${key} · ${label}`, { height: length, diameter: 0.1, tessellation: 16 }, scene);
      tube.position.copyFrom(ctx.local(x, y, z));
      if (axis === "x") tube.rotation.z = Math.PI / 2;
      if (axis === "z") tube.rotation.x = Math.PI / 2;
      return ctx.add(tube, look.copper);
    };
    pipe("tuyau nord haut", 0, H - 0.3, D / 2 - 0.12, W - 0.4, "x");
    pipe("tuyau ouest", -W / 2 + 0.12, H - 0.3, 0, D - 0.4, "z");
    pipe("descente nord", 4.5, H / 2, D / 2 - 0.12, H - 0.6, "y");
    pipe("descente ouest", -W / 2 + 0.12, H / 2, -3.5, H - 0.6, "y");
    for (const [x, z] of [[4.5, D / 2 - 0.12], [-W / 2 + 0.12, -3.5]]) {
      const elbow = CreateSphere(`${key} · coude ${x}`, { diameter: 0.16, segments: 12 }, scene);
      elbow.position.copyFrom(ctx.local(x, H - 0.3, z));
      ctx.add(elbow, look.brass);
    }
    // Manomètres : cadran clair, cerclage laiton, aiguille qui tremble.
    const dialTex = paintedTexture(scene, `${key} · cadran`, 256, 256, (c, w, h) => {
      c.fillStyle = "#f0e6c8";
      c.beginPath();
      c.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#2a1a10";
      c.lineWidth = 4;
      for (let k = 0; k <= 10; k++) {
        const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
        c.beginPath();
        c.moveTo(w / 2 + Math.cos(a) * 90, h / 2 + Math.sin(a) * 90);
        c.lineTo(w / 2 + Math.cos(a) * 110, h / 2 + Math.sin(a) * 110);
        c.stroke();
      }
      c.strokeStyle = "#a01010";
      c.beginPath();
      c.arc(w / 2, h / 2, 100, Math.PI * 0.05, Math.PI * 0.25);
      c.stroke();
    });
    const dialMat = std(scene, `${key} · cadran`, { diffuse: "#ffffff", texture: dialTex, emissive: "#3a3020" });
    const needles = [];
    for (const [x, y] of [[4.5, 2.2], [4.5, 1.2]]) {
      ctx.plane(`cadran ${y}`, x, y, D / 2 - 0.2, 0.32, 0.32, dialMat);
      const ring = CreateTorus(`${key} · cerclage ${y}`, { diameter: 0.33, thickness: 0.035, tessellation: 32 }, scene);
      ring.position.copyFrom(ctx.local(x, y, D / 2 - 0.21));
      ring.rotation.x = Math.PI / 2;
      ctx.add(ring, look.brass);
      const needle = ctx.box(`aiguille ${y}`, x, y, D / 2 - 0.22, 0.012, 0.13, 0.01, std(scene, `${key} · aiguille`, { diffuse: "#1a0a0a" }));
      needle.setPivotPoint(new Vector3(0, -0.06, 0));
      needles.push({ needle, phase: y * 3 });
    }
    // Ampoules à filament suspendues : lumière chaude, verre émissif.
    const bulbMat = std(scene, `${key} · filament`, { diffuse: "#000000", emissive: "#ffb050" });
    for (const [x, z] of [[-5.2, 3.3], [-3.2, 3.3], [-1.2, 3.3], [-4.6, -2], [5, -1]]) {
      ctx.box(`fil ${x} ${z}`, x, H - 0.45, z, 0.015, 0.9, 0.015, look.iron);
      const bulb = CreateSphere(`${key} · ampoule ${x} ${z}`, { diameter: 0.12, segments: 12 }, scene);
      bulb.scaling.y = 1.3;
      bulb.position.copyFrom(ctx.local(x, H - 0.95, z));
      ctx.add(bulb, bulbMat);
    }
    ctx.point("ampoules bar", -3.2, H - 1.1, 3, "#ffb050", 1, 8);
    ctx.point("ampoule table", -4.6, H - 1.1, -2, "#ffb050", 0.8, 6);
    const lamp = ctx.point("ampoule bornes", 5, H - 1.1, -1, "#ffb050", 0.8, 8);
    ctx.shadows(lamp, { size: 1024, darkness: 0.3, soft: true });
    ctx.probe([look.brass, look.copper, look.iron], { level: 1, at: [0, 1.6, 1] });
    // Vapeur : jets intermittents d'une soupape sur la descente nord.
    const steamMat = std(scene, `${key} · vapeur`, { diffuse: "#e8e0d8", emissive: "#605850" });
    const puffs = [];
    for (let k = 0; k < 14; k++) {
      const puff = CreateSphere(`${key} · vapeur ${k}`, { diameter: 0.12, segments: 6 }, scene);
      puff.isPickable = false;
      ctx.add(puff, steamMat);
      puffs.push({ puff, phase: k / 14 });
    }
    ctx.onUpdate((time) => {
      const base = time * 0.5;
      // Rapport des dents : ω₂ = −ω₁·n₁/n₂.
      gears[0].node.rotation.y = base;
      gears[1].node.rotation.y = -base * (22 / 13) + 0.12;
      gears[2].node.rotation.y = base * (22 / 8);
      for (const { needle, phase } of needles) needle.rotation.z = -0.6 + Math.sin(time * 0.7 + phase) * 0.5 + Math.sin(time * 23 + phase) * 0.03;
      const origin = ctx.local(4.5, 0, D / 2 - 0.3);
      const burst = (time % 5) < 1.6;
      for (const p of puffs) {
        const t = (time * 0.9 + p.phase) % 1;
        p.puff.isVisible = burst;
        p.puff.position.set(origin.x - t * 0.6, H - 0.3 + t * 0.15, origin.z - t * 0.5);
        p.puff.scaling.setAll(0.5 + t * 2.5);
        p.puff.visibility = 0.7 * (1 - t);
      }
    });
  },
};
