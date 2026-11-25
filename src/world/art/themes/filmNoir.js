import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 4 · Film noir : noir et blanc, fort contraste. La lumière de la rue passe par des stores
// vénitiens et zèbre la salle d'ombres nettes ; la pluie ruisselle sur la vitre, un ventilateur tourne,
// la fumée monte au-dessus de la table, le damier mouillé reflète la scène.
const palette = { background: "#000000", primary: "#ffffff", secondary: "#9a9a9a", accent: "#ffffff", text: "#ffffff" };

export const filmNoir = {
  key: "film-noir",
  title: "Film noir",
  ambient: { hemi: 0.12, sky: "#ffffff", ground: "#111111", sun: 0 },
  image: { saturation: -100, contrast: 1.55, exposure: 1.2, vignette: 3 },
  glow: 0.25,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const checker = paintedTexture(scene, `${name} · damier`, 1024, 768, (ctx, w, h) => {
      const step = w / 16;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          ctx.fillStyle = ((x + y) / step) % 2 ? "#101010" : "#d8d8d8";
          ctx.fillRect(x, y, step, step);
        }
      }
    });
    const wallpaper = paintedTexture(scene, `${name} · papier peint`, 1024, 512, (ctx, w, h) => {
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) {
        ctx.fillStyle = x % 64 ? "#444444" : "#2e2e2e";
        ctx.fillRect(x, 0, 14, h);
      }
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, h * 0.8, w, h * 0.2);
    });
    const lacquer = m("laque", { diffuse: "#151515", specular: "#bbbbbb", power: 140 });
    const wood = m("bois sombre", { diffuse: "#3a3530", specular: "#555555", power: 40 });
    const screens = new Map();
    return {
      palette,
      floor: m("damier", { diffuse: "#ffffff", texture: checker, specular: "#ffffff", power: 200 }),
      wall: m("papier peint", { diffuse: "#ffffff", texture: wallpaper }),
      ceiling: m("plafond", { diffuse: "#202020" }),
      trim: wood,
      doorFrame: wood,
      door: m("porte vitrée", { diffuse: "#4a4a4a", specular: "#ffffff", power: 120 }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "EXIT", { color: "#ffffff", background: "#000000", font: "bold 90px serif" }) }),
      counter: wood,
      counterTop: lacquer,
      backBar: m("fond du bar", { diffuse: "#222222" }),
      shelf: wood,
      glass: (i) => m(`verre ${i}`, { diffuse: "#000000", specular: "#ffffff", power: 256, alpha: 0.5, emissive: ["#555555", "#333333"][i % 2] }),
      seat: m("cuir", { diffuse: "#2a2a2a", specular: "#666666", power: 30 }),
      tableTop: lacquer,
      metal: m("chrome", { diffuse: "#777777", specular: "#ffffff", power: 160 }),
      cabinet: () => lacquer,
      cabinetSide: () => wood,
      panel: m("pupitre", { diffuse: "#1a1a1a" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => m("bouton", { diffuse: "#dddddd" }),
      lacquer,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, height: H } } = ctx;
    const key = room.theme.key;
    // Fenêtre sur la rue (mur ouest) : vitre lumineuse où ruisselle la pluie.
    const rain = paintedTexture(scene, `${key} · pluie`, 256, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#d0d0d0");
      g.addColorStop(1, "#808080");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "rgba(40,40,40,0.5)";
      for (let i = 0; i < 90; i++) {
        const x = (i * 53) % w;
        const y = (i * 97) % h;
        c.lineWidth = 1 + (i % 3);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 2, y + 30 + (i % 5) * 12);
        c.stroke();
      }
    });
    const glass = std(scene, `${key} · vitre`, { diffuse: "#000000", unlit: true, emissiveTexture: rain });
    const windowZ = -2;
    ctx.plane("vitre", -W / 2 + 0.02, 2.2, windowZ, 2.6, 2, glass, -Math.PI / 2);
    ctx.box("encadrement haut", -W / 2 + 0.06, 3.25, windowZ, 0.12, 0.1, 2.8, look.trim);
    ctx.box("encadrement bas", -W / 2 + 0.06, 1.15, windowZ, 0.25, 0.1, 2.8, look.trim);
    // Lamelles du store : leurs ombres zèbrent la table et le sol.
    for (let i = 0; i < 13; i++) {
      const slat = ctx.box(`lamelle ${i}`, -W / 2 + 0.5, 1.3 + i * 0.145, windowZ, 0.1, 0.045, 2.6, look.trim);
      slat.rotation.z = 0.2;
    }
    const street = ctx.spot("rue", [-W / 2 + 0.06, 2.6, windowZ], [1, -0.42, 0.15], "#ffffff", 3.2, 1.5, 1, 16);
    ctx.shadows(street, { size: 2048, darkness: 0.02, bias: 0.0002, soft: false });
    // Lumières d'appoint : lampe du bar, lueur froide des bornes.
    ctx.point("bar", -3.2, 2.2, 3.2, "#ffffff", 0.45, 5);
    ctx.point("bornes", 6, 2.4, 0, "#ffffff", 0.3, 5);
    // Ventilateur au plafond.
    const fan = new TransformNode(`${key} · ventilateur`, scene);
    fan.position.copyFrom(ctx.local(0, H - 0.45, -1));
    const hub = CreateCylinder(`${key} · moyeu`, { height: 0.18, diameter: 0.22 }, scene);
    hub.parent = fan;
    ctx.add(hub, look.metal);
    const rod = CreateCylinder(`${key} · tige`, { height: 0.4, diameter: 0.04 }, scene);
    rod.parent = fan;
    rod.position.y = 0.25;
    ctx.add(rod, look.metal);
    for (let b = 0; b < 4; b++) {
      const blade = CreateBox(`${key} · pale ${b}`, { width: 0.7, height: 0.02, depth: 0.16 }, scene);
      blade.parent = fan;
      blade.rotation.y = b * Math.PI / 2;
      blade.position.set(Math.cos(b * Math.PI / 2) * 0.45, 0, -Math.sin(b * Math.PI / 2) * 0.45);
      ctx.add(blade, look.trim);
    }
    // Fumée : panneaux toujours face caméra qui montent et s'estompent au-dessus de la table.
    const puff = paintedTexture(scene, `${key} · fumée`, 128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    puff.hasAlpha = true;
    const table = room.anchors.table;
    const smoke = [];
    for (let i = 0; i < 6; i++) {
      const mat = std(scene, `${key} · fumée ${i}`, { diffuse: "#000000", emissive: "#bbbbbb", unlit: true });
      mat.opacityTexture = puff;
      const sprite = CreatePlane(`${key} · bouffée ${i}`, { size: 0.8 }, scene);
      sprite.billboardMode = Mesh.BILLBOARDMODE_ALL;
      ctx.add(sprite, mat);
      smoke.push({ sprite, mat, phase: i / 6 });
    }
    // Miroir mouillé : le damier reflète la salle, à peine flouté.
    ctx.mirrorFloor(look.floor, { level: 0.3, blur: 6 });
    ctx.probe([look.lacquer, look.metal], { level: 0.3 });
    ctx.onUpdate((time, dt) => {
      fan.rotation.y += dt * 2.2;
      rain.vOffset = (rain.vOffset - dt * 0.35) % 1;
      for (const puffState of smoke) {
        const t = (time * 0.12 + puffState.phase) % 1;
        puffState.sprite.position.set(table.x + Math.sin(t * 9 + puffState.phase * 6) * 0.15, table.y + 0.2 + t * 2.4, table.z);
        puffState.sprite.scaling.setAll(0.4 + t * 1.6);
        puffState.mat.alpha = Math.sin(t * Math.PI) * 0.9;
      }
    });
  },
};
