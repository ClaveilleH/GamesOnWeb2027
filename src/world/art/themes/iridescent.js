import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Salle 17 · Futuriste blanc irisé : galerie immaculée façon showroom. PBR poussé : vernis (clearcoat)
// sur les bornes et le comptoir, irisation (film mince) qui change de couleur avec l'angle, tissu à
// reflet velouté (sheen) sur les sièges, sol blanc laqué en miroir. Lumière blanche, douce et abondante.
const palette = { background: "#f2f5f8", primary: "#6c8cff", secondary: "#ff7ac6", accent: "#5be7c4", text: "#1d2433" };

export const iridescent = {
  key: "futuriste-irise",
  title: "Futuriste blanc irisé",
  ambient: { hemi: 0.35, sky: "#ffffff", ground: "#d6dce6", specular: "#ffffff", sun: 0 },
  image: { toneMapping: "neutral", exposure: 1, contrast: 1.12, vignette: 1 },
  glow: 0.45,

  look(scene, name) {
    const material = (label, options) => {
      const m = pbr(scene, `${name} · ${label}`, options);
      m.usePhysicalLightFalloff = false;
      return m;
    };
    // Laque blanche vernie, irisée en option.
    const pearl = (label, { iridescence = 0, albedo = "#f4f6f9", roughness = 0.35 } = {}) => {
      const m = material(label, { albedo, roughness, metallic: 0 });
      m.clearCoat.isEnabled = true;
      m.clearCoat.intensity = 1;
      m.clearCoat.roughness = 0.05;
      if (iridescence) {
        m.iridescence.isEnabled = true;
        m.iridescence.intensity = iridescence;
        m.iridescence.indexOfRefraction = 1.3;
        m.iridescence.minimumThickness = 250;
        m.iridescence.maximumThickness = 700;
      }
      return m;
    };
    const panels = paintedTexture(scene, `${name} · panneaux`, 2048, 512, (ctx, w, h) => {
      ctx.fillStyle = "#f3f5f8";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#d9dee6";
      ctx.lineWidth = 3;
      for (let x = 0; x <= w; x += 256) {
        for (let y = 0; y < h * 0.86; y += 128) {
          ctx.beginPath();
          ctx.roundRect(x + 10, y + 10, 236, 108, 22);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "#e6eaf0";
      ctx.fillRect(0, h * 0.86, w, h * 0.14);
    });
    const floor = material("sol laqué", { albedo: "#eef1f5", roughness: 0.12 });
    const wall = material("panneaux", { albedo: "#ffffff", roughness: 0.6, texture: panels });
    const counter = pearl("comptoir", { iridescence: 0.6 });
    const top = pearl("plateau", { iridescence: 1, roughness: 0.15 });
    const tints = ["#f3eaff", "#e8f6ff", "#ffeaf5", "#e9fff6", "#fff6e6"];
    const cabinets = tints.map((albedo, i) => pearl(`borne ${i}`, { iridescence: 1, albedo, roughness: 0.25 }));
    const chrome = material("chrome", { albedo: "#e8ecf2", metallic: 1, roughness: 0.08 });
    const fabric = material("tissu", { albedo: "#c9d2de", roughness: 0.85 });
    fabric.sheen.isEnabled = true;
    fabric.sheen.intensity = 1;
    fabric.sheen.color.set(0.75, 0.85, 1);
    const glass = ["#9fd8ff", "#ffb3e1", "#b9ffe8", "#e3d4ff"].map((hex, i) => {
      const m = material(`verre ${i}`, { albedo: hex, roughness: 0.05, alpha: 0.55 });
      m.clearCoat.isEnabled = true;
      return m;
    });
    const light = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: "#000000", emissive: hex });
    const screens = new Map();
    return {
      palette,
      floor,
      wall,
      ceiling: material("plafond", { albedo: "#ffffff", roughness: 0.9 }),
      trim: light("liseré", "#cfe6ff"),
      doorFrame: chrome,
      door: pearl("porte", { iridescence: 0.8 }),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "suite", { color: "#1d2433", background: "#ffffff", font: "300 80px sans-serif" }) }),
      counter,
      counterTop: top,
      backBar: material("fond du bar", { albedo: "#aebccc", roughness: 0.4 }),
      shelf: chrome,
      glass: (i) => glass[i % glass.length],
      seat: fabric,
      tableTop: top,
      metal: chrome,
      cabinet: (i) => cabinets[i % cabinets.length],
      cabinetSide: (i) => cabinets[(i + 2) % cabinets.length],
      cabinetEdge: () => light("arête", "#ffffff"),
      panel: material("pupitre", { albedo: "#20262f", roughness: 0.3 }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => light(`bouton ${i}`, ["#6c8cff", "#ff7ac6", "#5be7c4", "#ffd36c"][i % 4]),
      scanlines: false,
      shiny: [counter, top, chrome, ...cabinets, ...glass, fabric],
      pearl,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Gorges lumineuses blanches au plafond (le long des quatre murs).
    const cove = std(scene, `${key} · gorge`, { diffuse: "#000000", emissive: "#f4f8ff" });
    ctx.box("gorge nord", 0, H - 0.05, D / 2 - 0.4, W - 0.8, 0.04, 0.12, cove);
    ctx.box("gorge sud", 0, H - 0.05, -D / 2 + 0.4, W - 0.8, 0.04, 0.12, cove);
    ctx.box("gorge ouest", -W / 2 + 0.4, H - 0.05, 0, 0.12, 0.04, D - 0.8, cove);
    ctx.box("gorge est", W / 2 - 0.4, H - 0.05, 0, 0.12, 0.04, D - 0.8, cove);
    // Lumière blanche douce, et des lavis colorés pour animer l'irisation.
    // Au plus 8 lumières par matériau, hémisphère comprise : trois plafonniers et trois lavis.
    for (const [x, z] of [[-4, 0], [1.5, 0], [5, 0]]) ctx.point(`plafonnier ${x} ${z}`, x, H - 0.3, z, "#ffffff", 0.6, 11);
    // Lavis colorés sur les murs : ils donnent à l'irisation et aux reflets des couleurs à refléter.
    ctx.spot("lavis rose", [-2, H - 0.2, 1], [-0.4, 0.1, 1], "#ff7ac6", 2.6, 2.4, 6, 10);
    ctx.spot("lavis cyan", [3, H - 0.2, 0], [1, 0.1, 0.2], "#5be7ff", 2.6, 2.4, 6, 10);
    ctx.spot("lavis violet", [-3, H - 0.2, -2], [-1, 0.1, -0.3], "#9b7bff", 2.4, 2.4, 6, 10);
    // Sculpture suspendue au-dessus de la table : tore et sphère irisés qui tournent.
    const ring = CreateTorus(`${key} · anneau`, { diameter: 0.9, thickness: 0.07, tessellation: 64 }, scene);
    const orb = CreateSphere(`${key} · orbe`, { diameter: 0.34, segments: 32 }, scene);
    const table = room.anchors.table;
    ring.position.set(table.x, table.y + 1.3, table.z);
    orb.position.copyFrom(ring.position);
    const sculpture = look.pearl("sculpture", { iridescence: 1, albedo: "#ffffff", roughness: 0.1 });
    ctx.add(ring, sculpture);
    ctx.add(orb, sculpture);
    look.shiny.push(sculpture);
    // Reflets : sol laqué en miroir légèrement flouté, sonde pour tout ce qui brille.
    ctx.mirrorFloor(look.floor, { level: 0.35, blur: 16 });
    ctx.probe(look.shiny, { level: 0.9, size: 256 });
    ctx.onUpdate((time) => {
      ring.rotation.x = time * 0.6;
      ring.rotation.y = time * 0.4;
      orb.position.y = table.y + 1.3 + Math.sin(time * 1.5) * 0.06;
    });
  },
};
