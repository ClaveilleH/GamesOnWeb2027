import { Engine } from "@babylonjs/core/Engines/engine";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 18 · Sous l'eau : l'arcade engloutie. Des caustiques (lumière focalisée par les vagues)
// ondulent au sol et au plafond ; brouillard bleu dense, bulles qui
// montent, algues qui oscillent, sable au sol. Les couleurs chaudes disparaissent avec la profondeur.
const palette = { background: "#022a3a", primary: "#7ff3ff", secondary: "#ffb070", accent: "#c8fff4", text: "#e0ffff" };

// Réseau de caustiques : boucles lumineuses irrégulières aux bords lissés et un peu flous, répétables.
function caustics(ctx, w, h) {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#ffffff";
  ctx.filter = "blur(1.5px)";
  const cells = Array.from({ length: 46 }, () => ({
    x: Math.random() * w, y: Math.random() * h, r: 22 + Math.random() * 22, n: 6 + Math.floor(Math.random() * 3),
    jitter: Array.from({ length: 9 }, () => 0.7 + Math.random() * 0.45), width: 2 + Math.random() * 4, alpha: 0.45 + Math.random() * 0.55,
  }));
  for (const cell of cells) {
    for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
      const pts = Array.from({ length: cell.n }, (_, k) => {
        const a = (k / cell.n) * Math.PI * 2;
        return [cell.x + dx + Math.cos(a) * cell.r * cell.jitter[k], cell.y + dy + Math.sin(a) * cell.r * cell.jitter[k]];
      });
      // Courbe fermée passant par les milieux des côtés : boucle douce.
      ctx.lineWidth = cell.width;
      ctx.globalAlpha = cell.alpha;
      ctx.beginPath();
      const mid = (i) => [(pts[i][0] + pts[(i + 1) % pts.length][0]) / 2, (pts[i][1] + pts[(i + 1) % pts.length][1]) / 2];
      ctx.moveTo(...mid(0));
      for (let i = 1; i <= pts.length; i++) ctx.quadraticCurveTo(...pts[i % pts.length], ...mid(i % pts.length));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.filter = "none";
}

export const underwater = {
  key: "sous-l-eau",
  title: "Sous l'eau",
  ambient: { hemi: 0.4, sky: "#4fd2ff", ground: "#06303a", sun: 0 },
  image: { exposure: 1.2, contrast: 1.1, vignette: 2.2 },
  fog: { color: "#0a4a63", density: 0.085 },
  glow: 0.5,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, { specular: "#2a5a66", power: 20, ...options });
    const sand = paintedTexture(scene, `${name} · sable`, 1024, 768, (ctx, w, h) => {
      ctx.fillStyle = "#c9b98a";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 16000; i++) {
        ctx.fillStyle = `rgba(${Math.random() > 0.5 ? "255,250,230" : "90,70,40"},${Math.random() * 0.25})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      // Rides de sable.
      ctx.strokeStyle = "rgba(120,100,60,0.3)";
      ctx.lineWidth = 3;
      for (let y = 10; y < h; y += 22) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x / 40 + y) * 5);
        ctx.stroke();
      }
    });
    const tiles = paintedTexture(scene, `${name} · faïence`, 2048, 512, (ctx, w, h) => {
      ctx.fillStyle = "#3e8f97";
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 48) {
        for (let y = 0; y < h; y += 48) {
          ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.08})`;
          ctx.fillRect(x + 2, y + 2, 44, 44);
        }
      }
      // Algues collées et taches de mousse.
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(20,90,50,${0.2 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, h * (0.6 + Math.random() * 0.4), 20 + Math.random() * 50, 10 + Math.random() * 30, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const coral = m("corail", { diffuse: "#d8735a" });
    const brass = m("laiton verdi", { diffuse: "#5f8a6a", specular: "#9fe0c0", power: 60 });
    const screens = new Map();
    return {
      palette,
      floor: m("sable", { diffuse: "#ffffff", texture: sand }),
      wall: m("faïence", { diffuse: "#ffffff", texture: tiles }),
      ceiling: m("plafond", { diffuse: "#0e3a46" }),
      trim: brass,
      doorFrame: brass,
      door: m("hublot", { diffuse: "#2a5a60", specular: "#ffffff", power: 120 }),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "↑ SURFACE", { color: "#c8fff4", background: "#022a3a", glow: 14 }) }),
      counter: m("coque", { diffuse: "#4a6a6a" }),
      counterTop: brass,
      backBar: m("fond du bar", { diffuse: "#1a4a50" }),
      shelf: brass,
      glass: (i) => m(`bouteille ${i}`, { diffuse: ["#7ff3ff", "#b0ffd0", "#ffd0a0"][i % 3], alpha: 0.6, emissive: "#0a3038" }),
      seat: coral,
      tableTop: m("table", { diffuse: "#6a8a80" }),
      metal: brass,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#2f6f7a", "#3a5f6f", "#2f7a6a"][i % 3] }),
      cabinetSide: () => m("flanc", { diffuse: "#24545e" }),
      panel: m("pupitre", { diffuse: "#163a40" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: ["#ff9a70", "#7ff3ff", "#fff07a"][i % 3] }),
    };
  },

  decorate(ctx) {
    const { scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Caustiques : deux calques additifs qui défilent en sens contraires, au sol et au plafond.
    // (La texture projetée d'un projecteur, `projectionTexture`, n'a rien donné ici : l'éclairage restait uniforme.)
    ctx.spot("surface", [0, H + 6, 0], [0, -1, 0], "#d6fbff", 2.2, 1.9, 1, 30);
    const layers = [];
    const causticLayer = (label, y, flip, level) => {
      const texture = paintedTexture(scene, `${key} · ${label}`, 512, 512, caustics);
      texture.uScale = 3;
      texture.vScale = 2.25;
      const mat = std(scene, `${key} · ${label}`, { diffuse: "#000000", emissive: "#000000", unlit: true, emissiveTexture: texture });
      mat.opacityTexture = texture;
      mat.opacityTexture.getAlphaFromRGB = true;
      mat.alphaMode = Engine.ALPHA_ADD;
      mat.disableDepthWrite = true;
      texture.level = level;
      const plane = ctx.plane(label, 0, y, 0, W, D, mat);
      plane.rotation.x = flip;
      layers.push(texture);
      return texture;
    };
    causticLayer("caustiques sol", 0.012, Math.PI / 2, 0.55);
    causticLayer("caustiques sol 2", 0.014, Math.PI / 2, 0.35);
    causticLayer("reflets plafond", H - 0.02, -Math.PI / 2, 0.45);
    // Bulles qui montent en zigzag.
    const bubble = paintedTexture(scene, `${key} · bulle`, 64, 64, (c) => {
      c.strokeStyle = "rgba(220,255,255,0.9)";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(32, 32, 26, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.beginPath();
      c.arc(22, 22, 6, 0, Math.PI * 2);
      c.fill();
    });
    bubble.hasAlpha = true;
    const bubbleMat = std(scene, `${key} · bulle`, { diffuse: "#000000", emissive: "#c8fff4", unlit: true });
    bubbleMat.opacityTexture = bubble;
    const bubbles = [];
    const base = CreatePlane(`${key} · bulle`, { size: 0.08 }, scene);
    base.billboardMode = Mesh.BILLBOARDMODE_ALL;
    ctx.add(base, bubbleMat);
    const sources = [[-6.6, 4.5], [6.6, -4.4], [-1.5, -1], [2.5, 4.6], [-4.6, -2]];
    for (let i = 0; i < 60; i++) {
      const mesh = i ? base.clone(`${key} · bulle ${i}`) : base;
      if (i) ctx.add(mesh, bubbleMat);
      const [x, z] = sources[i % sources.length];
      mesh.scaling.setAll(0.5 + Math.random() * 1.2);
      bubbles.push({ mesh, x, z, p: Math.random(), speed: 0.15 + Math.random() * 0.15 });
    }
    // Algues : rubans verts ancrés au sol qui ondulent.
    const kelp = paintedTexture(scene, `${key} · algue`, 64, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, "#1f5a2a");
      g.addColorStop(1, "#5fbf5a");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(w * 0.35, h);
      for (let y = h; y >= 0; y -= 32) c.lineTo(w * 0.5 + Math.sin(y / 40) * w * 0.3 - 8, y);
      for (let y = 0; y <= h; y += 32) c.lineTo(w * 0.5 + Math.sin(y / 40) * w * 0.3 + 8 + (y / h) * 8, y);
      c.fill();
    });
    kelp.hasAlpha = true;
    const kelpMat = std(scene, `${key} · algue`, { diffuse: "#ffffff", specular: "#000000" });
    kelpMat.diffuseTexture = kelp;
    kelpMat.useAlphaFromDiffuseTexture = true;
    kelpMat.backFaceCulling = false;
    const weeds = [];
    for (const [x, z, h] of [[-7.4, 5.3, 2.6], [-6.9, 5.4, 2], [7.3, 5.4, 3], [-7.4, -5.2, 2.4], [1.4, 5.5, 1.8], [-2.6, -5.5, 2.2]]) {
      for (let k = 0; k < 2; k++) {
        const plane = ctx.plane(`algue ${x} ${z} ${k}`, x + k * 0.15, h / 2, z, 0.45, h, kelpMat, k * Math.PI / 2 + x);
        weeds.push({ plane, phase: x + z + k });
      }
    }
    ctx.onUpdate((time) => {
      layers[0].uOffset = time * 0.03;
      layers[0].vOffset = Math.sin(time * 0.4) * 0.05;
      layers[1].uOffset = -time * 0.025;
      layers[1].vOffset = time * 0.02;
      layers[2].uOffset = time * 0.04;
      layers[2].vOffset = -time * 0.015;
      const origin = ctx.local(0, 0, 0);
      for (const b of bubbles) {
        const t = (time * b.speed + b.p) % 1;
        b.mesh.position.set(origin.x + b.x + Math.sin(t * 25 + b.p * 6) * 0.08, 0.1 + t * H, origin.z + b.z + Math.cos(t * 21) * 0.06);
      }
      for (const w of weeds) w.plane.rotation.z = Math.sin(time * 0.9 + w.phase) * 0.12;
    });
  },
};
