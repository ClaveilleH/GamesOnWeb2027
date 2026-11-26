import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { paintedTexture, pbr, signTexture, std } from "../materials.js";

// Salle 29 · Chalet sous la neige : murs en rondins, plancher de mélèze, cheminée en pierre où crépite
// un feu (flammes en panneaux animés, lumière orange qui vacille et porte des ombres), deux fenêtres sur
// une nuit bleue où tombe la neige, tapis en peau devant l'âtre. Contraste chaud et froid.
const palette = { background: "#1a0f08", primary: "#ffb347", secondary: "#8fb8de", accent: "#fff3d6", text: "#fff3d6" };

function logs(ctx, w, h) {
  const rows = 9;
  const rh = (h * 0.98) / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const g = ctx.createLinearGradient(0, y, 0, y + rh);
    g.addColorStop(0, "#3a2414");
    g.addColorStop(0.3, "#8a5a32");
    g.addColorStop(0.6, "#6e4626");
    g.addColorStop(1, "#24150a");
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, rh);
    ctx.strokeStyle = "rgba(30,15,5,0.35)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      const yy = y + rh * (0.25 + k * 0.1);
      ctx.moveTo(0, yy);
      for (let x = 0; x <= w; x += 40) ctx.lineTo(x, yy + Math.sin((x + r * 77 + k * 13) / 60) * 2);
      ctx.stroke();
    }
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = "rgba(40,20,8,0.5)";
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, y + rh * 0.5, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function night(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0b1530");
  g.addColorStop(0.7, "#3a5580");
  g.addColorStop(1, "#c8d8ec");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Sapins enneigés et colline.
  ctx.fillStyle = "#e8f0fa";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.quadraticCurveTo(w * 0.5, h * 0.62, w, h * 0.8);
  ctx.lineTo(w, h);
  ctx.fill();
  for (const [x, s] of [[0.15, 1], [0.32, 0.7], [0.7, 0.9], [0.86, 0.6]]) {
    const bx = x * w;
    const by = h * 0.82;
    ctx.fillStyle = "#14263a";
    ctx.beginPath();
    ctx.moveTo(bx, by - 180 * s);
    ctx.lineTo(bx - 50 * s, by);
    ctx.lineTo(bx + 50 * s, by);
    ctx.fill();
    ctx.fillStyle = "#dbe7f5";
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(bx, by - 180 * s + k * 50 * s);
      ctx.lineTo(bx - 18 * s - k * 10 * s, by - 140 * s + k * 50 * s);
      ctx.lineTo(bx + 18 * s + k * 10 * s, by - 140 * s + k * 50 * s);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#fffbe8";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.2, 22, 0, Math.PI * 2);
  ctx.fill();
}

export const chalet = {
  key: "chalet",
  title: "Chalet sous la neige",
  ambient: { hemi: 0.28, sky: "#8fb8de", ground: "#3a2414", sun: 0 },
  image: { toneMapping: "aces", exposure: 2.1, contrast: 1.1, vignette: 2 },
  glow: 0.6,

  look(scene, name) {
    const material = (label, options) => {
      const m = pbr(scene, `${name} · ${label}`, options);
      m.usePhysicalLightFalloff = false;
      return m;
    };
    const planks = paintedTexture(scene, `${name} · mélèze`, 1024, 768, (ctx, w, h) => {
      for (let y = 0; y < h; y += 64) {
        const shade = 120 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgb(${shade},${Math.floor(shade * 0.68)},${Math.floor(shade * 0.42)})`;
        ctx.fillRect(0, y, w, 62);
        ctx.strokeStyle = "rgba(50,25,10,0.25)";
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.moveTo(0, y + 10 + k * 10);
          for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + 10 + k * 10 + Math.sin(x / 70 + y) * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "#1a0e06";
        ctx.fillRect(0, y + 62, w, 2);
        ctx.fillRect(((y * 7) % w), y, 3, 62);
      }
    });
    const wood = material("rondins", { albedo: "#ffffff", roughness: 0.8, texture: paintedTexture(scene, `${name} · rondins`, 1024, 512, logs) });
    const larch = material("plancher", { albedo: "#ffffff", roughness: 0.55, texture: planks });
    const darkWood = material("bois sombre", { albedo: "#3a2414", roughness: 0.5 });
    const iron = material("fer forgé", { albedo: "#2a2a2a", metallic: 1, roughness: 0.6 });
    const wool = material("laine", { albedo: "#8a2a1e", roughness: 1 });
    wool.sheen.isEnabled = true;
    wool.sheen.intensity = 0.6;
    const screens = new Map();
    return {
      palette,
      floor: larch,
      wall: wood,
      ceiling: material("plafond", { albedo: "#4a2e18", roughness: 0.8 }),
      trim: darkWood,
      doorFrame: darkWood,
      door: material("porte", { albedo: "#5a3a20", roughness: 0.7 }),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Dehors ❄", { color: "#fff3d6", background: "#3a2414", font: "italic 68px serif" }) }),
      counter: darkWood,
      counterTop: material("plateau", { albedo: "#6e4626", roughness: 0.35 }),
      backBar: material("fond du bar", { albedo: "#2a1a0e", roughness: 0.7 }),
      shelf: darkWood,
      glass: (i) => material(`bocal ${i}`, { albedo: ["#c8a060", "#a02a1e", "#e8e0d0", "#506a3a"][i % 4], roughness: 0.1, alpha: 0.75 }),
      seat: wool,
      tableTop: material("table", { albedo: "#7a5230", roughness: 0.45 }),
      metal: iron,
      cabinet: () => material("borne bois", { albedo: "#5a3a20", roughness: 0.5 }),
      cabinetSide: () => darkWood,
      panel: iron,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => iron,
      scanlines: false,
      stone: material("pierre", { albedo: "#7a7268", roughness: 0.9, texture: paintedTexture(scene, `${name} · pierres`, 512, 512, (ctx, w, h) => {
        ctx.fillStyle = "#3a342e";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) {
          const v = 100 + Math.floor(Math.random() * 60);
          ctx.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
          ctx.beginPath();
          ctx.ellipse(Math.random() * w, Math.random() * h, 24 + Math.random() * 30, 16 + Math.random() * 18, Math.random(), 0, Math.PI * 2);
          ctx.fill();
        }
      }) }),
      larch,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Cheminée en pierre contre le mur sud-ouest, foyer noir, linteau en bois.
    const fx = -4;
    const fz = -D / 2 + 0.45;
    ctx.box("cheminée gauche", fx - 0.85, 0.7, fz, 0.4, 1.4, 0.8, look.stone);
    ctx.box("cheminée droite", fx + 0.85, 0.7, fz, 0.4, 1.4, 0.8, look.stone);
    ctx.box("hotte", fx, (1.4 + H) / 2, fz - 0.1, 2.1, H - 1.4, 0.6, look.stone);
    ctx.box("linteau", fx, 1.45, fz + 0.32, 2.2, 0.14, 0.2, look.trim);
    ctx.box("âtre", fx, 0.05, fz + 0.15, 2.1, 0.1, 1.1, look.stone);
    ctx.box("fond du foyer", fx, 0.7, fz - 0.3, 1.3, 1.3, 0.05, std(scene, `${key} · suie`, { diffuse: "#080605" }));
    ctx.box("bûche 1", fx - 0.1, 0.18, fz, 0.9, 0.14, 0.14, look.trim).rotation.y = 0.2;
    ctx.box("bûche 2", fx + 0.1, 0.26, fz + 0.05, 0.8, 0.13, 0.13, look.trim).rotation.y = -0.3;
    // Flammes : panneaux face caméra à texture dégradée, qui ondulent et changent de taille.
    const flameTex = paintedTexture(scene, `${key} · flamme`, 128, 256, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h * 0.8, 4, w / 2, h * 0.6, h * 0.55);
      g.addColorStop(0, "rgba(255,250,210,1)");
      g.addColorStop(0.3, "rgba(255,190,60,0.95)");
      g.addColorStop(0.7, "rgba(230,80,10,0.6)");
      g.addColorStop(1, "rgba(120,20,0,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(w / 2, 0);
      c.quadraticCurveTo(w * 0.95, h * 0.6, w * 0.7, h);
      c.lineTo(w * 0.3, h);
      c.quadraticCurveTo(w * 0.05, h * 0.6, w / 2, 0);
      c.fill();
    });
    flameTex.hasAlpha = true;
    const flames = [];
    for (let k = 0; k < 5; k++) {
      const mat = std(scene, `${key} · flamme ${k}`, { diffuse: "#000000", unlit: true, emissiveTexture: flameTex });
      mat.opacityTexture = flameTex;
      const plane = CreatePlane(`${key} · flamme ${k}`, { width: 0.4, height: 0.7 }, scene);
      plane.billboardMode = Mesh.BILLBOARDMODE_Y;
      ctx.add(plane, mat);
      flames.push({ plane, x: fx - 0.35 + k * 0.17, phase: k * 1.7 });
    }
    const fire = ctx.point("feu", fx, 0.8, fz + 0.9, "#ff8a2a", 2.2, 10);
    ctx.shadows(fire, { size: 1024, darkness: 0.2, soft: true });
    // Tapis en peau devant l'âtre.
    const rug = CreateDisc(`${key} · tapis`, { radius: 1, tessellation: 24 }, scene);
    rug.scaling.set(1.3, 0.8, 1);
    rug.rotation.x = Math.PI / 2;
    rug.position.copyFrom(ctx.local(fx, 0.012, fz + 1.8));
    ctx.add(rug, std(scene, `${key} · peau`, { diffuse: "#e8dcc8", specular: "#000000" }));
    // Fenêtres sur la nuit, avec neige qui tombe dehors (panneaux derrière le vitrage).
    const nightMat = std(scene, `${key} · nuit`, { diffuse: "#000000", unlit: true, emissiveTexture: paintedTexture(scene, `${key} · nuit`, 512, 384, night) });
    const snowTex = paintedTexture(scene, `${key} · neige`, 256, 512, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = "#ffffff";
      for (let i = 0; i < 120; i++) {
        c.globalAlpha = 0.5 + Math.random() * 0.5;
        c.beginPath();
        c.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 0, Math.PI * 2);
        c.fill();
      }
    });
    snowTex.hasAlpha = true;
    const snowMat = std(scene, `${key} · neige`, { diffuse: "#000000", unlit: true, emissiveTexture: snowTex });
    snowMat.opacityTexture = snowTex;
    for (const z of [-1.5, 2.5]) {
      ctx.plane(`fenêtre ${z}`, -W / 2 + 0.02, 2, z, 1.6, 1.4, nightMat, -Math.PI / 2);
      ctx.plane(`neige ${z}`, -W / 2 + 0.03, 2, z, 1.6, 1.4, snowMat, -Math.PI / 2);
      ctx.box(`meneau ${z}`, -W / 2 + 0.06, 2, z, 0.08, 1.5, 0.08, look.trim);
      ctx.box(`traverse ${z}`, -W / 2 + 0.06, 2, z, 0.08, 0.08, 1.7, look.trim);
      ctx.box(`appui ${z}`, -W / 2 + 0.12, 1.25, z, 0.25, 0.08, 1.8, look.trim);
    }
    ctx.point("clair de lune", -W / 2 + 1, 2.2, 0.5, "#8fb8de", 0.5, 8);
    // Lanternes chaudes au-dessus du bar et des bornes.
    ctx.point("lanterne bar", -3.2, H - 0.7, 3.4, "#ffc070", 0.7, 7);
    ctx.point("lanterne bornes", 5.5, H - 0.7, 0, "#ffc070", 0.6, 8);
    ctx.onUpdate((time) => {
      snowTex.vOffset = (snowTex.vOffset + 0.004) % 1;
      snowTex.uOffset = Math.sin(time * 0.3) * 0.03;
      const origin = ctx.local(0, 0, 0);
      for (const f of flames) {
        const s = 0.8 + 0.25 * Math.sin(time * 9 + f.phase) + 0.1 * Math.sin(time * 23 + f.phase * 3);
        f.plane.scaling.set(1 + 0.1 * Math.sin(time * 7 + f.phase), s, 1);
        f.plane.position.set(origin.x + f.x + Math.sin(time * 5 + f.phase) * 0.03, 0.25 + 0.35 * s, origin.z + fz + 0.05);
      }
      fire.intensity = 2 + Math.sin(time * 11) * 0.25 + Math.sin(time * 27) * 0.15;
    });
  },
};
