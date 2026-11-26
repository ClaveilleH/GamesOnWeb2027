import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Salle 22 · Art déco : casino des années 20. PBR orienté métaux : or brossé et laiton poli reflètent
// la salle par une sonde, marbre noir veiné d'or en miroir au sol, panneaux vert bouteille à éventails
// dorés, velours bordeaux sur les sièges, lustre de cristal scintillant au-dessus de la table.
const palette = { background: "#0c1a14", primary: "#d4af37", secondary: "#7a1020", accent: "#f3e2a9", text: "#f3e2a9" };
const GOLD = "#d4af37";

function marble(ctx, w, h) {
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, w, h);
  // Dalles et veines d'or sinueuses.
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = i % 3 ? "rgba(212,175,55,0.35)" : "rgba(240,230,210,0.25)";
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    let x = Math.random() * w;
    let y = Math.random() * h;
    ctx.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      x += (Math.random() - 0.3) * 70;
      y += (Math.random() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  for (let x = 0; x <= w; x += w / 4) ctx.strokeRect(x, 0, 0, h);
  for (let y = 0; y <= h; y += h / 3) ctx.strokeRect(0, y, w, 0);
}

function panels(ctx, w, h) {
  ctx.fillStyle = "#123a2a";
  ctx.fillRect(0, 0, w, h);
  const step = 256;
  for (let x = 0; x < w; x += step) {
    const cx = x + step / 2;
    // Cadre doré.
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 6;
    ctx.strokeRect(x + 16, 24, step - 32, h * 0.66);
    // Éventail (soleil levant) en haut du panneau.
    const baseY = h * 0.42;
    ctx.lineWidth = 3;
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI + (k / 12) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, baseY);
      ctx.lineTo(cx + Math.cos(a) * 100, baseY + Math.sin(a) * 100);
      ctx.stroke();
    }
    for (const r of [40, 70, 100]) {
      ctx.beginPath();
      ctx.arc(cx, baseY, r, Math.PI, 0);
      ctx.stroke();
    }
    // Chevrons sous l'éventail.
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(cx - 60, baseY + 30 + k * 26);
      ctx.lineTo(cx, baseY + 10 + k * 26);
      ctx.lineTo(cx + 60, baseY + 30 + k * 26);
      ctx.stroke();
    }
  }
  // Soubassement en bois laqué et filet doré.
  ctx.fillStyle = "#1a0d08";
  ctx.fillRect(0, h * 0.76, w, h * 0.24);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, h * 0.76, w, 6);
}

export const artDeco = {
  key: "art-deco",
  title: "Art déco, casino des années 20",
  ambient: { hemi: 0.45, sky: "#ffe8c0", ground: "#2a1a10", specular: "#ffffff", sun: 0 },
  image: { toneMapping: "aces", exposure: 2.1, contrast: 1.15, vignette: 1.8 },
  glow: 0.7,

  look(scene, name) {
    const material = (label, options) => {
      const m = pbr(scene, `${name} · ${label}`, options);
      m.usePhysicalLightFalloff = false;
      return m;
    };
    const gold = material("or brossé", { albedo: GOLD, metallic: 1, roughness: 0.3 });
    const brass = material("laiton poli", { albedo: "#e6c36a", metallic: 1, roughness: 0.12 });
    const lacquer = material("laque noire", { albedo: "#0a0a0a", roughness: 0.15 });
    lacquer.clearCoat.isEnabled = true;
    const walnut = material("loupe de noyer", { albedo: "#4a2412", roughness: 0.3 });
    walnut.clearCoat.isEnabled = true;
    const velvet = material("velours", { albedo: "#6a0c1c", roughness: 0.9 });
    velvet.sheen.isEnabled = true;
    velvet.sheen.intensity = 1;
    velvet.sheen.color.set(1, 0.5, 0.55);
    const floor = material("marbre noir", { albedo: "#ffffff", roughness: 0.1, texture: paintedTexture(scene, `${name} · marbre`, 1024, 768, marble) });
    const wall = material("panneaux", { albedo: "#ffffff", roughness: 0.55, texture: paintedTexture(scene, `${name} · panneaux`, 2048, 512, panels) });
    const crystal = ["#f3e2a9", "#ffffff", "#c9a75a", "#b0d4c4"].map((hex, i) => material(`cristal ${i}`, { albedo: hex, roughness: 0.02, alpha: 0.6 }));
    const screens = new Map();
    return {
      palette,
      floor,
      wall,
      ceiling: material("plafond", { albedo: "#1a2a20", roughness: 0.7 }),
      trim: gold,
      doorFrame: brass,
      door: walnut,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SALON PRIVÉ", { color: "#f3e2a9", background: "#0c1a14", font: "300 64px serif", glow: 6 }) }),
      counter: walnut,
      counterTop: lacquer,
      backBar: material("miroir fumé", { albedo: "#2a2418", metallic: 1, roughness: 0.05 }),
      shelf: brass,
      glass: (i) => crystal[i % crystal.length],
      seat: velvet,
      tableTop: material("tapis de jeu", { albedo: "#0e4a2a", roughness: 0.95 }),
      metal: brass,
      cabinet: () => lacquer,
      cabinetSide: () => walnut,
      cabinetEdge: () => gold,
      panel: lacquer,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => brass,
      scanlines: false,
      shiny: [gold, brass, lacquer, walnut, ...crystal],
      brass,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    // Lustre de cristal au-dessus de la table : anneaux de pampilles lumineuses qui scintillent.
    const table = room.anchors.table;
    const top = H - 0.2;
    const stem = CreateCylinder(`${key} · tige du lustre`, { height: 0.6, diameter: 0.04 }, scene);
    stem.position.set(table.x, room.anchors.floor.position.y + top, table.z);
    ctx.add(stem, look.brass);
    const drops = [];
    for (const [r, n, y] of [[0.55, 14, 0.55], [0.38, 10, 0.75], [0.2, 6, 0.95]]) {
      const ring = CreateCylinder(`${key} · couronne ${r}`, { height: 0.03, diameter: r * 2, tessellation: 32 }, scene);
      ring.position.set(table.x, room.anchors.floor.position.y + top - y + 0.05, table.z);
      ctx.add(ring, look.brass);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const drop = CreateSphere(`${key} · pampille ${r} ${k}`, { diameter: 0.07, segments: 6 }, scene);
        drop.position.set(table.x + Math.cos(a) * r, room.anchors.floor.position.y + top - y - 0.06, table.z + Math.sin(a) * r);
        const mat = std(scene, `${key} · pampille ${r} ${k}`, { diffuse: "#000000", emissive: "#fff1c8" });
        ctx.add(drop, mat);
        drops.push({ mat, phase: Math.random() * 10 });
      }
    }
    const chandelier = ctx.point("lustre", -4.6, H - 1, -2, "#ffd9a0", 1.6, 10);
    // Appliques dorées : lumière chaude rasante sur les panneaux.
    ctx.point("applique ouest", -7.4, 2.6, 2.5, "#ffc87a", 1.1, 7);
    ctx.point("applique nord", 0, 2.6, 5.4, "#ffc87a", 1.1, 7);
    ctx.point("bar", -3.2, H - 0.5, 3.4, "#ffd9a0", 1.3, 8);
    ctx.spot("bornes", [3, H - 0.1, 0], [1, -1.2, 0], "#ffe8c0", 1.8, 1.6, 2, 10);
    // Reflets : marbre en miroir net, or et laiton par la sonde.
    ctx.mirrorFloor(look.floor, { level: 0.4, blur: 4 });
    ctx.probe(look.shiny, { level: 1, at: [0, 1.6, 0] });
    ctx.onUpdate((time) => {
      for (const d of drops) {
        const s = 0.75 + 0.25 * Math.max(0, Math.sin(time * 5 + d.phase)) ** 8;
        d.mat.emissiveColor.set(s, s * 0.94, s * 0.78);
      }
      chandelier.intensity = 1.55 + Math.sin(time * 9) * 0.03;
    });
  },
};
